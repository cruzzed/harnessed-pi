# ADR 0008: Self-growth by proposal — "propose, don't touch"

- Status: accepted
- Date: 2026-10-07

## Context

The stack's design allows the agent to grow itself — but the first law (no
layer trusts the model) must hold even for self-improvement. The owner's
instinct: a "pull request" the owner approves. Fork: file convention vs.
convention plus a `/propose` gate helper vs. branch-based proposals.

## Decision

**File convention only — no new machinery.** Self-growth is a workflow over
the existing planes, and every stage already exists:

1. The agent **proposes**: writes `GROWTH-<id>.md` in its worktree — what to
   change, why, the exact patch, and the strength label of every affected
   rule — then ends its turn with a handoff item. (Files, not messages.)
2. The owner **reviews and applies** — human judgment, the PR approval.
3. `mise run check` is the CI + deploy: tests must pass, apply + verify prove
   byte-identical deployment. A bad self-patch cannot reach the soul without
   passing the suite.

Until the proposal is merged, the runtime leash stays read-only (physical)
and harness source stays untouched by convention: the harness repo is owner
territory, agents work in worktrees of other projects. Once ADR 0006 lands, a
custom gate rule blocking writes to the harness-repo path upgrades the
geography convention to mechanical.

## Consequences

- The convention lives in `.pi/global-agents.md` (protocol, advisory). Its
  enforcement at deploy time is mechanical; its prevention (don't touch the
  source) is convention until ADR 0006's rules exist.
- No `/propose` helper, no branch machinery. If proposals turn out
  ill-formatted in practice, a helper is a later ADR — not now.
- The same shape serves code changes, gate-policy changes (as data, per ADR
  0006), and new conventions: everything is a proposal file.
