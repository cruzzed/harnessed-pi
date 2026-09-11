/**
 * vicinity.ts — who's nearby, and when to tell the model about it.
 *
 * Registry: heartbeat files `.pi-agents/<instance-id>` in the worktree,
 * touched on every LLM call. Presence is mtime-freshness (< 2 min), so dead
 * instances evaporate on their own — no unregister path to leak.
 *
 * The nudge is conditional by design: solo agents hear nothing.
 */

import * as fs from "node:fs";
import * as path from "node:path";

export const HEARTBEAT_FRESH_MS = 2 * 60 * 1000;
export const NUDGE_COOLDOWN_MS = 5 * 60 * 1000;

const agentsDir = (cwd: string) => path.join(cwd, ".pi-agents");

/** Touch own heartbeat, return ids of other fresh instances. */
export function heartbeatAndPeers(cwd: string, instanceId: string, now = Date.now()): string[] {
  try {
    fs.mkdirSync(agentsDir(cwd), { recursive: true });
    fs.writeFileSync(path.join(agentsDir(cwd), instanceId), "");
    return fs
      .readdirSync(agentsDir(cwd))
      .filter((f) => f !== instanceId)
      .filter((f) => {
        try {
          return now - fs.statSync(path.join(agentsDir(cwd), f)).mtimeMs < HEARTBEAT_FRESH_MS;
        } catch {
          return false;
        }
      });
  } catch {
    return [];
  }
}

/** Pure nudge decision: peers present and cooldown elapsed. */
export function shouldNudge(peers: string[], lastNudgeAt: number, now = Date.now()): boolean {
  return peers.length > 0 && now - lastNudgeAt > NUDGE_COOLDOWN_MS;
}

export function nudgeText(peers: string[]): string {
  return (
    `[multi-agent notice] ${peers.length + 1} agent instances share this worktree ` +
    `(${peers.join(", ")} + you). Write ONLY via the write/edit tools — bash writes ` +
    `bypass the write-lock. Your first write/edit auto-acquires .pi-writelock; if ` +
    `blocked, the lock owner is named in the reason — wait and retry, do not work around it.`
  );
}
