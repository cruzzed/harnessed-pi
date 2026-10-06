# ADR 0003: Protocol shrunk to surviving tooling

- Status: accepted
- Date: 2026-10-06

## Context

`.pi/global-agents.md` mandated a Lead ↔ Spec ↔ Subagent loop with
`SPEC_*.md` files, probe scripts, and `REPORT_*.json` evaluation. The
machinery implementing that loop (probe templates, the AFK runner) was
retired to `archive/`, frozen — while the prompt half stayed live. Agents were
instructed to use a workflow whose machinery no longer exists.

Design dialogue 2026-10-06 ("dismantle the spirit"): the full protocol's value
is *verified* delegation; a shrunk protocol's value is *honest* delegation.
The probe machinery was retired once already and would have to earn its place
again. Chosen: honesty over machinery.

## Decision

`.pi/global-agents.md` is rewritten to the multi-agent discipline the
surviving machinery actually supports:

- Worktree doctrine (1 branch ↔ 1 directory) and write-lock coordination.
- Gate enforcement and handoff triggers.
- tmux-spawned Subagents with a written objective.
- Spec files survive as a *convention*: append-only external memory for
  decisions and task maps — not a gated protocol with a report schema.

The mandatory probe-script / REPORT.json loop is dropped. Verification of
delegated work is ordinary tests, not a report format.

Consequences:

- `docs/protocol-global-design.md` (the pre-shrink design) remains the record
  of the full protocol if it is ever un-retired.
- Deletion over machinery: no runner to deploy, verify, or maintain.
- Delegation is less formally verifiable; the human reads diffs and tests,
  not reports. If that proves insufficient in practice, un-retiring the
  probes loop is a new ADR, not a silent drift.
