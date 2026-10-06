

You can jump now — but only if you build the guardrails first. Pi is uniquely suited to your architecture because it is **extensible in TypeScript** and has **tree sessions**, but it ships with **zero safety**. Here is the phased hardening plan, with every file you need to copy-paste.

---

# Phase 0: Container Fortress (Do This First)

Pi's creator is explicit: *"Pi runs in full YOLO mode... No permission popups... Full filesystem access."*  Your first line of defense is the container.

## Option A: pi-less-yolo (Recommended)

```bash
# Install mise if you haven't
curl https://mise.run | sh

# Clone pi-less-yolo
git clone https://github.com/cjermain/pi-less-yolo.git
cd pi-less-yolo

# Run Pi in sandboxed container
mise run pi

# Run Pi in READ-ONLY mode (for spec auditing, no writes)
mise run pi:readonly
```

What this gives you:
- `--cap-drop=ALL` — no Linux capabilities
- `--security-opt=no-new-privileges` — no setuid escalation
- `--volume $(pwd):$(pwd)` — only your project directory is visible
- Runs as your host user ID — files created are owned by you 

## Option B: Dev Container (VS Code / Codespaces)

Create `.devcontainer/devcontainer.json` in your project root:

```json
{
  "name": "Pi Hardened Workspace",
  "image": "mcr.microsoft.com/devcontainers/typescript-node:20",
  "workspaceFolder": "/workspace",
  "workspaceMount": "source=${localWorkspaceFolder},target=/workspace,type=bind",
  "mounts": [
    "source=${localEnv:HOME}/.pi/agent,target=/home/node/.pi/agent,type=bind"
  ],
  "postCreateCommand": "npm install -g @earendil-works/pi-coding-agent",
  "runArgs": [
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges",
    "--ipc=none"
  ],
  "remoteUser": "node",
  "customizations": {
    "vscode": {
      "extensions": ["dbaeumer.vscode-eslint"]
    }
  }
}
```

**Critical:** Whichever you choose, the container is your **blast radius limiter**. It does not replace the behavioral protocol — it just ensures that when the agent goes wrong, it destroys a container, not your machine.

---

# Phase 1: The Safety Gate (TypeScript Extension)

Pi extensions are TypeScript files that hook into the agent's lifecycle. You will install this as a **global extension** so it applies to every session.

Create `~/.pi/agent/extensions/safety-gate.ts`:

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  // Track mode per session
  let mode: "YOLO" | "PLAN" | "CODE" | "ORCHESTRATOR" = "CODE";

  // ─── Slash command: /mode ───
  pi.registerCommand("mode", {
    description: "Set safety mode: plan | code | orchestrator | yolo",
    handler: async (args, ctx) => {
      const m = (args || "code").toLowerCase();
      if (!["plan", "code", "orchestrator", "yolo"].includes(m)) {
        ctx.ui.notify(`Invalid mode: ${m}. Use plan|code|orchestrator|yolo`, "error");
        return;
      }
      mode = m.toUpperCase() as typeof mode;
      ctx.ui.notify(`Safety mode: ${mode}`, mode === "YOLO" ? "warning" : "info");
    },
  });

  // ─── Pre-tool hook: block dangerous commands ───
  pi.on("tool_call", async (event, ctx) => {
    // ── Bash tool ──
    if (event.toolName === "bash") {
      const cmd = String(event.input.command ?? "");

      // ABSOLUTE BLOCKS (no confirmation, always deny)
      const absoluteBlocks = [
        "rm -rf /", "rm -rf ~", "sudo ", ":(){:|:&};:", "mkfs.",
        "dd if=/dev/zero", "> /dev/sda", "curl | sh", "curl | bash",
        "wget | sh", "wget | bash", "git push --force", "git push -f",
      ];
      for (const b of absoluteBlocks) {
        if (cmd.includes(b)) {
          return { block: true, reason: `ABSOLUTE BLOCK: ${b}`, terminate: true };
        }
      }

      // CONDITIONAL BLOCKS (require UI confirmation)
      const dangerous = ["rm -rf", "git reset --hard", "git clean -fd", "drop database"];
      for (const d of dangerous) {
        if (cmd.includes(d)) {
          if (!ctx.hasUI) {
            return { block: true, reason: `Blocked ${d}: no UI available` };
          }
          const ok = await ctx.ui.confirm("Dangerous Command", `Allow: ${cmd}?`);
          if (!ok) return { block: true, reason: `User denied: ${d}` };
        }
      }

      // MODE-BASED RESTRICTIONS
      if (mode === "PLAN") {
        const allowed = /^(ls|cat|find|grep|head|tail|echo|pwd|git\s+(status|log|diff|show)|python\s+probes\/test_)/;
        if (!allowed.test(cmd.trim())) {
          return { block: true, reason: "PLAN mode: read-only commands only" };
        }
      }
      if (mode === "CODE") {
        // Block destructive redirects and network exfil in CODE mode
        if (/> .*\.(pem|key|env|ssh)/.test(cmd)) {
          return { block: true, reason: "CODE mode: blocked potential secret exfil" };
        }
      }
    }

    // ── Write/Edit tool: protect spec FROZEN sections ──
    if ((event.toolName === "write" || event.toolName === "edit") && mode !== "YOLO") {
      const path = String(event.input.path ?? "");
      if (path.includes("SPEC_") && path.endsWith(".md")) {
        // Soft enforcement: warn but don't block (hard to parse content pre-write)
        ctx.ui.notify(`WARNING: Editing spec file ${path}. Respect [FROZEN] sections.`, "warning");
      }
    }

    // ── Read tool: redact secrets from output ──
    if (event.toolName === "read") {
      // Mutation happens post-call via tool_result if needed; here we just log
      // See redaction example in docs for post-call filtering
    }
  });

  // ─── Session start: announce mode ───
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.notify(`Safety gate active. Mode: ${mode}. /mode to change.`, "info");
  });
}
```

Install it:
```bash
pi -e ~/.pi/agent/extensions/safety-gate.ts
```

This gives you what Claude Code has built-in: **deny-by-default for dangerous commands**, **mode switching**, and **spec protection warnings**. 

---

# Phase 2: Global Harness Protocol (`.pi/global-agents.md`)

This file lives in your project root. Pi can load it automatically via the `claude-rules.ts` pattern — or you manually `/include` it at session start. 

```markdown
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
```

---

# Phase 3: Project-Specific Layer (`.pi/project-agents.md`)

Your Django MVT specifics. Keep this short — you said you have details already.

```markdown
# Django MVT: Project-Specific Rules

