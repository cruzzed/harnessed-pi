# ADR 0001: The soul is a generated artifact of this repo

- Status: accepted
- Date: 2026-10-06

## Context

The soul directory (`~/.pi/agent`) holds the agent's entire identity: sessions,
settings, auth, extensions, permlist. It was a living, hand-tended directory:
unversioned, manually repaired, owned by whoever ran pi last.

On 2026-09-19 a root-run pi upgrade recreated it (root-owned, gate wiped),
and nothing detected this. The safety gate — a *mechanical* layer — reached
production through a purely *advisory* channel (rsync + a convention in
AGENTS.md). The stack's core invariant — "no layer pretends to be the layer
below it" — was unenforced at exactly one seam: repo → soul.

Design dialogue 2026-10-06 ("dismantle the spirit"): the soul has identity but
no provenance. Identity outside the body (DESIGN.md §1–2) is half-built: the
body is protected from the agent, but the soul is not protected from the world.

## Decision

`~/.pi/agent` is a **generated artifact** of this repo. The repo is the source
of truth for everything in the soul that is ours: extensions (safety-gate),
protocol files, tool config. An idempotent `apply` mechanism materializes the
soul from the repo; a `verify` step proves what is actually present and
loading. After any wipe (root upgrade, new machine), re-apply recovers the
harness.

Consequences:

- "Never edit `~/.pi/agent` directly" stops being advice and becomes the only
  sane path — the directory is reproducible, so hand-edits are disposable.
- The soul's own runtime data (sessions, auth.json, gate-permissions.json)
  stays the soul's; apply manages only the harness-owned subset and must not
  clobber runtime state.
- `mise run check` gains a real verification step (see issue #1); deploy
  without verify is not a deploy.
- The mechanism itself must be small: a script or mise task, not a framework.
  If apply needs more than materialize + verify, that is a design smell.
