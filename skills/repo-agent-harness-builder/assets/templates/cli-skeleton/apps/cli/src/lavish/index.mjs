import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "../config.mjs";
import { hasFlag, readOption } from "../util/args.mjs";
import { commandExists, runCommand } from "../util/exec.mjs";
import { rejectUnexpectedArgs, renderHelpBlock, renderUsageError, safeLine, toonString } from "../util/agent-output.mjs";

const LAVISH_PROTOCOL = "ops/protocols/LAVISH-REVIEW.md";
const TRACKER_PROTOCOL = "ops/protocols/PROJECT-TRACKING.md";
const GOAL_PROTOCOL = "ops/protocols/GOAL-CHAIN.md";
const LOCAL_PATH_RE = /(?:\/(?:Users|home|tmp|private\/var|var\/folders|Volumes)\/[^\s"'()]+|[A-Za-z]:\\Users\\[^\r\n"'()]+|~\/[^\s"'()]+)/g;

function repoPath(relPath) {
  return path.join(CONFIG.repoRoot, relPath);
}

function fileState(relPath) {
  try {
    return fs.statSync(repoPath(relPath)).isFile() ? "present" : "not-file";
  } catch {
    return "missing";
  }
}

function leadingFrontMatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  return match ? match[1] : "";
}

function protocolStatus(relPath) {
  try {
    const frontMatter = leadingFrontMatter(fs.readFileSync(repoPath(relPath), "utf-8"));
    const match = frontMatter.match(/^status:\s*["']?([A-Za-z-]+)["']?\s*$/m);
    return match ? match[1].toLowerCase() : "unknown";
  } catch {
    return "missing";
  }
}

function projectSkillState() {
  const candidates = [
    ".agents/skills/lavish/SKILL.md",
    ".claude/skills/lavish/SKILL.md",
    ".codex/skills/lavish/SKILL.md",
    "skills/lavish/SKILL.md"
  ];
  const present = candidates.filter((candidate) => fileState(candidate) === "present");
  return present.length ? present.join(", ") : "not-installed";
}

function safeOutputPreview(value) {
  const line = safeLine(String(value || "").split(/\r?\n/).find((entry) => entry.trim()) || "");
  return line.replace(LOCAL_PATH_RE, "<redacted-path>").slice(0, 240);
}

function displayArtifact(filePath) {
  if (!filePath) return "(not provided)";
  const resolved = path.resolve(CONFIG.repoRoot, filePath);
  const rel = path.relative(CONFIG.repoRoot, resolved).split(path.sep).join("/");
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return "<outside-repo>";
  return rel;
}

function validatePassThroughFlags(argv, io, { command, booleanFlags = [], valueFlags = [] }) {
  const booleans = new Set(booleanFlags);
  const values = new Set(valueFlags);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("-")) {
      renderUsageError(io, {
        code: "unexpected-argument",
        command,
        message: `Unexpected argument for ${command}`,
        details: [arg],
        hints: [`Run ./${CONFIG.cliName} lavish help`]
      });
      return false;
    }
    const [flag] = arg.split("=", 1);
    if (booleans.has(arg)) continue;
    if (values.has(flag)) {
      if (!arg.includes("=")) {
        index += 1;
        if (index >= argv.length || argv[index].startsWith("-")) {
          renderUsageError(io, {
            code: "missing-flag-value",
            command,
            message: `Missing value for ${flag}`,
            details: [flag],
            hints: [`Run ./${CONFIG.cliName} lavish help`]
          });
          return false;
        }
      }
      continue;
    }
    renderUsageError(io, {
      code: "unknown-flag",
      command,
      message: `Unknown flag for ${command}`,
      details: [arg],
      hints: [`Run ./${CONFIG.cliName} lavish help`]
    });
    return false;
  }
  return true;
}

export function collectLavishStatus({ commandExistsImpl = commandExists } = {}) {
  return {
    module: "inactive-optional",
    protocol: fileState(LAVISH_PROTOCOL),
    protocol_status: protocolStatus(LAVISH_PROTOCOL),
    tracker_protocol: fileState(TRACKER_PROTOCOL),
    goal_protocol: fileState(GOAL_PROTOCOL),
    project_skill: projectSkillState(),
    npx_available: commandExistsImpl("npx"),
    install_required: false,
    update_check: `./${CONFIG.cliName} lavish update --check`,
    tracker_capture: `./${CONFIG.cliName} lavish tracker capture --issue <id> --artifact <html-file>`
  };
}

