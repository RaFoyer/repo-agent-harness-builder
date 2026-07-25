import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { CONFIG } from "../config.mjs";
import { validateCurrentOrchestrationRegistry } from "../orchestration/index.mjs";
import { readOption } from "../util/args.mjs";
import { redactSecrets } from "../util/secrets.mjs";
import { renderHelpBlock, renderUsageError, safeLine, toonString } from "../util/agent-output.mjs";

const PROFILE_TIERS = new Set(["observer", "worker", "manager", "integrator", "operator"]);
const AUTH_SOURCE_KINDS = new Set(["github-app-installation", "fine-grained-pat", "oauth-user", "classic-pat"]);
const GH_PROCESS_AUTH_ENV = ["GH", "TOKEN"].join("_");
const GITHUB_PROCESS_AUTH_ENV = ["GITHUB", "TOKEN"].join("_");
const GH_AMBIENT_CONTROL_ENV = new Set([
  GH_PROCESS_AUTH_ENV,
  GITHUB_PROCESS_AUTH_ENV,
  "GH_HOST",
  "GH_ENTERPRISE_TOKEN",
  "GITHUB_ENTERPRISE_TOKEN"
]);
const BROAD_AUTH_SOURCE_KINDS = new Set(["oauth-user", "classic-pat"]);
const SAFE_CAPABILITY_RE = /^github\.[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;
const SAFE_ENV_RE = /^[A-Z][A-Z0-9_]{0,63}$/;
const SAFE_PROFILE_RE = /^[a-z][a-z0-9-]{0,63}$/;
const SAFE_SUBDIR_RE = /^[a-z][a-z0-9._-]{0,63}$/;
const SAFE_APPROVAL_REF_RE = /^[A-Za-z0-9][A-Za-z0-9._:/#-]{0,127}$/;
const READ_CAPABILITIES = new Set([
  "github.repo.read",
  "github.issue.read",
  "github.pr.read",
  "github.workflow.read",
  "github.release.read",
  "github.label.read"
]);

const COMMAND_CAPABILITIES = new Map([
  ["issue:list", "github.issue.read"],
  ["issue:view", "github.issue.read"],
  ["issue:create", "github.issue.create"],
  ["issue:edit", "github.issue.update"],
  ["issue:close", "github.issue.close"],
  ["issue:reopen", "github.issue.update"],
  ["issue:comment", "github.issue.comment"],
  ["issue:delete", "github.issue.delete"],
  ["issue:lock", "github.issue.moderate"],
  ["issue:unlock", "github.issue.moderate"],
  ["issue:pin", "github.issue.moderate"],
  ["issue:unpin", "github.issue.moderate"],
  ["issue:transfer", "github.issue.transfer"],
  ["issue:subissue", "github.issue.update"],
  ["pr:list", "github.pr.read"],
  ["pr:view", "github.pr.read"],
  ["pr:checks", "github.pr.read"],
  ["pr:diff", "github.pr.read"],
  ["pr:create", "github.pr.create"],
  ["pr:edit", "github.pr.update"],
  ["pr:ready", "github.pr.update"],
  ["pr:update-branch", "github.pr.update"],
  ["pr:close", "github.pr.close"],
  ["pr:reopen", "github.pr.update"],
  ["pr:comment", "github.pr.comment"],
  ["pr:review", "github.pr.review"],
  ["pr:merge", "github.pr.merge"],
  ["pr:checkout", "github.pr.checkout"],
  ["pr:revert", "github.pr.revert"],
  ["run:list", "github.workflow.read"],
  ["run:view", "github.workflow.read"],
  ["run:watch", "github.workflow.read"],
  ["run:download", "github.workflow.read"],
  ["run:rerun", "github.workflow.dispatch"],
  ["run:cancel", "github.workflow.cancel"],
  ["run:delete", "github.workflow.delete"],
  ["repo:list", "github.repo.read"],
  ["repo:view", "github.repo.read"],
  ["repo:clone", "github.repo.clone"],
  ["repo:create", "github.repo.admin"],
  ["repo:edit", "github.repo.admin"],
  ["repo:fork", "github.repo.fork"],
  ["release:list", "github.release.read"],
  ["release:view", "github.release.read"],
  ["release:download", "github.release.read"],
  ["release:create", "github.release.write"],
  ["release:edit", "github.release.write"],
  ["release:upload", "github.release.write"],
  ["release:delete", "github.release.delete"],
  ["label:list", "github.label.read"],
  ["label:create", "github.label.write"],
  ["label:edit", "github.label.write"],
  ["label:delete", "github.label.delete"]
]);
const CAPABILITY_GATES = new Map([
  ["github.pr.merge", "merge"],
  ["github.pr.revert", "merge"],
  ["github.workflow.dispatch", "workflow"],
  ["github.workflow.cancel", "workflow"],
  ["github.workflow.delete", "destructive"],
  ["github.repo.admin", "repo-admin"],
  ["github.repo.fork", "cross-repository"],
  ["github.issue.delete", "destructive"],
  ["github.issue.transfer", "cross-repository"],
  ["github.release.delete", "destructive"],
  ["github.label.delete", "destructive"]
]);
const EXTERNALLY_SCOPED_COMMANDS = new Set(["repo:list", "repo:create", "repo:fork", "issue:transfer"]);
const SCOPE_CHANGING_OPTIONS = ["--org", "--owner", "--hostname", "--host"];
const REPOSITORY_REFERENCE_RE = /^(?:github\.com\/)?([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)$/i;
const REPOSITORY_POSITIONAL_COMMANDS = new Set(["repo:view", "repo:clone", "repo:edit"]);
const RESOURCE_POSITIONAL_COMMANDS = new Set([
  "issue:view", "issue:edit", "issue:close", "issue:reopen", "issue:comment", "issue:delete",
  "issue:lock", "issue:unlock", "issue:pin", "issue:unpin", "issue:subissue",
  "pr:view", "pr:checks", "pr:diff", "pr:edit", "pr:ready", "pr:update-branch", "pr:close",
  "pr:reopen", "pr:comment", "pr:review", "pr:merge", "pr:checkout", "pr:revert"
]);
const RESOURCE_CONTENT_OPTIONS = new Set(["--body", "-b", "--body-file", "--title", "-t"]);
const REPOSITORY_VALUE_OPTIONS = new Map([
  ["repo:view", new Set(["--branch", "-b", "--jq", "-q", "--json", "--template", "-t"])],
  ["repo:clone", new Set(["--upstream-remote-name"])],
  ["repo:edit", new Set(["--add-topic", "--default-branch", "--description", "--homepage", "--remove-topic", "--visibility"])]
]);

function loadJson(relativePath) {
  const target = path.join(CONFIG.repoRoot, relativePath);
  if (!fs.existsSync(target)) return { ok: false, error: `missing ${relativePath}` };
  try {
    return { ok: true, value: JSON.parse(fs.readFileSync(target, "utf-8")) };
  } catch (error) {
    return { ok: false, error: `invalid ${relativePath}: ${error.message}` };
  }
}

function githubProfiles(registry) {
  return (Array.isArray(registry.connectorProfiles) ? registry.connectorProfiles : [])
    .filter((profile) => profile.provider === "github");
}

function githubConfig(profile) {
  return profile.githubAuthority && typeof profile.githubAuthority === "object" ? profile.githubAuthority : null;
}

function profileRoot(profile) {
  const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  const subdir = profile.cliAuth?.configRoot?.providerSubdir || "github";
  const source = String(CONFIG.repoSlug || CONFIG.projectName || "repository");
  const slug = source.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "repository";
  const repoId = `${slug}--${createHash("sha256").update(source).digest("hex").slice(0, 12)}`;
  return path.join(base, "agent-connectors", repoId, subdir, profile.id);
}

export function runRepositoryGithubRead(args) {
  const loaded = loadJson("ops/connections.json");
  if (!loaded.ok) return { ok: false, status: 1, stdout: "", stderr: loaded.error };
  const profiles = githubProfiles(loaded.value).filter((profile) => {
    const config = githubConfig(profile);
    return profile.status === "configured"
      && validateProfile(profile).length === 0
      && config?.allowedCapabilities?.includes("github.pr.read");
  });
  if (profiles.length !== 1) {
    return {
      ok: false,
      status: 1,
      stdout: "",
      stderr: "exactly one configured repository-scoped GitHub read profile is required"
    };
  }
  const profile = profiles[0];
  const root = profileRoot(profile);
  const rootBlocker = validateProfileRoot(root);
  if (rootBlocker) return { ok: false, status: 1, stdout: "", stderr: rootBlocker };
  const child = createGithubChildEnvironment(profile, root);
  if (!child.ok) {
    return { ok: false, status: 1, stdout: "", stderr: "selected process-local GitHub credential is unavailable" };
  }
  const executable = githubConfig(profile).preferredCli === "gh" ? "gh" : "gh-axi";
  const result = spawnSync(executable, args, {
    cwd: CONFIG.repoRoot,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    env: child.env,
    timeout: 10_000,
    maxBuffer: 2 * 1024 * 1024
  });
  return {
    ok: result.status === 0,
    status: result.status ?? 1,
    stdout: redactSecrets(result.stdout || ""),
    stderr: redactSecrets(result.stderr || "")
  };
}

function pathInsideRepo(candidatePath) {
  const resolved = path.resolve(candidatePath);
  const repoRoot = path.resolve(CONFIG.repoRoot);
  return resolved === repoRoot || resolved.startsWith(`${repoRoot}${path.sep}`);
}

function validateProfile(profile) {
  const blockers = [];
  const config = githubConfig(profile);
  if (!config) return [`${profile.id || "(unknown)"} missing githubAuthority metadata`];
  if (!SAFE_PROFILE_RE.test(String(profile.id || ""))) blockers.push("GitHub profile id must be a safe lowercase slug");
  if (!SAFE_SUBDIR_RE.test(String(profile.cliAuth?.configRoot?.providerSubdir || ""))) blockers.push(`${profile.id} must use a safe GitHub config subdirectory`);
  if (!PROFILE_TIERS.has(config.tier)) blockers.push(`${profile.id} githubAuthority.tier is invalid`);
  if (!AUTH_SOURCE_KINDS.has(config.authSourceKind)) blockers.push(`${profile.id} githubAuthority.authSourceKind is invalid`);
  if (BROAD_AUTH_SOURCE_KINDS.has(config.authSourceKind) && config.tier !== "operator") {
    blockers.push(`${profile.id} broad GitHub credentials require an operator profile tier`);
  }
  if (!Array.isArray(config.allowedCapabilities) || !config.allowedCapabilities.length) {
    blockers.push(`${profile.id} githubAuthority.allowedCapabilities must be a non-empty array`);
  } else {
    for (const capability of config.allowedCapabilities) {
      if (typeof capability !== "string" || !SAFE_CAPABILITY_RE.test(capability)) blockers.push(`${profile.id} has invalid GitHub capability id`);
    }
  }
  if (profile.cliAuth?.configRoot?.strategy !== "env" || profile.cliAuth?.configRoot?.env !== "GH_CONFIG_DIR") {
    blockers.push(`${profile.id} must isolate upstream gh with GH_CONFIG_DIR`);
  }
  if (profile.cliAuth?.profileBoundary !== "repository") blockers.push(`${profile.id} must use a repository profile boundary`);
  if (profile.cliAuth?.globalStatePolicy !== "refuse-global-mutable-state") blockers.push(`${profile.id} must refuse global mutable auth state`);
  if (config.repositoryRef && config.repositoryRef !== CONFIG.repoSlug) blockers.push(`${profile.id} repositoryRef must match the configured repository`);
  if (!["gh-axi", "gh"].includes(config.preferredCli)) blockers.push(`${profile.id} preferredCli must be gh-axi or gh`);
  const runtimeAuth = config.runtimeAuth || {};
  if (!["stored-profile", "environment"].includes(runtimeAuth.strategy)) {
    blockers.push(`${profile.id} githubAuthority.runtimeAuth.strategy must be stored-profile or environment`);
  }
  if (runtimeAuth.strategy === "environment" && !SAFE_ENV_RE.test(String(runtimeAuth.env || ""))) {
    blockers.push(`${profile.id} environment runtime credential requires a safe env name`);
  }
  if (runtimeAuth.strategy === "environment" && GH_AMBIENT_CONTROL_ENV.has(runtimeAuth.env)) {
    blockers.push(`${profile.id} environment runtime credential may not reuse an ambient GitHub control variable`);
  }
  if (["worker", "manager", "integrator"].includes(config.tier) && runtimeAuth.strategy !== "environment") {
    blockers.push(`${profile.id} bounded agent tiers require a process-local environment authentication source`);
  }
  return blockers;
}

function findProfile(registry, id) {
  return githubProfiles(registry).find((profile) => profile.id === id);
}

function extractRunArgs(argv) {
  const separator = argv.indexOf("--");
  if (separator < 0) return [];
  return argv.slice(separator + 1);
}

function classifyCommand(args) {
  const command = args[0];
  const subcommand = args[1];
  if (!command || !subcommand || command.startsWith("-") || subcommand.startsWith("-")) return null;
  return COMMAND_CAPABILITIES.get(`${command}:${subcommand}`) || null;
}

function optionValues(args, flags) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    for (const flag of flags) {
      if (argument === flag) {
        values.push(args[index + 1]);
        index += 1;
        break;
      }
      if (argument.startsWith(`${flag}=`)) {
        values.push(argument.slice(flag.length + 1));
        break;
      }
      if (flag === "-R" && argument.startsWith("-R") && argument.length > 2) {
        values.push(argument.slice(2));
        break;
      }
    }
  }
  return values;
}

function repositoryFromReference(value) {
  if (typeof value !== "string") return null;
  const repositoryMatch = REPOSITORY_REFERENCE_RE.exec(value);
  if (repositoryMatch) return repositoryMatch[1];
  const urlMatch = /^https?:\/\/([^/]+)\/([^/]+)\/([^/#]+)(?:[\/#].*)?$/i.exec(value);
  if (!urlMatch) return null;
  if (urlMatch[1].toLowerCase() !== "github.com") return "__external_host__";
  return `${urlMatch[2]}/${urlMatch[3].replace(/\.git$/i, "")}`;
}

function isConfiguredRepository(value) {
  const repository = repositoryFromReference(value);
  return typeof repository === "string" && repository.toLowerCase() === String(CONFIG.repoSlug).toLowerCase();
}

function firstRepositoryPositional(args, commandKey) {
  const valueOptions = REPOSITORY_VALUE_OPTIONS.get(commandKey) || new Set();
  for (let index = 2; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--") return null;
    if (valueOptions.has(argument)) {
      index += 1;
      continue;
    }
    if (argument.startsWith("-")) continue;
    return argument;
  }
  return null;
}

function rejectWrapperArgs(argv, io, command, { run = false } = {}) {
  const boundary = run ? argv.indexOf("--") : argv.length;
  const wrapperArgs = boundary < 0 ? argv : argv.slice(0, boundary);
  const allowedValueOptions = new Set(run ? ["--profile", "--node", "--approval-ref"] : ["--profile"]);
  const allowedFlags = new Set(run ? ["--dry-run"] : []);
  const unexpected = [];
  for (let index = 0; index < wrapperArgs.length; index += 1) {
    const arg = wrapperArgs[index];
    const option = arg.includes("=") ? arg.slice(0, arg.indexOf("=")) : arg;
    if (allowedValueOptions.has(option)) {
      if (!arg.includes("=")) {
        const next = wrapperArgs[index + 1];
        if (!next || next.startsWith("--")) unexpected.push(`${arg} requires a value`);
        else index += 1;
      }
    } else if (!allowedFlags.has(arg)) unexpected.push(arg);
  }
  if (!unexpected.length) return false;
  renderUsageError(io, { code: "unexpected-argument", command, message: `Unexpected argument for ${command}`, details: unexpected, hints: [`Run ./${CONFIG.cliName} github help`] });
  return true;
}

export function validateRepositoryTarget(args) {
  const commandKey = `${args[0]}:${args[1]}`;
  if (EXTERNALLY_SCOPED_COMMANDS.has(commandKey)) {
    return "GitHub command cannot be constrained to this harness repository";
  }
  const requestedRepositories = optionValues(args, ["--repo", "-R"]);
  if (requestedRepositories.length > 1) return "GitHub command supplies duplicate repository selectors";
  if (requestedRepositories.some((requested) => !isConfiguredRepository(requested))) {
    return "GitHub command targets a repository outside this harness scope";
  }
  const transferTargets = optionValues(args, ["--to-repo"]);
  if (transferTargets.length > 1) return "GitHub command supplies duplicate transfer repository selectors";
  if (transferTargets.some((target) => target !== CONFIG.repoSlug)) {
    return "Cross-repository GitHub transfer requires separately registered authority";
  }
  for (const option of SCOPE_CHANGING_OPTIONS) {
    if (optionValues(args, [option]).length) return "GitHub command changes the configured repository or host scope";
  }
  const positional = firstRepositoryPositional(args, commandKey);
  if (REPOSITORY_POSITIONAL_COMMANDS.has(commandKey)) {
    if (positional && !isConfiguredRepository(positional)) return "GitHub command targets a repository outside this harness scope";
  }
  if (RESOURCE_POSITIONAL_COMMANDS.has(commandKey)) {
    for (let index = 2; index < args.length; index += 1) {
      const argument = args[index];
      if (RESOURCE_CONTENT_OPTIONS.has(argument)) {
        index += 1;
        continue;
      }
      if ([...RESOURCE_CONTENT_OPTIONS].some((option) => argument.startsWith(`${option}=`))) continue;
      if (/^(?:https?:\/\/|git@)/i.test(argument) && !isConfiguredRepository(argument)) {
        return "GitHub command targets a repository outside this harness scope";
      }
    }
  }
  return null;
}

export function validateProfileRoot(root) {
  if (pathInsideRepo(root)) return "isolated GitHub profile root must remain outside the repository";
  if (!fs.existsSync(root)) return "isolated GitHub profile root is not initialized; use the repository auth plan before login";
  const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  const relative = path.relative(path.resolve(base), path.resolve(root));
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    return "isolated GitHub profile root must remain inside the selected configuration home";
  }
  const components = [path.resolve(base)];
  for (const part of relative.split(path.sep)) components.push(path.join(components.at(-1), part));
  for (const component of components) {
    if (!fs.existsSync(component)) return "isolated GitHub profile root has an incomplete configuration path";
    if (fs.lstatSync(component).isSymbolicLink()) return "isolated GitHub profile path must not contain symlinks";
  }
  const realRoot = fs.realpathSync(root);
  if (pathInsideRepo(realRoot)) return "isolated GitHub profile real path must remain outside the repository";
  if (!fs.statSync(realRoot).isDirectory()) return "isolated GitHub profile root must be a directory";
  return null;
}

function validateNode(capability, nodeId, orchestration) {
  if (READ_CAPABILITIES.has(capability) && !nodeId) return [];
  if (!nodeId) return ["write-capable GitHub commands require --node <orchestration-node-id>"];
  if (!orchestration.registry) return orchestration.blockers;
  const registry = orchestration.registry;
  const blockers = orchestration.blockers.length
    ? ["GitHub execution requires a valid orchestration registry", ...orchestration.blockers]
    : [];
  if (registry.status !== "active") return [...blockers, "write-capable GitHub commands require active project orchestration"];
  const node = (registry.nodes || []).find((candidate) => candidate.id === nodeId);
  if (!node) return [...blockers, "unknown orchestration node"];
  if (!["working", "waiting", "blocked", "ready-for-parent"].includes(node.state)) return [...blockers, "orchestration node is not active"];
  if (!(node.authority?.allowedExternalActions || []).includes(capability)) {
    return [...blockers, `orchestration node does not allow ${capability}`];
  }
  const profileMarkers = (node.authority?.allowedExternalActions || []).filter((action) => action.startsWith("github.profile."));
  if (profileMarkers.length !== 1) return [...blockers, "orchestration node must bind exactly one github.profile.<profile-id> authority marker"];
  return blockers;
}

function validateApprovalRecord(approvalRef, { capability, gate, nodeId, orchestration }) {
  const loaded = loadJson("ops/github-approvals.json");
  if (!loaded.ok) return [`GitHub approval ledger is unavailable: ${loaded.error}`];
  if (loaded.value?.schemaVersion !== 1 || !Array.isArray(loaded.value.approvals)) {
    return ["GitHub approval ledger must use schemaVersion 1 with an approvals array"];
  }
  const matches = loaded.value.approvals.filter((approval) => approval?.id === approvalRef);
  if (matches.length !== 1) return ["GitHub approval reference must resolve to exactly one governed record"];
  const approval = matches[0];
  const blockers = [];
  if (approval.status !== "approved") blockers.push("GitHub approval record is not approved");
  if (approval.repositoryRef !== CONFIG.repoSlug) blockers.push("GitHub approval record does not match this repository");
  if (approval.nodeId !== nodeId) blockers.push("GitHub approval record does not match the orchestration node");
  if (approval.capability !== capability) blockers.push("GitHub approval record does not match the requested capability");
  if (approval.gate !== gate) blockers.push("GitHub approval record does not match the required gate");
  if (approval.orchestrationRevision !== orchestration?.registry?.revision) blockers.push("GitHub approval record is stale for the current orchestration revision");
  if (!SAFE_APPROVAL_REF_RE.test(String(approval.approvedByRef || ""))) blockers.push("GitHub approval record requires a value-safe approver reference");
  const approvedAt = Date.parse(approval.approvedAt);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(String(approval.approvedAt || ""))
    || !Number.isFinite(approvedAt) || approvedAt > Date.now()) {
    blockers.push("GitHub approval record requires a UTC approval timestamp");
  }
  if (approval.expiresAt !== null && approval.expiresAt !== undefined) {
    const expiresAt = Date.parse(approval.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) blockers.push("GitHub approval record is expired or has an invalid expiry");
  }
  return blockers;
}

export function createGithubChildEnvironment(profile, root, sourceEnv = process.env) {
  const childEnv = { ...sourceEnv };
  for (const name of GH_AMBIENT_CONTROL_ENV) delete childEnv[name];
  const runtimeAuth = githubConfig(profile)?.runtimeAuth || {};
  if (runtimeAuth.strategy === "environment") {
    const authValue = sourceEnv[runtimeAuth.env];
    if (!authValue) return { ok: false, env: childEnv };
    childEnv[GH_PROCESS_AUTH_ENV] = authValue;
  }
  Object.assign(childEnv, {
    GH_CONFIG_DIR: root,
    GH_REPO: CONFIG.repoSlug,
    GH_PROMPT_DISABLED: "1",
    GH_PAGER: "cat"
  });
  return { ok: true, env: childEnv };
}

function help(io) {
  io.stdout("GitHub commands use repository-scoped upstream gh authentication.");
  io.stdout("Available commands:");
  io.stdout("  github help                         Show this help");
  io.stdout("  github status                       Validate GitHub profile contracts without live auth");
  io.stdout("  github plan --profile <id>          Show a value-safe profile and authority plan");
  io.stdout("  github run --profile <id> [--node <id>] [--dry-run] -- <gh-axi args>");
  io.stdout("                                      Run a classified command through the isolated profile");
}

function status(io) {
  const loaded = loadJson("ops/connections.json");
  if (!loaded.ok) {
    io.stderr(`blocker: ${loaded.error}`);
    return 1;
  }
  const profiles = githubProfiles(loaded.value);
  const blockers = profiles.flatMap(validateProfile);
  io.stdout(`github_profiles: ${profiles.length}`);
  io.stdout(`profiles[${profiles.length}]{id,status,tier,auth_source_kind}:`);
  for (const profile of profiles) {
    const config = githubConfig(profile) || {};
    io.stdout(`  ${toonString(profile.id)},${toonString(profile.status || "unknown")},${toonString(config.tier || "unknown")},${toonString(config.authSourceKind || "unknown")}`);
  }
  if (!profiles.length) io.stdout("empty: no repository-scoped GitHub profiles configured");
  for (const blocker of blockers) io.stderr(`blocker: ${blocker}`);
  return blockers.length ? 1 : 0;
}

function plan(argv, io) {
  if (rejectWrapperArgs(argv, io, "github plan")) return 2;
  const profileId = readOption(argv, "--profile");
  if (!profileId) {
    renderUsageError(io, { code: "missing-profile", command: "github plan", message: "Missing GitHub profile id", hints: [`Run ./${CONFIG.cliName} github plan --profile <profile-id>`] });
    return 2;
  }
  const loaded = loadJson("ops/connections.json");
  if (!loaded.ok) {
    io.stderr(`blocker: ${loaded.error}`);
    return 1;
  }
  const profile = findProfile(loaded.value, profileId);
  if (!profile) {
    io.stderr("blocker: unknown GitHub profile supplied");
    return 1;
  }
  const blockers = validateProfile(profile);
  const config = githubConfig(profile) || {};
  io.stdout(`GitHub profile plan: ${safeLine(profile.id)}`);
  io.stdout(`repository: ${toonString(CONFIG.repoSlug)}`);
  io.stdout(`profile_boundary: ${safeLine(profile.cliAuth?.profileBoundary || "unknown")}`);
  io.stdout(`config_root_env: ${safeLine(profile.cliAuth?.configRoot?.env || "unknown")}`);
  io.stdout(`tier: ${safeLine(config.tier || "unknown")}`);
  io.stdout(`auth_source_kind: ${safeLine(config.authSourceKind || "unknown")}`);
  io.stdout(`preferred_cli: ${safeLine(config.preferredCli || "gh-axi")}`);
  io.stdout(`runtime_auth: ${safeLine(config.runtimeAuth?.strategy || "unknown")}`);
  io.stdout(`expected_account_label: ${profile.expectedAccountLabelRef ? "configured" : "not configured"}`);
  io.stdout(`capabilities[${(config.allowedCapabilities || []).length}]:`);
  for (const capability of config.allowedCapabilities || []) io.stdout(`  - ${safeLine(capability)}`);
  io.stdout("ambient_global_login_used: false");
  io.stdout("starts_auth: false");
  for (const blocker of blockers) io.stderr(`blocker: ${blocker}`);
  return blockers.length ? 1 : 0;
}

function run(argv, io) {
  if (rejectWrapperArgs(argv, io, "github run", { run: true })) return 2;
  const args = extractRunArgs(argv);
  const profileId = readOption(argv, "--profile");
  const nodeId = readOption(argv, "--node");
  const approvalRef = readOption(argv, "--approval-ref");
  const dryRun = argv.includes("--dry-run");
  if (!profileId || !args.length) {
    renderUsageError(io, {
      code: !profileId ? "missing-profile" : "missing-command",
      command: "github run",
      message: !profileId ? "Missing GitHub profile id" : "Missing gh-axi command after --",
      hints: [`Run ./${CONFIG.cliName} github run --profile <profile-id> --dry-run -- pr list`]
    });
    return 2;
  }
  const loaded = loadJson("ops/connections.json");
  if (!loaded.ok) {
    io.stderr(`blocker: ${loaded.error}`);
    return 1;
  }
  const profile = findProfile(loaded.value, profileId);
  if (!profile) {
    io.stderr("blocker: unknown GitHub profile supplied");
    return 1;
  }
  const config = githubConfig(profile) || {};
  const capability = classifyCommand(args);
  const blockers = validateProfile(profile);
  if (!capability) blockers.push("GitHub command is not in the fail-closed command capability map");
  if (capability && !(config.allowedCapabilities || []).includes(capability)) blockers.push(`GitHub profile does not allow ${capability}`);
  const targetBlocker = validateRepositoryTarget(args);
  if (targetBlocker) blockers.push(targetBlocker);
  const requiresOrchestration = Boolean(capability && (nodeId || !READ_CAPABILITIES.has(capability)));
  const orchestration = requiresOrchestration ? validateCurrentOrchestrationRegistry() : null;
  if (capability) blockers.push(...validateNode(capability, nodeId, orchestration || { registry: null, blockers: [] }));
  if (capability && nodeId) {
    const node = orchestration?.registry ? (orchestration.registry.nodes || []).find((candidate) => candidate.id === nodeId) : null;
    if (node && !(node.authority?.allowedExternalActions || []).includes(`github.profile.${profile.id}`)) {
      blockers.push("selected GitHub profile does not match the orchestration node profile binding");
    }
  }
  if (profile.status !== "configured" && !dryRun) blockers.push("GitHub profile must be configured before execution");
  const requiredGate = capability ? CAPABILITY_GATES.get(capability) : null;
  if (requiredGate) {
    const node = orchestration?.registry ? (orchestration.registry.nodes || []).find((candidate) => candidate.id === nodeId) : null;
    if (!(node?.authority?.approvalGates || []).includes(requiredGate)) blockers.push(`GitHub capability requires inherited ${requiredGate} approval gate`);
    if (!approvalRef || !SAFE_APPROVAL_REF_RE.test(approvalRef)) blockers.push(`GitHub capability requires a value-safe --approval-ref for ${requiredGate}`);
    else blockers.push(...validateApprovalRecord(approvalRef, { capability, gate: requiredGate, nodeId, orchestration }));
  }

  io.stdout(`github_profile: ${safeLine(profile.id)}`);
  io.stdout(`repository: ${toonString(CONFIG.repoSlug)}`);
  io.stdout(`capability: ${safeLine(capability || "unclassified")}`);
  io.stdout(`node: ${toonString(nodeId || "none")}`);
  io.stdout(`dry_run: ${dryRun}`);
  io.stdout("ambient_global_login_used: false");
  for (const blocker of blockers) io.stderr(`blocker: ${blocker}`);
  if (blockers.length) return 1;
  if (dryRun) {
    io.stdout("execution: skipped");
    return 0;
  }

  const root = profileRoot(profile);
  const rootBlocker = validateProfileRoot(root);
  if (rootBlocker) {
    io.stderr(`blocker: ${rootBlocker}`);
    return 1;
  }
  const executable = config.preferredCli === "gh" ? "gh" : "gh-axi";
  const child = createGithubChildEnvironment(profile, root);
  if (!child.ok) {
    io.stderr("blocker: selected process-local GitHub credential is unavailable");
    return 1;
  }
  const result = spawnSync(executable, args, {
    cwd: CONFIG.repoRoot,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    env: child.env
  });
  const stdout = redactSecrets(result.stdout || "").trimEnd();
  const stderr = redactSecrets(result.stderr || "").trimEnd();
  if (stdout) for (const line of stdout.split("\n")) io.stdout(line);
  if (stderr) for (const line of stderr.split("\n")) io.stderr(line);
  if (result.error) io.stderr(`blocker: ${safeLine(result.error.message)}`);
  return result.status ?? 1;
}

export async function runGithub(argv, io) {
  const [subcommand = "help", ...rest] = argv;
  if (subcommand === "help") {
    if (rest.length) {
      renderUsageError(io, { code: "unexpected-argument", command: "github help", message: "Unexpected argument for github help", details: rest, hints: [`Run ./${CONFIG.cliName} github help`] });
      return 2;
    }
    return help(io) || 0;
  }
  if (subcommand === "status") {
    if (rest.length) {
      renderUsageError(io, { code: "unexpected-argument", command: "github status", message: "Unexpected argument for github status", details: rest, hints: [`Run ./${CONFIG.cliName} github status`] });
      return 2;
    }
    return status(io);
  }
  if (subcommand === "plan") return plan(rest, io);
  if (subcommand === "run") return run(rest, io);
  renderUsageError(io, { code: "unknown-github-command", command: "github", message: `Unknown github command: ${subcommand}`, hints: [`Run ./${CONFIG.cliName} github help`] });
  return 2;
}

export { classifyCommand };
