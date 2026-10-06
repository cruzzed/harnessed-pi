# AGENTS.md — piagent workspace

The harness home: everything that makes pi *ours*. Source of truth for the
safety gate, pi-web layers, protocol docs, and fleet tooling.

## Layout

| Path | Role |
|---|---|
| `extensions/safety-gate/` | The gate, modularized. `index.ts` = wiring only; logic lives in `policy.ts` (pure, unit-tested), `writelock.ts`, `vicinity.ts`, `permissions.ts` |
| `pi-less-yolo/` | Submodule → fork `cruzzed/pi-less-yolo`, branch `local` (the jail) |
| `pi-web/` | Web UI layer (`Dockerfile.agegr`, `piweb:*` mise tasks). The maintainer's browser bring-up script is personal tooling, out of scope (ADR 0002) |
| `docs/DESIGN.md` | Design doctrine — read before changing conventions |
| `docs/adr/` | Decision records; a decision is not real until it is written here |
| `.pi/global-agents.md`, `.pi/project-agents.md` | The imperative protocol instructions agents follow directly (shrunk per ADR 0003) |
| `docs/protocol-global-design.md` | Design-doc counterpart of `.pi/global-agents.md` — pre-shrink full protocol, frozen record |
| `docs/protocol-project-design.md` | Design-doc counterpart of `.pi/project-agents.md` (verbatim pre-instruction form) |
| `archive/` | Retired experiments (AFK tooling), frozen |
| `SETUP-REPORT.md` | Operational history, append-only addenda |

## Commands

- `mise run test` — unit tests (node --test, type-stripped TS; mise provides node 26)
- `mise run deploy` — rsync `extensions/safety-gate/` → `~/.pi/agent/extensions/safety-gate/`
- `mise run check` — test + deploy

## Conventions (law)

- **Never edit `~/.pi/agent/extensions/` directly.** Edit here, `mise run check`.
- `index.ts` wires; it contains no logic. New policy goes in `policy.ts` as a
  pure function + a test. New coordination state goes in `writelock.ts` or
  `vicinity.ts` + a test.
- Every enforcement rule must be labeled with its strength: heuristic
  (string matching) vs mechanical (tool gating) vs physical (container).
  Heuristics never claim to be more.
- Blocks never terminate the turn; reasons carry the "needs human" handoff
  protocol.
- Deployment is a directory (`index.ts` entry), not a single file.
- `pi-less-yolo/` is a submodule. Customizations commit on branch `local`,
  push to the fork, then bump the gitlink here. The live install
  `~/projects/pi-less-yolo` tracks the same branch via its `fork` remote.
  (All projects live under `~/projects/` since 2026-09; old paths are symlinks.)
- `.env` is gitignored and must stay out of this directory (rotate-on-sight).
