# Design: The pi Harness Stack

The spirit of this stack, the decisions that govern it, and where they are
recorded. For operational history see `SETUP-REPORT.md`; for decision records
see `docs/adr/`. Rewritten 2026-10-06 after a design dialogue ("dismantle the
spirit") and the rediagnosis filed as issue #1.

## 0. Governing philosophy

Agents drift. Every layer of this stack exists to move a constraint from
something the agent was *told* into something the agent *cannot avoid*:

| Layer | Mechanism | Character |
|---|---|---|
| Steering | directives, spec files | advisory — the model chooses |
| Gate | safety-gate extension hooks | mechanical — in-process policy |
| Lock/heartbeat | files in the worktree | coordination — cooperative |
| Container | docker flags, cgroups | physical — kernel-enforced |

Two laws follow:

1. **No layer trusts the model. No layer pretends to be the layer below it.**
   Every rule declares its strength — heuristic, mechanical, physical — and
   heuristics never claim to be more.
2. **The seam between repo and soul is itself a layer**, and it must be at
   least as strong as what it ships. A mechanical gate delivered by an
   advisory channel is an advisory gate. (ADR 0001)

## 1. The three load-bearing moves

Everything else in this stack is scaffolding around these:

1. **Identity lives outside the body.** The soul directory (`~/.pi/agent`)
   is the agent; the container is a disposable body. Inside the soul,
   `extensions/` is mounted read-only — the learner cannot rewrite its own
   leash.
2. **Every rule declares its own strength.** Honesty about what a layer
   *cannot* enforce is itself the load-bearing invariant. Overclaiming makes
   the architecture theater.
3. **Coordination happens through files, never messages.** Write-lock,
   heartbeat, spec files. No agent-to-agent channel exists.

The pattern is **declared-strength defense in depth**: the system's honesty
is what makes the depth real.

## 2. The soul is a generated artifact (ADR 0001)

`~/.pi/agent` is materialized from this repo by an idempotent apply, and a
verify step proves what is present and loading. The repo is the source of
truth for everything the harness owns (extensions, protocol files); the soul
keeps its runtime data (sessions, auth, permlist) which apply never clobbers.

This makes "never edit the soul directly" the only sane path rather than a
convention: the directory is reproducible, hand-edits are disposable, and a
wipe (root upgrade, new machine) is recovered by re-apply — not by memory.

## 3. pi, the kernel

pi is a minimal agent loop: prompt → model → tool calls → results → repeat.
Its identity lives entirely in the soul: sessions as append-only files
(fork/rewind = pointing at an earlier entry), extensions as TypeScript hooks
auto-loaded from `extensions/`, directives as AGENTS.md, settings as JSON.
The process is disposable; the directory is the agent.

Extension hooks we rely on: `tool_call` (block/mutate before execution),
`context` (modify messages before each LLM call), `session_start`,
`registerCommand`. Verified against the shipped type definitions, not assumed.

## 4. pi-less-yolo, the jail

A mise shim that builds one `docker run` per invocation:

- Mounts exactly two host paths: `$(pwd)` at its real path, and the soul at
  `/pi-agent` (`PI_CODING_AGENT_DIR`).
- `--cap-drop=ALL`, `--no-new-privileges`, `--ipc=none`, host UID/GID.
  No docker socket inside, ever.
- Optional resource caps: `PI_MEMORY`, `PI_CPUS`, `PI_PIDS_LIMIT`.
- Blast radius by construction: one project directory.

pi-less-yolo is carried as a submodule of this repo, pinned to the fork
`cruzzed/pi-less-yolo`'s `local` branch.

## 5. The safety gate (behavioral policy)

Modular extension (`index.ts` wiring only; logic in `policy.ts`,
`writelock.ts`, `vicinity.ts`, `permissions.ts` — pure functions, unit-tested
via `mise run test`), deployed into the soul by apply (§2), never edited in
place.

### Write-lock — `.pi-writelock/`

Single-writer lock per worktree: a directory (atomic `mkdir`) with an `owner`
file. Fresh = mtime younger than 30 min; stale locks are reaped on sight.
First writer auto-acquires; foreign fresh locks block `write`/`edit` with the
owner named. Heuristic bash-write blocking while a foreign lock is held —
**catches the forgetful, not the adversarial**; physical write prevention is
`:ro` mounts, not this.

### Vicinity — `.pi-agents/<instance-id>`

Heartbeat files touched on `context` events; peers with mtime < 2 min are
"present." When present, a one-paragraph notice is appended to the next LLM
call (5-min cooldown). Conditional by design — solo agents hear nothing.

### Permlist — gate memory

Ask-by-default with persistent decisions (`allow once / allow always /
cancel / block forever`), coarse rule classes, stored in the soul as
`gate-permissions.json` — survives all containers. Hierarchy: permlist (the
user's standing decision) > gate defaults; AGENTS.md directives defer to
permlist.

## 6. Worktree doctrine

**1 branch ↔ 1 directory.** A worktree is a unique address; duplicates of the
same branch create divergent copies of "the same" work. Multiple agents on one
branch = one directory, coordinated by the lock. Isolation need = a different
branch = a different directory. (Geography is the bootstrap tool's business,
not the pi side's.)

## 7. Canonical run surface (ADR 0002)

The project's run surface is the mise tasks: `pi:spawn` (interactive TUI) and
`pi:web` (browser daemon; jails the pi-web daemon, which embeds pi
in-process). Pins and labels are defined once, here.

Browser-based bring-up exists as the maintainer's personal tooling, kept
outside this repo: not project scope, not canonical, not reconciled. Direct
`pi-less-yolo` invocation is the escape hatch, not a supported surface.

## 8. Agent protocol (ADR 0003)

`.pi/global-agents.md` is the live protocol — shrunk to the discipline the
surviving machinery supports: worktree doctrine, lock coordination, gate
enforcement, tmux-spawned subagents with a written objective, and spec files
as a *convention* (append-only external memory). The full Lead↔Spec↔Subagent
loop with probe reports is recorded in `docs/protocol-global-design.md`
should it ever earn un-retirement (a new ADR, not a silent drift).

## 9. Safety taxonomy

Safety decomposes by concern, each with an owning layer. The gate does NOT
protect the host (that's the container's job) — its territory is workspace
contents, coordination, and handoff UX.

| Concern | Owner | Strength |
|---|---|---|
| host system | container (mounts, caps, no socket) | physical |
| resources (loops/leaks) | cgroups + timeouts | physical |
| tool capability per role | spawn-time toolset restriction | mechanical |
| workspace contents | gate + git + worktrees | mechanical/heuristic |
| network egress | gate pattern blocks only | weakest layer |
| coordination | write-lock + vicinity | cooperative |
| repo → soul delivery | apply + verify | mechanical |

Blocks like mkfs/dd-to-device are intent *signals*, not enforcement — those
targets don't exist in the jail anyway. Pipe-to-shell blocks matter because
the network is open: unreviewed remote code executes in a room containing the
project and the soul dir.

## 10. What is deliberately NOT built

- No auto-merge, ever. Evaluation and merge are human.
- No cross-worktree agent messaging. Files are the shared state.
- No enforcement pretending to be stronger than it is.
- No subagent isolation inside pi itself; isolation comes from worktree +
  container.
- No probe-runner machinery (retired; see ADR 0003 and archive/).

## 11. Decision records

| ADR | Decision |
|---|---|
| 0001 | The soul is a generated artifact of this repo |
| 0002 | Canonical run surface; personal tooling out of scope |
| 0003 | Protocol shrunk to surviving tooling |