function renderLavishHelp(io) {
  io.stdout(`${CONFIG.projectName} Lavish commands`);
  io.stdout("");
  io.stdout(`Usage: ./${CONFIG.cliName} lavish <command> [options]`);
  io.stdout("");
  io.stdout("Commands:");
  io.stdout("  status                         Show optional Lavish review-surface posture");
  io.stdout("  doctor                         Alias for status; does not install or contact npm");
  io.stdout("  update [--check|--apply]       Check or explicitly apply lavish-axi updates");
  io.stdout("  open <html-file> [flags]       Run npx -y lavish-axi <html-file>");
  io.stdout("  poll <html-file> [flags]       Long-poll for Lavish feedback and layout warnings");
  io.stdout("  end <html-file>                End a Lavish session as the agent");
  io.stdout("  tracker capture --issue <id>   Draft a tracker update from Lavish decisions");
  io.stdout("  tracker reconcile --issue <id> Preview the review -> ticket -> goal -> no-mistakes sequence");
  io.stdout("");
  io.stdout("Safety:");
  io.stdout("  status/doctor are local and non-mutating");
  io.stdout("  update defaults to --check; --apply is required to mutate the Lavish install");
  io.stdout("  tracker commands are proposal-first and never write to the tracker");
}

function renderUpdateHelp(io) {
  io.stdout(`${CONFIG.projectName} Lavish update`);
  io.stdout("");
  io.stdout(`Usage: ./${CONFIG.cliName} lavish update [--check|--apply]`);
  io.stdout("");
  io.stdout("Options:");
  io.stdout("  --check  Check lavish-axi updates without applying changes");
  io.stdout("  --apply  Explicitly apply lavish-axi updates");
  io.stdout("");
  io.stdout("Safety:");
  io.stdout("  Defaults to --check");
  io.stdout("  Calls npx -y lavish-axi only when not rendering help");
}

function renderStatus(status, io) {
  io.stdout("lavish:");
  io.stdout(`  module: ${toonString(status.module)}`);
  io.stdout(`  protocol: ${toonString(status.protocol)}`);
  io.stdout(`  protocol_status: ${toonString(status.protocol_status)}`);
  io.stdout(`  tracker_protocol: ${toonString(status.tracker_protocol)}`);
  io.stdout(`  goal_protocol: ${toonString(status.goal_protocol)}`);
  io.stdout(`  project_skill: ${toonString(status.project_skill)}`);
  io.stdout(`  npx_available: ${status.npx_available}`);
  io.stdout(`  install_required: ${status.install_required}`);
  io.stdout(`  update_check: ${toonString(status.update_check)}`);
  io.stdout(`  tracker_capture: ${toonString(status.tracker_capture)}`);
  io.stdout(renderHelpBlock([
    `Use ./${CONFIG.cliName} lavish update --check before relying on a Lavish review session`,
    `Use ./${CONFIG.cliName} lavish tracker capture --issue <id> after Lavish decisions are made`,
    `Read ${LAVISH_PROTOCOL} before using Lavish as review evidence`
  ]));
}

function renderCommandResult(io, { action, mode, result, artifact = null }) {
  io.stdout("lavish_command:");
  io.stdout(`  action: ${toonString(action)}`);
  if (mode) io.stdout(`  mode: ${toonString(mode)}`);
  if (artifact) io.stdout(`  artifact: ${toonString(displayArtifact(artifact))}`);
  io.stdout(`  ok: ${result.ok}`);
  io.stdout(`  exit_code: ${result.status}`);
  const preview = safeOutputPreview(result.stdout || result.stderr);
  if (preview) io.stdout(`  output_preview: ${toonString(preview)}`);
}

function runLavishAxi(args, io, { runImpl, action, mode, artifact = null }) {
  const result = runImpl("npx", ["-y", "lavish-axi", ...args], { cwd: CONFIG.repoRoot });
  renderCommandResult(io, { action, mode, result, artifact });
  if (!result.ok) {
    io.stdout(renderHelpBlock([`Run ./${CONFIG.cliName} lavish status to check local posture`]));
  }
  return result.ok ? 0 : 1;
}

