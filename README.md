# harnessed-pi

The harness that makes pi *ours*: a locked-down container, a behavioral
safety gate, a web UI layer, and the protocols/fleet tooling to run multiple
agents without them stepping on each other.

## The stack

| Layer | Role | Source |
|---|---|---|
| pi | the agent kernel | npm `@earendil-works/pi-coding-agent` |
| pi-less-yolo | the jail — Chainguard container, caps dropped, project-only mounts | submodule → fork `cruzzed/pi-less-yolo`, branch `local` |
| safety-gate | behavioral policy (blocks, permlist, write-lock, vicinity) | `extensions/safety-gate/` → deployed to `~/.pi/agent/extensions/` |
| pi-web | web UI (agegr, minimalist) on the jail image | `pi-web/` — npm `@agegr/pi-web`, a dependency, not forked |

## Layout

- `extensions/safety-gate/` — the gate; `index.ts` wires, logic in
  `policy.ts` / `writelock.ts` / `vicinity.ts`, all unit-tested
- `pi-web/` — `Dockerfile.agegr` + `piweb:agegr*` mise tasks
- `pi-less-yolo/` — submodule (fork); customizations live on branch `local`
- `docs/DESIGN.md` — architecture and doctrine; read before changing conventions
- `.pi/` — harness protocol (global/project agents)
- `archive/` — retired experiments, frozen
- `SETUP-REPORT.md` — operational history, append-only

## Quickstart

```bash
git clone --recurse-submodules <this-repo> piagent && cd piagent
mise trust && mise run check        # unit-test + deploy the safety gate
cd pi-less-yolo && mise trust && mise run install && mise run pi:health
```

Web UI: `mise run piweb:agegr` → http://127.0.0.1:30141 (image builds on
first run). Note: the global mise wiring
(`~/.config/mise/conf.d/pi-web-layers.toml`) hardcodes the
`~/piagent` path — keep the directory name.

## Conventions

- Never edit `~/.pi/agent/extensions/` directly — edit here, `mise run check`.
- pi-less-yolo customizations: commit on branch `local`, push to the fork,
  bump the gitlink.
- `.env` is gitignored and must stay that way (rotate-on-sight).

## License

MIT — see [LICENSE](LICENSE).
