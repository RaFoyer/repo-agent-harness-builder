import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "../config.mjs";
import { rejectUnexpectedArgs, renderUsageError } from "../util/agent-output.mjs";
import { loadDesignWorkflow, runDesignWorkflow } from "./workflow.mjs";

const DESIGN_PROTOCOL = "ops/protocols/DESIGN-SYSTEM.md";
const HARNESS_CHECKLIST = "ops/HARNESS-CHECKLIST.md";
const SOURCE_CANDIDATES = [
  "design-system/manifest.json",
  "design-system/tokens.json",
  "design-system/theme.json",
  "design-system/components.json",
  "design-system/components.md",
  "design-system/design-philosophy.md",
  "design-system/ux-principles.md",
  "design-system/reviews.jsonl",
  "design-system/proofs.jsonl",
  "design-system/exceptions.jsonl",
  "design-system/external-authorities.json"
];

function repoPath(relPath) {
  return path.join(CONFIG.repoRoot, relPath);
}

function hasFile(relPath) {
  try {
    return fs.statSync(repoPath(relPath)).isFile();
  } catch {
    return false;
  }
}

function leadingFrontMatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  return match ? match[1] : "";
}

function protocolStatus() {
  const protocolPath = repoPath(DESIGN_PROTOCOL);
  let content;
  try {
    content = fs.readFileSync(protocolPath, "utf-8");
  } catch {
    return "unknown";
  }
  const frontMatter = leadingFrontMatter(content);
  const match = frontMatter.match(/^status:\s*["']?([A-Za-z-]+)["']?\s*$/m);
  const status = (match ? match[1] : "unknown").toLowerCase();
  if (status === "inactive" || status === "not-applicable" || status === "unknown") return status;
  return `declared ${status} (unverified)`;
}

function sourceSummary() {
  const sources = SOURCE_CANDIDATES.filter((candidate) => hasFile(candidate));
  if (sources.length === 0) return "no known source pointers found";
  return sources.map((source) => `${source} (present, unverified)`).join(", ");
}

function renderDesignHelp() {
  return `${CONFIG.projectName} design commands

Usage:
  ./${CONFIG.cliName} design <command>

Commands:
  status   Show design-system governance status and activation route
  views [--audience <name>] [--module <name>] [--json]
           List the active design workflow's registered views
  session <id> [--json]
           Print a client-neutral brief; stop for milestone-1 approval
  preview <id> [--json]
           Print a reviewed local preview plan; never launch or disable auth
  tracker [--write]
           Render the tracker to stdout; --write regenerates its configured file
  check <manifest> --revision <full-sha> --view <id>
           Verify local visual-evidence receipts against ops/design-evidence.json

Workflow commands require active ops/design-workflow.json. See DESIGN-IN-CODE.md.
`;
}

function runStatus(io) {
  io.stdout(`design system: ${protocolStatus()}`);
  try { io.stdout(`design workflow: ${loadDesignWorkflow().status} (declared, not verified)`); }
  catch (error) { io.stdout(`design workflow: ${error.code === "ENOENT" ? "not-configured" : "invalid-config"}`); }
  io.stdout(`protocol: ${DESIGN_PROTOCOL}`);
  io.stdout(`checklist: ${HARNESS_CHECKLIST}`);
  io.stdout(`source: ${sourceSummary()}`);
  io.stdout("activation: name owner, scope, canonical design authority, verification, and rollback before marking active");
  return 0;
}

export async function runDesign(argv = [], io) {
  const [command = "status", ...rest] = argv;
  switch (command) {
    case "views":
    case "session":
    case "preview":
    case "tracker":
    case "check":
      return runDesignWorkflow(command, rest, io);
    case "help":
    case "--help":
    case "-h":
      if (rejectUnexpectedArgs(rest, io, { command: "design help", hints: [`Run ./${CONFIG.cliName} design help`] })) return 2;
      io.stdout(renderDesignHelp());
      return 0;
    case "status":
      if (rejectUnexpectedArgs(rest, io, { command: "design status", hints: [`Run ./${CONFIG.cliName} design status`] })) return 2;
      return runStatus(io);
    default:
      renderUsageError(io, {
        code: "unknown-design-command",
        command: `design ${command}`,
        message: `Unknown design command: ${command}`,
        hints: [`Run ./${CONFIG.cliName} design status for inactive module status`]
      });
      return 2;
  }
}