function runUpdate(argv, io, options) {
  if (hasFlag(argv, "--help") || hasFlag(argv, "-h")) {
    const nonHelpArgs = argv.filter((arg) => arg !== "--help" && arg !== "-h");
    if (rejectUnexpectedArgs(nonHelpArgs, io, {
      command: "lavish update",
      allowedFlags: ["--check", "--apply"],
      hints: [`Run ./${CONFIG.cliName} lavish update --check`]
    })) {
      return 2;
    }
    renderUpdateHelp(io);
    return 0;
  }
  if (rejectUnexpectedArgs(argv, io, {
    command: "lavish update",
    allowedFlags: ["--check", "--apply"],
    hints: [`Run ./${CONFIG.cliName} lavish update --check`]
  })) {
    return 2;
  }
  const apply = hasFlag(argv, "--apply");
  const check = hasFlag(argv, "--check") || !apply;
  if (apply && check && hasFlag(argv, "--check")) {
    renderUsageError(io, {
      code: "conflicting-flags",
      command: "lavish update",
      message: "Choose either --check or --apply",
      hints: [`Run ./${CONFIG.cliName} lavish update --check`]
    });
    return 2;
  }
  return runLavishAxi(check ? ["update", "--check"] : ["update"], io, {
    ...options,
    action: "update",
    mode: check ? "check" : "apply"
  });
}

function runOpen(argv, io, options) {
  const [filePath, ...rest] = argv;
  if (!filePath || filePath.startsWith("-")) {
    renderUsageError(io, {
      code: "missing-html-file",
      command: "lavish open",
      message: "lavish open requires an HTML file path",
      hints: [`Run ./${CONFIG.cliName} lavish open .lavish/review.html --no-open`]
    });
    return 2;
  }
  if (!validatePassThroughFlags(rest, io, {
    command: "lavish open",
    booleanFlags: ["--no-open", "--no-gate", "--reopen"]
  })) {
    return 2;
  }
  return runLavishAxi([filePath, ...rest], io, { ...options, action: "open", artifact: filePath });
}

function runPoll(argv, io, options) {
  const [filePath, ...rest] = argv;
  if (!filePath || filePath.startsWith("-")) {
    renderUsageError(io, {
      code: "missing-html-file",
      command: "lavish poll",
      message: "lavish poll requires an HTML file path",
      hints: [`Run ./${CONFIG.cliName} lavish poll .lavish/review.html`]
    });
    return 2;
  }
  if (!validatePassThroughFlags(rest, io, {
    command: "lavish poll",
    valueFlags: ["--agent-reply", "--timeout-ms"]
  })) {
    return 2;
  }
  return runLavishAxi(["poll", filePath, ...rest], io, { ...options, action: "poll", artifact: filePath });
}

function runEnd(argv, io, options) {
  const [filePath, ...rest] = argv;
  if (!filePath || filePath.startsWith("-")) {
    renderUsageError(io, {
      code: "missing-html-file",
      command: "lavish end",
      message: "lavish end requires an HTML file path",
      hints: [`Run ./${CONFIG.cliName} lavish end .lavish/review.html`]
    });
    return 2;
  }
  if (rejectUnexpectedArgs(rest, io, { command: "lavish end", hints: [`Run ./${CONFIG.cliName} lavish end ${displayArtifact(filePath)}`] })) {
    return 2;
  }
  return runLavishAxi(["end", filePath], io, { ...options, action: "end", artifact: filePath });
}

function trackerCapture(argv, io) {
  if (!validatePassThroughFlags(argv, io, {
    command: "lavish tracker capture",
    valueFlags: ["--issue", "--artifact", "--decisions"]
  })) {
    return 2;
  }
  const issue = readOption(argv, "--issue");
  const artifact = readOption(argv, "--artifact");
  const decisions = readOption(argv, "--decisions");
  if (!issue) {
    renderUsageError(io, {
      code: "missing-issue",
      command: "lavish tracker capture",
      message: "tracker capture requires --issue <id>",
      hints: [`Run ./${CONFIG.cliName} lavish tracker capture --issue <id> --artifact <html-file>`]
    });
    return 2;
  }

  io.stdout("tracker_update_proposal:");
  io.stdout("  mode: dry-run");
  io.stdout("  write_authority: none");
  io.stdout(`  issue: ${toonString(issue)}`);
  io.stdout(`  artifact: ${toonString(displayArtifact(artifact))}`);
  io.stdout(`  decisions_source: ${toonString(displayArtifact(decisions))}`);
  io.stdout("  summary: \"Lavish review decisions are ready to capture before implementation starts\"");
  io.stdout("body_template:");
  io.stdout("  \"Lavish review decisions\"");
  io.stdout("  \"\"");
  io.stdout("  \"- Decision:\"");
  io.stdout("  \"- Rationale:\"");
  io.stdout("  \"- User feedback source: Lavish review artifact / poll output\"");
  io.stdout("  \"- Implementation scope:\"");
  io.stdout("  \"- Verification expectation:\"");
  io.stdout("  \"- No-mistakes gate:\"");
  io.stdout(renderHelpBlock([
    "Review this proposal with the human before writing to the tracker",
    `After tracker capture, run ./${CONFIG.cliName} goals start-prompt <goal-id>`,
    `Before merge, run local checks and ./${CONFIG.cliName} no-mistakes status`
  ]));
  return 0;
}

