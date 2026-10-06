#!/usr/bin/env bash
# afk-run.sh — headless AFK pi run against a frozen spec, in an isolated worktree.
#
# Usage:
#   ./afk-run.sh [--dry] path/to/probes/SPEC_<feature>.md
#
# Run from the PROJECT ROOT (must be a git repo). What it does:
#   1. verifies the spec exists and is status: frozen
#   2. verifies the git tree is clean (checkpoint = current HEAD; no commits made)
#   3. creates a git worktree on branch feat/<feature>-afk
#   4. runs pi headless in the pi-less-yolo container with resource limits
#      and a 30-minute timeout, log tee'd to probes/RUN_<feature>_<ts>.log
#   5. prints git diff --stat and report location — evaluation stays manual
#
# --dry prints the resolved commands without executing anything.

set -euo pipefail

HARNESS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MISE="$HOME/.local/bin/mise"
TIMEOUT_S=1800
MAX_FILES=5

DRY=0
if [[ "${1:-}" == "--dry" ]]; then DRY=1; shift; fi

SPEC="${1:-}"
if [[ -z "$SPEC" ]]; then
  echo "usage: $0 [--dry] probes/SPEC_<feature>.md" >&2; exit 2
fi
SPEC="$(realpath "$SPEC")"
[[ -f "$SPEC" ]] || { echo "spec not found: $SPEC" >&2; exit 2; }

FEATURE="$(basename "$SPEC" .md)"; FEATURE="${FEATURE#SPEC_}"
TS="$(date +%Y%m%d-%H%M%S)"
PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "must run from inside a git repo (the project root)" >&2; exit 2; }
WORKTREE="${PROJECT_ROOT}/../$(basename "$PROJECT_ROOT")-afk-${FEATURE}"
BRANCH="feat/${FEATURE}-afk"
LOG="${PROJECT_ROOT}/probes/RUN_${FEATURE}_${TS}.log"
REPORT="probes/REPORT_${FEATURE}.json"

# ── pre-flight ────────────────────────────────────────────────────────────
grep -q '^status:[[:space:]]*frozen' "$SPEC" || {
  echo "spec is not frozen — refusing AFK run" >&2; exit 1; }
[[ -z "$(git -C "$PROJECT_ROOT" status --porcelain)" ]] || {
  echo "git tree not clean — commit or stash first (checkpoint = HEAD)" >&2; exit 1; }
[[ -f "$HOME/.config/pi-agent/env" ]] || {
  echo "missing ~/.config/pi-agent/env (KIMI_API_KEY)" >&2; exit 1; }

# re-exec under docker group if needed (pre-re-login shells)
if ! docker info >/dev/null 2>&1; then
  exec sg docker -c "$(printf '%q ' "$0" ${DRY:+--dry} "$SPEC")"
fi

PROMPT="$(cat "$HARNESS_DIR/prompts/afk-lead.md")
spec path inside worktree: ${SPEC#"$PROJECT_ROOT"/}
---
$(cat "$SPEC")"

if [[ "$DRY" == "1" ]]; then
  cat <<EOF
DRY RUN — would execute:
  git worktree add "$WORKTREE" -b "$BRANCH"
  cd "$WORKTREE"
  source ~/.config/pi-agent/env
  PI_MEMORY=4g PI_PIDS_LIMIT=512 timeout $TIMEOUT_S \\
    $MISE run pi -- -p "<afk-lead.md + spec ($(wc -c <<<"$PROMPT") bytes)>" \\
    2>&1 | tee "$LOG"
  git -C "$WORKTREE" diff --stat
  expect report at: $WORKTREE/$REPORT
EOF
  exit 0
fi

# ── run ───────────────────────────────────────────────────────────────────
set -x
git -C "$PROJECT_ROOT" worktree add "$WORKTREE" -b "$BRANCH"
set +x

set +e
(
  cd "$WORKTREE"
  source "$HOME/.config/pi-agent/env"
  PI_MEMORY=4g PI_PIDS_LIMIT=512 timeout "$TIMEOUT_S" \
    "$MISE" run pi -- -p "$PROMPT"
) 2>&1 | tee "$LOG"
RC=${PIPESTATUS[0]}
set -e

# ── post-run summary (evaluation stays with the human) ───────────────────
echo "────────────────────────────────────────────"
echo "exit code: $RC (124 = ${TIMEOUT_S}s timeout hit)"
echo "log:       $LOG"
echo "worktree:  $WORKTREE (branch $BRANCH)"
echo "diff stat:"
git -C "$WORKTREE" diff --stat HEAD || true
NFILES=$(git -C "$WORKTREE" diff --name-only HEAD | wc -l)
if [[ "$NFILES" -gt "$MAX_FILES" ]]; then
  echo "WARNING: $NFILES files changed (limit $MAX_FILES) — review before merge"
fi
if [[ -f "$WORKTREE/$REPORT" ]]; then
  echo "report:    $WORKTREE/$REPORT"
else
  echo "report:    MISSING ($REPORT) — run did not complete its contract"
fi
echo "next: evaluate per AFK-RUNBOOK.md section 3, then merge or:"
echo "  git worktree remove --force \"$WORKTREE\" && git branch -D \"$BRANCH\""
