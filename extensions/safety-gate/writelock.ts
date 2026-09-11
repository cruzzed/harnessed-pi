/**
 * writelock.ts — single-writer lock for a worktree.
 *
 * The lock is a DIRECTORY (`.pi-writelock/`) because mkdir is atomic:
 * two racers cannot both succeed. Owner identity lives in an `owner` file.
 * Freshness is mtime-based with a TTL — a killed container cannot clean up,
 * so stale locks are reaped on sight by whoever notices first.
 *
 * Functions take cwd explicitly and stay close to the fs — thin enough that
 * behavior is verified by the unit tests with temp dirs.
 */

import * as fs from "node:fs";
import * as path from "node:path";

export const LOCK_TTL_MS = 30 * 60 * 1000;

export type LockState = { owner: string; fresh: boolean } | null;

const lockDir = (cwd: string) => path.join(cwd, ".pi-writelock");

export function readLock(cwd: string, now = Date.now()): LockState {
  try {
    const st = fs.statSync(lockDir(cwd));
    let owner = "unknown";
    try {
      owner = fs.readFileSync(path.join(lockDir(cwd), "owner"), "utf8").trim();
    } catch { /* dir without owner file: still a lock */ }
    return { owner, fresh: now - st.mtimeMs < LOCK_TTL_MS };
  } catch {
    return null;
  }
}

export function acquire(cwd: string, instanceId: string): boolean {
  try {
    fs.mkdirSync(lockDir(cwd));
    fs.writeFileSync(path.join(lockDir(cwd), "owner"), `${instanceId}\n`);
    return true;
  } catch {
    return false;
  }
}

export function release(cwd: string, instanceId: string): boolean {
  const l = readLock(cwd);
  if (!l || l.owner !== instanceId) return false;
  fs.rmSync(lockDir(cwd), { recursive: true, force: true });
  return true;
}

/** Remove the lock iff stale. Returns true if a lock remains (fresh). */
export function reapIfStale(cwd: string, now = Date.now()): boolean {
  const l = readLock(cwd, now);
  if (l && !l.fresh) {
    fs.rmSync(lockDir(cwd), { recursive: true, force: true });
    return false;
  }
  return l !== null;
}

/**
 * Gate decision for a write attempt: may `instanceId` write right now?
 * - foreign fresh lock → no (owner named)
 * - no lock but peers present → try to auto-acquire (first writer takes the pen)
 */
export function mayWrite(
  cwd: string,
  instanceId: string,
  peersPresent: boolean,
): { ok: true } | { ok: false; owner: string } {
  reapIfStale(cwd);
  const l = readLock(cwd);
  if (l && l.fresh && l.owner !== instanceId) return { ok: false, owner: l.owner };
  if (!l && peersPresent && !acquire(cwd, instanceId)) {
    return { ok: false, owner: readLock(cwd)?.owner ?? "another instance" };
  }
  return { ok: true };
}
