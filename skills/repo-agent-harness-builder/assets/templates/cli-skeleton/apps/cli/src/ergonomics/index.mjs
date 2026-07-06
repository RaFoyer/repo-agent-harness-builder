import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "../config.mjs";
import { renderHelp, renderHome } from "../help.mjs";
import { renderHelpBlock, safeDetail, safeLine, toonString } from "../util/agent-output.mjs";

const ERGONOMICS_PROTOCOL = "ops/protocols/AGENT-CLI-ERGONOMICS.md";
const ALLOWED_FLAGS = new Set(["--strict"]);

function repoPath(relPath) {
  return path.join(CONFIG.repoRoot, relPath);
}

function readRepoFile(relPath) {
  return fs.readFileSync(repoPath(relPath), "utf-8");
}

function fileExists(relPath) {
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

function protocolStatus(relPath) {
  try {
    const frontMatter = leadingFrontMatter(readRepoFile(relPath));
    const match = frontMatter.match(/^status:\s*["']?([A-Za-z-]+)["']?\s*$/m);
    return match ? match[1].toLowerCase() : "unknown";
  } catch {
    return "missing";
  }
}

function sourceContains(relPath, pattern) {
  try {
    return pattern.test(readRepoFile(relPath));
  } catch {
    return false;
  }
}

function countSourceMatches(relPath, pattern) {
  try {
    return [...readRepoFile(relPath).matchAll(pattern)].length;
  } catch {
    return 0;
  }
}

function collectCommandModules() {
  const srcDir = repoPath("apps/cli/src");
  const files = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith(".mjs")) {
        files.push(path.relative(CONFIG.repoRoot, full).split(path.sep).join("/"));
      }
    }
  }
  if (fs.existsSync(srcDir)) walk(srcDir);
  return files.sort();
}

function addCheck(checks, id, status, summary) {
  checks.push({ id, status, summary });
}

