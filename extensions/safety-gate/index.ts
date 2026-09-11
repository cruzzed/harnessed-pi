/**
 * safety-gate — pi extension entry point.
 *
 * Wiring only: registers commands and event handlers, delegates all logic to
 *   policy.ts    — command policy (pure, unit-tested)
 *   writelock.ts — single-writer worktree lock
 *   vicinity.ts  — heartbeat registry + conditional nudge
 *
 * Deploy: ~/piagent/.mise.toml `deploy` task rsyncs this directory to
 * ~/.pi/agent/extensions/safety-gate/ (auto-discovered by pi at startup).
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as path from "node:path";
import * as os from "node:os";
import { evaluateBash, type Mode } from "./policy.ts";
import * as writelock from "./writelock.ts";
import * as vicinity from "./vicinity.ts";
import * as permissions from "./permissions.ts";

export default function (pi: ExtensionAPI) {
  let mode: Mode = "CODE";
  const INSTANCE_ID = process.env.PI_INSTANCE_ID || "default";
  let lastNudge = 0;

  const resolvePath = (from: string, to: string) =>
    to.startsWith("/") ? path.resolve(to) : path.resolve(from, to);

  // ─── permlist (persistent gate memory) ───
  const AGENT_DIR = process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), ".pi", "agent");
  const perms = {
    store: permissions.loadStore(AGENT_DIR),
    allow(rule: string) {
      this.store = permissions.record(this.store, "allow", rule);
      permissions.saveStore(AGENT_DIR, this.store);
    },
    block(rule: string) {
      this.store = permissions.record(this.store, "block", rule);
      permissions.saveStore(AGENT_DIR, this.store);
    },
  };

  // ─── /mode ───
  pi.registerCommand("mode", {
    description: "Set safety mode: plan | code | orchestrator | yolo",
    handler: async (args, ctx) => {
      const m = (args || "code").toLowerCase();
      if (!["plan", "code", "orchestrator", "yolo"].includes(m)) {
        ctx.ui.notify(`Invalid mode: ${m}. Use plan|code|orchestrator|yolo`, "error");
        return;
      }
      mode = m.toUpperCase() as Mode;
      ctx.ui.notify(`Safety mode: ${mode}`, mode === "YOLO" ? "warning" : "info");
    },
  });

  // ─── /permlist ───
  pi.registerCommand("permlist", {
    description: "Gate memory: list | clear <rule>",
    handler: async (args, ctx) => {
      const parts = (args || "list").trim().split(/\s+/);
      if (parts[0] === "clear" && parts[1]) {
        perms.store = {
          allow: perms.store.allow.filter((r) => r !== parts[1]),
          block: perms.store.block.filter((r) => r !== parts[1]),
        };
        permissions.saveStore(AGENT_DIR, perms.store);
        ctx.ui.notify(`Cleared permlist rule '${parts[1]}'`, "info");
        return;
      }
      const a = perms.store.allow.map((r) => `  allow: ${r}`).join("\n") || "  (none)";
      const b = perms.store.block.map((r) => `  block: ${r}`).join("\n") || "  (none)";
      ctx.ui.notify(`Permlist:\n${a}\n${b}`, "info");
    },
  });

  // ─── /writelock ───
  pi.registerCommand("writelock", {
    description: "Worktree write-lock: acquire | release | status",
    handler: async (args, ctx) => {
      const sub = (args || "status").toLowerCase();
      const cwd = ctx.cwd;
      writelock.reapIfStale(cwd);
      if (sub === "acquire") {
        const l = writelock.readLock(cwd);
        if (l && l.owner !== INSTANCE_ID) {
          ctx.ui.notify(`Write-lock held by '${l.owner}'`, "warning");
          return;
        }
        ctx.ui.notify(
          l?.owner === INSTANCE_ID || writelock.acquire(cwd, INSTANCE_ID)
            ? `Write-lock acquired by '${INSTANCE_ID}'`
            : "Write-lock acquisition failed (race lost)",
          "info",
        );
      } else if (sub === "release") {
        ctx.ui.notify(
          writelock.release(cwd, INSTANCE_ID)
            ? `Write-lock released by '${INSTANCE_ID}'`
            : "No lock held by this instance",
          "info",
        );
      } else {
        const l = writelock.readLock(cwd);
        ctx.ui.notify(l ? `Write-lock: held by '${l.owner}' (fresh)` : "Write-lock: free", "info");
      }
    },
  });

  // ─── tool gate ───
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName === "bash") {
      const cmd = String(event.input.command ?? "");
      const verdict = evaluateBash(cmd, ctx.cwd, mode, resolvePath);
      if (verdict.action === "block") return { block: true, reason: verdict.reason };
      if (verdict.action === "confirm") {
        const rule = verdict.rule;
        if (permissions.isBlocked(perms.store, rule)) {
          return { block: true, reason: `Blocked forever by permlist rule '${rule}'. Remove it from gate-permissions.json to re-enable.` };
        }
        if (!permissions.isAllowed(perms.store, rule)) {
          if (!ctx.hasUI) {
            return { block: true, reason: `${verdict.reason} (auto-denied: no UI; approve once interactively to allow-always)` };
          }
          const choice = await ctx.ui.select(`Dangerous Command — ${verdict.reason}\n\n${cmd}`, [
            "Allow once",
            "Allow always",
            "Cancel",
            "Block forever",
          ]);
          if (choice === "Allow once") { /* fall through */ }
          else if (choice === "Allow always") { perms.allow(rule); }
          else if (choice === "Block forever") {
            perms.block(rule);
            return { block: true, reason: `Blocked forever: rule '${rule}' saved to permlist.` };
          } else { // Cancel or dismissed
            return { block: true, reason: `User denied: ${cmd.slice(0, 80)}` };
          }
        }
        // allowed (once/always/permlist): fall through
      }
      // Vicinity-conditional bash-write heuristics while a foreign lock is held.
      // HEURISTIC — catches the forgetful, not the adversarial.
      const l = (writelock.reapIfStale(ctx.cwd), writelock.readLock(ctx.cwd));
      if (l && l.fresh && l.owner !== INSTANCE_ID) {
        if (/>>|>(?!&)|\btee\b|\bsed\s+-i\b|\bcp\s|\bmv\s/.test(cmd)) {
          return {
            block: true,
            reason: `Worktree write-locked by '${l.owner}'; bash writes blocked. Wait, or ask the user to release.`,
          };
        }
      }
    }

    // Spec-file guard (soft): warn on edits, respect [FROZEN]
    if ((event.toolName === "write" || event.toolName === "edit") && mode !== "YOLO") {
      const p = String(event.input.path ?? "");
      if (p.includes("SPEC_") && p.endsWith(".md")) {
        ctx.ui.notify(`WARNING: Editing spec file ${p}. Respect [FROZEN] sections.`, "warning");
      }
    }

    // Write-lock enforcement on gated write tools
    if (event.toolName === "write" || event.toolName === "edit") {
      const peers = vicinity.heartbeatAndPeers(ctx.cwd, INSTANCE_ID);
      const w = writelock.mayWrite(ctx.cwd, INSTANCE_ID, peers.length > 0);
      if (!w.ok) {
        return {
          block: true,
          reason: `Worktree write-locked by '${w.owner}'. Wait for release, or ask the user (/writelock status).`,
        };
      }
    }
  });

  // ─── vicinity nudge: conditional, cooldown-limited ───
  pi.on("context", async (event, ctx) => {
    const peers = vicinity.heartbeatAndPeers(ctx.cwd, INSTANCE_ID);
    if (vicinity.shouldNudge(peers, lastNudge)) {
      lastNudge = Date.now();
      return {
        messages: [
          ...event.messages,
          { role: "user", content: vicinity.nudgeText(peers), timestamp: Date.now() },
        ],
      };
    }
  });

  // ─── session start ───
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.notify(
      `Safety gate active. Mode: ${mode}. Instance: ${INSTANCE_ID}. /mode and /writelock available.`,
      "info",
    );
  });
}
