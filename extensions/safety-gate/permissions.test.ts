import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { loadStore, saveStore, record, isAllowed, isBlocked, storePath } from "./permissions.ts";

test("missing file yields empty store", () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "perms-"));
  assert.deepEqual(loadStore(d), { allow: [], block: [] });
});

test("record moves a rule between lists and dedupes", () => {
  let s = { allow: [], block: [] };
  s = record(s, "allow", "conditional:git reset --hard");
  s = record(s, "allow", "conditional:git reset --hard"); // no dupes
  assert.deepEqual(s.allow, ["conditional:git reset --hard"]);
  s = record(s, "block", "conditional:git reset --hard"); // flips list
  assert.deepEqual(s, { allow: [], block: ["conditional:git reset --hard"] });
  assert.ok(isBlocked(s, "conditional:git reset --hard"));
  assert.ok(!isAllowed(s, "conditional:git reset --hard"));
});

test("save/load round-trips; corrupt file degrades to empty", () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "perms-"));
  let s = record(record(loadStore(d), "allow", "rm-rf-outside"), "block", "absolute:sudo");
  saveStore(d, s);
  assert.deepEqual(loadStore(d), s);
  fs.writeFileSync(storePath(d), "{not json");
  assert.deepEqual(loadStore(d), { allow: [], block: [] });
});

test("malformed store fields are filtered, not trusted", () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "perms-"));
  fs.writeFileSync(storePath(d), JSON.stringify({ allow: ["ok", 42, null], block: "nope" }));
  assert.deepEqual(loadStore(d), { allow: ["ok"], block: [] });
});
