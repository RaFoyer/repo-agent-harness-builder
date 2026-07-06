import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CONFIG } from "../config.mjs";
import { runCommand } from "../util/exec.mjs";
import { hasFlag } from "../util/args.mjs";
import { renderHelpBlock, renderUsageError, safeLine, toonString } from "../util/agent-output.mjs";

const NOT_READY_RE = /\bnot initialized\b|no-mistakes init|run .*init|\bnot in a git repository\b|\bnot a git repository\b|\bno git repository\b|\bmissing remote\b|\bno remote\b|\bnot configured\b/i;
const READY_RE = /^[ \t]*gate:[ \t]*\S+/m;
const DAEMON_READY_RE = /\bdaemon\b.*\b(running|ready|connected|healthy)\b/i;
const DAEMON_UNAVAILABLE_RE = /\bdaemon\b.*\b(not running|stopped|unavailable|missing|failed)\b/i;
const DEFAULT_SETUP_AGENT = "auto";
const AGENT_CHOICES = new Set(["auto", "claude", "codex", "rovodev", "opencode", "pi", "copilot"]);
const ACTIVE_RUN_STATUSES = new Set(["pending", "running"]);
const ACP_AGENT_RE = /^acp:[a-z0-9][a-z0-9._-]*$/;

function isSupportedAgent(agent) {
  return AGENT_CHOICES.has(agent) || ACP_AGENT_RE.test(agent);
}

function normalizeAgent(agent) {
  const normalized = String(agent || DEFAULT_SETUP_AGENT).trim().toLowerCase();
  if (normalized === "claude-code") return "claude";
  if (normalized === "openai" || normalized === "gpt") return "codex";
  if (!isSupportedAgent(normalized)) return null;
  return normalized;
}

function safeAgentLabel(agent) {
  if (!agent) return null;
  const normalized = normalizeAgent(agent);
  if (!normalized) return "custom";
  if (normalized.startsWith("acp:")) return "acp:configured";
  return normalized;
}

function describeAgent(agent) {
  const label = safeAgentLabel(agent);
  if (label === "auto") return "auto lets no-mistakes choose a supported local agent";
  if (label === "codex") return "codex pins no-mistakes fixes to Codex";
  if (label === "claude") return "claude pins no-mistakes fixes to Claude Code";
  if (label === "acp:configured") return "acp:configured pins no-mistakes through a configured ACP target";
  if (!label) return "unset; generated harnesses default repo policy to auto";
  return `${label} is an explicit no-mistakes agent choice`;
}

function resolveNoMistakesHome(env = process.env) {
  return env.NM_HOME || path.join(env.HOME || os.homedir(), ".no-mistakes");
}

