# ADR 0006: One gate, pluggable policy

- Status: accepted (implementation pending — rules format is a following slice)
- Date: 2026-10-07

## Context

Packaging dialogue: how is the harness customized without changing the core —
e.g., a smarter safety gate? pi multiplexes extension hooks but has no policy
court: two gate-like extensions can double-confirm or contradict (one's
permlist says allow-always while the other blocks). Fork: one gate with
pluggable policy vs. free composition.

## Decision

**One gate extension; policy is pluggable data.** The single-leash invariant
(DESIGN: the learner faces one coherent set of rules with one permlist)
survives; customizers write rules, not hooks.

- Built-in policy (`policy.ts`) remains the floor: its absolute/mechanical
  blocks cannot be weakened or overridden by any rules file.
- Custom rules are data the gate reads, parsed by a pure, unit-tested module;
  every rule carries a strength label like everything else in the stack.
- Precedence: built-in absolutes > custom rules > built-in conditionals;
  permlist remains the user's court over confirm-class rules.

## Consequences (to implement in the next slice)

- A rules format and its parser (with tests), loaded from a declared location
  — locality of behavior argues for worktree-level rules beside the
  coordination state they extend; final choice recorded in the slice.
- The seam manifest (planned) delivers default rules with the gate.
- No second behavioral extension may claim gating responsibilities; other
  extension kinds (non-policy) remain free to compose via pi's multiplexing.
