import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "../config.mjs";
import { renderUsageError, truncateText } from "../util/agent-output.mjs";
import { runCommand } from "../util/exec.mjs";

const GOAL_CHAIN_CANDIDATES = [
  "docs/reference/implementation-goal-chain.md",
  "docs/engineering/goal-chain.md",
  "docs/reference/goal-chain.md",
  "ops/goal-chain.md"
];

function findGoalChain() {
  for (const relPath of GOAL_CHAIN_CANDIDATES) {
    const fullPath = path.join(CONFIG.repoRoot, relPath);
    if (fs.existsSync(fullPath)) {
      return { relPath, fullPath, text: fs.readFileSync(fullPath, "utf-8") };
    }
  }
  return null;
}

function parseGoals(text) {
  const matches = [...text.matchAll(/^##\s+Goal\s+([A-Za-z0-9._-]+)\s*:\s*(.+?)\s*$/gm)];
  return matches.map((match, index) => {
    const bodyStart = match.index + match[0].length;
    const bodyEnd = index + 1 < matches.length ? matches[index + 1].index : text.length;
    return {
      id: match[1],
      title: match[2].trim(),
      body: text.slice(bodyStart, bodyEnd).trim()
    };
  });
}

function findGoal(goals, id) {
  return goals.find((goal) => goal.id.toLowerCase() === id.toLowerCase());
}

function normalizeBullet(line) {
  return line.trim().replace(/^[-*]\s+/, "");
}

const KNOWN_FIELD_LABELS = [
  "Objective",
  "Issues?",
  "Scope",
  "Out of scope",
  "Exit criteria",
  "Verification",
  "Sequencing",
  "Merged PR",
  "Merge commit",
  "Closed issues",
  "Linked issues",
  "Residual risks",
  "Next goal",
  "Base",
  "First action"
];

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fieldLabelPattern(label) {
  if (label === "Issues?") return "Issues?";
  return escapeRegex(label);
}

const KNOWN_FIELD_PATTERN = new RegExp(`^(?:${KNOWN_FIELD_LABELS.map(fieldLabelPattern).join("|")}):\\s*`, "i");
const FIELD_LIKE_PATTERN = /^[A-Z][A-Za-z0-9 /()-]{1,48}:\s*/;
const VERIFICATION_NOTE_LABEL_PATTERN = /^(?:notes?|links?|follow[- ]?up|next steps?):\s*/i;
const DEFAULT_REQUIRED_GOAL_CLOSEOUT_FIELDS = ["Issues?", "Residual risks"];

function isKnownFieldBoundary(line) {
  const trimmed = line.trim();
  if (/^[-*]\s+/.test(trimmed)) return false;
  return KNOWN_FIELD_PATTERN.test(trimmed);
}

function isFieldLikeBoundary(line) {
  const trimmed = line.trim();
  if (/^[-*]\s+/.test(trimmed)) return false;
  return FIELD_LIKE_PATTERN.test(trimmed);
}

function isVerificationNoteBoundary(line) {
  const trimmed = line.trim();
  if (/^[-*]\s+/.test(trimmed)) return false;
  return VERIFICATION_NOTE_LABEL_PATTERN.test(trimmed);
}

function fieldBlock(body, label) {
  const lines = body.split(/\r?\n/);
  const fieldPattern = new RegExp(`^${fieldLabelPattern(label)}:\\s*(.*)$`, "i");
  const start = lines.findIndex((line) => fieldPattern.test(line.trim()));
  if (start === -1) return "";

  const firstValue = lines[start].trim().match(fieldPattern)?.[1]?.trim() || "";
  const values = firstValue ? [firstValue] : [];
  for (const line of lines.slice(start + 1)) {
    const trimmed = line.trim();
    if (!trimmed && values.length === 0) continue;
    if (!trimmed) break;
    if (trimmed.startsWith("##")) break;
    if (isKnownFieldBoundary(trimmed)) {
      if (label === "Verification" && /^Verification:\s*/i.test(trimmed)) {
        values.push(normalizeBullet(trimmed));
        continue;
      }
      break;
    }
    if (isFieldLikeBoundary(trimmed) && label !== "Verification") break;
    if (label === "Verification" && isVerificationNoteBoundary(trimmed)) break;
    values.push(normalizeBullet(trimmed));
  }
  return values.join("\n").trim();
}

function hasField(body, label) {
  const fieldPattern = new RegExp(`^${fieldLabelPattern(label)}:\\s*`, "i");
  return body.split(/\r?\n/).some((line) => fieldPattern.test(line.trim()));
}

function closeoutFieldKey(label) {
  const normalized = String(label || "")
    .toLowerCase()
    .replace(/\?$/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  if (/^(?:issues?|linked issues?)$/.test(normalized)) return "issues";
  if (/^residual risks?$/.test(normalized)) return "residual risks";
  return normalized;
}

function requiredCloseoutFieldEntries(body) {
  const entries = new Map();
  const fields = Array.isArray(CONFIG.requiredGoalCloseoutFields)
    ? CONFIG.requiredGoalCloseoutFields
    : [];
  for (const field of fields) {
    const label = String(field || "").trim().replace(/:$/, "");
    const key = closeoutFieldKey(label);
    if (key) entries.set(key, { key, label });
  }
  if (hasField(body, "Issues?") || hasField(body, "Linked issues") || hasField(body, "Closed issues")) {
    entries.set("issues", { key: "issues", label: "Issues?" });
  }
  if (hasField(body, "Residual risks")) entries.set("residual risks", { key: "residual risks", label: "Residual risks" });
  return [...entries.values()];
}

function firstIssue(goal) {
  const issues = issueEvidenceBlock(goal.body);
  return issues.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "N/A";
}

function issueEvidenceBlock(body) {
  return [fieldBlock(body, "Issues?"), fieldBlock(body, "Linked issues"), fieldBlock(body, "Closed issues")]
    .filter(Boolean)
    .join("\n")
    .trim();
}

function hasPlaceholder(value) {
  return /(?:<[^>]+>|#<[^>]+>|\b(?:tbd|todo|fixme|pending|unknown)\b)/i.test(value);
}

function isTerminalMarker(value) {
  return /^none$/i.test(value.trim());
}

function isRejectedTerminalMarker(value) {
  return /^(?:no next goal|final|final goal|not applicable|n\/a|na)$/i.test(value.trim());
}

function hasUsableEvidence(value) {
  return Boolean(value?.trim()) && !hasPlaceholder(value) && !isTerminalMarker(value);
}

function prNumber(value) {
  const text = value || "";
  return text.match(/(?:^|\s)#(\d+)\b/)?.[1] || text.match(/https?:\/\/\S+\/pull\/(\d+)\b/i)?.[1] || "";
}

function hasNegatedPrEvidence(value) {
  const text = value || "";
  if (/\b(?:not|never|no|without|pending|awaiting)\s+(?:merged?|landed|closed)\b/i.test(text)) return true;
  if (/\b(?:unmerged|unlanded)\b/i.test(text)) return true;
  if (/\b(?:pr|pull request)\b[^.\n]*(?:open|draft|pending|unmerged|not merged|not landed)\b/i.test(text)) return true;
  return /\b(?:open|draft|pending)\b[^.\n]*(?:pr|pull request)\b/i.test(text);
}

function hasValidPrEvidence(value) {
  return hasUsableEvidence(value) && Boolean(prNumber(value)) && !hasNegatedPrEvidence(value);
}

function configuredTrackerPatternResult() {
  if (!CONFIG.trackerIssuePattern) return { pattern: null, error: "" };
  try {
    return { pattern: new RegExp(CONFIG.trackerIssuePattern, "i"), error: "" };
  } catch (error) {
    return { pattern: null, error: error.message || "invalid regular expression" };
  }
}

function hasTrackerKeyEvidence(value) {
  const pattern = /\b([A-Z][A-Z0-9]{1,20}-\d+)\b/g;
  return value.split(/\r?\n/).some((line) => {
    for (const match of line.matchAll(pattern)) {
      if (!/^(?:UTF|SHA|ISO|AES|TLS|HTTP|HTTPS|IPV|UUID)-\d+\b/i.test(match[1])) return true;
    }
    return false;
  });
}

function hasValidIssueEvidence(value) {
  if (!hasUsableEvidence(value)) return false;
  const { pattern } = configuredTrackerPatternResult();
  if (pattern?.test(value)) return true;
  return (
    /(?:^|\s)#\d+\b/i.test(value) ||
    /\b[A-Z][A-Z0-9]{1,10}#\d+\b/i.test(value) ||
    hasTrackerKeyEvidence(value) ||
    /https?:\/\/\S+\/(?:issues?|pull|issue|browse|workitems?|_workitems\/edit)\/[A-Za-z0-9._-]+\b/i.test(value)
  );
}

function recordedCommit(value) {
  if (!hasUsableEvidence(value)) return "";
  return value.match(/\b[0-9a-f]{7,40}\b/i)?.[0] || "";
}

function refExists(ref) {
  return runCommand("git", ["rev-parse", "--verify", `${ref}^{commit}`], { cwd: CONFIG.repoRoot }).ok;
}

function integrationBranch() {
  return CONFIG.integrationBranch || CONFIG.defaultBranch;
}

function integrationRemote() {
  return CONFIG.integrationRemote || "origin";
}

function integrationRefs() {
  const branch = integrationBranch();
  const remote = integrationRemote();
  return remote ? [branch, `${remote}/${branch}`] : [branch];
}

function integrationRefDescription() {
  return integrationRefs().join(" or ");
}

function commitIsReachableFromIntegrationBranch(sha) {
  for (const ref of integrationRefs()) {
    if (!refExists(ref)) continue;
    const result = runCommand("git", ["merge-base", "--is-ancestor", sha, ref], { cwd: CONFIG.repoRoot });
    if (result.ok) return true;
  }
  return false;
}

function commitParentCount(sha) {
  const result = runCommand("git", ["rev-list", "--parents", "-n", "1", sha], { cwd: CONFIG.repoRoot });
  if (!result.ok) return 0;
  return Math.max(0, result.stdout.trim().split(/\s+/).length - 1);
}

function commitSubject(sha) {
  const result = runCommand("git", ["log", "-1", "--format=%s", sha], { cwd: CONFIG.repoRoot });
  return result.ok ? result.stdout.trim() : "";
}

function subjectMatchesMergePrNumber(subject, number) {
  if (!number) return false;
  const escaped = number.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (
    new RegExp(`^Merge pull request #${escaped}\\b`, "i").test(subject) ||
    new RegExp(`^Merge PR #${escaped}\\b`, "i").test(subject)
  );
}

function subjectMatchesSquashPrNumber(subject, number) {
  if (!number) return false;
  const escaped = number.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\(#${escaped}\\)\\s*$`, "i").test(subject);
}

function commitIsRecordedIntegrationCommitForPr(sha, number) {
  if (!commitIsReachableFromIntegrationBranch(sha)) return false;
  const parentCount = commitParentCount(sha);
  const subject = commitSubject(sha);
  return (
    (parentCount >= 2 && subjectMatchesMergePrNumber(subject, number)) ||
    (parentCount === 1 && subjectMatchesSquashPrNumber(subject, number))
  );
}

const FAILURE_STATUS_WORDS = "(?:fail(?:ed|ing)?|errored|blocked|skipped|incomplete|unverified)";
const FAILURE_COUNT_WORDS = "(?:failures?|errors?)";
const FAILURE_WORDS = `(?:${FAILURE_STATUS_WORDS}|${FAILURE_COUNT_WORDS})`;

function stripNegatedFailurePhrases(text) {
  return text
    .replace(new RegExp(`\\b(?:no|zero|0|without|none|nothing)\\b(?:[\\s:;,]+\\S+){0,5}?[\\s:;,]+${FAILURE_WORDS}\\b`, "gi"), "")
    .replace(new RegExp(`\\bno\\s+longer\\s+${FAILURE_WORDS}\\b`, "gi"), "");
}

function hasFailedVerification(line) {
  const text = stripNegatedFailurePhrases(line.trim());
  if (/\b(?:did not|does not|never|cannot|can't|unable to)\s+(?:pass|verify|complete|succeed|run)\b/i.test(text)) {
    return true;
  }
  if (/\b(?:tests?|verification|check|build|lint|typecheck|manual qa)\b[^.\n]*(?:fail(?:ed|ing)?|blocked|skipped|errored|incomplete|unverified)\b/i.test(text)) {
    return true;
  }
  if (/\b(?:tests?|verification|check|build|lint|typecheck|manual qa)\b[^.\n]*\b[1-9]\d*\s+(?:failures?|errors?)\b/i.test(text)) {
    return true;
  }
  if (/\b[1-9]\d*\s+(?:failures?|errors?)\b(?!-)/i.test(text)) {
    return true;
  }
  if (/\b(?:failed|failing|blocked|skipped|errored|incomplete|unverified)\b/i.test(text)) {
    return true;
  }
  if (/(?:^|[:;,]\s*)(?:fail(?:ed|ing)?|blocked|skipped|errored|incomplete|unverified)\b/i.test(text)) {
    return true;
  }
  if (/(?:^|[:;,]\s*)[1-9]\d*\s+(?:failures?|errors?)\b/i.test(text)) {
    return true;
  }
  return /^(?:(?:fail(?:ed|ing)?|blocked|skipped|incomplete|unverified)\b|errors?\s*[:=-])/i.test(text);
}

function hasPassingVerification(line) {
  const text = stripNegatedFailurePhrases(line.trim());
  return /\b(?:pass(?:ed|es)?|verified|success(?:ful|fully)?|succeeded|completed)\b/i.test(text);
}

function failedVerificationLine(value) {
  if (!hasUsableEvidence(value)) return "";
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .find((line) => hasFailedVerification(line) || hasPlaceholder(line)) || "";
}

function hasValidVerification(value) {
  if (!hasUsableEvidence(value)) return false;
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return false;
  if (lines.some((line) => hasFailedVerification(line) || hasPlaceholder(line))) return false;
  return lines.some((line) => {
    if (/\b(?:not applicable|n\/a|none)\b/i.test(line)) return false;
    return hasPassingVerification(line);
  });
}

function hasValidResidualRisks(value) {
  const text = value?.trim() || "";
  if (!text || hasPlaceholder(text)) return false;
  return true;
}

function hasGenericCloseoutEvidence(value) {
  const text = value?.trim() || "";
  return Boolean(text) && !hasPlaceholder(text);
}

function hasValidNextGoal(value) {
  if (isTerminalMarker(value)) return true;
  if (!hasUsableEvidence(value) || isRejectedTerminalMarker(value)) return false;
  return /^Goal\s+[A-Za-z0-9._-]+\s*:/i.test(value.trim()) || /(?:^|\s)#\d+\b/.test(value);
}

function closeoutBlockers(goal) {
  const blockers = [];
  const trackerPattern = configuredTrackerPatternResult();
  if (trackerPattern.error) {
    blockers.push(`trackerIssuePattern (${trackerPattern.error})`);
  }

  for (const field of requiredCloseoutFieldEntries(goal.body)) {
    if (field.key === "issues") {
      if (!trackerPattern.error && !hasValidIssueEvidence(issueEvidenceBlock(goal.body))) {
        blockers.push("Linked issue (set trackerIssuePattern for custom tracker refs)");
      }
    } else if (field.key === "residual risks") {
      if (!hasValidResidualRisks(fieldBlock(goal.body, "Residual risks"))) blockers.push("Residual risks");
    } else if (!hasGenericCloseoutEvidence(fieldBlock(goal.body, field.label))) {
      blockers.push(field.label);
    }
  }

  const mergedPr = fieldBlock(goal.body, "Merged PR");
  if (!hasValidPrEvidence(mergedPr)) blockers.push("Merged PR");

  const mergeCommit = recordedCommit(fieldBlock(goal.body, "Merge commit"));
  if (!mergeCommit || !commitIsRecordedIntegrationCommitForPr(mergeCommit, prNumber(mergedPr))) {
    blockers.push(`Integration commit matching the merged PR on ${integrationRefDescription()}`);
  }

  const verification = fieldBlock(goal.body, "Verification");
  if (!hasValidVerification(verification)) {
    const failedLine = failedVerificationLine(verification);
    blockers.push(failedLine ? `Verification result (${failedLine})` : "Verification result");
  }

  const nextGoal = fieldBlock(goal.body, "Next goal");
  if (!hasValidNextGoal(nextGoal)) blockers.push("Next goal");
  return blockers;
}

function loadGoals(io) {
  const chain = findGoalChain();
  if (!chain) {
    io.stderr(`Missing goal-chain document. Expected one of: ${GOAL_CHAIN_CANDIDATES.join(", ")}`);
    return null;
  }
  const goals = parseGoals(chain.text);
  return { chain, goals };
}

function printHelp(io) {
  io.stdout("Usage: ./{{CLI_NAME}} goals <command> [goal-id] [--full]");
  io.stdout("");
  io.stdout("Commands:");
  io.stdout("  status              List goals from the implementation goal chain");
  io.stdout("  verify <goal-id>    Check merge, verification, and next-goal evidence");
  io.stdout("  start-prompt <id>   Print a bounded prompt for a goal thread");
  io.stdout("");
  io.stdout("Options:");
  io.stdout("  --full              Print the complete goal objective for start-prompt");
}

function parseGoalArgs(args, { allowedFlags = [] } = {}) {
  const allowed = new Set(allowedFlags);
  const flags = new Set();
  const positionals = [];
  const unexpected = [];
  for (const arg of args) {
    if (allowed.has(arg)) {
      flags.add(arg);
    } else if (arg.startsWith("-")) {
      unexpected.push(arg);
    } else {
      positionals.push(arg);
    }
  }
  return { flags, positionals, unexpected };
}

function rejectGoalArgDrift(parsed, io, { command, maxPositionals = 0, hints = [] }) {
  const unexpected = [...parsed.unexpected, ...parsed.positionals.slice(maxPositionals)];
  if (unexpected.length === 0) return false;
  renderUsageError(io, {
    code: unexpected.some((arg) => arg.startsWith("-")) ? "unknown-flag" : "unexpected-argument",
    command,
    message: `Unexpected argument for goals ${command}`,
    details: unexpected,
    hints: hints.length ? hints : [`Run ./${CONFIG.cliName} goals help`]
  });
  return true;
}

function runStatus(io) {
  const chain = findGoalChain();
  if (!chain) {
    io.stdout("No goal chain document found.");
    io.stdout(`Expected one of: ${GOAL_CHAIN_CANDIDATES.join(", ")}`);
    return 0;
  }

  const goals = parseGoals(chain.text);
  io.stdout(`Goal chain: ${chain.relPath}`);
  if (goals.length === 0) {
    io.stdout("No goal headings found. Use headings like `## Goal 1: Title`.");
    return 0;
  }

  for (const goal of goals) {
    const status = closeoutBlockers(goal).length === 0 ? "matching local closeout evidence" : "open, incomplete, or locally unverifiable";
    io.stdout(`- Goal ${goal.id}: ${goal.title} (${status})`);
  }
  return 0;
}

function runVerify(goalId, io) {
  if (!goalId) {
    renderUsageError(io, {
      code: "missing-goal-id",
      command: "goals verify",
      message: "Missing goal id",
      hints: [`Run ./${CONFIG.cliName} goals verify <goal-id>`]
    });
    return 2;
  }
  const loaded = loadGoals(io);
  if (!loaded) return 1;

  const goal = findGoal(loaded.goals, goalId);
  if (!goal) {
    io.stderr(`Goal not found: ${goalId}`);
    return 1;
  }

  const blockers = closeoutBlockers(goal);
  if (blockers.length > 0) {
    io.stderr(`Missing closeout evidence for Goal ${goal.id}: ${goal.title}`);
    for (const blocker of blockers) io.stderr(`- ${blocker}`);
    return 1;
  }

  io.stdout(`Goal ${goal.id} has matching local closeout evidence: ${goal.title}`);
  return 0;
}

function verificationLines(goal) {
  const block = fieldBlock(goal.body, "Verification");
  if (!block) return ["- the relevant local verification command"];
  return block.split(/\r?\n/).filter(Boolean).map((line) => `- ${line}`);
}

function runStartPrompt(goalId, io, { full = false } = {}) {
  if (!goalId) {
    renderUsageError(io, {
      code: "missing-goal-id",
      command: "goals start-prompt",
      message: "Missing goal id",
      hints: [`Run ./${CONFIG.cliName} goals start-prompt <goal-id>`]
    });
    return 2;
  }
  const loaded = loadGoals(io);
  if (!loaded) return 1;

  const goal = findGoal(loaded.goals, goalId);
  if (!goal) {
    io.stderr(`Goal not found: ${goalId}`);
    return 1;
  }

  const objective = fieldBlock(goal.body, "Objective") || "Complete the scoped goal from the goal-chain document.";
  const objectivePreview = full ? { text: objective, truncated: false, shown: objective.length, total: objective.length } : truncateText(objective, { limit: 1200 });

  io.stdout(`Goal ${goal.id}: ${goal.title}`);
  io.stdout("");
  io.stdout("First action: read the repository instructions, run preflight, and inspect the linked issue.");
  io.stdout("");
  io.stdout(`Repository: ${CONFIG.repoRoot}`);
  io.stdout(`Base: ${integrationBranch()}`);
  io.stdout(`Issue: ${firstIssue(goal)}`);
  io.stdout("");
  io.stdout("Objective:");
  io.stdout(objectivePreview.text);
  if (objectivePreview.truncated) {
    io.stdout("");
    io.stdout("objective_preview:");
    io.stdout("  truncated: true");
    io.stdout(`  shown: ${objectivePreview.shown}`);
    io.stdout(`  total: ${objectivePreview.total}`);
    io.stdout(`  full: ./${CONFIG.cliName} goals start-prompt ${goal.id} --full`);
  }
  io.stdout("");
  io.stdout("Work shape:");
  io.stdout(`- Create a branch from current ${integrationBranch()}.`);
  io.stdout("- Implement only this goal.");
  io.stdout("- Keep secrets out of repo, chat, logs, tickets, commits, and CI.");
  io.stdout("");
  io.stdout("Expected first deliverable:");
  io.stdout("- Concise implementation plan naming files, integration points, verification commands, and PR exit criteria.");
  io.stdout("");
  io.stdout("Verification expectations:");
  for (const line of verificationLines(goal)) io.stdout(line);
  io.stdout("");
  io.stdout("Goal close:");
  io.stdout(`- Complete only after PR is merged into ${integrationBranch()}, evidence is recorded, and the next goal is queued from current ${integrationBranch()}.`);
  return 0;
}

export async function runGoals(argv, io) {
  const [command = "status", ...rest] = argv;
  if (argv.includes("--help") || argv.includes("-h") || command === "help") {
    printHelp(io);
    return 0;
  }

  switch (command) {
    case "status": {
      const parsed = parseGoalArgs(rest);
      if (rejectGoalArgDrift(parsed, io, { command: "status" })) return 2;
      return runStatus(io);
    }
    case "verify": {
      const parsed = parseGoalArgs(rest);
      if (rejectGoalArgDrift(parsed, io, { command: "verify", maxPositionals: 1 })) return 2;
      return runVerify(parsed.positionals[0], io);
    }
    case "start-prompt": {
      const parsed = parseGoalArgs(rest, { allowedFlags: ["--full"] });
      if (rejectGoalArgDrift(parsed, io, { command: "start-prompt", maxPositionals: 1 })) return 2;
      return runStartPrompt(parsed.positionals[0], io, { full: parsed.flags.has("--full") });
    }
    default:
      renderUsageError(io, {
        code: "unknown-goals-command",
        command: "goals",
        message: `Unknown goals command: ${command}`,
        hints: [`Run ./${CONFIG.cliName} goals help`]
      });
      return 2;
  }
}
