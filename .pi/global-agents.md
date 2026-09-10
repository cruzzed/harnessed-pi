# Global Harness Protocol: Pi Edition

## 0. Architecture: Lead ↔ Spec ↔ Subagent

Because Pi has no native sub-agent isolation, we simulate it via **session forking** and **Bash-spawned worktrees**.

```
┌─────────────┐     reads/writes     ┌──────────────┐
│   Human     │◄────────────────────►│  Lead Agent  │
│  (You)      │                      │  (Pi session)│
└─────────────┘                      └──────┬───────┘
                                            │ reads/writes
                                            ▼
                                    ┌───────────────┐
                                    │  SPEC_*.md    │
                                    │  (on disk)    │
                                    └───────┬───────┘
                                            │ spawns via Bash
                                            ▼
                                    ┌───────────────┐
                                    │  Subagent     │
                                    │  (tmux +      │
                                    │   git worktree)│
                                    └───────────────┘
```

## 1. Role Definitions

### Lead Agent (This Session)
- **Allowed tools:** `read`, `write` (specs only), `bash` (spawn commands only)
- **Scope:** `probes/SPEC_*.md`, `probes/TASKS_*.md`, `.pi/global-agents.md`
- **Forbidden:** Direct edits to `models.py`, `views.py`, templates, or implementation code.
- **Context rule:** Re-read the spec file every turn. Do not "remember" implementation details.

### Subagent (Throwaway Session)
- **Spawned via:** `bash` command launching Pi in isolated git worktree
- **Lifetime:** One objective, max 25 turns, then destroyed
- **Scope:** The implementation layer assigned in the spec
- **Output:** JSON report written to `probes/REPORT_<feature>_<timestamp>.json`

## 2. The Spec Document (External Memory)

Format: `probes/SPEC_<feature>.md`

```markdown
---
status: draft | frozen | deprecated
version: 1
checkpoint_fork: <session_fork_id_or_git_commit>
---

## [FROZEN] Narrative
As a [actor], when I [action], then [observable result].

## [FROZEN] Data Flow
Entry: [URL/Command] → [View] → [Model] → [Template/Response]

## [FROZEN] Model Layer
- Field A: type, constraints, rules

## [DRAFT] View Layer
- TODO: CBV or FBV? Auth? HTMX?

## [FROZEN] Amendment 1
<user answer>
```

**Rules:**
- `[FROZEN]` sections are append-only. Never rewrite.
- Wrong? Mark `[DEPRECATED]` and append a new `[FROZEN]` block.
- The Lead Agent edits ONLY `[DRAFT]` sections and `status:` frontmatter.

## 3. Spec Completion Gate (Mechanical)

Before spawning the first Subagent:
1. Read `probes/SPEC_<feature>.md`.
2. For every `[DRAFT]` section, ask user ONE multiple-choice question.
3. Append answer as `[FROZEN] Amendment`.
4. Repeat until no `[DRAFT]` remains.
5. Set `status: frozen`.
6. Only then spawn Subagent.

## 4. Subagent Spawn Protocol

### Step 1: Fork the Session
Before any risky work, type:
```
/fork
```
This creates a branch in Pi's session tree. If the Subagent destroys everything, `/rewind` to here.

### Step 2: Spawn via Bash
```bash
# Create isolated worktree
git worktree add ../<feature>-worktree -b feat/<feature>-subagent

# Spawn Subagent in tmux with restricted context
tmux new-session -d -s "pi-subagent-<feature>" \
  "cd ../<feature>-worktree && \
   pi --no-history \
      -e ~/.pi/agent/extensions/safety-gate.ts \
      -p 'You are a throwaway implementer. Objective: <paste spec slice>. \
          Produce probe script at probes/test_<feature>_v1.py. \
          Return JSON report to probes/REPORT_<feature>.json. \
          Max 25 turns. Do not exceed scope.'"
```

### Step 3: Capture Report
The Subagent writes:
```json
{
  "status": "pass | fail | partial",
  "files_changed": ["myapp/models.py"],
  "probe_results": {"probe": "...", "status": "pass", "checks": [...]},
  "regression_results": {"status": "pass"},
  "diff_stat": "1 file changed, 10 insertions(+)",
  "anomalies": [],
  "suggested_spec_amendments": []
}
```

### Step 4: Evaluate (Lead Agent)
The Lead Agent reads the report JSON. It does NOT read code.

| Condition | Action |
|---|---|
| Probe pass + regression pass + no anomalies | **ACCEPT**: `git merge` from worktree. Update spec `checkpoint_fork`. |
| Probe pass + regression fail | **REJECT + RESPAWN**: Spec likely correct; Subagent broke something. Respawn with smaller scope. |
| Probe fail + "spec unclear" | **AMEND SPEC**: Append `[FROZEN] Amendment`. Respawn. |
| Probe fail 3x, divergent reasons | **HALT**: Human decides refactor/strangle/revert. |
| Probe fail 3x, same reason | **DEPRECATE**: Mark spec section wrong. Revert to last checkpoint. |

### Step 5: Destroy Subagent
```bash
tmux kill-session -t "pi-subagent-<feature>"
git worktree remove ../<feature>-worktree
```

## 5. Context Hygiene Rules (Behavioral Guardrails)

- **No implementation context in Lead session.** The Lead Agent never `read`s `models.py`, `views.py`, etc. It only reads specs and reports.
- **Re-read spec every turn.** Do not rely on "memory." The spec file IS the memory.
- **No incremental spec rewrites.** Edit by appending amendments only.
- **No Subagent-to-Subagent communication.** Each spawn is isolated. The spec is the only shared state.
- **25-turn hard limit.** Enforced by tmux timeout or manual kill.
- **5-file change limit per spawn.** If more needed, decompose into multiple spawns.

## 6. Human Handoff Triggers

The Lead Agent MUST halt and hand to human when:
- Spec completion gate cannot resolve ambiguity.
- Design audit trigger fires (3 failures, divergent reasons).
- Subagent reports security concern or unexpected destructive operation.
- Cost/token cap exceeded.
- The word "should" appears in spec >1 time without a testable condition.
- The user says "halt" or "stop."

## 7. Pi-Specific Commands Reference

| Command | When to use |
|---|---|
| `/fork` | Before spawning a Subagent. Creates session branch. |
| `/rewind` | Subagent failed catastrophically. Return to pre-fork state. |
| `/mode plan` | Auditing code/specs. Read-only. |
| `/mode code` | Active implementation. Non-destructive bash protection. |
| `/mode orchestrator` | Delegating to subagents. Full tools with coordination prompt. |
| `/include .pi/global-agents.md` | Reload protocol if context drifts. |