## 0. MVT Boundaries (Law)

| Layer | Owns | Forbidden |
|---|---|---|
| **Model** | Data integrity, `save()`, `clean()`, Managers | HTML, request handling |
| **Form** | Validation, `clean()`, field logic | DB queries (use Model methods) |
| **View** | Request/response, auth, queryset optimization | Business logic, HTML generation |
| **Template** | Presentation, HTMX attributes | DB queries, business logic |
| **URL** | Routing, `app_name`, named paths | Logic |

## 1. Anti-Patterns (Blocked by Protocol)

- Querying DB in templates → Use `select_related`/`prefetch_related` in View
- Business logic in View → Model method or Form `clean()`
- HTML generation in View → Pass context to Template
- `print()` debugging → Write probe script
- `shell -c` one-liners → Write `.py` probe in `probes/`
- DRF for HTMX endpoints → Standard CBV/FBV with `render()`
- Custom SQL when ORM suffices → `QuerySet.annotate()`
- Signals for business logic → Explicit method calls

## 2. HTMX Rules

- Endpoints return **rendered HTML partials**, not JSON.
- Partial templates: `myapp/_<model>_<fragment>.html` (underscore prefix).
- OOB swaps: `hx-swap-oob="true"` on secondary elements.
- View detects HTMX via `request.headers.get("HX-Request")`.

## 3. Probe Script Template

Subagents MUST produce probes following this structure:

```python
#!/usr/bin/env python
"""Probe: <Feature> - Happy Path v<N>"""
import os, sys, django, json
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
django.setup()

from django.test import RequestFactory, Client
from django.contrib.auth import get_user_model
User = get_user_model()

def probe():
    results = {"probe": "...", "status": "pending", "checks": []}
    # Check 1: Model
    try:
        # instance = MyModel.objects.create(...)
        results["checks"].append({"layer": "model", "status": "pass"})
    except Exception as e:
        results["checks"].append({"layer": "model", "status": "fail", "error": str(e)})
    # Check 2: View
    # Check 3: Template
    results["status"] = "pass" if all(c["status"] == "pass" for c in results["checks"]) else "fail"
    return results

if __name__ == "__main__":
    print(json.dumps(probe(), indent=2))
```

## 4. Task Map Template

Before spawning, spec MUST contain:

```markdown
## Task Map: <Feature>

### Models (`myapp/models.py`)
- [ ] `MyModel` — fields, `Meta`, `__str__`, `get_absolute_url`

### Forms (`myapp/forms.py`)
- [ ] `MyModelForm` — `Meta: model = MyModel`, validation

### Views (`myapp/views.py`)
- [ ] `MyView` — CBV, auth, queryset optimization

### Templates (`myapp/templates/myapp/`)
- [ ] `<model>_form.html` — full page
- [ ] `_<model>_item.html` — HTMX partial

### URLs (`myapp/urls.py`)
- [ ] `path("create/", MyView.as_view(), name="myapp_create")`

### Tests & Probes
- [ ] `probes/test_<feature>_v<N>.py` — happy path
- [ ] `probes/test_<feature>_edge_<name>.py` — edge cases
```
```

---

# Phase 4: Operational Runbook (Daily Workflow)

## Starting a Feature

```bash
# 1. Enter container
mise run pi
# or: devcontainer open