function readGlobalNoMistakesConfig({ env = process.env, fsImpl = fs } = {}) {
  const configPath = path.join(resolveNoMistakesHome(env), "config.yaml");
  try {
    const contents = fsImpl.readFileSync(configPath, "utf-8");
    const agentMatch = contents.match(/^\s*agent\s*:\s*([^#\n\r]+)/m);
    const agent = agentMatch ? agentMatch[1].trim().replace(/^["']|["']$/g, "") : null;
    return { path: configPath, exists: true, agent };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return { path: configPath, exists: false, agent: null };
  }
}

function writeGlobalNoMistakesAgent(agent, { env = process.env, fsImpl = fs } = {}) {
  const normalized = normalizeAgent(agent);
  if (!normalized) return { status: "invalid", agent: null };

  const config = readGlobalNoMistakesConfig({ env, fsImpl });
  fsImpl.mkdirSync(path.dirname(config.path), { recursive: true, mode: 0o700 });
  let contents = "";
  if (config.exists) contents = fsImpl.readFileSync(config.path, "utf-8");
  const nextContents = /^\s*agent\s*:/m.test(contents)
    ? contents.replace(/^(\s*agent\s*:\s*)[^\n\r]*/m, `$1${normalized}`)
    : `${contents.trimEnd() ? `${contents.trimEnd()}\n\n` : ""}agent: ${normalized}\n`;
  fsImpl.writeFileSync(config.path, nextContents, { mode: 0o600 });
  return {
    status: config.agent === normalized ? "present" : "updated",
    agent: safeAgentLabel(normalized),
    previous_agent: safeAgentLabel(config.agent)
  };
}

function fileState(repoRoot, relPath) {
  const fullPath = path.join(repoRoot, relPath);
  try {
    const stat = fs.statSync(fullPath);
    return stat.isFile() ? "present" : "not-file";
  } catch {
    return "missing";
  }
}

function setupScriptState(repoRoot) {
  const fullPath = path.join(repoRoot, "scripts", "setup-no-mistakes.sh");
  try {
    const stat = fs.statSync(fullPath);
    if (!stat.isFile()) return "not-file";
    return (stat.mode & 0o111) !== 0 ? "present-executable" : "present-not-executable";
  } catch {
    return "missing";
  }
}

function localGitInfoDir(repoRoot) {
  const gitDir = path.join(repoRoot, ".git");
  try {
    const stat = fs.statSync(gitDir);
    if (stat.isDirectory()) return path.join(gitDir, "info");
    if (!stat.isFile()) return null;
    const pointer = fs.readFileSync(gitDir, "utf-8").match(/^gitdir:\s*(.+)\s*$/m);
    if (!pointer) return null;
    const actualGitDir = path.isAbsolute(pointer[1]) ? pointer[1] : path.resolve(repoRoot, pointer[1]);
    return path.join(actualGitDir, "info");
  } catch {
    return null;
  }
}

function ensureLocalNoMistakesExclude(repoRoot) {
  const infoDir = localGitInfoDir(repoRoot);
  if (!infoDir) return "unavailable";
  const excludePath = path.join(infoDir, "exclude");
  try {
    const current = fs.existsSync(excludePath) ? fs.readFileSync(excludePath, "utf-8") : "";
    if (/(^|\n)\.no-mistakes\/(?:\n|$)/.test(current)) return "present";
    fs.mkdirSync(infoDir, { recursive: true });
    const prefix = current && !current.endsWith("\n") ? "\n" : "";
    fs.appendFileSync(excludePath, `${prefix}.no-mistakes/\n`, "utf-8");
    return "added";
  } catch {
    return "unavailable";
  }
}

function firstLine(value) {
  const line = String(value || "").split(/\r?\n/).find((entry) => entry.trim());
  return line ? safeLine(line).slice(0, 160) : "";
}

function normalizedVersion(value) {
  const line = firstLine(value);
  const match = line.match(/\b(v?\d+(?:\.\d+){1,3}(?:[-+][0-9A-Za-z.-]+)?)\b/);
  if (!match) return "detected";
  return `no-mistakes ${match[1].replace(/^v/, "")}`;
}

function statusText(result) {
  if (!result) return "";
  return `${result.stdout || ""}\n${result.stderr || ""}`;
}

function repoState(statusResult) {
  if (!statusResult) return "unavailable";
  const text = statusText(statusResult);
  if (NOT_READY_RE.test(text)) return "not-ready";
  if (statusResult.ok && READY_RE.test(text)) return "initialized";
  return statusResult.ok ? "not-ready" : "status-error";
}

function daemonState(statusResult) {
  const text = statusText(statusResult);
  if (DAEMON_UNAVAILABLE_RE.test(text)) return "unavailable";
  if (DAEMON_READY_RE.test(text)) return "ready";
  return "unknown";
}

function parseCsvFields(lineText) {
  const fields = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < lineText.length; index += 1) {
    const char = lineText[index];
    if (char === "\"") {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      fields.push(field);
      field = "";
      continue;
    }
    field += char;
  }
  fields.push(field);
  return fields.map((value) => value.trim());
}

function safeRun(run) {
  if (!run?.branch) return null;
  return {
    id: safeLine(run.id || ""),
    branch: safeLine(run.branch || ""),
    status: safeLine(run.status || "")
  };
}

function parseAxiOutput(output) {
  const summary = {
    current_branch: null,
    current_run: null,
    other_branch_run: null,
    other_running_runs: []
  };
  let section = null;
  const allRunningRuns = [];

  for (const lineText of String(output || "").split(/\r?\n/)) {
    const branchMatch = lineText.match(/^current_branch:\s*(.+)$/);
    if (branchMatch) {
      summary.current_branch = safeLine(branchMatch[1].trim().replace(/^"|"$/g, ""));
      section = null;
      continue;
    }

    const sectionMatch = lineText.match(/^(active_run|other_branch_active_run):\s*$/);
    if (sectionMatch) {
      section = sectionMatch[1];
      if (section === "active_run") summary.current_run = {};
      if (section === "other_branch_active_run") summary.other_branch_run = {};
      continue;
    }

    if (/^runs\[\d+\]\{id,branch,status,head,pr\}:/.test(lineText)) {
      section = "runs";
      continue;
    }

    if (section === "runs") {
      const rowMatch = lineText.match(/^\s{2}(.+)$/);
      if (!rowMatch) {
        if (/^\S/.test(lineText)) section = null;
        continue;
      }
      const [id, branch, status] = parseCsvFields(rowMatch[1]);
      if (ACTIVE_RUN_STATUSES.has(status)) {
        const run = safeRun({ id, branch, status });
        if (run) allRunningRuns.push(run);
      }
      continue;
    }

    if (!section) continue;
    const fieldMatch = lineText.match(/^\s{2}([a-z_]+):\s*(.+)$/);
    if (!fieldMatch) {
      if (/^\S/.test(lineText)) section = null;
      continue;
    }
    const [, key, rawValue] = fieldMatch;
    const target = section === "active_run" ? summary.current_run : summary.other_branch_run;
    target[key] = rawValue.trim().replace(/^"|"$/g, "");
  }

  summary.current_run = safeRun(summary.current_run);
  summary.other_branch_run = safeRun(summary.other_branch_run);
  summary.other_running_runs = allRunningRuns.filter(
    (run) => run.branch && run.branch !== summary.current_branch,
  );
  if (summary.other_running_runs.length === 0 && summary.other_branch_run) {
    summary.other_running_runs = [summary.other_branch_run];
  }
  return summary;
}

function collectAxiStatus({ repoRoot, runImpl }) {
  const result = runImpl("no-mistakes", ["axi"], { cwd: repoRoot });
  if (!result.ok) return { available: false };
  return {
    available: true,
    ...parseAxiOutput(statusText(result))
  };
}

export function collectNoMistakesStatus({
  repoRoot = CONFIG.repoRoot,
  runImpl = runCommand,
  env = process.env,
  fsImpl = fs
} = {}) {
  const versionResult = runImpl("no-mistakes", ["--version"], { cwd: repoRoot });
  const commandResponded = versionResult.ok || Boolean(versionResult.stdout || versionResult.stderr);
  const statusResult = commandResponded ? runImpl("no-mistakes", ["status"], { cwd: repoRoot }) : null;
  const state = repoState(statusResult);
  const globalConfig = readGlobalNoMistakesConfig({ env, fsImpl });

  return {
    available: commandResponded,
    initialized: state === "initialized",
    repo_state: state,
    daemon: daemonState(statusResult),
    version: versionResult.ok ? normalizedVersion(versionResult.stdout || versionResult.stderr) : null,
    config: fileState(repoRoot, ".no-mistakes.yaml"),
    setup_script: setupScriptState(repoRoot),
    agent_config: globalConfig.exists ? "present" : "missing",
    agent: safeAgentLabel(globalConfig.agent),
    recommended_agent: DEFAULT_SETUP_AGENT,
    axi: state === "initialized" ? collectAxiStatus({ repoRoot, runImpl }) : null,
    status_exit_code: statusResult ? statusResult.status : null
  };
}

function statusHints(status) {
  const hints = [];
  if (status.config !== "present") hints.push("Restore .no-mistakes.yaml from the harness template");
  if (status.setup_script !== "present-executable") hints.push("Restore scripts/setup-no-mistakes.sh and make it executable");
  if (!status.available) hints.push(`Install no-mistakes, then run ./${CONFIG.cliName} no-mistakes setup`);
  else if (!status.initialized) hints.push(`Ask for approval, then run ./${CONFIG.cliName} no-mistakes setup`);
  else hints.push("Commit a feature branch, then run git push no-mistakes <branch-name>");
  return hints;
}

function renderStatus(status, io, { json = false } = {}) {
  const payload = {
    no_mistakes: status,
    help: statusHints(status)
  };
  if (json) {
    io.stdout(JSON.stringify(payload, null, 2));
    return;
  }

  io.stdout("no_mistakes:");
  io.stdout(`  available: ${status.available}`);
  io.stdout(`  initialized: ${status.initialized}`);
  io.stdout(`  repo_state: ${status.repo_state}`);
  io.stdout(`  daemon: ${status.daemon}`);
  io.stdout(`  config: ${status.config}`);
  io.stdout(`  setup_script: ${status.setup_script}`);
  io.stdout(`  agent_config: ${status.agent_config}`);
  io.stdout(`  agent: ${toonString(status.agent || "(unset)")}`);
  io.stdout(`  recommended_agent: ${toonString(status.recommended_agent)}`);
  if (status.version) io.stdout(`  version: ${toonString(status.version)}`);
  if (status.axi?.available && status.axi.current_branch) {
    io.stdout(`  current_branch: ${toonString(status.axi.current_branch)}`);
  }
  if (status.axi?.current_run?.branch) {
    io.stdout(`  current_run: ${toonString(`${status.axi.current_run.branch} ${status.axi.current_run.status} ${status.axi.current_run.id}`.trim())}`);
  }
  if (status.axi?.other_running_runs?.length) {
    const runs = status.axi.other_running_runs.map((run) => `${run.branch} ${run.status} ${run.id}`.trim()).join("; ");
    io.stdout(`  other_runs: ${toonString(`${runs} - leave active validations in other branches/worktrees alone`)}`);
  }
  io.stdout(renderHelpBlock(payload.help));
}

function help(io) {
  io.stdout("No-mistakes commands are value-safe wrappers around the branch-to-PR validation gate.");
  io.stdout("Available commands:");
  io.stdout("  no-mistakes help                         Show this help");
  io.stdout("  no-mistakes status [--json]              Check local setup without printing raw status output");
  io.stdout("  no-mistakes setup [--fork-url <url>] [--agent <agent>]");
  io.stdout("                                           Run no-mistakes init, optionally pinning the user-local agent");
  io.stdout("");
  io.stdout("Agent choices: auto, codex, claude, rovodev, opencode, pi, copilot, or acp:<target>.");
  io.stdout("Generated harnesses keep repo policy at auto; pass --agent only when the maintainer wants a local pin.");
}

function parseSetupArgs(argv) {
  const options = { json: false, forkUrl: null, agent: null, help: false, errors: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--fork-url") {
      const value = argv[index + 1];
      if (!value || value.startsWith("-")) {
        options.errors.push(arg);
      } else {
        options.forkUrl = value;
        index += 1;
      }
    } else if (arg.startsWith("--fork-url=")) {
      const value = arg.slice("--fork-url=".length);
      if (!value) options.errors.push("--fork-url");
      else options.forkUrl = value;
    } else if (arg === "--agent") {
      const value = argv[index + 1];
      const normalized = normalizeAgent(value);
      if (!value || value.startsWith("-") || !normalized) {
        options.errors.push("--agent");
      } else {
        options.agent = normalized;
        index += 1;
      }
    } else if (arg.startsWith("--agent=")) {
      const value = arg.slice("--agent=".length);
      const normalized = normalizeAgent(value);
      if (!value || !normalized) options.errors.push("--agent");
      else options.agent = normalized;
    } else {
      options.errors.push(arg);
    }
  }
  return options;
}

async function runSetup(
  argv,
  io,
  { repoRoot = CONFIG.repoRoot, runImpl = runCommand, env = process.env, fsImpl = fs } = {},
) {
  const options = parseSetupArgs(argv);
  if (options.help) {
    if (options.errors.length) {
      renderUsageError(io, {
        code: "unexpected-argument",
        command: "no-mistakes setup",
        message: "Unexpected argument for no-mistakes setup",
        details: options.errors,
        hints: [`Run ./${CONFIG.cliName} no-mistakes help`]
      });
      return 2;
    }
    help(io);
    return 0;
  }
  if (options.errors.length) {
    renderUsageError(io, {
      code: options.errors.some((arg) => arg.startsWith("-")) ? "unknown-flag" : "unexpected-argument",
      command: "no-mistakes setup",
      message: "Unexpected argument for no-mistakes setup",
      details: options.errors,
      hints: [`Run ./${CONFIG.cliName} no-mistakes help`]
    });
    return 2;
  }

  const before = collectNoMistakesStatus({ repoRoot, runImpl, env, fsImpl });
  if (!before.available) {
    renderStatus(before, io, { json: options.json });
    return 1;
  }

  const initArgs = ["init"];
  if (options.forkUrl) initArgs.push("--fork-url", options.forkUrl);
  const initResult = runImpl("no-mistakes", initArgs, { cwd: repoRoot });
  const localExclude = ensureLocalNoMistakesExclude(repoRoot);
  const after = collectNoMistakesStatus({ repoRoot, runImpl, env, fsImpl });
  const ok = initResult.ok && after.initialized;
  const agentConfig = ok && options.agent
    ? writeGlobalNoMistakesAgent(options.agent, { env, fsImpl })
    : { status: "unchanged", agent: null, previous_agent: null };
  const payload = {
    no_mistakes_setup: {
      status: ok ? "ok" : "failed",
      available: true,
      initialized: after.initialized,
      fork_url: options.forkUrl ? "provided" : "omitted",
      agent_config: agentConfig.status,
      agent: agentConfig.agent || "unchanged",
      local_exclude: localExclude,
      init_exit_code: initResult.status,
      post_check: after.initialized ? "pass" : "fail"
    },
    help: ok
      ? [
          "Commit a feature branch, then run git push no-mistakes <branch-name>",
          options.agent ? describeAgent(options.agent) : "Pass --agent codex, --agent claude, or --agent auto only when you want to pin local no-mistakes behavior"
        ]
      : ["Run no-mistakes status locally for detailed diagnostics before retrying"]
  };

  if (options.json) {
    io.stdout(JSON.stringify(payload, null, 2));
  } else {
    io.stdout("no_mistakes_setup:");
    io.stdout(`  status: ${payload.no_mistakes_setup.status}`);
    io.stdout("  available: true");
    io.stdout(`  initialized: ${payload.no_mistakes_setup.initialized}`);
    io.stdout(`  fork_url: ${payload.no_mistakes_setup.fork_url}`);
    io.stdout(`  agent_config: ${payload.no_mistakes_setup.agent_config}`);
    io.stdout(`  agent: ${toonString(payload.no_mistakes_setup.agent)}`);
    io.stdout(`  local_exclude: ${payload.no_mistakes_setup.local_exclude}`);
    io.stdout(`  init_exit_code: ${payload.no_mistakes_setup.init_exit_code}`);
    io.stdout(`  post_check: ${payload.no_mistakes_setup.post_check}`);
    io.stdout(renderHelpBlock(payload.help));
  }

  return ok ? 0 : 1;
}

export async function runNoMistakes(argv, io, options = {}) {
  const [subcommand = "status", ...rest] = argv;
  if (subcommand === "help" || subcommand === "--help" || subcommand === "-h") {
    if (rest.length) {
      renderUsageError(io, {
        code: rest.some((arg) => arg.startsWith("-")) ? "unknown-flag" : "unexpected-argument",
        command: "no-mistakes help",
        message: "Unexpected argument for no-mistakes help",
        details: rest,
        hints: [`Run ./${CONFIG.cliName} no-mistakes help`]
      });
      return 2;
    }
    help(io);
    return 0;
  }

  if (subcommand === "status" || subcommand.startsWith("-")) {
    const statusArgs = subcommand === "status" ? rest : argv;
    const unexpected = statusArgs.filter((arg) => !["--json", "--help", "-h"].includes(arg));
    if (unexpected.length) {
      renderUsageError(io, {
        code: unexpected.some((arg) => arg.startsWith("-")) ? "unknown-flag" : "unexpected-argument",
        command: "no-mistakes status",
        message: "Unexpected argument for no-mistakes status",
        details: unexpected,
        hints: [`Run ./${CONFIG.cliName} no-mistakes help`]
      });
      return 2;
    }
    if (hasFlag(statusArgs, "--help") || hasFlag(statusArgs, "-h")) {
      help(io);
      return 0;
    }
    renderStatus(collectNoMistakesStatus(options), io, { json: hasFlag(statusArgs, "--json") });
    return 0;
  }

  if (subcommand === "setup") {
    return runSetup(rest, io, options);
  }

  renderUsageError(io, {
    code: "unknown-no-mistakes-command",
    command: "no-mistakes",
    message: "Unknown no-mistakes command",
    details: [subcommand],
    hints: [`Run ./${CONFIG.cliName} no-mistakes help`]
  });
  return 2;
}
