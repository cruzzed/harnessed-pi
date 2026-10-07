# ADR 0004: The blind core is jail + seam + file formats

- Status: accepted
- Date: 2026-10-07

## Context

Packaging dialogue: the package is to be hammered into four architectural
ideals — technology-blind core, one-directional attachment, locality of
behavior, UNIX-y composability. De facto a blind core already exists (the
jail knows processes/mounts/caps plus exactly two pi facts; the gate's policy
is string-matching; only `index.ts` is pi-coupled), but no artifact drew the
boundary. Fork: what is the core?

## Decision

The **core** is everything blind:

- **The jail** (`pi-less-yolo/`): process containment — mounts, caps, non-root,
  body/soul split. Its only pi-specific knowledge is the env var name
  `PI_CODING_AGENT_DIR` and the package in the Dockerfile.
- **The seam** (`scripts/soul`): materialize-and-verify of harness-owned state
  into a target dir. Blind about what it ships; it reads a managed-subset
  definition.
- **The file formats**: write-lock, vicinity heartbeat, permlist — declared
  contracts, currently implemented inside the gate modules.

The **opinion layer** is everything pi-shaped: the hook adapter
(`index.ts`), the gate policy tuning, the protocol docs (`.pi/`), the
channels (`pi:spawn`, one-shot), the fleet view. Opinions attach to the core;
the core never imports an opinion.

Physical layout stays one repo; the boundary is declared in docs/DESIGN.md.
Moving files to match the boundary is permitted only when a slice needs it —
boundary-drawing is not an excuse for reorganization theatre.

Consequences:

- The pi-coupled surface is one swappable adapter (`index.ts`). A different
  agent kernel could reuse jail + seam + formats by writing its own adapter.
- The seam's managed-subset definition must become explicit data (a manifest
  file apply/verify read), not a path hardcoded in a script — declared in this
  ADR, implemented in a following slice.
- New opinions default to living outside the core; putting an opinion in the
  core requires the test "is this blind to which agent kernel is running?"