function trackerReconcile(argv, io) {
  if (!validatePassThroughFlags(argv, io, {
    command: "lavish tracker reconcile",
    booleanFlags: ["--dry-run"],
    valueFlags: ["--issue"]
  })) {
    return 2;
  }
  const issue = readOption(argv, "--issue");
  if (!issue) {
    renderUsageError(io, {
      code: "missing-issue",
      command: "lavish tracker reconcile",
      message: "tracker reconcile requires --issue <id>",
      hints: [`Run ./${CONFIG.cliName} lavish tracker reconcile --issue <id>`]
    });
    return 2;
  }
  io.stdout("lavish_tracker_reconcile:");
  io.stdout("  mode: dry-run");
  io.stdout("  write_authority: none");
  io.stdout(`  issue: ${toonString(issue)}`);
  io.stdout("sequence[5]{step,status}:");
  io.stdout("  \"review artifact in Lavish\",\"manual-or-optional\"");
  io.stdout("  \"capture decisions in tracker\",\"proposal-first\"");
  io.stdout("  \"start ticket-backed goal\",\"requires tracker scope\"");
  io.stdout("  \"run local verification\",\"required before PR gate\"");
  io.stdout("  \"run no-mistakes when initialized\",\"strongly recommended before merge\"");
  io.stdout(renderHelpBlock([
    `Use ./${CONFIG.cliName} lavish tracker capture --issue ${issue} to draft the ticket update`,
    `Use ./${CONFIG.cliName} goals status to inspect configured goal chains`
  ]));
  return 0;
}

function runTracker(argv, io) {
  const [command = "help", ...rest] = argv;
  if (command === "help" || command === "--help" || command === "-h") {
    io.stdout("Lavish tracker commands are dry-run and proposal-first.");
    io.stdout(`Usage: ./${CONFIG.cliName} lavish tracker <capture|reconcile> --issue <id>`);
    return 0;
  }
  if (command === "capture") return trackerCapture(rest, io);
  if (command === "reconcile") return trackerReconcile(rest, io);
  renderUsageError(io, {
    code: "unknown-lavish-tracker-command",
    command: `lavish tracker ${command}`,
    message: `Unknown Lavish tracker command: ${command}`,
    hints: [`Run ./${CONFIG.cliName} lavish tracker help`]
  });
  return 2;
}

export async function runLavish(argv = [], io, { runImpl = runCommand, commandExistsImpl = commandExists } = {}) {
  const [command = "status", ...rest] = argv;
  switch (command) {
    case "help":
    case "--help":
    case "-h":
      if (rejectUnexpectedArgs(rest, io, { command: "lavish help", hints: [`Run ./${CONFIG.cliName} lavish help`] })) return 2;
      renderLavishHelp(io);
      return 0;
    case "status":
    case "doctor":
      if (rejectUnexpectedArgs(rest, io, { command: `lavish ${command}`, hints: [`Run ./${CONFIG.cliName} lavish status`] })) return 2;
      renderStatus(collectLavishStatus({ commandExistsImpl }), io);
      return 0;
    case "update":
      return runUpdate(rest, io, { runImpl });
    case "open":
      return runOpen(rest, io, { runImpl });
    case "poll":
      return runPoll(rest, io, { runImpl });
    case "end":
      return runEnd(rest, io, { runImpl });
    case "tracker":
      return runTracker(rest, io);
    default:
      renderUsageError(io, {
        code: "unknown-lavish-command",
        command: `lavish ${command}`,
        message: `Unknown Lavish command: ${command}`,
        hints: [`Run ./${CONFIG.cliName} lavish help`]
      });
      return 2;
  }
}
