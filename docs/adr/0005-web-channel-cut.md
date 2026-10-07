# ADR 0005: Web channel cut to spawn contract

- Status: accepted (supersedes the canonical-web claim of ADR 0002)
- Date: 2026-10-07

## Context

Packaging dialogue, ideal test: the web channel failed locality of behavior
(canonical per ADR 0002, but no `pi:web` task exists; the only web task,
`piweb:agegr`, is deregistered from mise) and composability (a long-lived
daemon with startup snapshots and a no-timeout confirm modal — two known
park-forever modes). Fork: ship it, keep it as an unsupported example, or cut
it?

## Decision

**Cut.** The package ships no web channel and claims none. What the package
ships instead is the **spawn contract** any web daemon can consume (it
already exists and is verified): run through the jail's task entrypoints with
cwd = the owned dir, and the env passthroughs (`PI_INSTANCE_ID`,
`PI_LABELS`, `PI_CONTAINER_NAME`). A browser layer is an external attachment
— buildable by anyone on the contract, maintained by whoever ships it.

`pi-web/` is removed from the repo. ADR 0002's canonical-run-surface decision
is superseded in its web half: the canonical *human* surface is the mise
tasks (`pi:spawn` TUI/one-shot); the canonical *machine* surface is the
spawn contract.

Consequences:

- The park-forever modes, `@latest` drift, and deregistered tasks leave with
  the channel. Issue #1's web-layer items (image skew, task registration) are
  moot — closed by deletion, not repair.
- The maintainer keeps web as a **personal attachment**: the launcher, the
  image build recipe, and the original mise tasks live in the maintainer's
  personal files (outside this repo), consuming the spawn contract. The
  package's only obligation is that the contract stays stable.
- If a web channel ever returns *to the package*, it must arrive as an
  attachment on the spawn contract — a new ADR, not a resurrection.
