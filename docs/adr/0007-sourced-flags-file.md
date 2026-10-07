# ADR 0007: Plane 2 grows one mechanism — a sourced flags file

- Status: accepted (implemented in pi-less-yolo `local` @ 0297b62)
- Date: 2026-10-07

## Context

Packaging dialogue: customization planes (behavioral = soul extensions,
environmental = spawn-time passthroughs, channels = spawn contract). Plane 2
was env-var-only: functional for machines, clunky for humans composing
mounts/labels/resources by hand. Fork: stay env-only, or grow the core by
exactly one mechanism — a user-owned flags file the jail sources if present.

## Decision

The jail sources `${XDG_CONFIG_HOME:-~/.config}/pi-less-yolo/flags.sh` if it
exists, after its own defaults. The file may extend `DOCKER_FLAGS` and the
standard env passthroughs; it is plain shell, user-owned, outside every repo.

This is a deliberate, bounded core change: one `source` line plus
documentation. It satisfies the ideals — blind (the jail doesn't interpret
the contents), composable (a file is a file), one-directional (uninstall =
delete the file; nothing else references it).

## Consequences

- Blast-radius caveat is documented in the jail README and at the source
  site: user-defined mounts enlarge what the container can touch, which the
  jail otherwise bounds by construction. The flags file is per-user, never
  repo-tracked, and never set by anything in this stack automatically.
- Environment customization without this file remains fully supported
  (env vars); the file is sugar, not a required path.
- Implemented in `pi-less-yolo` (branch `local`, gitlink bumped here) —
  the core is the submodule, so this ADR records a cross-repo decision.