function evaluateErgonomics() {
  const checks = [];
  const blockers = [];
  const warnings = [];
  const home = renderHome();
  const help = renderHelp();
  const mainPath = "apps/cli/src/main.mjs";
  const helpPath = "apps/cli/src/help.mjs";
  const testPath = "apps/cli/test/cli.test.mjs";
  const verifyPath = "apps/cli/src/verify/index.mjs";
  const protocolsPath = "apps/cli/src/commands/protocols.mjs";
  const connectionsPath = "apps/cli/src/connections/index.mjs";
  const facadePath = `apps/cli/bin/${CONFIG.cliName}.mjs`;
  const protocolStatusValue = protocolStatus(ERGONOMICS_PROTOCOL);

  if (protocolStatusValue !== "active") {
    blockers.push(`${ERGONOMICS_PROTOCOL} must exist with status: active`);
    addCheck(checks, "protocol-active", "blocker", `${ERGONOMICS_PROTOCOL} is ${protocolStatusValue}`);
  } else {
    addCheck(checks, "protocol-active", "pass", `${ERGONOMICS_PROTOCOL} is active`);
  }

  if (/^bin: /m.test(home) && /^description: /m.test(home) && /commands\[\d+\]\{command,purpose\}:/m.test(home) && /help\[\d+\]:/m.test(home) && !/Usage:/m.test(home)) {
    addCheck(checks, "home-view", "pass", "no-args home view is content-first");
  } else {
    blockers.push("no-args home view must include bin, description, commands[], help[], and avoid a Usage manual");
    addCheck(checks, "home-view", "blocker", "no-args home view is missing required AXI-shaped fields");
  }

  if (/Usage:/m.test(help) && /Safety posture:/m.test(help) && /ergonomics status/.test(help)) {
    addCheck(checks, "help-catalog", "pass", "help catalog is present and includes ergonomics");
  } else {
    blockers.push("help output must remain a concise catalog and list ergonomics status");
    addCheck(checks, "help-catalog", "blocker", "help catalog is missing expected sections or ergonomics command");
  }

  if (sourceContains(mainPath, /argv\.length\s*===\s*0[\s\S]*renderHome\(\)/) && sourceContains(mainPath, /code: unknown-command/) && sourceContains(mainPath, /return 2/)) {
    addCheck(checks, "dispatch-usage-errors", "pass", "top-level dispatch has no-args home view and structured unknown-command errors");
  } else {
    blockers.push("main dispatch must route no-args to renderHome and unknown commands to structured stdout usage errors with exit 2");
    addCheck(checks, "dispatch-usage-errors", "blocker", "top-level dispatch is missing AXI-shaped usage handling");
  }

  if (sourceContains(verifyPath, /ergonomics status/)) {
    addCheck(checks, "verify-includes-audit", "pass", "verify sequence includes ergonomics status");
  } else {
    warnings.push("verify should include ergonomics status so CLI quality is checked during harness verification");
    addCheck(checks, "verify-includes-audit", "warning", "verify sequence does not include ergonomics status");
  }

  if (sourceContains(testPath, /content-first agent home view/) && sourceContains(testPath, /structured usage error on stdout/) && sourceContains(testPath, /command families reject unexpected args/) && sourceContains(testPath, /ergonomics status/)) {
    addCheck(checks, "tests-cover-contract", "pass", "tests cover no-args home, stdout usage errors, rejected args, and ergonomics status");
  } else {
    blockers.push("CLI tests must cover no-args home view, structured usage errors, rejected command-family args, and ergonomics status");
    addCheck(checks, "tests-cover-contract", "blocker", "tests do not cover the AXI-shaped CLI contract");
  }

  if (sourceContains(helpPath, /commands\[\$\{HOME_COMMANDS\.length\}\]\{command,purpose\}/) && sourceContains(helpPath, /renderHelpBlock/)) {
    addCheck(checks, "contextual-help", "pass", "home view uses compact command rows and contextual help hints");
  } else {
    warnings.push("home view should use compact command rows and contextual help hints");
    addCheck(checks, "contextual-help", "warning", "home view contextual help could drift");
  }

  const modules = collectCommandModules();
  const stderrUnknownCount = modules.reduce((count, relPath) => count + countSourceMatches(relPath, /io\.stderr\([^)]*Unknown [^)]*command/g), 0);
  if (stderrUnknownCount > 0) {
    warnings.push(`${stderrUnknownCount} subcommand usage error paths still write to stderr instead of structured stdout`);
    addCheck(checks, "subcommand-usage-errors", "warning", `${stderrUnknownCount} stderr unknown-command paths remain`);
  } else {
    addCheck(checks, "subcommand-usage-errors", "pass", "subcommand usage errors are structured on stdout");
  }

  const ignoredArgCount = modules.reduce((count, relPath) => count + countSourceMatches(relPath, /export async function \w+\(_argv/g), 0);
  if (ignoredArgCount > 0) {
    warnings.push(`${ignoredArgCount} command handlers ignore argv; add explicit unknown-flag handling before extending them`);
    addCheck(checks, "unknown-flag-validation", "warning", `${ignoredArgCount} handlers ignore argv`);
  } else {
    addCheck(checks, "unknown-flag-validation", "pass", "command handlers do not silently ignore argv by signature");
  }

  if (sourceContains("apps/cli/src/util/agent-output.mjs", /toonString/) && sourceContains("apps/cli/src/util/agent-output.mjs", /renderHelpBlock/)) {
    addCheck(checks, "output-helpers", "pass", "shared output helpers are present");
  } else {
    warnings.push("add shared output helpers for TOON-shaped strings and contextual help blocks");
    addCheck(checks, "output-helpers", "warning", "shared output helpers are missing");
  }

  if (
    sourceContains(protocolsPath, /count:/) &&
    sourceContains(protocolsPath, /\[\$\{[^}]+\.length\}\]\{/) &&
    sourceContains(connectionsPath, /count:/) &&
    sourceContains(connectionsPath, /connections\[\$\{connections\.length\}\]\{/) &&
    sourceContains(connectionsPath, /empty: no registered external authorities/)
  ) {
    addCheck(checks, "list-output-shape", "pass", "protocol and connection list output is count-bearing and field-shaped");
  } else {
    warnings.push("list outputs need count-bearing TOON-shaped rows and definitive zero-result states");
    addCheck(checks, "list-output-shape", "warning", "list output shape is not fully AXI-shaped");
  }

  const auditedModules = modules.filter((relPath) => relPath !== "apps/cli/src/ergonomics/index.mjs");
  if (auditedModules.some((relPath) => sourceContains(relPath, /--full/)) && auditedModules.some((relPath) => sourceContains(relPath, /truncated/i))) {
    addCheck(checks, "truncation-escape-hatch", "pass", "long-output producers include truncation and --full support");
  } else {
    warnings.push("no generic truncation or --full escape-hatch support is present for long outputs");
    addCheck(checks, "truncation-escape-hatch", "warning", "long-output truncation support is missing");
  }

  if (sourceContains(connectionsPath, /endpoint \${service}: \${endpoint}/) || sourceContains(facadePath, /error\?\.(?:stack|message)/)) {
    warnings.push("some output paths may expose raw endpoint/account/error details; route them through a redaction boundary before hardening");
    addCheck(checks, "output-redaction-boundary", "warning", "not every output path is proven redacted");
  } else {
    addCheck(checks, "output-redaction-boundary", "pass", "high-risk output paths avoid raw endpoint/account/error details");
  }

  if (warnings.length <= CONFIG.ergonomicsWarningBudget) {
    addCheck(checks, "warning-budget", "pass", `${warnings.length} warnings within budget ${CONFIG.ergonomicsWarningBudget}`);
  } else {
    blockers.push(`${warnings.length} ergonomics warnings exceed configured budget ${CONFIG.ergonomicsWarningBudget}`);
    addCheck(checks, "warning-budget", "blocker", `${warnings.length} warnings exceed budget ${CONFIG.ergonomicsWarningBudget}`);
  }

  return { checks, blockers, warnings };
}

function renderRows(label, rows, fields, rowRenderer) {
  return [`${label}[${rows.length}]{${fields.join(",")}}:`, ...rows.map(rowRenderer)];
}

function renderStatus(io, result, strict) {
  const status = result.blockers.length ? "blocker" : strict && result.warnings.length ? "warning" : result.warnings.length ? "warning" : "pass";
  io.stdout("agent_cli_ergonomics:");
  io.stdout(`  status: ${status}`);
  io.stdout(`  blockers: ${result.blockers.length}`);
  io.stdout(`  warnings: ${result.warnings.length}`);
  for (const line of renderRows("checks", result.checks, ["id", "status", "summary"], (check) => `  ${toonString(check.id)},${toonString(check.status)},${toonString(check.summary)}`)) {
    io.stdout(line);
  }
  if (result.blockers.length) {
    for (const line of renderRows("blockers", result.blockers, ["message"], (blocker) => `  ${toonString(blocker)}`)) io.stdout(line);
  }
  if (result.warnings.length) {
    for (const line of renderRows("warnings", result.warnings, ["message"], (warning) => `  ${toonString(warning)}`)) io.stdout(line);
  }
  io.stdout(renderHelpBlock([
    `Run ./${CONFIG.cliName} ergonomics audit --strict before changing CLI output`,
    `Read ${ERGONOMICS_PROTOCOL} before adding or changing command output`
  ]));
}

function renderUsageError(io, code, message, details = []) {
  io.stdout("error:");
  io.stdout(`  code: ${safeLine(code)}`);
  io.stdout(`  message: ${toonString(safeLine(message))}`);
  for (const detail of details) io.stdout(`  detail: ${toonString(safeDetail(detail))}`);
  io.stdout(renderHelpBlock([`Run ./${CONFIG.cliName} ergonomics help`]));
}

function renderErgonomicsHelp(io) {
  io.stdout(`${CONFIG.projectName} CLI ergonomics commands`);
  io.stdout("");
  io.stdout(`Usage: ./${CONFIG.cliName} ergonomics <status|audit|help> [--strict]`);
  io.stdout("");
  io.stdout("Commands:");
  io.stdout("  status             Audit agent-facing CLI ergonomics and report blockers/warnings");
  io.stdout("  audit [--strict]   Same audit; --strict exits non-zero on warnings");
  io.stdout("  help               Show this help");
}

export async function runErgonomics(argv = [], io) {
  const [command = "status", ...rest] = argv;
  if (command === "help" || command === "--help" || command === "-h") {
    if (rest.length) {
      renderUsageError(io, "unexpected-argument", "Unexpected argument for ergonomics help", rest);
      return 2;
    }
    renderErgonomicsHelp(io);
    return 0;
  }
  if (command !== "status" && command !== "audit") {
    renderUsageError(io, "unknown-ergonomics-command", `Unknown ergonomics command: ${command}`);
    return 2;
  }
  const unknownFlags = rest.filter((arg) => arg.startsWith("-") && !ALLOWED_FLAGS.has(arg));
  if (unknownFlags.length) {
    renderUsageError(io, "unknown-flag", "Unknown flag for ergonomics audit", unknownFlags);
    return 2;
  }
  const unexpectedArgs = rest.filter((arg) => !arg.startsWith("-"));
  if (unexpectedArgs.length) {
    renderUsageError(io, "unexpected-argument", `Unexpected argument for ergonomics ${command}`, unexpectedArgs);
    return 2;
  }
  const strict = rest.includes("--strict");
  const result = evaluateErgonomics();
  renderStatus(io, result, strict);
  if (result.blockers.length) return 1;
  if (strict && result.warnings.length) return 1;
  return 0;
}
