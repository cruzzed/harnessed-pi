# Setup Report — pi-agent hardened environment

Generated unattended by Kimi Code, 2026-08-25 ~01:15 local. All steps completed;
the environment is verified working end-to-end.

## Step results

| Step | Result |
|---|---|
| mise 2026.8.12 install + bashrc activation | PASS |
| pi-less-yolo clone + task registration | PASS |
| `pi:build` (image `pi-less-yolo:latest`, 1.7 GB) | PASS |
| `pi:health` (all checks) | PASS |
| `~/.pi/agent/extensions/safety-gate.ts` | PASS — installed verbatim from piagent.md after verifying every API hook against the shipped type definitions (`tool_call` with `block/reason/terminate`, `registerCommand`, `session_start`, `ctx.ui.confirm`, `ctx.hasUI` all exist as the file assumes) |
| `.pi/global-agents.md`, `.pi/project-agents.md`, `probes/_template.py` | PASS (extracted verbatim) |
| `afk-run.sh`, `prompts/afk-lead.md`, `AFK-RUNBOOK.md` | PASS |
| Smoke test `pi -p "reply with exactly: OK"` | PASS (replied `OK`) |
| Safety-gate live test (`sudo echo hi`) | PASS — JSON event stream shows `ABSOLUTE BLOCK: sudo `, `isError: true`, `terminate: true` |
| `pi:readonly` headless | PASS |
| `afk-run.sh --dry` in a throwaway git repo | PASS |

## Deviations from the plan (read these)

1. **Provider: `kimi-coding` (RESOLVED).** The original key turned out to be a
   Moonshot platform key; after the key was replaced with a Kimi For Coding key,
   pi is configured as provider `kimi-coding`, model `kimi-for-coding`
   (`~/.pi/agent/settings.json`) and the smoke test passes. The patch forwarding
   `MOONSHOT_API_KEY` in `~/pi-less-yolo/tasks/pi/_docker_flags` (+ README table)
   remains in place — harmless, and useful if you ever add a platform key.
   Note: `mise run update` (git pull) in pi-less-yolo will conflict with it.

2. **Docker bridge networking (RESOLVED).** Root cause found after a long
   hunt: a Tailscale peer advertises `172.17.0.0/16` (docker's default bridge
   subnet) tailnet-wide, and this machine was accepting subnet routes —
   tailscale's policy routing (table 52, rule pref 5270) hijacked all traffic
   to the docker subnet, black-holing container↔host and container↔internet.
   NordVPN (since uninstalled) and ufw (enabled but with no loaded chains)
   were red herrings. `tailscale set --accept-routes=false` did not clear the
   stale routes even after a tailscaled restart, so the fix in place is a
   surgical rule: `ip rule add to 172.17.0.0/16 pref 5200 lookup main`
   (checked before table 52). **This rule does not survive reboot** — see
   "Your first AFK loop" / the systemd unit below. Proper root fix: remove the
   `172.17.0.0/16` route advertisement at the source node (or in the Tailscale
   admin console) — advertising docker's default bridge subnet tailnet-wide
   collides with every docker host in the tailnet. Container networking is
   fully verified: smoke test passes on the default bridge, no
   `--network=host` workaround anywhere.

3. **Your env file was missing `export`** on the KIMI_API_KEY line — child
   processes never saw the key. Fixed in place (value untouched, perms still 600).

## Disk

Before 5.2 GB free → after 2.9 GB free. Image is 1.7 GB (larger than my original
350–500 MB estimate — Chainguard base plus pi plus git/tmux/uv/Python adds up).
Build cache pruned; only ~43 MB more is reclaimable. You're at 97% disk usage —
worth cleaning up soon regardless of pi.

## Your first AFK loop

1. In your Django project (a git repo, clean tree): write
   `probes/SPEC_<feature>.md` per `.pi/global-agents.md` §2, resolve every
   `[DRAFT]` section, set `status: frozen`, commit.
2. `cd <project> && ~/piagent/afk-run.sh probes/SPEC_<feature>.md`
3. Sleep. When back: read `probes/REPORT_<feature>.json` in the worktree +
   follow `AFK-RUNBOOK.md` §3 decision table. Merging is always manual.

For interactive sessions: `mise run pi` (with `PI_LOCAL_MODELS=1` until the VPN
fix), `/mode plan|code|orchestrator|yolo` from the safety gate, `/fork` before
risky work.

## Known gaps (unchanged from plan)

- Container limits blast radius to the mounted project dir, which is **writable**.
  "Less YOLO, not no YOLO."
- Headless pi has network access — keep secrets out of any project you run it on.
- `/fork` + `/rewind` are TUI-only; the headless path uses git checkpoints.
- tmux not installed — only needed for the interactive subagent pattern in
  global-agents.md §4 Step 2, not for `afk-run.sh`.
- The "max 25 turns" rule from piagent.md is prompt-level only in headless mode;
  the hard stop is the 30-min `timeout` in `afk-run.sh`.
- Nothing was committed to git anywhere; no system files were modified.

---

# Addendum: pi-web (pi-less-yolo-web) — 2026-09-08

pi-web's web UI now runs inside the same jail, added as a layer on the local
pi-less-yolo fork.

## What was built

- `~/pi-less-yolo/Dockerfile.web` → image `pi-less-yolo-web:latest`
  (pi-web installed with `--prefix=/usr/local`; the base image's npmrc redirects
  global installs to `/pi-agent/npm-global`, which the runtime mount shadows —
  a plain `npm install -g` at build time would vanish at runtime)
- `mise run pi:web` (from any project dir) — sessiond + web/API in the container,
  project dir + `~/.pi/agent` + `~/.config/pi-web` + `~/.local/share/pi-web`
  mounted, nothing else; publishes `127.0.0.1:${PI_WEB_PORT:-8504}` only
- `mise run pi:web-build` — rebuild the web image
- `~/.config/pi-web/config.json` — workspace-only file access, askUser on

## Verified (browser-driven)

- UI 200 at http://127.0.0.1:8504; `ss` confirms 127.0.0.1-only binding
- Live Kimi round trip through the web chat (`kimi-coding/kimi-for-coding`)
- Safety gate loads and fires in pi-web: `sudo echo hi` → `ABSOLUTE BLOCK: sudo`
  in the transcript; the gate's session-start notification appears in the UI
- All terminal-pi sessions are visible in the web UI (shared `/pi-agent`) —
  sessions are portable between terminal and web
- Web terminal is jailed: `/home` shows only the project mount, `/etc` writes
  denied, container fs only

## Model

One project per daemon (chosen over a shared projects root): `cd <project> &&
mise run pi:web`, one port per project (`PI_WEB_PORT=8505` etc. for a second).
Ctrl-C stops the container; sessions persist in `~/.pi/agent`.

Phone/tablet: `tailscale serve 8504` (or SSH tunnel). Never bind it publicly —
pi-web's own docs: it is not a sandbox or permission system.

## Honest caveats

- Long-lived daemon holding your API key > per-invocation containers. The spatial
  jail is identical to pi-less-yolo; the temporal exposure is the price of
  persistence.
- pi-web's systemd-managed features (`pi-web doctor`, auto-restart) don't exist
  here — daemons run foreground-manual inside the container.
- Web terminals = arbitrary shell inside the jail. Fine for trusted local use;
  it's why the localhost bind matters.
- The web image is a local fork layer; `mise run pi:upgrade` upgrades the base
  image only — rebuild with `mise run pi:web-build` afterwards.
