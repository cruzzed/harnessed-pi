# ADR 0002: Canonical run surface; personal tooling is out of scope

- Status: accepted
- Date: 2026-10-06

## Context

Three surfaces could launch an agent: `pi:spawn` (mise task, TUI), the
`pi:web` mise task (browser), plus a personal browser bring-up script and
direct `pi-less-yolo` invocation. The 2026-10-05 rediagnosis found version
skew (container on pi 0.85.1, repo at 1.0.2), deregistered `piweb:*` mise
tasks, and dead paths in comments — all drift born from multiple surfaces
carrying separate pins, registrations, and docs.

Design dialogue 2026-10-06: the maintainer clarified their browser bring-up
script is *personal* tooling, not part of the project's canonical surface,
and it must not live in (or be named in) this repo.

## Decision

The project's canonical run surface is the mise tasks in this repo:
`pi:spawn` (interactive TUI) and `pi:web` (browser daemon). All pins, labels,
and flags are defined once, in the repo.

The maintainer's personal bring-up tooling is not project scope: it does not
live in this repo, and the project does not maintain, document as canonical,
or reconcile it. It owns its own valet/sudo coupling and its own
park-forever risks.

Direct `pi-less-yolo` invocation remains the escape hatch (it is the
underlying shim) but is not a supported surface.

Consequences:

- Documentation names `pi:spawn` / `pi:web` as the run surface; personal
  tooling is unnamed and out of scope.
- Fixes to the jail ship in one place; skew like 0.85.1-vs-1.0.2 becomes a
  repo-state question, not a which-launcher question.
- The web mode's known issues (no-timeout confirm modal, startup snapshotting)
  are fenced in the canonical `pi:web` task, not in a side script.