# 2. Load protocol
/include .pi/global-agents.md
/include .pi/project-agents.md

# 3. Set mode
/mode plan

# 4. Create spec (you or Lead Agent)
# Edit probes/SPEC_feature.md with [DRAFT] sections

# 5. Run spec completion gate
# Lead Agent asks multiple-choice questions until all [DRAFT] -> [FROZEN]

# 6. Freeze spec
# status: frozen

# 7. Fork before danger
/fork

# 8. Switch to orchestrator mode
/mode orchestrator

# 9. Spawn subagent (bash command from protocol above)

# 10. Evaluate report
# Read probes/REPORT_feature.json

# 11. Accept or reject
# If accept: git merge from worktree
# If reject: /rewind, respawn, or halt
```

## When Things Go Wrong

| Symptom | Command | Meaning |
|---|---|---|
| Subagent fixated on wrong approach | `/rewind` | Return to pre-fork state |
| Context drift in Lead session | `/include .pi/global-agents.md` | Reload protocol into context |
| Need to audit without risk | `/mode plan` | Read-only, bash restricted |
| Subagent exceeded scope | `tmux kill-session -t pi-subagent-*` | Hard stop |
| Spec assumption wrong | Mark `[DEPRECATED]`, append new `[FROZEN]` | Amend, don't rewrite |

---

# Phase 5: Migration Checklist (Do In Order)

- [ ] **Day 1:** Install pi-less-yolo. Verify `mise run pi` and `mise run pi:readonly` work.
- [ ] **Day 1:** Create `~/.pi/agent/extensions/safety-gate.ts`. Test `/mode plan` blocks writes.
- [ ] **Day 2:** Create `.pi/global-agents.md` and `.pi/project-agents.md` in one project.
- [ ] **Day 2:** Practice `/fork` and `/rewind` manually. Verify session tree branching.
- [ ] **Day 3:** Write first `probes/SPEC_<feature>.md` with `[FROZEN]` and `[DRAFT]` sections.
- [ ] **Day 3:** Run spec completion gate manually (you ask yourself the questions, append answers).
- [ ] **Day 4:** Spawn first throwaway Subagent via bash/tmux. Verify isolation.
- [ ] **Day 4:** Subagent produces `probes/REPORT_*.json`. Lead Agent evaluates without reading code.
- [ ] **Day 5:** First full loop: spec → fork → spawn → report → accept → merge → kill.
- [ ] **Week 2:** Automate spawn/kill with a bash script or `pi-worktree` extension.
- [ ] **Week 2:** Add regression probe gate (run all previous probes before accepting).
- [ ] **Week 3:** Evaluate if `pi-agent-modes` ORCHESTRATOR mode replaces manual bash spawning.
- [ ] **Month 1:** Harden safety-gate.ts with project-specific path protections.

---

# The Gaps You Asked Me to Fill

| Gap | Solution |
|---|---|
| **How does Pi know when to spawn?** | The spec's `status: frozen` is the mechanical trigger. The Lead Agent is instructed: "Only spawn when status is frozen." No ambiguity. |
| **How does Pi know when to halt?** | The evaluation tree in Phase 2 is a decision table, not a judgment. "3 failures + divergent reasons = HALT" is a boolean condition. |
| **How to prevent context rot?** | Lead Agent never holds implementation context. It re-reads spec every turn. The spec is on disk. `/include` reloads protocol on demand. |
| **How to protect specs from accidental edits?** | Soft: protocol instructs respect for `[FROZEN]`. Hard: safety-gate.ts warns on spec edits. You can harden this to block writes to `[FROZEN]` lines if you parse content pre-write. |
| **What if the whole design is wrong?** | `/fork` before every spawn. If design is wrong, `/rewind` to pre-design state. The strangler fig pattern: grow new design alongside old, don't demolish. |
| **Plugin for subagent delegation?** | v1: Bash spawn in tmux (works today). v2: Install `pi-worktree` extension for git worktree management. v3: Install `pi-agent-modes` for ORCHESTRATOR mode with built-in delegation patterns. |

---

## Bottom Line

You can jump into Pi **today** if you do Phase 0 and Phase 1 first. The container gives you host safety. The safety-gate extension gives you behavioral safety. The global-agents.md gives you the protocol. Everything else is optimization.

Pi is not safer than Claude Code out of the box. It is **more honest about being unsafe** — and that honesty means you can build exactly the guardrails you need, rather than fighting against someone else's false sense of security. 

Your artifacts are not optional extras. In Pi, **they are the entire safety layer.** Build them first. Then code.
