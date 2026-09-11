/**
 * policy.ts — pure command-policy analysis for the safety gate.
 *
 * Everything here is a pure function over (command, cwd) — no fs, no pi API —
 * so the whole policy surface is unit-testable with node --test.
 *
 * Reminder on guarantees: this is heuristic shell parsing. It catches
 * straightforward commands and forgetful agents, not adversaries. Physical
 * enforcement is the container (caps, mounts, :ro), not this file.
 */

export type Verdict =
  | { action: "allow" }
  | { action: "block"; reason: string }
  | { action: "confirm"; reason: string };

const HANDOFF_HINT =
  "Do NOT retry or work around it. Note the exact command in a \"needs human\" list, " +
  "continue with everything you CAN do, and present the list to the user at the end of your turn.";

/** Commands that are never permitted, no matter the target or mode. */
const ABSOLUTE_PATTERNS = [
  "sudo ",
  ":(){:|:&};:",
  "mkfs.",
  "dd if=/dev/zero",
  "> /dev/sda",
  "git push --force",
  "git push -f",
];

/** Pipe-to-shell downloaders: "curl <anything> | sh" — substring patterns can't see the URL in the middle. */
const ABSOLUTE_REGEXES = [
  /\bcurl\b[^|;]*\|\s*(sudo\s+)?(ba|z)?sh\b/,
  /\bwget\b[^|;]*\|\s*(sudo\s+)?(ba|z)?sh\b/,
];

export function checkAbsolute(cmd: string): Verdict {
  for (const p of ABSOLUTE_PATTERNS) {
    if (cmd.includes(p)) {
      return { action: "block", reason: `ABSOLUTE BLOCK: '${p.trim()}' is not permitted in this environment. ${HANDOFF_HINT}` };
    }
  }
  for (const re of ABSOLUTE_REGEXES) {
    if (re.test(cmd)) {
      return { action: "block", reason: `ABSOLUTE BLOCK: pipe-to-shell download. ${HANDOFF_HINT}` };
    }
  }
  return { action: "allow" };
}

/** Dangerous-but-sometimes-legitimate operations: confirm when a UI exists. */
const CONDITIONAL_PATTERNS = ["git reset --hard", "git clean -fd", "drop database"];

export function checkConditional(cmd: string): Verdict {
  for (const p of CONDITIONAL_PATTERNS) {
    if (cmd.includes(p)) {
      return { action: "confirm", reason: `Dangerous command: '${p.trim()}'. ${HANDOFF_HINT}` };
    }
  }
  return { action: "allow" };
}

const RM_RF_SEGMENT =
  /^rm\s/; // segment starts with rm
const RM_RF_FLAGS =
  /-(?:[a-zA-Z]*r[a-zA-Z]*f|[a-zA-Z]*f[a-zA-Z]*r)[a-zA-Z]*(\s|$)/; // flags combining r and f

function isHomeOrRoot(target: string): boolean {
  return /^~|^\/\/?$|^\$HOME|^\/\*/.test(target);
}

/**
 * Target-aware analysis of `rm -rf`.
 * - root/home/$HOME → absolute block
 * - inside cwd or /tmp scratch → allow
 * - anywhere else absolute/outside → confirm
 */
export function analyzeRmRf(
  cmd: string,
  cwd: string,
  resolvePath: (from: string, to: string) => string,
): Verdict {
  const seg = cmd
    .split(/[;&|]+/)
    .map((s) => s.trim())
    .find((s) => RM_RF_SEGMENT.test(s) && RM_RF_FLAGS.test(s));
  if (!seg) return { action: "allow" };

  const targets = seg
    .replace(/^rm\s+/, "")
    .split(/\s+/)
    .filter((t) => t !== "" && !t.startsWith("-"));

  if (targets.some(isHomeOrRoot)) {
    return {
      action: "block",
      reason: `ABSOLUTE BLOCK: rm recursive+force on root/home. ${HANDOFF_HINT}`,
    };
  }

  const resolve = (t: string) => resolvePath(cwd, t);
  const risky = targets.filter((t) => {
    if (isHomeOrRoot(t)) return false;
    const r = resolve(t);
    return !(r === cwd || r.startsWith(cwd + "/") || r.startsWith("/tmp/"));
  });

  if (risky.length > 0) {
    return {
      action: "confirm",
      reason: `rm recursive+force outside worktree and /tmp: ${risky.join(", ")}. ${HANDOFF_HINT}`,
    };
  }
  return { action: "allow" };
}

export type Mode = "YOLO" | "PLAN" | "CODE";

const PLAN_ALLOWED =
  /^(ls|cat|find|grep|head|tail|echo|pwd|git\s+(status|log|diff|show)|python\s+probes\/test_)/;

/** Mode-based bash restrictions. Returns allow when the mode imposes none. */
export function checkMode(cmd: string, mode: Mode): Verdict {
  if (mode === "PLAN" && !PLAN_ALLOWED.test(cmd.trim())) {
    return { action: "block", reason: "PLAN mode: read-only commands only" };
  }
  if (mode === "CODE" && /> .*\.(pem|key|env|ssh)/.test(cmd)) {
    return { action: "block", reason: "CODE mode: blocked potential secret exfil" };
  }
  return { action: "allow" };
}

/** Full bash pipeline: absolute → rm analysis → conditional → mode. */
export function evaluateBash(
  cmd: string,
  cwd: string,
  mode: Mode,
  resolvePath: (from: string, to: string) => string,
): Verdict {
  for (const v of [checkAbsolute(cmd), analyzeRmRf(cmd, cwd, resolvePath), checkConditional(cmd), checkMode(cmd, mode)]) {
    if (v.action !== "allow") return v;
  }
  return { action: "allow" };
}
