import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "../config.mjs";
import { runCommand } from "../util/exec.mjs";
import { isPrecommitHookInstalled } from "../precommit/checklist.mjs";
import { rejectUnexpectedArgs } from "../util/agent-output.mjs";

function git(args) {
  return runCommand("git", args, { cwd: CONFIG.repoRoot });
}

export async function runPreflight(argv, io) {
  if (rejectUnexpectedArgs(argv, io, { command: "preflight", hints: [`Run ./${CONFIG.cliName} preflight`] })) return 2;
  const blockers = [];
  const warnings = [];

  const branch = git(["branch", "--show-current"]);
  if (branch.ok) {
    io.stdout(`branch: ${branch.stdout.trim() || "(detached)"}`);
    if (!isPrecommitHookInstalled()) {
      warnings.push("Harness precommit hook is not installed. Run ./verify-harness precommit install-hook to enforce the gate before git commit.");
    }
  } else {
    warnings.push("Not inside a git worktree or git branch could not be read.");
  }

  const status = git(["status", "--porcelain"]);
  if (status.ok && status.stdout.trim()) {
    warnings.push("Worktree has local changes. Review before broad edits.");
  }

  for (const protocol of CONFIG.requiredProtocols) {
    const protocolPath = path.join(CONFIG.repoRoot, CONFIG.protocolDir, protocol);
    if (!fs.existsSync(protocolPath)) blockers.push(`Missing protocol: ${CONFIG.protocolDir}/${protocol}`);
  }

  if (!fs.existsSync(path.join(CONFIG.repoRoot, "AGENTS.md"))) blockers.push("Missing AGENTS.md");
  if (!fs.existsSync(path.join(CONFIG.repoRoot, "AGENTS-TOC.md"))) blockers.push("Missing AGENTS-TOC.md");
  if (!fs.existsSync(path.join(CONFIG.repoRoot, "ops", "HARNESS-CHECKLIST.md"))) {
    blockers.push("Missing ops/HARNESS-CHECKLIST.md");
  }
  if (!fs.existsSync(path.join(CONFIG.repoRoot, "ops", "connections.json"))) {
    blockers.push("Missing ops/connections.json");
  }

  for (const warning of warnings) io.stdout(`warning: ${warning}`);
  for (const blocker of blockers) io.stderr(`blocker: ${blocker}`);

  if (blockers.length) {
    io.stderr("Preflight found blockers. Ask before running mutating repair commands.");
    return 1;
  }

  io.stdout("Preflight passed. Load AGENTS-TOC.md and task-specific protocols next.");
  return 0;
}
