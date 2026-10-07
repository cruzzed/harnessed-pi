# Global Harness Protocol: Pi Edition

Follow this protocol when orchestrating or acting as a subagent. It is shrunk
to the discipline the harness actually enforces — see ADR 0003 and
`docs/protocol-global-design.md` for the retired full protocol.

## 1. Roles

### Lead (this session)

- Delegate implementation to Subagents; do not write implementation code yourself.
- Never edit a worktree where a fresh foreign write-lock is held — the owner is named in `.pi-writelock/owner`.
- Coordinate through files only. Never message another agent directly; no such channel exists.

### Subagent (throwaway session)

- Complete exactly one written objective in at most 25 turns, then be destroyed.
- Stay inside the assigned worktree and layer. Respect the write-lock.
- Verify your own work with the project's tests before ending the turn.

## 2. Worktree doctrine

- 1 branch ↔ 1 directory. Never create a second directory for a branch that already has one.
- Isolation need → a different branch → a different directory.
- First writer to a worktree takes the pen (auto-acquire); everyone else coordinates or waits. `/writelock acquire|release|status` for explicit control.

## 3. Delegation

Before delegating, write the objective down:

- `SPEC_<feature>.md` in the worktree — append-only: narrative, decisions, task map. Never rewrite history in it; amend by appending.
- One objective per Subagent. If the work needs more than ~5 files, decompose into multiple spawns.

Spawn in an isolated worktree via tmux:

```bash
git worktree add ../<feature>-worktree -b feat/<feature>-subagent
tmux new-session -d -s "pi-subagent-<feature>" \
  "cd ../<feature>-worktree && pi --no-history \
     -p '<objective, pasted from the spec. Max 25 turns. Stay in scope.>'"
tmux kill-session -t "pi-subagent-<feature>"   # when done
git worktree remove ../<feature>-worktree
```

## 4. Evaluation

Evaluate a Subagent's work by reading the diff and running the tests — not by
reading code from scratch. Accept → merge. Reject → respawn with a smaller
objective and a sharper spec. After three failed attempts, halt and hand to
the human; do not keep respawning.

## 5. Human handoff

Halt immediately and hand off when:

- A Subagent reports a security concern or an unexpected destructive operation.
- The same failure repeats three times (divergent or not).
- The cost/token cap is exceeded.
- The user says "halt" or "stop."

## 6. Self-improvement: propose, don't touch

Harness source — this repo, the jail, the gate — is owner territory. Your own
leash is read-only at runtime for a reason; its source is off-limits by
protocol.

- Never edit harness source. Not the gate, not the jail, not the protocol files.
- To improve the harness, write `GROWTH-<id>.md` in your worktree: what to
  change, why, the exact patch, and the strength label (heuristic /
  mechanical / physical) of every affected rule.
- End your turn immediately after writing it, with a handoff item for the owner.
- The owner applies it and runs `mise run check`. Tests + verify are the
  court. There is no other path to changing the harness.

## 7. Pi command reference

| Command | When to use |
|---|---|
| `/fork` | Before risky delegation. Creates a session branch. |
| `/rewind` | Catastrophic failure. Return to pre-fork state. |
| `/mode plan` | Auditing. Read-only. |
| `/mode code` | Active implementation. |
| `/mode orchestrator` | Delegating to subagents. |
| `/include .pi/global-agents.md` | Reload protocol if context drifts. |

---

## 8. Delivery Principles (framework-agnostic)

Apply these to every implementation task:

1. **Slice by use case at milestones; scatter by concern between them.** Before committing, ask: does this complete a use case? Yes → bundle backend + UI + test in one commit ("<capability> ready with tests"). No → smallest coherent single-layer commit.
2. **Tests prove the use case, not the unit.** Test at the outermost practical boundary (feature/HTTP level), colocated in the capability's commit. Browser-automation tests only for genuinely UI-critical flows. Test file mirrors the class/module it covers.
3. **Close every branch with a test pass.** Before opening a PR: run the suite, close coverage gaps, commit the closing pass.
4. **Touch order follows branch intent.** Integration/API branch → backend first, surface only after logic is proven. Fix branch → symptom/surface first, then trace down. Feature branch → vertical scaffold first, then alternate logic/presentation clusters.
5. **Commit messages carry lifecycle state — honestly.** Label WIP as draft/WIP, label review-response commits, flag untested changes explicitly ("added X, not tested yet"), credit feedback sources inline. Never write a polished message for unproven work.
6. **Checkpoint per green step.** After each small increment that compiles/passes: commit immediately, subject-line only, don't batch.
7. **Formatting is a reflex.** Run the project's formatter after every session, not just before PRs.
8. **Guard the slice discipline against drift.** If a branch accumulates ~5+ fix-commits with no completed use-case slice, stop — propose re-slicing, splitting the PR, or redefining the milestone. Don't keep polishing.
