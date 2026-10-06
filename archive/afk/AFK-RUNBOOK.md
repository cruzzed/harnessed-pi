# AFK Runbook — pi-agent headless execution

How to run a feature while you're away. The interactive protocol in
`.pi/global-agents.md` still applies for attended sessions; this runbook is the
unattended path, where git checkpoints replace `/fork` and `/rewind`.

## 1. Pre-flight (before you walk away, ~5 min)

- [ ] Spec written at `probes/SPEC_<feature>.md`, all `[DRAFT]` sections resolved
      into `[FROZEN]` amendments (spec completion gate, global-agents.md §3).
      There is no one to answer questions while you're gone — an ambiguous spec
      produces a `partial` or `fail` report, not a clarification.
- [ ] `status: frozen` in the spec frontmatter. `afk-run.sh` refuses otherwise.
- [ ] Project tree clean: `git status` empty. HEAD is your rewind point.
- [ ] `KIMI_API_KEY` present in `~/.config/pi-agent/env`.
- [ ] No secrets readable in the project dir — the container mount is writable
      and the agent has network access.

## 2. Run

```bash
cd <project-root>
~/piagent/afk-run.sh probes/SPEC_<feature>.md
```

What happens: worktree `../<project>-afk-<feature>` on branch
`feat/<feature>-afk`, pi headless in the container (`timeout 1800`,
`PI_MEMORY=4g`, `PI_PIDS_LIMIT=512`), log at `probes/RUN_<feature>_<ts>.log`.
Nothing is committed or merged. Hard kill: `docker ps` → `docker stop`, or just
let the 30-min timeout bite.

## 3. Evaluate (when you're back)

Read `probes/REPORT_<feature>.json` **and the diff** — headless mode has no
Lead Agent watching, so you are the evaluation step. Decision table
(global-agents.md §4 Step 4):

| Condition | Action |
|---|---|
| probe pass + regression pass + no anomalies | Accept: `git merge feat/<feature>-afk` |
| probe pass + regression fail | Reject: remove worktree, respawn with smaller scope |
| probe fail + spec unclear | Amend spec (append `[FROZEN] Amendment`), respawn |
| probe fail 3×, divergent reasons | Halt: you decide refactor/strangle/revert |
| probe fail 3×, same reason | Deprecate spec section, `git worktree remove --force`, rewind |

Also check: `files_changed` ≤ 5 (script warns), no files outside the task map,
log tail for safety-gate blocks (`grep -i "block" probes/RUN_*.log`).

## 4. Cleanup

```bash
git worktree remove --force ../<project>-afk-<feature>   # after merge or reject
git branch -D feat/<feature>-afk                          # only if rejected
```

## Failure modes worth knowing

- **Timeout (exit 124):** partial work stays in the worktree, uncommitted.
  Report may be missing. Evaluate the diff directly.
- **Conditional-block commands** (`rm -rf`, `git reset --hard`, …): headless has
  no UI, so the safety gate auto-denies them. A run that needed one stalls —
  check the log for `Blocked ... no UI available`.
- **Ambiguous spec:** the agent guesses and logs it under
  `suggested_spec_amendments`. Treat guesses as drafts, not truth.
