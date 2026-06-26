import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "../config.mjs";
import { hasFlag } from "../util/args.mjs";
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

function looksLikeNextField(line) {
  return /^[A-Z][A-Za-z0-9 /()-]{1,48}:\s*/.test(line.trim());
}

function fieldBlock(body, label) {
  const lines = body.split(/\r?\n/);
  const fieldPattern = new RegExp(`^${label}:\\s*(.*)$`, "i");
  const start = lines.findIndex((line) => fieldPattern.test(line.trim()));
  if (start === -1) return "";

  const firstValue = lines[start].trim().match(fieldPattern)?.[1]?.trim() || "";
  if (firstValue) return firstValue;

  const values = [];
  for (const line of lines.slice(start + 1)) {
    const trimmed = line.trim();
    if (!trimmed && values.length === 0) continue;
    if (!trimmed) break;
    if (trimmed.startsWith("##")) break;
    if (looksLikeNextField(trimmed)) break;
    values.push(normalizeBullet(trimmed));
  }
  return values.join("\n").trim();
}

function firstIssue(goal) {
  const issues = fieldBlock(goal.body, "Issues?");
  return issues.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "N/A";
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

function recordedCommit(value) {
  if (!hasUsableEvidence(value)) return "";
  return value.match(/\b[0-9a-f]{7,40}\b/i)?.[0] || "";
}

function refExists(ref) {
  return runCommand("git", ["rev-parse", "--verify", `${ref}^{commit}`], { cwd: CONFIG.repoRoot }).ok;
}

function commitIsReachableFromIntegrationBranch(sha) {
  const candidateRefs = [CONFIG.defaultBranch, `origin/${CONFIG.defaultBranch}`];
  for (const ref of candidateRefs) {
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

const FAILURE_WORDS = "(?:fail(?:ed|ing|ures?)?|errors?|errored|blocked|skipped|incomplete|unverified)";

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
  if (/\b(?:failed|failing|blocked|skipped|errored|incomplete|unverified)\b/i.test(text)) {
    return true;
  }
  return /^(?:fail(?:ed|ing)?|blocked|skipped|incomplete|unverified|error)\b/i.test(text);
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
    return /\b(?:pass(?:ed|es)?|verified|success(?:ful)?|ok|complete(?:d)?|manual qa)\b/i.test(line);
  });
}

function hasValidNextGoal(value) {
  if (isTerminalMarker(value)) return true;
  if (!hasUsableEvidence(value) || isRejectedTerminalMarker(value)) return false;
  return /^Goal\s+[A-Za-z0-9._-]+\s*:/i.test(value.trim()) || /(?:^|\s)#\d+\b/.test(value);
}

function closeoutBlockers(goal) {
  const blockers = [];
  const mergedPr = fieldBlock(goal.body, "Merged PR");
  if (!hasValidPrEvidence(mergedPr)) blockers.push("Merged PR");

  const mergeCommit = recordedCommit(fieldBlock(goal.body, "Merge commit"));
  if (!mergeCommit || !commitIsRecordedIntegrationCommitForPr(mergeCommit, prNumber(mergedPr))) {
    blockers.push(`Integration commit matching the merged PR on local ${CONFIG.defaultBranch} or origin/${CONFIG.defaultBranch}`);
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
  io.stdout("Usage: ./{{CLI_NAME}} goals <command> [goal-id]");
  io.stdout("");
  io.stdout("Commands:");
  io.stdout("  status              List goals from the implementation goal chain");
  io.stdout("  verify <goal-id>    Check merge, verification, and next-goal evidence");
  io.stdout("  start-prompt <id>   Print a bounded prompt for a goal thread");
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
    const status = closeoutBlockers(goal).length === 0 ? "closeout evidence present" : "open or incomplete";
    io.stdout(`- Goal ${goal.id}: ${goal.title} (${status})`);
  }
  return 0;
}

function runVerify(goalId, io) {
  if (!goalId) {
    io.stderr("Missing goal id. Usage: ./{{CLI_NAME}} goals verify <goal-id>");
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

  io.stdout(`Goal ${goal.id} has closeout evidence: ${goal.title}`);
  return 0;
}

function verificationLines(goal) {
  const block = fieldBlock(goal.body, "Verification");
  if (!block) return ["- the relevant local verification command"];
  return block.split(/\r?\n/).filter(Boolean).map((line) => `- ${line}`);
}

function runStartPrompt(goalId, io) {
  if (!goalId) {
    io.stderr("Missing goal id. Usage: ./{{CLI_NAME}} goals start-prompt <goal-id>");
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

  io.stdout(`Goal ${goal.id}: ${goal.title}`);
  io.stdout("");
  io.stdout("First action: read the repository instructions, run preflight, and inspect the linked issue.");
  io.stdout("");
  io.stdout(`Repository: ${CONFIG.repoRoot}`);
  io.stdout(`Base: ${CONFIG.defaultBranch}`);
  io.stdout(`Issue: ${firstIssue(goal)}`);
  io.stdout("");
  io.stdout("Objective:");
  io.stdout(objective);
  io.stdout("");
  io.stdout("Work shape:");
  io.stdout(`- Create a branch from current ${CONFIG.defaultBranch}.`);
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
  io.stdout(`- Complete only after PR is merged into ${CONFIG.defaultBranch}, evidence is recorded, and the next goal is queued from current ${CONFIG.defaultBranch}.`);
  return 0;
}

export async function runGoals(argv, io) {
  const [command = "status", goalId] = argv;
  if (hasFlag(argv, "--help") || hasFlag(argv, "-h") || command === "help") {
    printHelp(io);
    return 0;
  }

  switch (command) {
    case "status":
      return runStatus(io);
    case "verify":
      return runVerify(goalId, io);
    case "start-prompt":
      return runStartPrompt(goalId, io);
    default:
      io.stderr(`Unknown goals command: ${command}`);
      printHelp(io);
      return 2;
  }
}
