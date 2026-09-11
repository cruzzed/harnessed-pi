# AGENTS.md — piagent workspace

The harness home: everything that makes pi *ours*. Source of truth for the
safety gate, pi-web layers, protocol docs, and fleet tooling.

## Layout

| Path | Role |
|---|---|
| `extensions/safety-gate/` | The gate, modularized. `index.ts` = wiring only; logic lives in `policy.ts` (pure, unit-tested), `writelock.ts`, `vicinity.ts` |
| `pi-web/` | Web UI layer (agegr flavor: `Dockerfile.agegr`, `piweb:agegr*` mise tasks) |
| `docs/DESIGN.md` | Architecture and design doctrine — read before changing conventions |
| `.pi/global-agents.md`, `.pi/project-agents.md` | The harness protocol (Lead/Spec/Subagent) |
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
- `.env` is gitignored and must stay out of this directory (rotate-on-sight).
