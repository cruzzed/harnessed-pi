/**
 * permissions.ts — persistent gate memory ("permlist").
 *
 * The gate asks by default; the user's decision can persist:
 *   allow_always  → rule id lands in `allow`, consulted even headless
 *   block_forever → rule id lands in `block`, promotes confirm → block
 *
 * Rule ids are coarse rule classes (e.g. "conditional:git reset --hard",
 * "rm-rf-outside"), not exact command strings — exact strings never repeat,
 * classes capture intent. Deliberately simple; refine only with evidence.
 *
 * Storage: JSON file in the pi agent dir (writable soul). Last-writer-wins
 * under concurrent agents — accepted; this is a convenience store, not a
 * security boundary (physical enforcement is the container).
 */

import * as fs from "node:fs";
import * as path from "node:path";

export type PermStore = { allow: string[]; block: string[] };

const EMPTY: PermStore = { allow: [], block: [] };

export function storePath(agentDir: string): string {
  return path.join(agentDir, "gate-permissions.json");
}

export function loadStore(agentDir: string): PermStore {
  try {
    const raw = JSON.parse(fs.readFileSync(storePath(agentDir), "utf8"));
    return {
      allow: Array.isArray(raw.allow) ? raw.allow.filter((x: unknown) => typeof x === "string") : [],
      block: Array.isArray(raw.block) ? raw.block.filter((x: unknown) => typeof x === "string") : [],
    };
  } catch {
    return { ...EMPTY };
  }
}

export function isAllowed(store: PermStore, rule: string): boolean {
  return store.allow.includes(rule);
}

export function isBlocked(store: PermStore, rule: string): boolean {
  return store.block.includes(rule);
}

export function record(store: PermStore, kind: "allow" | "block", rule: string): PermStore {
  const next: PermStore = {
    allow: store.allow.filter((r) => r !== rule),
    block: store.block.filter((r) => r !== rule),
  };
  next[kind].push(rule);
  return next;
}

export function saveStore(agentDir: string, store: PermStore): void {
  fs.mkdirSync(agentDir, { recursive: true });
  const tmp = storePath(agentDir) + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2) + "\n");
  fs.renameSync(tmp, storePath(agentDir)); // atomic on same fs
}
