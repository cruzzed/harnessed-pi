# Design: The pi Harness Stack

What we built, why, and the rules it operates by. Written 2026-09-11 after two
days of bring-up; the authoritative record of design decisions. For operational
history see `SETUP-REPORT.md`.

## 0. Governing philosophy

Agents drift. Every layer of this stack exists to move a constraint from
something the agent was *told* into something the agent *cannot avoid*:

| Layer | Mechanism | Character |
|---|---|---|
| Steering | dictation, specs, AGENTS.md | advisory — the model chooses |
| Gate | safety-gate.ts hooks | mechanical — in-process policy |
| Lock/heartbeat | files in the worktree | coordination — cooperative |
| Container | docker flags, cgroups | physical — kernel-enforced |

No layer trusts the model. No layer pretends to be the layer below it.

## 1. pi, the kernel

pi is a minimal agent loop: prompt → model → tool calls → results → repeat.
Its identity lives entirely in `~/.pi/agent/` (the **soul**): sessions as
append-only files (fork/rewind = pointing at an earlier entry), extensions as
TypeScript hooks auto-loaded from `extensions/`, directives as `AGENTS.md`,
settings as JSON. The process is disposable; the directory is the agent.

Extension hooks we rely on: `tool_call` (block/mutate before execution),
`context` (modify messages before each LLM call), `session_start`,
`registerCommand`. Verified against the shipped type definitions, not assumed.

## 2. pi-less-yolo, the jail

A mise shim that builds one `docker run` per invocation:

- Mounts exactly two host paths: `$(pwd)` at its real path, and
  `~/.pi/agent` at `/pi-agent` (`PI_CODING_AGENT_DIR`).
- `--cap-drop=ALL`, `--no-new-privileges`, `--ipc=none`, host UID/GID,
  `--rm`. No docker socket inside, ever.
- Optional resource caps: `PI_MEMORY`, `PI_CPUS`, `PI_PIDS_LIMIT`.
- **Body/soul split:** the container is a fresh body each run; `/pi-agent`
  persists everything. Inside the soul, `extensions/` is mounted read-only —
  the learner cannot rewrite its own leash.

Blast radius by construction: one project directory. Nothing else exists in
there. (Verified: `~` inside contains only the project.)

## 3. The safety gate (behavioral policy)

Source: `~/piagent/extensions/safety-gate/` (modular: `index.ts` wiring +
`policy.ts`/`writelock.ts`/`vicinity.ts`, unit-tested via `mise run test`),
deployed by rsync to `~/.pi/agent/extensions/safety-gate/` (a directory
extension — pi auto-discovers `index.ts`). Never edit the deployed copy. Original policy from `piagent.md`
(absolute blocks, conditional blocks with UI confirm, PLAN/CODE modes via
`/mode`, SPEC-file warnings) plus coordination v2:

### Write-lock — `.pi-writelock/`

Single-writer lock per worktree, a directory (atomic `mkdir` acquisition)
containing an `owner` file. Fresh = mtime younger than 30 min; stale locks are
reaped on sight (a killed container cannot clean up). Rules:

- `write`/`edit` while a fresh foreign lock is held → blocked, owner named.
- First `write`/`edit` with peers present → auto-acquire (first writer takes
  the pen; losers get a named-owner reason).
- `/writelock acquire|release|status` for explicit control.
- Heuristic bash-write blocking (`>`, `>>`, `tee`, `sed -i`, `cp`, `mv`) only
  while a foreign lock is held. **Heuristic: catches the forgetful, not the
  adversarial.** Physical write prevention is `:ro` mounts, not this.

### Vicinity — `.pi-agents/<instance-id>`

Heartbeat files touched on every `context` event. Peers with mtime < 2 min are
"present." When present, a one-paragraph notice is appended to the next LLM
call (5-min cooldown): write via gated tools only, respect the lock, don't work
around blocks. Conditional by design — solo agents hear nothing.

### Instance identity

`PI_INSTANCE_ID` env (forwarded into the container, also `ply.instance` label).
Unlabeled agents share id `default` and are *invisible to each other* — always
give concurrent agents distinct ids.

## 4. Worktree doctrine

**1 branch ↔ 1 directory.** A worktree is a unique address; duplicates of the
same branch create divergent copies of "the same" work, ambiguous merges, and
lock domains that map to nothing. Enforced at bootstrap by the user's
`worktree-bootstrap` tool (the pi side takes no position on geography).

Multiple agents on one branch = one directory, coordinated by the lock.
Isolation need = a different branch = a different directory.

## 5. Fleet interface (mise tasks)

cwd is the only context. Callers `cd` into the worktree; tasks take no paths.

- `pi:spawn [id] [-p "prompt"]` — detached, labeled, named
  `ply-<project>-<branch>-<id>`. Interactive spawns keep `-it` for
  `docker attach`; headless spawns close stdin (`pi -p` blocks on stdin EOF)
  and drop `--rm` so logs survive exit.
- `pi:agents` — containers (label-filtered), write-lock owner/freshness,
  vicinity list. The worktree is the database; this is a read-only view.
