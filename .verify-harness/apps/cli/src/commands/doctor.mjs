import { CONFIG } from "../config.mjs";
import { commandExists, runCommand } from "../util/exec.mjs";
import { isPrecommitHookInstalled } from "../precommit/checklist.mjs";
import { rejectUnexpectedArgs } from "../util/agent-output.mjs";

const REQUIRED_TOOLS = ["git", "node"];
const OPTIONAL_TOOLS = ["gh"];
const MIN_NODE_MAJOR = 18;

export async function runDoctor(argv, io) {
  if (rejectUnexpectedArgs(argv, io, { command: "doctor", hints: [`Run ./${CONFIG.cliName} doctor`] })) return 2;
  const blockers = [];
  const warnings = [];

  const nodeMajor = Number.parseInt(process.versions.node.split(".")[0], 10);
  if (!Number.isFinite(nodeMajor) || nodeMajor < MIN_NODE_MAJOR) {
    blockers.push(`Node.js ${MIN_NODE_MAJOR}+ is required. Current Node.js version: ${process.versions.node}`);
  }
  if (process.platform === "win32") {
    warnings.push("Native Windows shells are not the primary generated-CLI target. Use WSL, Git Bash, or direct-read mode unless this harness has a Windows adapter.");
  }

  for (const tool of REQUIRED_TOOLS) {
    if (!commandExists(tool)) blockers.push(`Missing required tool: ${tool}`);
  }
  for (const tool of OPTIONAL_TOOLS) {
    if (!commandExists(tool)) warnings.push(`Optional tool not found: ${tool}`);
  }
  const gitWorktree = runCommand("git", ["rev-parse", "--is-inside-work-tree"], { cwd: CONFIG.repoRoot });
  if (gitWorktree.ok && gitWorktree.stdout.trim() === "true" && !isPrecommitHookInstalled()) {
    warnings.push("Harness precommit hook is not installed. Run ./verify-harness precommit install-hook to enforce commit-time checks.");
  }

  for (const warning of warnings) io.stdout(`warning: ${warning}`);
  for (const blocker of blockers) io.stderr(`blocker: ${blocker}`);

  if (blockers.length) return 1;
  io.stdout("Doctor checks passed.");
  return 0;
}
