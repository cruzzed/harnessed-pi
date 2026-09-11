import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { readLock, acquire, release, reapIfStale, mayWrite, LOCK_TTL_MS } from "./writelock.ts";
import { shouldNudge, nudgeText, heartbeatAndPeers } from "./vicinity.ts";

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "gate-test-"));
}

test("lock lifecycle: acquire, read, release", () => {
  const d = tmp();
  assert.equal(readLock(d), null);
  assert.equal(acquire(d, "a"), true);
  assert.equal(acquire(d, "b"), false); // atomic: second racer loses
  assert.deepEqual(readLock(d), { owner: "a", fresh: true });
  assert.equal(release(d, "b"), false); // not the owner
  assert.equal(release(d, "a"), true);
  assert.equal(readLock(d), null);
});

test("stale locks are reaped on sight", () => {
  const d = tmp();
  acquire(d, "old");
  const old = new Date(Date.now() - LOCK_TTL_MS - 1000);
  fs.utimesSync(path.join(d, ".pi-writelock"), old, old);
  assert.equal(readLock(d)?.fresh, false);
  assert.equal(reapIfStale(d), false); // reaped
  assert.equal(readLock(d), null);
  // and now a new owner can take it
  assert.equal(acquire(d, "new"), true);
});

test("mayWrite: foreign fresh lock blocks; owner passes", () => {
  const d = tmp();
  acquire(d, "a");
  assert.deepEqual(mayWrite(d, "b", false), { ok: false, owner: "a" });
  assert.deepEqual(mayWrite(d, "a", false), { ok: true });
});

test("mayWrite: first writer auto-acquires when peers present", () => {
  const d = tmp();
  assert.deepEqual(mayWrite(d, "a", true), { ok: true });
  assert.equal(readLock(d)?.owner, "a"); // pen taken
  assert.deepEqual(mayWrite(d, "b", true), { ok: false, owner: "a" });
});

test("mayWrite: no lock, no peers → write free, no lock created", () => {
  const d = tmp();
  assert.deepEqual(mayWrite(d, "a", false), { ok: true });
  assert.equal(readLock(d), null);
});

test("vicinity: heartbeat registers self, fresh peers visible, stale gone", () => {
  const d = tmp();
  heartbeatAndPeers(d, "a");
  assert.deepEqual(heartbeatAndPeers(d, "b"), ["a"]); // b sees a
  const old = new Date(Date.now() - 5 * 60 * 1000);
  fs.utimesSync(path.join(d, ".pi-agents", "a"), old, old);
  assert.deepEqual(heartbeatAndPeers(d, "b"), []); // a's heartbeat went stale
});

test("nudge: only with peers, cooldown-limited", () => {
  const now = Date.now();
  assert.equal(shouldNudge([], 0, now), false);
  assert.equal(shouldNudge(["x"], 0, now), true);
  assert.equal(shouldNudge(["x"], now, now + 1000), false); // cooldown
  assert.ok(nudgeText(["x"]).includes("x"));
});