- `pi:web` — pi-web UI in the `pi-less-yolo-web` image (pi-web embeds pi
  in-process, so the *daemon* is what gets jailed). `PI_WEB_INSTANCE` separates
  concurrent daemons: deterministic port 8504–8599 and per-instance data dir
  (sessiond requires exclusive data-dir ownership). Localhost publish only.

Every run is labeled (`ply.project`, `ply.worktree`) by default via
`_docker_flags` git probing — even hand-run agents are discoverable.

## 6. Integration contract (for worktree-bootstrap)

Four optional env vars at spawn time; nothing else:

| Variable | Effect |
|---|---|
| `PI_INSTANCE_ID` | lock owner id, heartbeat id, container label |
| `PI_LABELS` | extra `k=v` docker labels |
| `PI_CONTAINER_NAME` | container `--name` |
| `PI_WEB_INSTANCE` | pi:web port + data-dir derivation |

State inspection needs no docker API: `cat .pi-writelock/owner`,
`stat .pi-agents/*`.

## 7. What is deliberately NOT built

- No auto-merge, ever. Evaluation and merge are human.
- No cross-worktree agent messaging. The spec/lock files are the shared state.
- No enforcement pretending to be stronger than it is: bash-write blocking is
  heuristic; only `:ro` mounts and cgroups are physical.
- No subagent isolation inside pi itself (it has none); isolation comes from
  worktree + container, not from pi.

## 8. Known operational facts (hard-won)

- Tailscale accepting a tailnet-advertised `172.17.0.0/16` route hijacks all
  docker bridge traffic. `accept-routes=false` + delete stale table-52 routes;
  systemd unit `docker-routing-fix.service` keeps a protective ip rule.
- ufw with default DROP policies needs `allow in on docker0` +
  `route allow in on docker0` for containers to reach host/internet.
- Chainguard node `-dev` images already carry gcc/g++/make/python3 — no apk
  needed for native module builds (node-pty).
- The image's `.npmrc` redirects `npm install -g` to `/pi-agent/npm-global`,
  which the runtime mount shadows — image-time installs need `--prefix=/usr/local`.
- `docker logs` of `--rm` containers vanish at exit; headless spawns drop `--rm`.

## 9. Web UI (pi-web layer, ~/piagent/pi-web/)

One flavor: **agegr** — minimalist, one process, reads pi session files
directly, no data-dir lock, `PI_WEB_PASSWORD` auth option, built-in worktree
switcher. Namespace `piweb:agegr*`, cwd-is-context like all tasks. Installed
from npm (`@agegr/pi-web`) as a dependency, not forked. Pins pi 0.85.1
(nested); CLI image pi may differ — bump base via `pi:upgrade` if
session-format drift ever bites. (The jmfederico battleship layer was removed
2026-09-12 — too invasive to integrate without breaking things.)

Gate verified firing in-session. Known deltas for web agents: no
container-context system-prompt injection (web agents don't know they're in a
container — put it in project AGENTS.md), extension/setting changes need a
daemon restart (startup snapshots), and the UI worktree-switcher can't reach
sibling worktrees (jail sees one dir).

Gate `confirm()` dialogs: **agegr ≥0.9.0 bridges them to a browser modal**
(verified 2026-09-11 — the gate's 4-choice select for `git reset --hard`
surfaced as an `extension_ui_request` over SSE and `Allow once` let the
command run; no timeout, so the agent turn blocks until a human answers —
unattended web runs can park indefinitely). Below 0.9.0 they auto-deny.

## 10. Safety taxonomy (revised philosophy)

Safety decomposes by concern, each with an owning layer. The gate does NOT
protect the host (that's the container's job) — its real territory is the
workspace contents, network governance, coordination, and handoff UX.

| Concern | Owner | Strength |
|---|---|---|
| host system | container (mounts, caps, no socket) | physical |
| resources (loops/leaks) | cgroups + timeouts | physical |
| tool capability per role | spawn-time toolset restriction | mechanical |
| workspace contents | gate + git + worktrees | mechanical/heuristic |
| network egress | gate pattern blocks only | weakest layer |
| coordination | write-lock + vicinity | cooperative |

Blocks like mkfs/dd-to-device are intent *signals*, not enforcement — those
targets don't exist in the jail anyway. Pipe-to-shell blocks matter because
the network is open: unreviewed remote code executes in a room containing the
project and the soul dir.

## 11. Permlist (gate memory)

Ask-by-default with persistent decisions, Claude-Code-style:
`allow once / allow always / cancel / block forever`. Rules are coarse classes
(`conditional:git reset --hard`, `rm-rf-outside`, …), stored in
`gate-permissions.json` in the soul dir (survives all containers).
Allow-rules are consulted headless — approve once in the TUI, applies to
web/headless runs. Block-rules promote a confirm class to a hard block.
`/permlist list|clear <rule>` inside sessions. Hierarchy: permlist (user's
standing decision) > gate defaults; AGENTS.md directives defer to permlist.

## 12. Toolbox (`~/.pi/toolbox`)

User-curated global tools, mounted read-only at `/toolbox` in every container.
`mise run pi:toolbox add|list|remove`. musl image ⇒ statically-linked binaries
or scripts only (enforced at add time via ldd check). Read-only so agents
can't poison the shared toolset.
