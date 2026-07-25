import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, createPublicKey, verify as verifySignature } from "node:crypto";
import { spawnSync } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
import { CONFIG } from "../config.mjs";
import { rejectUnexpectedArgs, renderHelpBlock, renderUsageError, toonString } from "../util/agent-output.mjs";
import {
  codexMaterializationPinDecision,
  materializeCodexTaskWithBroker
} from "./codex-materialization-broker.mjs";
import {
  REPORT_STAGES,
  collectOrchestrationReport,
  reconcileOrchestrationReport,
  renderOrchestrationReconcile,
  renderOrchestrationReport
} from "./report.mjs";

const EXAMPLE_REGISTRY_REL_PATH = "ops/orchestration.example.json";
const LEGACY_REGISTRY_REL_PATH = "ops/orchestration.json";
const LOCAL_STORE_REL_PATH = path.join("repo-agent-harness", "orchestration");
const SAFE_LOCAL_NAME_RE = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;
const DEFAULT_LOCAL_NAME = "default";
const SUPPORTED_REGISTRY_SCHEMA_VERSIONS = new Set([2, 3, 4, 5]);
const COORDINATION_MODES = new Set(["managed", "hybrid"]);
const ROOT_MATERIALIZATION_MODES = new Set(["required", "optional"]);
const PARENT_BINDING_MODES = new Set(["task", "logical"]);
const TRACKED_EXAMPLE_COMMANDS = new Set([
  "status", "validate", "adapter-status", "taxonomy", "liveness", "report", "reconcile"
]);
const TRACKED_POLICY_EXTENSION_FIELDS = new Set(["kind", "schemaVersion", "policy"]);
const TRACKED_EXAMPLE_LOGICAL_NODE_FIELDS = new Set([
  "id", "role", "workRef", "workKind", "governingProtocols", "requiredSkills", "label", "title",
  "parentId", "dependencies", "state", "objective", "completionProfile", "trustLevel", "authority",
  "parentBindingMode"
]);
const TRACKED_EXAMPLE_NULLABLE_RUNTIME_NODE_FIELDS = [
  "taskId", "parentTaskId", "taskBinding", "launchReservation", "nextAction", "waitingOn",
  "blocker", "unblockAction", "blockedByDirectiveIds", "handoffEvidence", "terminalDisposition",
  "completionEvidence", "completedAt", "trustApproval", "stageTracking"
];
const TRACKED_EXAMPLE_AUTHORITY_FIELDS = new Set([
  "allowedReads", "allowedWrites", "allowedExternalActions", "approvalGates", "canDelegate",
  "maxActiveChildren", "stopConditions"
]);
const TRACKED_EXAMPLE_COMPLETION_PROFILE_FIELDS = new Set(["type", "requiredEvidence"]);
const TRACKED_EXAMPLE_ROOT_FIELDS = new Set([
  "schemaVersion", "revision", "status", "coordinationMode", "rootControl", "prefix", "scope",
  "bindingAttestation", "clientAdapter", "trustPolicy", "controlLoopPolicy", "reportingPolicy",
  "nodes", "ownerDirectives", "extensions"
]);
const TRACKED_EXAMPLE_SCOPE_FIELDS = new Set(["id", "kind", "rootRef", "ownerRef", "objective"]);
const TRACKED_EXAMPLE_TRUST_POLICY_FIELDS = new Set([
  "defaultLevel", "maxLevel", "promotionRequiresHumanApproval", "childMayExceedParent", "limits"
]);
const TRACKED_EXAMPLE_TRUST_LIMIT_FIELDS = new Set(["maxActiveNodes", "maxDelegationDepth"]);
const EXTENSION_NAMESPACE_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;
const RUNTIME_EXTENSION_FIELD_WORDS = new Set([
  "account", "acknowledged", "authority", "binding", "budget", "completed", "completion",
  "created", "delegation", "developer", "email", "evidence", "identity", "instance", "issued",
  "launch", "lifecycle", "maintainer", "node", "operator", "owner", "parent", "reservation",
  "resolved", "revision", "role", "root", "scope", "signature", "state", "status", "task", "thread",
  "trust", "updated", "user", "workcontract"
]);
const RUNTIME_EXTENSION_FIELDS = new Set([
  "accountid", "acknowledgedbyref", "allowedexternalactions", "allowedreads", "allowedwrites", "approvalgates",
  "authority", "bindingattestation", "boundat", "budgets", "candelegate", "clientadapter", "completedat",
  "completionevidence", "completionprofile", "coordinationmode", "createdat", "createdby", "dependencies",
  "developer", "developeridentity", "email", "evidence", "instance", "issuedbyref", "launchkey", "launchedat",
  "launchreservation", "lifecycle", "maintainer", "maxactivechildren", "nodes", "observedbyref", "operator",
  "ownerdirectives", "ownerref", "parentbindingmode", "parentid", "parenttaskid", "reservation", "resolvedbyref",
  "revision", "role", "rootcontrol", "rootref", "scope", "signature", "state", "status", "stopconditions",
  "taskbinding", "taskid", "taskids", "threadid", "threadids", "titleverification", "trustlevel", "trustpolicy",
  "updatedat", "updatedby", "userid", "username", "workcontracthash"
]);
const RUNTIME_EXTENSION_FIELD_SUFFIXES = ["taskid", "taskids", "taskref", "taskrefs", "taskidentifier", "taskidentifiers", "threadid", "threadids", "threadref", "threadrefs", "threadidentifier", "threadidentifiers"];
const RUNTIME_EXTENSION_VALUE_RE = /(?:codex:\/\/(?:tasks|threads)\/|(?:task|thread)(?:[-_ ]?(?:message|id|ref|identifier))?:)/i;
const GIT_TOPOLOGY_OVERRIDE_ENV = [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_COMMON_DIR",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_INDEX_FILE",
  "GIT_CEILING_DIRECTORIES",
  "GIT_DISCOVERY_ACROSS_FILESYSTEM"
];
const GIT_CONFIG_OVERRIDE_ENV = [
  "GIT_CONFIG",
  "GIT_CONFIG_GLOBAL",
  "GIT_CONFIG_SYSTEM",
  "GIT_CONFIG_NOSYSTEM",
  "GIT_CONFIG_PARAMETERS"
];
const DIRECTIVE_KINDS = new Set(["owner-directive", "owner-intervention"]);
const DIRECTIVE_IMPACTS = new Set(["within-contract", "replan-required"]);
const DIRECTIVE_STATES = new Set(["issued", "acknowledged", "reconciled", "superseded", "cancelled"]);
const DIRECTIVE_TERMINAL_STATES = new Set(["reconciled", "superseded", "cancelled"]);
const SAFE_DIRECTIVE_ID_RE = /^[a-z][a-z0-9-]{0,95}$/;
const SHA256_RE = /^[a-f0-9]{64}$/;
const DIRECTIVE_REFERENCE_RE = /^(?:task|task-message|tracker):[A-Za-z0-9][A-Za-z0-9._/-]*(?:#[A-Za-z0-9][A-Za-z0-9._/-]*)?$/;
const TRUST_LEVELS = [
  { id: "T0", name: "Observe", authority: "approved reads and reporting only" },
  { id: "T1", name: "Propose", authority: "plans, graphs, drafts, and prompts without project-state mutation" },
  { id: "T2", name: "Execute", authority: "bounded reversible local writes and approved verification" },
  { id: "T3", name: "Integrate", authority: "approved branches, PRs, tracker transitions, and child-task delegation" },
  { id: "T4", name: "Operate", authority: "allowlisted external writes, deployments, or schedules with rollback evidence" },
  { id: "T5", name: "Govern", authority: "bounded portfolio control loops and delegation within explicit budgets" }
];
const TRUST_RANK = new Map(TRUST_LEVELS.map((level, index) => [level.id, index]));
const ROLES = new Set(["boss", "manager", "worker"]);
const STATES = new Set(["queued", "eligible", "working", "waiting", "blocked", "ready-for-parent", "terminal"]);
const TASK_STATES = new Set(["working", "waiting", "blocked", "ready-for-parent", "terminal"]);
const ACTIVE_STATES = new Set(["working", "waiting", "blocked", "ready-for-parent"]);
const MANAGING_STATES = new Set(["working", "waiting", "blocked"]);
const TERMINAL_DISPOSITIONS = new Set(["completed", "cancelled", "superseded"]);
const COMPLETION_TYPES = new Set(["repository-merge", "artifact", "external-operation", "human-decision", "custom"]);
const SCOPE_KINDS = new Set(["repository", "project", "program", "personal-folder", "custom"]);
const CORE_GOVERNING_PROTOCOL = "AGENT-ORCHESTRATION";
const AUTHORITY_ARRAY_FIELDS = ["allowedReads", "allowedWrites", "allowedExternalActions", "approvalGates", "stopConditions"];
const BINDING_ATTESTATION_ALGORITHM = "ed25519";
const BINDING_PUBLIC_KEY_ENV = "ORCHESTRATION_BINDING_PUBLIC_KEY";
const BINDING_KEY_ID_ENV = "ORCHESTRATION_BINDING_KEY_ID";
const CODEX_FIRSTMATE_PROFILE = "codex-native-firstmate";
const PROJECT_ORCHESTRATION_SKILL = "project-orchestration";
const GOAL_GRAPH_SKILL = "goal-graph-loop";
const FLEET_MANAGED_SKILLS = new Set([
  "repo-agent-harness-builder", PROJECT_ORCHESTRATION_SKILL, GOAL_GRAPH_SKILL,
  "goal-chain-loop", CODEX_FIRSTMATE_PROFILE
]);
const DEPRECATED_SKILL_ALIASES = new Map([["goal-chain-loop", GOAL_GRAPH_SKILL]]);
const GOAL_GRAPH_PROTOCOLS = new Set(["GOAL-GRAPH", "GOAL-CHAIN"]);
const SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CONTROL_CHECK_MODES = new Set(["scheduled", "event"]);
const CONTROL_PROGRESS_SIGNAL = "evidence-fingerprint";
const SHARED_RUNTIME_ACTIVE_SET_CHANGE_ACTION = "abort-and-replan";
const SHARED_RUNTIME_UNKNOWN_PRESERVATION_BEHAVIOR = "treat-as-non-preserving";
const SHARED_RUNTIME_UNMANAGED_START_BEHAVIOR = "block-recovery";
const MAX_CONTROL_UNCHANGED_CHECKS = 100;
const MAX_CONTROL_SAME_FAILURE_RETRIES = 20;
const MAX_CONTROL_STAGNATION_SECONDS = 2592000;
const CONTROL_LOOP_POLICY_FIELDS = new Set([
  "progressSignal", "quietActivityCountsAsProgress", "maxUnchangedChecks",
  "maxSameFailureRetries", "maxControlIntervalSeconds", "maxClockSkewSeconds",
  "retryRequiresChangedPrecondition", "sharedRuntimeRecovery"
]);
const REPORTING_POLICY_FIELDS = new Set([
  "quietAfterSeconds", "postMergeStabilitySeconds", "terminalVisibilitySeconds",
  "stageBudgetsSeconds", "wipLimits", "agentAuthors"
]);
const REPORTING_WIP_LIMIT_FIELDS = new Set(["maxConcurrentLanes", "maxOpenPullRequests"]);
const REPORTING_AGENT_AUTHOR_FIELDS = new Set(["names", "emails"]);
const STAGE_TRACKING_FIELDS = new Set([
  "stage", "enteredAt", "gitBaseRef", "gitHeadRef", "pullRequestNumber", "validationRunId"
]);
const SHARED_RUNTIME_RECOVERY_FIELDS = new Set([
  "requireActiveSetSnapshot", "requirePreActionCompare", "activeSetChangeAction",
  "unknownPreservationBehavior", "maxReceiptAgeSeconds", "maxClaimLeaseSeconds",
  "requireRuntimeScopedClaim", "requireAdmissionClosure", "unmanagedStartBehavior"
]);
const NODE_CONTROL_LOOP_FIELDS = new Set([
  "progressFingerprint", "progressEvidenceRefs", "lastProgressAt", "unchangedChecks",
  "observationReceipts", "checkMode", "nextCheckAt", "wakeEvent", "watchdogAt",
  "lastFailureFingerprint", "lastFailureEvidenceRefs",
  "lastFailurePreconditionFingerprint", "lastFailurePreconditionRefs",
  "sameFailureRetries", "preconditionFingerprint", "preconditionRefs"
]);
const CONTROL_OBSERVATION_RECEIPT_FIELDS = new Set([
  "sequence", "observerRef", "observedAt", "previousReceiptHash", "receiptHash",
  "previousProgressFingerprint", "previousUnchangedChecks", "progressChanged",
  "progressFingerprint", "progressEvidenceRefs", "lastProgressAt",
  "unchangedChecks", "preconditionFingerprint", "preconditionRefs",
  "lastFailureFingerprint", "lastFailureEvidenceRefs",
  "lastFailurePreconditionFingerprint", "lastFailurePreconditionRefs",
  "sameFailureRetries"
]);
const SHARED_RUNTIME_RECEIPT_FIELDS = new Set([
  "id", "claimKey", "runtimeScopeRef", "runtimeClaimFingerprint",
  "runtimeClaimEvidenceRefs", "admissionClosureFingerprint",
  "admissionClosureEvidenceRefs", "admissionClosedAt", "admissionReopenedAt",
  "runtimeCoordinatorGeneration", "runtimeCoordinatorAttestationHash",
  "actionRef", "approvedBy", "preservedAt", "comparedAt", "beforeActiveSet",
  "beforeFingerprint", "preActionActiveSet", "preActionFingerprint", "decision",
  "recoveryPreconditionFingerprint", "recoveryPreconditionRefs", "status",
  "claimOwnerRef", "actionStartedAt", "claimExpiresAt", "completedAt",
  "failureEvidenceRefs", "transitionReceipts"
]);
const SHARED_RUNTIME_TRANSITION_FIELDS = new Set([
  "sequence", "claimKey", "status", "recordedAt", "previousTransitionHash", "transitionHash",
  "claimOwnerRef", "actionStartedAt", "claimExpiresAt", "completedAt",
  "failureEvidenceRefs", "admissionReopenedAt"
]);
const SHARED_RUNTIME_ACTIVE_ENTRY_FIELDS = new Set([
  "runRef", "headRef", "preservationEvidenceRefs"
]);
const EVIDENCE_REF_RE = /^(?:artifact|check|completion|external|git|pr|task|tracker):[!-~]+$/;
const PORTABLE_CONTROL_REF_RE = /^[!-~]+$/;
const RECOVERY_RECEIPT_STATUSES = new Set(["prepared", "started", "completed", "failed", "aborted"]);
const RECOVERY_RECEIPT_DECISIONS = new Set(["proceed", "abort-and-replan"]);
const PRESENTATION_PROFILES = new Set(["portable", "nautical", "executive"]);
const PRESENTATION_ROLE_LABELS = {
  portable: { boss: "Boss", manager: "Manager", worker: "Worker" },
  nautical: { boss: "Firstmate", manager: "Secondmate", worker: "Crewmate" }
};
const DEFAULT_EXECUTIVE_MANAGER_CATALOG = ["CTO", "COO", "CPO", "CFO", "CMO", "CRO"];
const DEFAULT_EXECUTIVE_WORKER_CATALOG = ["Director", "Lead", "Contributor"];
const CODEX_FIRSTMATE_ASSETS = [
  ".codex/config.firstmate.example.toml",
  ".codex/agents/firstmate-boss.toml",
  ".codex/agents/firstmate-manager.toml",
  ".codex/agents/firstmate-worker.toml",
  "apps/cli/src/orchestration/codex-materialization-broker.mjs",
  "docs/templates/orchestration/codex-native-firstmate-prompt.txt",
  "docs/templates/orchestration/codex-native-firstmate-adapter.example.json",
  "ops/protocols/CODEX-NATIVE-FIRSTMATE.md"
];

function environmentLocalSelection() {
  return {
    operator: process.env.REPO_ORCHESTRATION_OPERATOR || DEFAULT_LOCAL_NAME,
    instance: process.env.REPO_ORCHESTRATION_INSTANCE || DEFAULT_LOCAL_NAME
  };
}

let selectedLocalInstance = environmentLocalSelection();
let selectedTrackedExample = false;

function safeLocalName(value, label) {
  if (!SAFE_LOCAL_NAME_RE.test(value || "")) throw new Error(`${label} must be a safe 1-64 character local name`);
  return value;
}

function resolvedRepoRoot() {
  try {
    return fs.realpathSync(CONFIG.repoRoot);
  } catch (error) {
    throw new Error(`cannot resolve project root: ${error.message || "unknown error"}`);
  }
}

function sanitizedGitEnvironment() {
  const env = { ...process.env };
  for (const name of GIT_TOPOLOGY_OVERRIDE_ENV) delete env[name];
  for (const name of GIT_CONFIG_OVERRIDE_ENV) delete env[name];
  for (const name of Object.keys(env)) {
    if (/^GIT_CONFIG_(?:COUNT|KEY_\d+|VALUE_\d+)$/.test(name)) delete env[name];
  }
  return env;
}

function gitTopologyEnvironment() {
  const env = sanitizedGitEnvironment();
  env.GIT_CONFIG_NOSYSTEM = "1";
  env.GIT_CONFIG_GLOBAL = os.devNull;
  return env;
}

function hasConfiguredExactSafeDirectory(repoRoot) {
  const env = sanitizedGitEnvironment();
  for (const scope of ["--global", "--system"]) {
    const result = spawnSync("git", ["config", scope, "--path", "--null", "--get-all", "safe.directory"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
      env
    });
    if (result.status !== 0) continue;
    const entries = result.stdout.split("\0").filter(Boolean);
    if (entries.some((entry) => {
      if (entry === "*" || entry.endsWith("/*") || !path.isAbsolute(entry)) return false;
      try {
        return fs.realpathSync(entry) === repoRoot;
      } catch {
        return false;
      }
    })) return true;
  }
  return false;
}

function resolveGitTopology(repoRoot, { exactSafeDirectory = false } = {}) {
  const args = exactSafeDirectory ? ["-c", `safe.directory=${repoRoot}`] : [];
  return spawnSync("git", [...args, "-C", repoRoot, "rev-parse", "--show-toplevel", "--git-common-dir"], {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    env: gitTopologyEnvironment()
  });
}

function localStoreRoot() {
  const repoRoot = resolvedRepoRoot();
  const gitMarker = path.join(repoRoot, ".git");
  let gitMarkerStat = null;
  try {
    gitMarkerStat = fs.lstatSync(gitMarker);
  } catch (error) {
    if (error.code !== "ENOENT") throw new Error(`cannot inspect Git metadata: ${error.message}`);
  }
  if (gitMarkerStat?.isSymbolicLink()) {
    throw new Error("Git metadata must not be a symlink");
  }
  const gitMetadataPresent = gitMarkerStat !== null;
  let result = resolveGitTopology(repoRoot);
  if (result.status !== 0 && gitMetadataPresent && hasConfiguredExactSafeDirectory(repoRoot)) {
    result = resolveGitTopology(repoRoot, { exactSafeDirectory: true });
  }
  if (result.status === 0) {
    const [topLevel, commonDirValue] = result.stdout.trim().split(/\r?\n/);
    if (!topLevel || !commonDirValue) throw new Error("Git topology did not return a worktree root and common directory");
    const resolvedTopLevel = fs.realpathSync(topLevel);
    if (resolvedTopLevel !== repoRoot) throw new Error("configured project root does not match the Git worktree root");
    const commonDir = fs.realpathSync(path.resolve(repoRoot, commonDirValue));
    return { kind: "git-common-private", basePath: commonDir, path: path.join(commonDir, LOCAL_STORE_REL_PATH) };
  }

  if (gitMetadataPresent) {
    throw new Error("Git metadata is present but unreadable; refusing a fallback store that could split orchestration state");
  }

  const projectKey = createHash("sha256").update(repoRoot).digest("hex").slice(0, 24);
  const home = fs.realpathSync(os.homedir());
  return {
    kind: "user-state-private",
    basePath: home,
    path: path.join(home, ".local", "state", "repo-agent-harness", "projects", projectKey, "orchestration")
  };
}

function instanceLocation(selection = selectedLocalInstance) {
  const operator = safeLocalName(selection.operator, "operator");
  const instance = safeLocalName(selection.instance, "instance");
  const store = localStoreRoot();
  return {
    ...store,
    storePath: store.path,
    operator,
    instance,
    path: path.join(store.path, "operators", operator, "instances", `${instance}.json`),
    label: `local:${operator}/${instance}`
  };
}

function loadJsonFile(fullPath, metadata) {
  if (!fs.existsSync(fullPath)) return { ...metadata, exists: false, registry: null, error: "" };
  try {
    return { ...metadata, exists: true, registry: JSON.parse(fs.readFileSync(fullPath, "utf-8")), error: "" };
  } catch (error) {
    return { ...metadata, exists: true, registry: null, error: error.message || "invalid JSON" };
  }
}

function loadPrivateRegistry(location) {
  try {
    assertPrivateDirectory(location, path.dirname(location.path));
  } catch (error) {
    return { source: "local-instance", live: true, label: location.label, location, exists: false, registry: null, error: error.message };
  }
  let stat;
  try {
    stat = fs.lstatSync(location.path);
  } catch (error) {
    if (error.code !== "ENOENT") {
      return { source: "local-instance", live: true, label: location.label, location, exists: false, registry: null, error: error.message };
    }
    return { source: "local-instance", live: true, label: location.label, location, exists: false, registry: null, error: "" };
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    return { source: "local-instance", live: true, label: location.label, location, exists: true, registry: null, error: "private orchestration instance must be a regular file" };
  }
  if ((stat.mode & 0o777) !== 0o600) {
    return { source: "local-instance", live: true, label: location.label, location, exists: true, registry: null, error: "private orchestration instance permissions must be 0600" };
  }
  return loadJsonFile(location.path, { source: "local-instance", live: true, label: location.label, location });
}

function loadRegistry({ liveRequired = false, selection = selectedLocalInstance, trackedExampleOnly = selectedTrackedExample } = {}) {
  if (trackedExampleOnly) {
    if (liveRequired) {
      return { exists: false, registry: null, error: "tracked example cannot be used as live orchestration authority", source: "tracked-example", live: false, label: EXAMPLE_REGISTRY_REL_PATH, location: null };
    }
    return {
      ...loadTrackedRegistry(EXAMPLE_REGISTRY_REL_PATH),
      source: "tracked-example",
      live: false,
      label: EXAMPLE_REGISTRY_REL_PATH,
      location: null
    };
  }
  let location;
  try {
    location = instanceLocation(selection);
  } catch (error) {
    return { exists: false, registry: null, error: error.message, source: "local-instance", live: true, label: "local:unresolved" };
  }
  const local = loadPrivateRegistry(location);
  if (local.exists || local.error || liveRequired) return local;
  return {
    ...loadTrackedRegistry(EXAMPLE_REGISTRY_REL_PATH),
    source: "tracked-example",
    live: false,
    label: EXAMPLE_REGISTRY_REL_PATH,
    location
  };
}

function registryLabel(loaded) {
  return loaded?.label || EXAMPLE_REGISTRY_REL_PATH;
}

function parseLocalSelection(argv, io) {
  const remaining = [];
  let { operator, instance } = environmentLocalSelection();
  let trackedExampleOnly = false;
  let explicitLocalSelector = false;
  try {
    for (let index = 0; index < argv.length; index += 1) {
      const argument = argv[index];
      if (argument === "--example") {
        trackedExampleOnly = true;
        continue;
      }
      if (argument !== "--operator" && argument !== "--instance") {
        remaining.push(argument);
        continue;
      }
      const value = argv[index + 1];
      if (!value || value.startsWith("-")) throw new Error(`${argument} requires a value`);
      explicitLocalSelector = true;
      if (argument === "--operator") operator = value;
      else instance = value;
      index += 1;
    }
    if (trackedExampleOnly && explicitLocalSelector) throw new Error("--example cannot be combined with --operator or --instance");
    selectedLocalInstance = trackedExampleOnly
      ? { operator: DEFAULT_LOCAL_NAME, instance: DEFAULT_LOCAL_NAME }
      : {
          operator: safeLocalName(operator, "operator"),
          instance: safeLocalName(instance, "instance")
        };
    selectedTrackedExample = trackedExampleOnly;
    return { ok: true, argv: remaining, trackedExampleOnly };
  } catch (error) {
    renderUsageError(io, {
      code: "invalid-orchestration-local-selection",
      command: "orchestration",
      message: error.message,
      hints: [`Use lowercase letters, digits, dot, underscore, or dash`, `Run ./${CONFIG.cliName} orchestration help`]
    });
    return { ok: false, argv: [] };
  }
}

function assertPrivateDirectory(location, directory) {
  const relativeDirectory = path.relative(location.basePath, directory);
  if (!relativeDirectory || relativeDirectory.startsWith("..") || path.isAbsolute(relativeDirectory)) {
    throw new Error("private orchestration directory escapes its local state boundary");
  }
  let current = location.basePath;
  for (const component of relativeDirectory.split(path.sep)) {
    current = path.join(current, component);
    let stat;
    try {
      stat = fs.lstatSync(current);
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
    if (stat.isSymbolicLink()) throw new Error("private orchestration directory may not traverse symlinks");
    if (!stat.isDirectory()) throw new Error("private orchestration path component must be a directory");
  }
  const resolvedStore = fs.realpathSync(location.storePath);
  const resolvedDirectory = fs.realpathSync(directory);
  if (resolvedDirectory !== resolvedStore && !resolvedDirectory.startsWith(`${resolvedStore}${path.sep}`)) {
    throw new Error("local instance directory escapes the private orchestration store");
  }
}

function privateInstanceDirectory(location) {
  const directory = path.dirname(location.path);
  const relativeDirectory = path.relative(location.basePath, directory);
  if (!relativeDirectory || relativeDirectory.startsWith("..") || path.isAbsolute(relativeDirectory)) {
    throw new Error("private orchestration directory escapes its local state boundary");
  }
  let current = location.basePath;
  for (const component of relativeDirectory.split(path.sep)) {
    current = path.join(current, component);
    try {
      const stat = fs.lstatSync(current);
      if (stat.isSymbolicLink()) throw new Error("private orchestration directory may not traverse symlinks");
      if (!stat.isDirectory()) throw new Error("private orchestration path component must be a directory");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      fs.mkdirSync(current, { mode: 0o700 });
    }
    fs.chmodSync(current, 0o700);
  }
  assertPrivateDirectory(location, directory);
  return directory;
}

function writePrivateInstance(registry, location) {
  privateInstanceDirectory(location);
  if (fs.existsSync(location.path)) throw new Error(`local instance already exists: ${location.label}`);
  const content = `${JSON.stringify(registry, null, 2)}\n`;
  fs.writeFileSync(location.path, content, { encoding: "utf-8", flag: "wx", mode: 0o600 });
  fs.chmodSync(location.path, 0o600);
}

function loadTrackedRegistry(relPath) {
  let repoRoot;
  try {
    repoRoot = resolvedRepoRoot();
  } catch (error) {
    return { exists: false, registry: null, error: error.message || "cannot resolve project root", fullPath: null };
  }
  const fullPath = path.resolve(repoRoot, relPath);
  const relativePath = path.relative(repoRoot, fullPath);
  if (!relativePath || relativePath === ".." || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
    return { exists: false, registry: null, error: `${relPath} escapes the project root`, fullPath };
  }
  const components = relativePath.split(path.sep);
  let current = repoRoot;
  let fileStat;
  for (let index = 0; index < components.length; index += 1) {
    current = path.join(current, components[index]);
    try {
      fileStat = fs.lstatSync(current);
    } catch (error) {
      if (error.code === "ENOENT") return { exists: false, registry: null, error: "", fullPath };
      return { exists: false, registry: null, error: error.message, fullPath };
    }
    if (fileStat.isSymbolicLink()) {
      return { exists: true, registry: null, error: `${relPath} must not traverse symlinks`, fullPath };
    }
    if (index < components.length - 1 && !fileStat.isDirectory()) {
      return { exists: true, registry: null, error: `${relPath} path components must be directories`, fullPath };
    }
  }
  if (!fileStat?.isFile()) return { exists: true, registry: null, error: `${relPath} must be a regular tracked file`, fullPath };
  try {
    const resolvedPath = fs.realpathSync(fullPath);
    const resolvedRelativePath = path.relative(repoRoot, resolvedPath);
    if (resolvedRelativePath === ".." || resolvedRelativePath.startsWith(`..${path.sep}`) || path.isAbsolute(resolvedRelativePath)) {
      return { exists: true, registry: null, error: `${relPath} escapes the project root`, fullPath };
    }
  } catch (error) {
    return { exists: true, registry: null, error: error.message, fullPath };
  }
  return loadJsonFile(fullPath, { fullPath });
}

function runInstances(io) {
  let location;
  try {
    location = instanceLocation();
  } catch (error) {
    io.stdout('valid: false');
    io.stdout(`error: ${toonString(error.message)}`);
    return 1;
  }
  const directory = path.dirname(location.path);
  try {
    assertPrivateDirectory(location, directory);
  } catch (error) {
    io.stdout('valid: false');
    io.stdout(`error: ${toonString(error.message)}`);
    return 1;
  }
  let entries = [];
  if (fs.existsSync(directory)) {
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      io.stdout('valid: false');
      io.stdout('error: "private orchestration instance directory cannot be listed"');
      return 1;
    }
  }
  const records = entries
      .filter((entry) => entry.name.endsWith(".json") && SAFE_LOCAL_NAME_RE.test(entry.name.slice(0, -5)))
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((entry) => {
        const name = entry.name.slice(0, -5);
        const recordLocation = { ...location, instance: name, label: `local:${location.operator}/${name}`, path: path.join(directory, entry.name) };
        const loaded = loadPrivateRegistry(recordLocation);
        return { name, status: loaded.error ? "invalid" : loaded.registry?.status || "invalid", revision: loaded.registry?.revision ?? "" };
      });
  io.stdout(`store_kind: ${toonString(location.kind)}`);
  io.stdout(`operator: ${toonString(location.operator)}`);
  io.stdout(`selected_instance: ${toonString(location.instance)}`);
  io.stdout(`instances[${records.length}]{name,status,revision,selected}:`);
  for (const record of records) {
    io.stdout(`  ${toonString(record.name)},${toonString(record.status)},${toonString(record.revision)},${record.name === location.instance}`);
  }
  if (!records.length) io.stdout('message: "No private orchestration instances initialized"');
  return 0;
}

function runInit(instanceName, io) {
  if (instanceName) {
    try {
      selectedLocalInstance = { ...selectedLocalInstance, instance: safeLocalName(instanceName, "instance") };
    } catch (error) {
      io.stderr(error.message);
      return 2;
    }
  }
  const source = loadTrackedRegistry(EXAMPLE_REGISTRY_REL_PATH);
  if (!source.exists || source.error) {
    io.stderr(source.error || `Missing ${EXAMPLE_REGISTRY_REL_PATH}`);
    return 1;
  }
  const findings = validateRegistry(source.registry);
  findings.blockers.push(...validateTrackedExampleRegistry(source.registry));
  if (findings.blockers.length) {
    io.stderr(`Tracked example is invalid; run orchestration validate before initializing (${findings.blockers[0]}).`);
    return 1;
  }
  try {
    const location = instanceLocation();
    writePrivateInstance(source.registry, location);
    io.stdout('created: true');
    io.stdout(`registry: ${toonString(location.label)}`);
    io.stdout(`store_kind: ${toonString(location.kind)}`);
    io.stdout('permissions: "0600"');
    io.stdout(renderHelpBlock([`Configure the private instance before activation`, `Run ./${CONFIG.cliName} orchestration validate --instance ${location.instance}`]));
    return 0;
  } catch (error) {
    io.stderr(error.message);
    return 1;
  }
}

function runMigrate(instanceName, io) {
  if (instanceName) {
    try {
      selectedLocalInstance = { ...selectedLocalInstance, instance: safeLocalName(instanceName, "instance") };
    } catch (error) {
      io.stderr(error.message);
      return 2;
    }
  }
  const source = loadTrackedRegistry(LEGACY_REGISTRY_REL_PATH);
  if (!source.exists || source.error) {
    io.stderr(source.error || `Missing legacy ${LEGACY_REGISTRY_REL_PATH}`);
    return 1;
  }
  try {
    const location = instanceLocation();
    writePrivateInstance(source.registry, location);
    const findings = validateRegistry(source.registry);
    io.stdout('migrated: true');
    io.stdout(`source: ${toonString(LEGACY_REGISTRY_REL_PATH)}`);
    io.stdout(`registry: ${toonString(location.label)}`);
    io.stdout(`store_kind: ${toonString(location.kind)}`);
    io.stdout('permissions: "0600"');
    io.stdout(`valid: ${findings.blockers.length === 0}`);
    printFindings(io, findings);
    io.stdout(renderHelpBlock(findings.blockers.length
      ? [`Keep the legacy registry until the private copy is repaired and validates`, `Run ./${CONFIG.cliName} orchestration validate --instance ${location.instance}`]
      : [`Remove the legacy tracked live registry through a reviewed Git change`, `Keep ${EXAMPLE_REGISTRY_REL_PATH} inactive and identity-free`]));
    return findings.blockers.length ? 1 : 0;
  } catch (error) {
    io.stderr(error.message);
    return 1;
  }
}

function loadGithubProfiles() {
  const fullPath = path.join(CONFIG.repoRoot, "ops", "connections.json");
  if (!fs.existsSync(fullPath)) return new Map();
  try {
    const registry = JSON.parse(fs.readFileSync(fullPath, "utf-8"));
    return new Map(arrayOrEmpty(registry.connectorProfiles)
      .filter((profile) => profile?.provider === "github" && isNonEmptyString(profile.id))
      .map((profile) => [profile.id, profile]));
  } catch {
    return new Map();
  }
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizedExtensionField(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function extensionFieldWords(value) {
  return String(value)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]/g, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function runtimeExtensionFields(value) {
  if (isObject(value)) {
    return Object.entries(value).flatMap(([key, item]) => {
      const normalized = normalizedExtensionField(key);
      const isRuntimeField = RUNTIME_EXTENSION_FIELDS.has(normalized)
        || RUNTIME_EXTENSION_FIELD_SUFFIXES.some((suffix) => normalized.endsWith(suffix))
        || extensionFieldWords(key).some((word) => RUNTIME_EXTENSION_FIELD_WORDS.has(word));
      return [...(isRuntimeField ? [key] : []), ...runtimeExtensionFields(item)];
    });
  }
  if (Array.isArray(value)) return value.flatMap(runtimeExtensionFields);
  return typeof value === "string" && RUNTIME_EXTENSION_VALUE_RE.test(value.trim()) ? ["<runtime-reference-value>"] : [];
}

function validateTrackedExampleRegistry(registry) {
  const blockers = [];
  if (!isObject(registry)) return ["tracked example root must be a JSON object"];
  const unexpectedRootFields = Object.keys(registry).filter((field) => !TRACKED_EXAMPLE_ROOT_FIELDS.has(field));
  if (unexpectedRootFields.length) blockers.push(`tracked example contains unsupported or runtime fields: ${unexpectedRootFields.sort().join(", ")}`);
  const schemaVersion = registry.schemaVersion;
  if (!SUPPORTED_REGISTRY_SCHEMA_VERSIONS.has(schemaVersion)) blockers.push("tracked example has unsupported schema version");
  if (registry.revision !== 0) blockers.push("tracked example must start at revision 0");
  if (registry.status !== "inactive") blockers.push("tracked example must be inactive");
  if (!Array.isArray(registry.nodes)) blockers.push("tracked example nodes must be an array");
  else if (schemaVersion !== 5 && registry.nodes.length) blockers.push("only schema-v5 tracked examples may contain logical nodes");
  else {
    const allowedNodeFields = new Set([
      ...TRACKED_EXAMPLE_LOGICAL_NODE_FIELDS,
      ...TRACKED_EXAMPLE_NULLABLE_RUNTIME_NODE_FIELDS
    ]);
    for (const node of registry.nodes) {
      if (!isObject(node)) {
        blockers.push("tracked example nodes must be objects");
        continue;
      }
      const label = `tracked example node ${node.id || "<missing-id>"}`;
      const unexpectedNodeFields = Object.keys(node).filter((field) => !allowedNodeFields.has(field));
      if (unexpectedNodeFields.length) {
        blockers.push(`${label} contains unsupported or runtime fields: ${unexpectedNodeFields.sort().join(", ")}`);
      }
      if (node.state !== "queued") blockers.push(`${label} must remain queued`);
      for (const field of TRACKED_EXAMPLE_NULLABLE_RUNTIME_NODE_FIELDS) {
        if (node[field] !== undefined && node[field] !== null) blockers.push(`${label} must not contain live ${field}`);
      }
      for (const field of ["governingProtocols", "requiredSkills", "dependencies"]) {
        if (field in node && !isStringArray(node[field])) blockers.push(`${label} ${field} must be an array of strings`);
      }
      for (const field of ["id", "role", "workRef", "workKind", "label", "title", "state", "objective", "trustLevel", "parentBindingMode"]) {
        if (field in node && !isNonEmptyString(node[field])) blockers.push(`${label} ${field} must be a single-line string`);
      }
      if ("parentId" in node && node.parentId !== null && !isNonEmptyString(node.parentId)) {
        blockers.push(`${label} parentId must be a single-line string or null`);
      }
      if (node.completionProfile !== undefined && node.completionProfile !== null) {
        if (!isObject(node.completionProfile)) blockers.push(`${label} completionProfile must be an object`);
        else {
          const unexpectedCompletionFields = Object.keys(node.completionProfile)
            .filter((field) => !TRACKED_EXAMPLE_COMPLETION_PROFILE_FIELDS.has(field));
          if (unexpectedCompletionFields.length) blockers.push(`${label} completionProfile contains unsupported or runtime fields: ${unexpectedCompletionFields.sort().join(", ")}`);
          if ("type" in node.completionProfile && !isNonEmptyString(node.completionProfile.type)) {
            blockers.push(`${label} completionProfile.type must be a single-line string`);
          }
          if ("requiredEvidence" in node.completionProfile && !isStringArray(node.completionProfile.requiredEvidence)) {
            blockers.push(`${label} completionProfile.requiredEvidence must be an array of strings`);
          }
        }
      }
      if (node.authority !== undefined && node.authority !== null) {
        if (!isObject(node.authority)) blockers.push(`${label} authority must be an object`);
        else {
          const unexpectedAuthorityFields = Object.keys(node.authority)
            .filter((field) => !TRACKED_EXAMPLE_AUTHORITY_FIELDS.has(field));
          if (unexpectedAuthorityFields.length) blockers.push(`${label} authority contains unsupported or runtime fields: ${unexpectedAuthorityFields.sort().join(", ")}`);
          for (const field of AUTHORITY_ARRAY_FIELDS) {
            if (field in node.authority && !isStringArray(node.authority[field])) blockers.push(`${label} authority.${field} must be an array of strings`);
          }
          if ("canDelegate" in node.authority && typeof node.authority.canDelegate !== "boolean") {
            blockers.push(`${label} authority.canDelegate must be boolean`);
          }
          if ("maxActiveChildren" in node.authority && (!Number.isInteger(node.authority.maxActiveChildren) || node.authority.maxActiveChildren < 0)) {
            blockers.push(`${label} authority.maxActiveChildren must be a non-negative integer`);
          }
        }
      }
    }
  }
  if (registry.ownerDirectives !== undefined && (!Array.isArray(registry.ownerDirectives) || registry.ownerDirectives.length)) {
    blockers.push("tracked example must not contain owner directives");
  }
  if ((registry.clientAdapter !== undefined && registry.clientAdapter !== null) || (schemaVersion >= 4 && !("clientAdapter" in registry))) {
    blockers.push("tracked example must not select a client adapter");
  }
  if ((registry.bindingAttestation !== undefined && registry.bindingAttestation !== null) || (schemaVersion >= 4 && !("bindingAttestation" in registry))) {
    blockers.push("tracked example must not contain binding attestation data");
  }
  const extensions = registry.extensions;
  if (extensions !== undefined) {
    if (!isObject(extensions)) blockers.push("tracked example extensions must be an object");
    else {
      for (const [namespace, extension] of Object.entries(extensions)) {
        if (!EXTENSION_NAMESPACE_RE.test(namespace)) {
          blockers.push("tracked example extension keys must be lowercase dotted namespaces");
          continue;
        }
        if (!isObject(extension)) {
          blockers.push(`tracked example extension ${namespace} must be an object`);
          continue;
        }
        const unexpectedExtensionFields = Object.keys(extension).filter((field) => !TRACKED_POLICY_EXTENSION_FIELDS.has(field));
        if (unexpectedExtensionFields.length) blockers.push(`tracked example extension ${namespace} contains unsupported envelope fields: ${unexpectedExtensionFields.sort().join(", ")}`);
        if (extension.kind !== "tracked-policy") blockers.push(`tracked example extension ${namespace} kind must be tracked-policy`);
        if (!Number.isInteger(extension.schemaVersion) || extension.schemaVersion < 1) {
          blockers.push(`tracked example extension ${namespace} schemaVersion must be a positive integer`);
        }
        if (!isObject(extension.policy)) {
          blockers.push(`tracked example extension ${namespace} policy must be an object`);
          continue;
        }
        const runtimeFields = [...new Set(runtimeExtensionFields(extension.policy))].sort();
        if (runtimeFields.length) {
          blockers.push(`tracked example extension ${namespace} contains runtime, identity, or core-authority fields: ${runtimeFields.join(", ")}`);
        }
      }
    }
  }
  const scope = registry.scope;
  if (!isObject(scope)) blockers.push("tracked example scope must be an object");
  else {
    const unexpectedScopeFields = Object.keys(scope).filter((field) => !TRACKED_EXAMPLE_SCOPE_FIELDS.has(field));
    if (unexpectedScopeFields.length) blockers.push(`tracked example scope contains unsupported or identity fields: ${unexpectedScopeFields.sort().join(", ")}`);
    if (scope.rootRef !== "repository-root") blockers.push("tracked example rootRef must remain the identity-free repository-root placeholder");
    if (("ownerRef" in scope && scope.ownerRef !== "project-owner") || (schemaVersion >= 4 && !("ownerRef" in scope))) {
      blockers.push("tracked example ownerRef must remain the identity-free project-owner placeholder");
    }
  }
  if (registry.rootControl !== undefined && (!isObject(registry.rootControl) || Object.keys(registry.rootControl).length !== 1 || !("materialization" in registry.rootControl))) {
    blockers.push("tracked example rootControl contains unsupported fields");
  }
  const trustPolicy = registry.trustPolicy;
  if (!isObject(trustPolicy)) blockers.push("tracked example trustPolicy must be an object");
  else {
    const unexpectedTrustFields = Object.keys(trustPolicy).filter((field) => !TRACKED_EXAMPLE_TRUST_POLICY_FIELDS.has(field));
    if (unexpectedTrustFields.length) blockers.push(`tracked example trustPolicy contains unsupported or runtime fields: ${unexpectedTrustFields.sort().join(", ")}`);
    if (!isObject(trustPolicy.limits) || Object.keys(trustPolicy.limits).some((field) => !TRACKED_EXAMPLE_TRUST_LIMIT_FIELDS.has(field))) {
      blockers.push("tracked example trustPolicy.limits contains unsupported fields");
    }
  }
  validateReportingPolicy(registry.reportingPolicy, blockers);
  return blockers;
}

function isCodexNativeFirstmateAdapter(adapter) {
  return isObject(adapter) && adapter.profile === CODEX_FIRSTMATE_PROFILE;
}

function isNonEmptyString(value) {
  return typeof value === "string" && Boolean(value.trim()) && !/[\r\n]/.test(value);
}

function isStringArray(value, { nonEmpty = false } = {}) {
  return Array.isArray(value) && (!nonEmpty || value.length > 0) && value.every(isNonEmptyString);
}

function arrayOrEmpty(value) {
  return Array.isArray(value) ? value : [];
}

function rootMaterializationFor(registry) {
  return registry?.schemaVersion >= 5 ? registry.rootControl?.materialization : "required";
}

function logicalParentBinding(registry, node, parent) {
  return registry?.schemaVersion >= 5
    && rootMaterializationFor(registry) === "optional"
    && node?.role === "manager"
    && parent?.role === "boss"
    && node?.parentBindingMode === "logical";
}

function activatesRegistryOnLaunch(registry, node, parent) {
  return registry.status === "inactive" && (node.role === "boss" || logicalParentBinding(registry, node, parent));
}

function requiredSkillsFor(registry, node) {
  const ordered = [PROJECT_ORCHESTRATION_SKILL];
  if (registry.clientAdapter?.status === "active" && isNonEmptyString(registry.clientAdapter.requiredSkill)) {
    ordered.push(registry.clientAdapter.requiredSkill);
  } else if (isCodexNativeFirstmateAdapter(registry.clientAdapter)) {
    ordered.push(CODEX_FIRSTMATE_PROFILE);
  }
  if (arrayOrEmpty(node.governingProtocols).some((protocol) => GOAL_GRAPH_PROTOCOLS.has(protocol))) {
    ordered.push(GOAL_GRAPH_SKILL);
  }
  ordered.push(...arrayOrEmpty(node.requiredSkills));
  return [...new Set(ordered)];
}

function missingProjectLocalSkills(registry, node) {
  return requiredSkillsFor(registry, node).filter((skillName) => !FLEET_MANAGED_SKILLS.has(skillName) && !fs.existsSync(
    path.join(CONFIG.repoRoot, ".agents", "skills", skillName, "SKILL.md")
  ));
}

function trustRank(level) {
  return TRUST_RANK.has(level) ? TRUST_RANK.get(level) : -1;
}

function isCalendarDate(year, month, day) {
  if (month < 1 || month > 12 || day < 1) return false;
  const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1];
}

function isApprovalTimestamp(value) {
  if (!isNonEmptyString(value)) return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?Z)?$/.exec(value);
  if (!match) return false;
  const [, year, month, day, hour, minute, second] = match.map((part) => (part === undefined ? part : Number(part)));
  if (!isCalendarDate(year, month, day)) return false;
  return hour === undefined || (hour <= 23 && minute <= 59 && second <= 59);
}

function isUtcRfc3339Timestamp(value) {
  return isNonEmptyString(value)
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)
    && isApprovalTimestamp(value);
}

function presentationTaxonomy(adapter) {
  const taxonomy = adapter?.presentationTaxonomy;
  if (!isObject(taxonomy) || !PRESENTATION_PROFILES.has(taxonomy.profile)) return null;
  return taxonomy;
}

function displayRoleForNode(node, taxonomy) {
  if (!taxonomy) return null;
  if (taxonomy.profile !== "executive") return PRESENTATION_ROLE_LABELS[taxonomy.profile][node.role] || null;
  if (node.role === "boss") return "CEO";
  return isNonEmptyString(node.displayRole) ? node.displayRole : null;
}

function titleForNode(node, nodesById, prefix, adapter, scope) {
  const taxonomy = presentationTaxonomy(adapter);
  if (taxonomy) {
    const identity = taxonomy.repositoryIdentity || "<repository-identity>";
    const displayRole = displayRoleForNode(node, taxonomy) || `<${node.role}-display-role>`;
    const boundedScope = node.role === "boss" ? scope?.id || "<scope>" : node.workRef || "<WORK-REF>";
    return `${identity} - ${displayRole} - ${boundedScope}/${node.id || "<node-id>"}`;
  }
  const label = node.label || "<label>";
  const workRef = node.workRef || "<WORK-REF>";
  if (node.role === "boss") return `${prefix} - Boss`;
  if (node.role === "manager") return `${prefix} - Manager - ${workRef} ${label}`;
  const parent = nodesById.get(node.parentId);
  if (!parent) return "";
  if (parent.role === "boss") return `${prefix} - Worker for Boss - ${workRef} ${label}`;
  const parentRole = parent.role === "manager" ? "Manager" : "Worker";
  return `${prefix} - Worker for ${parentRole} ${parent.workRef} - ${workRef} ${label}`;
}

function graphHasCycle(nodes, edgesForNode) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const visiting = new Set();
  const visited = new Set();
  function visit(id) {
    if (visiting.has(id)) return true;
    if (visited.has(id) || !byId.has(id)) return false;
    visiting.add(id);
    for (const next of arrayOrEmpty(edgesForNode(byId.get(id)))) {
      if (visit(next)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  }
  return nodes.some((node) => visit(node.id));
}

function isAncestor(ancestorId, node, nodesById) {
  const seen = new Set();
  let current = node;
  while (current?.parentId && !seen.has(current.id)) {
    seen.add(current.id);
    if (current.parentId === ancestorId) return true;
    current = nodesById.get(current.parentId);
  }
  return false;
}

function missingCompletionEvidence(node) {
  const requiredEvidence = node.completionProfile?.requiredEvidence;
  if (!isStringArray(requiredEvidence, { nonEmpty: true })) return [];
  const completionEvidence = new Set(arrayOrEmpty(node.completionEvidence));
  return requiredEvidence.filter((evidence) => !completionEvidence.has(evidence));
}

function isTaskBackedNode(node) {
  return TASK_STATES.has(node?.state) && isNonEmptyString(node.taskId);
}

function hasLaunchReservation(node) {
  return isObject(node?.launchReservation);
}

function launchKeyFor(registry, node, parent) {
  return `orchestration:${registry.scope.id}:${node.id}:${materializedWorkContractHash(registry, node, parent)}`;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

function portableCanonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function portableAsciiCompare(left, right) {
  const leftValue = String(left);
  const rightValue = String(right);
  if (leftValue < rightValue) return -1;
  if (leftValue > rightValue) return 1;
  return 0;
}

function canonicalValues(value) {
  return [...new Set(arrayOrEmpty(value))].sort(portableAsciiCompare);
}

function canonicalAuthority(authority) {
  if (!isObject(authority)) return authority;
  return {
    ...authority,
    ...Object.fromEntries(AUTHORITY_ARRAY_FIELDS.map((field) => [field, canonicalValues(authority[field])]))
  };
}

function bindingAttestationConfigError(registry) {
  const config = registry.bindingAttestation;
  if (!isObject(config)
    || config.algorithm !== BINDING_ATTESTATION_ALGORITHM
    || !isNonEmptyString(config.keyId)) {
    return "bindingAttestation must declare algorithm ed25519 and a non-empty keyId";
  }
  if (process.env[BINDING_KEY_ID_ENV] !== config.keyId) {
    return `bindingAttestation.keyId must match ${BINDING_KEY_ID_ENV}`;
  }
  const encodedKey = process.env[BINDING_PUBLIC_KEY_ENV];
  if (!isNonEmptyString(encodedKey)) return `${BINDING_PUBLIC_KEY_ENV} must contain the trusted Ed25519 SPKI public key`;
  try {
    const key = createPublicKey({ key: Buffer.from(encodedKey, "base64"), format: "der", type: "spki" });
    if (key.asymmetricKeyType !== BINDING_ATTESTATION_ALGORITHM) {
      return `${BINDING_PUBLIC_KEY_ENV} must contain an Ed25519 SPKI public key`;
    }
  } catch {
    return `${BINDING_PUBLIC_KEY_ENV} must contain a valid base64 Ed25519 SPKI public key`;
  }
  return "";
}

function bindingAttestationPayload(registry, binding) {
  return JSON.stringify(canonicalize({
    schemaVersion: registry.schemaVersion,
    scopeId: registry.scope?.id,
    binding: {
      launchKey: binding.launchKey,
      workContractHash: binding.workContractHash,
      nodeId: binding.nodeId,
      taskId: binding.taskId,
      externalTitle: binding.externalTitle,
      titleVerification: binding.titleVerification,
      parentNodeId: binding.parentNodeId ?? null,
      parentTaskId: binding.parentTaskId ?? null,
      boundRevision: binding.boundRevision,
      boundAt: binding.boundAt,
      ...(binding.materializationAttempt ? {
        materializationAttempt: binding.materializationAttempt
      } : {}),
      attestation: {
        algorithm: binding.attestation?.algorithm,
        keyId: binding.attestation?.keyId
      }
    }
  }));
}

export function taskBindingAttestationPayload(registry, binding) {
  return bindingAttestationPayload(registry, binding);
}

export function taskBindingLegacyAttestationDigest(registry, binding) {
  return createHash("sha256").update(bindingAttestationPayload(registry, binding)).digest("hex");
}

function explicitLegacyFirstmateBinding(registry, node, binding) {
  const adapter = registry.clientAdapter;
  if (!isCodexNativeFirstmateAdapter(adapter)
    || binding.externalTitle !== undefined
    || binding.titleVerification !== undefined
    || !Array.isArray(adapter.legacyTaskBindings)) {
    return false;
  }
  const attestationDigest = taskBindingLegacyAttestationDigest(registry, binding);
  return adapter.legacyTaskBindings.some((entry) => isObject(entry)
    && entry.nodeId === node.id
    && entry.taskId === node.taskId
    && entry.attestationDigest === attestationDigest);
}

function legacyTaskBindingInventoryBlockers(registry, adapter, nodesById) {
  const blockers = [];
  if (!Array.isArray(adapter.legacyTaskBindings)) {
    blockers.push("clientAdapter.legacyTaskBindings must explicitly inventory legacy bindings or be an empty array");
    return blockers;
  }
  const seenNodeIds = new Set();
  for (const entry of adapter.legacyTaskBindings) {
    if (!isObject(entry)
      || !isNonEmptyString(entry.nodeId)
      || !isNonEmptyString(entry.taskId)
      || typeof entry.attestationDigest !== "string"
      || !/^[a-f0-9]{64}$/.test(entry.attestationDigest)) {
      blockers.push("clientAdapter.legacyTaskBindings entries require nodeId, taskId, and a SHA-256 attestationDigest");
      continue;
    }
    if (seenNodeIds.has(entry.nodeId)) {
      blockers.push(`clientAdapter.legacyTaskBindings may list node ${entry.nodeId} only once`);
      continue;
    }
    seenNodeIds.add(entry.nodeId);
    const node = nodesById.get(entry.nodeId);
    const binding = node?.taskBinding;
    if (!isTaskBackedNode(node) || node.taskId !== entry.taskId || !isObject(binding)) {
      blockers.push(`clientAdapter.legacyTaskBindings entry ${entry.nodeId} must identify its current task-backed node`);
      continue;
    }
    if (binding.externalTitle !== undefined || binding.titleVerification !== undefined) {
      blockers.push(`clientAdapter.legacyTaskBindings entry ${entry.nodeId} may not classify a title-proof binding as legacy`);
      continue;
    }
    if (taskBindingLegacyAttestationDigest(registry, binding) !== entry.attestationDigest) {
      blockers.push(`clientAdapter.legacyTaskBindings entry ${entry.nodeId} must match the immutable binding attestation digest`);
    }
  }
  return blockers;
}

function taskBindingAttestationBlockers(registry, node, binding) {
  const blockers = [];
  const label = `node ${node.id || "<missing-id>"}`;
  const configError = bindingAttestationConfigError(registry);
  if (configError) {
    blockers.push(`${label}: trusted binding attestor is unavailable: ${configError}`);
    return blockers;
  }
  if (!isObject(binding.attestation)
    || binding.attestation.algorithm !== BINDING_ATTESTATION_ALGORITHM
    || binding.attestation.keyId !== registry.bindingAttestation.keyId
    || !isNonEmptyString(binding.attestation.signature)) {
    blockers.push(`${label}: taskBinding.attestation must contain an Ed25519 signature from the configured binding attestor`);
    return blockers;
  }
  try {
    const key = createPublicKey({ key: Buffer.from(process.env[BINDING_PUBLIC_KEY_ENV], "base64"), format: "der", type: "spki" });
    const valid = verifySignature(
      null,
      Buffer.from(bindingAttestationPayload(registry, binding)),
      key,
      Buffer.from(binding.attestation.signature, "base64")
    );
    if (!valid) blockers.push(`${label}: taskBinding.attestation signature does not match the trusted immutable binding record`);
  } catch {
    blockers.push(`${label}: taskBinding.attestation signature is invalid`);
  }
  return blockers;
}

function materializedWorkContract(registry, node, parent) {
  const logicalParent = logicalParentBinding(registry, node, parent);
  const nodeContract = {
    id: node.id,
    role: node.role,
    parentId: node.parentId,
    workRef: node.workRef,
    workKind: node.workKind,
    governingProtocols: canonicalValues(node.governingProtocols),
    ...(registry.schemaVersion >= 3 ? { requiredSkills: requiredSkillsFor(registry, node) } : {}),
    ...(registry.schemaVersion >= 5 ? { parentBindingMode: node.parentBindingMode || "task" } : {}),
    label: node.label,
    title: node.title,
    objective: node.objective,
    dependencies: canonicalValues(node.dependencies),
    trustLevel: node.trustLevel,
    authority: canonicalAuthority(node.authority),
    completionProfile: isObject(node.completionProfile)
      ? { ...node.completionProfile, requiredEvidence: canonicalValues(node.completionProfile.requiredEvidence) }
      : node.completionProfile
  };
  return canonicalize({
    ...(registry.schemaVersion >= 4 ? { coordinationMode: registry.coordinationMode } : {}),
    ...(registry.schemaVersion >= 5 ? { rootControl: registry.rootControl } : {}),
    ...(registry.schemaVersion >= 5 && registry.controlLoopPolicy
      ? { controlLoopPolicy: registry.controlLoopPolicy }
      : {}),
    scope: registry.scope,
    trustPolicy: registry.trustPolicy,
    node: nodeContract,
    parent: parent ? {
      id: parent.id,
      taskId: logicalParent ? null : parent.taskId,
      trustLevel: parent.trustLevel,
      authority: canonicalAuthority(parent.authority)
    } : null
  });
}

function validateReportingPolicy(policy, blockers) {
  if (policy === undefined) return;
  if (!isObject(policy)) {
    blockers.push("reportingPolicy must be an object when configured");
    return;
  }
  const unexpectedFields = Object.keys(policy).filter((field) => !REPORTING_POLICY_FIELDS.has(field));
  if (unexpectedFields.length) blockers.push(`reportingPolicy contains unsupported fields: ${unexpectedFields.sort().join(", ")}`);
  for (const field of ["quietAfterSeconds", "postMergeStabilitySeconds", "terminalVisibilitySeconds"]) {
    if (!Number.isSafeInteger(policy[field]) || policy[field] < 1 || policy[field] > 31_536_000) {
      blockers.push(`reportingPolicy.${field} must be an integer from 1 through 31536000`);
    }
  }
  if (!isObject(policy.stageBudgetsSeconds)) {
    blockers.push("reportingPolicy.stageBudgetsSeconds must be an object");
  } else {
    const unexpectedStages = Object.keys(policy.stageBudgetsSeconds).filter((stage) => !REPORT_STAGES.includes(stage));
    if (unexpectedStages.length) {
      blockers.push(`reportingPolicy.stageBudgetsSeconds contains unsupported stages: ${unexpectedStages.sort().join(", ")}`);
    }
    for (const [stage, value] of Object.entries(policy.stageBudgetsSeconds)) {
      if (!Number.isSafeInteger(value) || value < 1 || value > 31_536_000) {
        blockers.push(`reportingPolicy.stageBudgetsSeconds.${stage} must be an integer from 1 through 31536000`);
      }
    }
  }
  if (!isObject(policy.wipLimits)) {
    blockers.push("reportingPolicy.wipLimits must be an object");
  } else {
    const unexpectedLimits = Object.keys(policy.wipLimits).filter((field) => !REPORTING_WIP_LIMIT_FIELDS.has(field));
    if (unexpectedLimits.length) blockers.push(`reportingPolicy.wipLimits contains unsupported fields: ${unexpectedLimits.sort().join(", ")}`);
    for (const field of REPORTING_WIP_LIMIT_FIELDS) {
      if (!Number.isSafeInteger(policy.wipLimits[field]) || policy.wipLimits[field] < 1 || policy.wipLimits[field] > 10_000) {
        blockers.push(`reportingPolicy.wipLimits.${field} must be an integer from 1 through 10000`);
      }
    }
  }
  if (!isObject(policy.agentAuthors)) {
    blockers.push("reportingPolicy.agentAuthors must be an object");
  } else {
    const unexpectedAuthorFields = Object.keys(policy.agentAuthors).filter((field) => !REPORTING_AGENT_AUTHOR_FIELDS.has(field));
    if (unexpectedAuthorFields.length) blockers.push(`reportingPolicy.agentAuthors contains unsupported fields: ${unexpectedAuthorFields.sort().join(", ")}`);
    for (const field of REPORTING_AGENT_AUTHOR_FIELDS) {
      if (!isStringArray(policy.agentAuthors[field])) {
        blockers.push(`reportingPolicy.agentAuthors.${field} must be an array of strings`);
      }
    }
  }
}

function validateStageTracking(stageTracking, label, blockers) {
  if (stageTracking === undefined || stageTracking === null) return;
  if (!isObject(stageTracking)) {
    blockers.push(`${label}: stageTracking must be an object when configured`);
    return;
  }
  const unexpectedFields = Object.keys(stageTracking).filter((field) => !STAGE_TRACKING_FIELDS.has(field));
  if (unexpectedFields.length) blockers.push(`${label}: stageTracking contains unsupported fields: ${unexpectedFields.sort().join(", ")}`);
  if (!REPORT_STAGES.includes(stageTracking.stage)) {
    blockers.push(`${label}: stageTracking.stage must be one of ${REPORT_STAGES.join(", ")}`);
  }
  if (!isUtcRfc3339Timestamp(stageTracking.enteredAt)) {
    blockers.push(`${label}: stageTracking.enteredAt must be a UTC RFC3339 timestamp`);
  }
  for (const field of ["gitBaseRef", "gitHeadRef", "validationRunId"]) {
    if (stageTracking[field] !== undefined
      && stageTracking[field] !== null
      && !isNonEmptyString(stageTracking[field])) {
      blockers.push(`${label}: stageTracking.${field} must be a non-empty single-line string or null`);
    }
  }
  if (stageTracking.pullRequestNumber !== undefined
    && stageTracking.pullRequestNumber !== null
    && (!Number.isSafeInteger(stageTracking.pullRequestNumber) || stageTracking.pullRequestNumber < 1)) {
    blockers.push(`${label}: stageTracking.pullRequestNumber must be a positive integer or null`);
  }
}

function validateControlLoopPolicy(registry, blockers, warnings) {
  const policy = registry.controlLoopPolicy;
  if (policy === undefined) {
    if (registry.schemaVersion >= 5) {
      warnings.push("controlLoopPolicy is not configured; add it during the next deliberate private-instance replan to enable anti-stagnation enforcement");
    }
    return null;
  }
  if (registry.schemaVersion < 5) {
    blockers.push("controlLoopPolicy requires schemaVersion 5");
    return null;
  }
  if (!isObject(policy)) {
    blockers.push("controlLoopPolicy must be an object when configured");
    return null;
  }
  const unexpectedPolicyFields = Object.keys(policy).filter((field) => !CONTROL_LOOP_POLICY_FIELDS.has(field));
  if (unexpectedPolicyFields.length) {
    blockers.push(`controlLoopPolicy contains unsupported fields: ${unexpectedPolicyFields.sort().join(", ")}`);
  }
  if (policy.progressSignal !== CONTROL_PROGRESS_SIGNAL) {
    blockers.push(`controlLoopPolicy.progressSignal must be ${CONTROL_PROGRESS_SIGNAL}`);
  }
  if (policy.quietActivityCountsAsProgress !== false) {
    blockers.push("controlLoopPolicy.quietActivityCountsAsProgress must be false");
  }
  if (!Number.isSafeInteger(policy.maxUnchangedChecks)
    || policy.maxUnchangedChecks < 1
    || policy.maxUnchangedChecks > MAX_CONTROL_UNCHANGED_CHECKS) {
    blockers.push(`controlLoopPolicy.maxUnchangedChecks must be a safe integer from 1 through ${MAX_CONTROL_UNCHANGED_CHECKS}`);
  }
  if (!Number.isSafeInteger(policy.maxSameFailureRetries)
    || policy.maxSameFailureRetries < 0
    || policy.maxSameFailureRetries > MAX_CONTROL_SAME_FAILURE_RETRIES) {
    blockers.push(`controlLoopPolicy.maxSameFailureRetries must be a safe integer from 0 through ${MAX_CONTROL_SAME_FAILURE_RETRIES}`);
  }
  if (!Number.isInteger(policy.maxControlIntervalSeconds)
    || policy.maxControlIntervalSeconds < 1
    || policy.maxControlIntervalSeconds > 604800) {
    blockers.push("controlLoopPolicy.maxControlIntervalSeconds must be an integer from 1 through 604800");
  }
  if (!Number.isInteger(policy.maxClockSkewSeconds)
    || policy.maxClockSkewSeconds < 0
    || policy.maxClockSkewSeconds > 3600) {
    blockers.push("controlLoopPolicy.maxClockSkewSeconds must be an integer from 0 through 3600");
  }
  if (Number.isSafeInteger(policy.maxUnchangedChecks)
    && Number.isSafeInteger(policy.maxControlIntervalSeconds)
    && policy.maxUnchangedChecks * policy.maxControlIntervalSeconds > MAX_CONTROL_STAGNATION_SECONDS) {
    blockers.push(`controlLoopPolicy unchanged-check budget may span at most ${MAX_CONTROL_STAGNATION_SECONDS} seconds`);
  }
  if (policy.retryRequiresChangedPrecondition !== true) {
    blockers.push("controlLoopPolicy.retryRequiresChangedPrecondition must be true");
  }
  const recovery = policy.sharedRuntimeRecovery;
  if (!isObject(recovery)) {
    blockers.push("controlLoopPolicy.sharedRuntimeRecovery must be an object");
  } else {
    const unexpectedRecoveryFields = Object.keys(recovery).filter((field) => !SHARED_RUNTIME_RECOVERY_FIELDS.has(field));
    if (unexpectedRecoveryFields.length) {
      blockers.push(`controlLoopPolicy.sharedRuntimeRecovery contains unsupported fields: ${unexpectedRecoveryFields.sort().join(", ")}`);
    }
    if (recovery.requireActiveSetSnapshot !== true) {
      blockers.push("controlLoopPolicy.sharedRuntimeRecovery.requireActiveSetSnapshot must be true");
    }
    if (recovery.requirePreActionCompare !== true) {
      blockers.push("controlLoopPolicy.sharedRuntimeRecovery.requirePreActionCompare must be true");
    }
    if (recovery.activeSetChangeAction !== SHARED_RUNTIME_ACTIVE_SET_CHANGE_ACTION) {
      blockers.push(`controlLoopPolicy.sharedRuntimeRecovery.activeSetChangeAction must be ${SHARED_RUNTIME_ACTIVE_SET_CHANGE_ACTION}`);
    }
    if (recovery.unknownPreservationBehavior !== SHARED_RUNTIME_UNKNOWN_PRESERVATION_BEHAVIOR) {
      blockers.push(`controlLoopPolicy.sharedRuntimeRecovery.unknownPreservationBehavior must be ${SHARED_RUNTIME_UNKNOWN_PRESERVATION_BEHAVIOR}`);
    }
    if (recovery.requireRuntimeScopedClaim !== true) {
      blockers.push("controlLoopPolicy.sharedRuntimeRecovery.requireRuntimeScopedClaim must be true");
    }
    if (recovery.requireAdmissionClosure !== true) {
      blockers.push("controlLoopPolicy.sharedRuntimeRecovery.requireAdmissionClosure must be true");
    }
    if (recovery.unmanagedStartBehavior !== SHARED_RUNTIME_UNMANAGED_START_BEHAVIOR) {
      blockers.push(`controlLoopPolicy.sharedRuntimeRecovery.unmanagedStartBehavior must be ${SHARED_RUNTIME_UNMANAGED_START_BEHAVIOR}`);
    }
    if (!Number.isInteger(recovery.maxReceiptAgeSeconds)
      || recovery.maxReceiptAgeSeconds < 1
      || recovery.maxReceiptAgeSeconds > 300) {
      blockers.push("controlLoopPolicy.sharedRuntimeRecovery.maxReceiptAgeSeconds must be an integer from 1 through 300");
    }
    if (!Number.isInteger(recovery.maxClaimLeaseSeconds)
      || recovery.maxClaimLeaseSeconds < 1
      || recovery.maxClaimLeaseSeconds > 3600) {
      blockers.push("controlLoopPolicy.sharedRuntimeRecovery.maxClaimLeaseSeconds must be an integer from 1 through 3600");
    }
  }
  return policy;
}

function fingerprintForRefs(refs) {
  return createHash("sha256").update(portableCanonicalJson(canonicalValues(refs))).digest("hex");
}

function validateFingerprintRefs(refs, fingerprint, field, label, blockers, { allowEmpty = false } = {}) {
  if (!isStringArray(refs) || (!allowEmpty && refs.length === 0) || !refs.every((ref) => EVIDENCE_REF_RE.test(ref))) {
    blockers.push(`${label}: ${field} must be ${allowEmpty ? "a" : "a non-empty"} canonical array of typed evidence references`);
    return false;
  }
  if (!isDeepStrictEqual(refs, canonicalValues(refs))) {
    blockers.push(`${label}: ${field} must be sorted and deduplicated`);
    return false;
  }
  if (!allowEmpty || refs.length > 0) {
    const expectedFingerprint = fingerprintForRefs(refs);
    if (fingerprint !== expectedFingerprint) {
      blockers.push(`${label}: ${field} does not match its SHA-256 fingerprint`);
      return false;
    }
  }
  return true;
}

function livenessOwnerRef(registry, node, parent) {
  if (node.role === "boss") return registry.scope?.ownerRef || null;
  if (isTaskBackedNode(parent) && MANAGING_STATES.has(parent.state)) return parent.taskId;
  if (node.role === "manager"
    && parent?.role === "boss"
    && registry.schemaVersion >= 5
    && registry.rootControl?.materialization === "optional"
    && node.parentBindingMode === "logical") {
    return registry.scope?.ownerRef || null;
  }
  return null;
}

function observationReceiptHash(receipt) {
  const payload = Object.fromEntries(
    Object.entries(receipt).filter(([field]) => field !== "receiptHash")
  );
  return createHash("sha256").update(portableCanonicalJson(payload)).digest("hex");
}

function observationFailurePairKey(observation) {
  if (!SHA256_RE.test(String(observation?.lastFailureFingerprint || ""))
    || !SHA256_RE.test(String(observation?.lastFailurePreconditionFingerprint || ""))) {
    return null;
  }
  return `${observation.lastFailureFingerprint}:${observation.lastFailurePreconditionFingerprint}`;
}

function validateNodeControlLoop(registry, node, parent, policy, label, blockers) {
  if (!policy || !ACTIVE_STATES.has(node.state)) return;
  const control = node.controlLoop;
  if (!isObject(control)) {
    blockers.push(`${label}: active state requires controlLoop under the configured controlLoopPolicy`);
    return;
  }
  const unexpectedControlFields = Object.keys(control).filter((field) => !NODE_CONTROL_LOOP_FIELDS.has(field));
  if (unexpectedControlFields.length) {
    blockers.push(`${label}: controlLoop contains unsupported fields: ${unexpectedControlFields.sort().join(", ")}`);
  }
  if (!SHA256_RE.test(String(control.progressFingerprint || ""))) {
    blockers.push(`${label}: controlLoop.progressFingerprint must be a lowercase SHA-256 digest`);
  }
  validateFingerprintRefs(
    control.progressEvidenceRefs,
    control.progressFingerprint,
    "controlLoop.progressEvidenceRefs",
    label,
    blockers
  );
  if (!isUtcRfc3339Timestamp(control.lastProgressAt)) {
    blockers.push(`${label}: controlLoop.lastProgressAt must be a UTC RFC3339 timestamp`);
  }
  if (!Number.isInteger(control.unchangedChecks) || control.unchangedChecks < 0) {
    blockers.push(`${label}: controlLoop.unchangedChecks must be a non-negative integer`);
  }
  const observations = control.observationReceipts;
  let latestObservation = null;
  if (!Array.isArray(observations) || observations.length === 0) {
    blockers.push(`${label}: controlLoop.observationReceipts must be a non-empty append-only receipt chain`);
  } else {
    let previous = null;
    const failurePairRetryHighWater = new Map();
    for (const [index, observation] of observations.entries()) {
      const observationLabel = `${label}: controlLoop.observationReceipts[${index}]`;
      if (!isObject(observation)) {
        blockers.push(`${observationLabel} must be an object`);
        continue;
      }
      const unexpectedObservationFields = Object.keys(observation)
        .filter((field) => !CONTROL_OBSERVATION_RECEIPT_FIELDS.has(field));
      const missingObservationFields = [...CONTROL_OBSERVATION_RECEIPT_FIELDS]
        .filter((field) => !Object.hasOwn(observation, field));
      if (unexpectedObservationFields.length) {
        blockers.push(`${observationLabel} contains unsupported fields: ${unexpectedObservationFields.sort().join(", ")}`);
      }
      if (missingObservationFields.length) {
        blockers.push(`${observationLabel} is missing fields: ${missingObservationFields.sort().join(", ")}`);
      }
      if (observation.sequence !== index + 1) {
        blockers.push(`${observationLabel}.sequence must be the contiguous value ${index + 1}`);
      }
      if (!PORTABLE_CONTROL_REF_RE.test(String(observation.observerRef || ""))) {
        blockers.push(`${observationLabel}.observerRef must be a portable printable-ASCII reference`);
      }
      if (!isUtcRfc3339Timestamp(observation.observedAt)) {
        blockers.push(`${observationLabel}.observedAt must be a UTC RFC3339 timestamp`);
      } else {
        if (Number.isInteger(policy.maxClockSkewSeconds)
          && Date.parse(observation.observedAt) > Date.now() + (policy.maxClockSkewSeconds * 1000)) {
          blockers.push(`${observationLabel}.observedAt exceeds the configured clock-skew allowance`);
        }
        if (previous && isUtcRfc3339Timestamp(previous.observedAt)
          && Date.parse(observation.observedAt) < Date.parse(previous.observedAt)) {
          blockers.push(`${observationLabel}.observedAt may not precede the prior observation`);
        }
      }
      const expectedPreviousReceiptHash = previous?.receiptHash || null;
      if (observation.previousReceiptHash !== expectedPreviousReceiptHash) {
        blockers.push(`${observationLabel}.previousReceiptHash must link to the prior receipt`);
      }
      if (!SHA256_RE.test(String(observation.receiptHash || ""))
        || observation.receiptHash !== observationReceiptHash(observation)) {
        blockers.push(`${observationLabel}.receiptHash must match the portable canonical receipt payload`);
      }
      const expectedPreviousProgress = previous?.progressFingerprint || null;
      const expectedPreviousUnchanged = previous?.unchangedChecks || 0;
      if (observation.previousProgressFingerprint !== expectedPreviousProgress) {
        blockers.push(`${observationLabel}.previousProgressFingerprint must match the prior receipt`);
      }
      if (observation.previousUnchangedChecks !== expectedPreviousUnchanged) {
        blockers.push(`${observationLabel}.previousUnchangedChecks must match the prior receipt`);
      }
      const progressRefsValid = validateFingerprintRefs(
        observation.progressEvidenceRefs,
        observation.progressFingerprint,
        `${observationLabel}.progressEvidenceRefs`,
        label,
        blockers
      );
      const preconditionRefsValid = validateFingerprintRefs(
        observation.preconditionRefs,
        observation.preconditionFingerprint,
        `${observationLabel}.preconditionRefs`,
        label,
        blockers
      );
      if (!SHA256_RE.test(String(observation.progressFingerprint || ""))) {
        blockers.push(`${observationLabel}.progressFingerprint must be a lowercase SHA-256 digest`);
      }
      if (!SHA256_RE.test(String(observation.preconditionFingerprint || ""))) {
        blockers.push(`${observationLabel}.preconditionFingerprint must be a lowercase SHA-256 digest`);
      }
      const hasObservationFailure = observation.lastFailureFingerprint !== null;
      const hasObservationFailurePrecondition = observation.lastFailurePreconditionFingerprint !== null;
      if (hasObservationFailure !== hasObservationFailurePrecondition) {
        blockers.push(`${observationLabel}: failure and failure-precondition fingerprints must be recorded or cleared together`);
      }
      if (hasObservationFailure) {
        validateFingerprintRefs(
          observation.lastFailureEvidenceRefs,
          observation.lastFailureFingerprint,
          `${observationLabel}.lastFailureEvidenceRefs`,
          label,
          blockers
        );
        validateFingerprintRefs(
          observation.lastFailurePreconditionRefs,
          observation.lastFailurePreconditionFingerprint,
          `${observationLabel}.lastFailurePreconditionRefs`,
          label,
          blockers
        );
      } else {
        if (!Array.isArray(observation.lastFailureEvidenceRefs)
          || observation.lastFailureEvidenceRefs.length !== 0) {
          blockers.push(`${observationLabel}.lastFailureEvidenceRefs must be empty without a failure`);
        }
        if (!Array.isArray(observation.lastFailurePreconditionRefs)
          || observation.lastFailurePreconditionRefs.length !== 0) {
          blockers.push(`${observationLabel}.lastFailurePreconditionRefs must be empty without a failure precondition`);
        }
      }
      if (!Number.isSafeInteger(observation.sameFailureRetries)
        || observation.sameFailureRetries < 0) {
        blockers.push(`${observationLabel}.sameFailureRetries must be a non-negative safe integer`);
      }
      const failurePairKey = observationFailurePairKey(observation);
      const priorPairRetryHighWater = failurePairKey
        ? failurePairRetryHighWater.get(failurePairKey) || 0
        : 0;
      if (!failurePairKey) {
        if (observation.sameFailureRetries !== 0) {
          blockers.push(`${observationLabel}: no failure pair requires sameFailureRetries zero`);
        }
        if (observationFailurePairKey(previous) && observation.progressChanged !== true) {
          blockers.push(`${observationLabel}: clearing a failure pair requires material progress`);
        }
      } else if (observation.lastFailurePreconditionFingerprint !== observation.preconditionFingerprint) {
        if (index > 0 && failurePairKey !== observationFailurePairKey(previous)) {
          blockers.push(`${observationLabel}: a newly recorded failure pair must match the current precondition`);
        }
        if (observation.sameFailureRetries !== 0) {
          blockers.push(`${observationLabel}: a changed current precondition must reset the active retry count to zero`);
        }
      } else if (priorPairRetryHighWater === 0) {
        if (observation.sameFailureRetries !== 1) {
          blockers.push(`${observationLabel}: the first failed attempt for a failure/precondition pair must set sameFailureRetries to one`);
        }
      } else if (observation.sameFailureRetries !== priorPairRetryHighWater
        && observation.sameFailureRetries !== priorPairRetryHighWater + 1) {
        blockers.push(`${observationLabel}: a known failure/precondition pair must preserve or increment its historical retry count exactly once`);
      }
      if (!Number.isSafeInteger(observation.unchangedChecks) || observation.unchangedChecks < 0) {
        blockers.push(`${observationLabel}.unchangedChecks must be a non-negative safe integer`);
      }
      if (!isUtcRfc3339Timestamp(observation.lastProgressAt)) {
        blockers.push(`${observationLabel}.lastProgressAt must be a UTC RFC3339 timestamp`);
      }
      if (typeof observation.progressChanged !== "boolean") {
        blockers.push(`${observationLabel}.progressChanged must be boolean`);
      } else if (observation.progressChanged) {
        if (index > 0 && observation.progressFingerprint === previous?.progressFingerprint) {
          blockers.push(`${observationLabel}: progressChanged requires a changed evidence fingerprint`);
        }
        if (observation.unchangedChecks !== 0) {
          blockers.push(`${observationLabel}: progressChanged must reset unchangedChecks to zero`);
        }
        if (observation.observedAt !== observation.lastProgressAt) {
          blockers.push(`${observationLabel}: progressChanged must set lastProgressAt to observedAt`);
        }
      } else {
        if (index === 0) {
          blockers.push(`${observationLabel}: the first observation must establish progress`);
        }
        if (observation.progressFingerprint !== previous?.progressFingerprint) {
          blockers.push(`${observationLabel}: unchanged observation must preserve the evidence fingerprint`);
        }
        if (observation.unchangedChecks !== expectedPreviousUnchanged + 1) {
          blockers.push(`${observationLabel}: unchanged observation must increment unchangedChecks exactly once`);
        }
        if (observation.lastProgressAt !== previous?.lastProgressAt) {
          blockers.push(`${observationLabel}: unchanged observation must preserve lastProgressAt`);
        }
      }
      if (!progressRefsValid || !preconditionRefsValid) {
        // Detailed blockers above identify the non-canonical evidence.
      }
      if (failurePairKey && Number.isSafeInteger(observation.sameFailureRetries)) {
        failurePairRetryHighWater.set(
          failurePairKey,
          Math.max(priorPairRetryHighWater, observation.sameFailureRetries)
        );
      }
      previous = observation;
      latestObservation = observation;
    }
    const expectedObserverRef = livenessOwnerRef(registry, node, parent);
    if (!expectedObserverRef || latestObservation?.observerRef !== expectedObserverRef) {
      blockers.push(`${label}: latest controlLoop observation must identify the current project-owner or active immediate-parent liveness owner`);
    }
    const latestFields = [
      "progressFingerprint", "progressEvidenceRefs", "lastProgressAt",
      "unchangedChecks", "preconditionFingerprint", "preconditionRefs",
      "lastFailureFingerprint", "lastFailureEvidenceRefs",
      "lastFailurePreconditionFingerprint", "lastFailurePreconditionRefs",
      "sameFailureRetries"
    ];
    for (const field of latestFields) {
      if (!isDeepStrictEqual(latestObservation?.[field], control[field])) {
        blockers.push(`${label}: controlLoop.${field} must match the latest observation receipt`);
      }
    }
  }
  if (!CONTROL_CHECK_MODES.has(control.checkMode)) {
    blockers.push(`${label}: controlLoop.checkMode must be scheduled or event`);
  } else if (control.checkMode === "scheduled") {
    if (!isUtcRfc3339Timestamp(control.nextCheckAt)) {
      blockers.push(`${label}: scheduled controlLoop requires nextCheckAt as a UTC RFC3339 timestamp`);
    }
    if (control.wakeEvent !== undefined && control.wakeEvent !== null) {
      blockers.push(`${label}: scheduled controlLoop must not set wakeEvent`);
    }
    if (control.watchdogAt !== undefined && control.watchdogAt !== null) {
      blockers.push(`${label}: scheduled controlLoop must not set watchdogAt`);
    }
  } else {
    if (!isNonEmptyString(control.wakeEvent)) {
      blockers.push(`${label}: event controlLoop requires wakeEvent`);
    }
    if (control.nextCheckAt !== undefined && control.nextCheckAt !== null) {
      blockers.push(`${label}: event controlLoop must not set nextCheckAt`);
    }
    if (!isUtcRfc3339Timestamp(control.watchdogAt)) {
      blockers.push(`${label}: event controlLoop requires watchdogAt as a UTC RFC3339 timestamp`);
    }
  }
  const controlDeadline = control.checkMode === "event" ? control.watchdogAt : control.nextCheckAt;
  if (isUtcRfc3339Timestamp(latestObservation?.observedAt)
    && isUtcRfc3339Timestamp(controlDeadline)
    && Number.isInteger(policy.maxControlIntervalSeconds)) {
    const intervalMs = Date.parse(controlDeadline) - Date.parse(latestObservation.observedAt);
    if (intervalMs <= 0 || intervalMs > policy.maxControlIntervalSeconds * 1000) {
      blockers.push(`${label}: next scheduled check or event watchdog must fall within the configured control interval after observedAt`);
    }
  }
  const hasLastFailure = control.lastFailureFingerprint !== undefined
    && control.lastFailureFingerprint !== null;
  const hasLastFailurePrecondition = control.lastFailurePreconditionFingerprint !== undefined
    && control.lastFailurePreconditionFingerprint !== null;
  if (hasLastFailure && !SHA256_RE.test(String(control.lastFailureFingerprint))) {
    blockers.push(`${label}: controlLoop.lastFailureFingerprint must be null or a lowercase SHA-256 digest`);
  }
  if (hasLastFailurePrecondition && !SHA256_RE.test(String(control.lastFailurePreconditionFingerprint))) {
    blockers.push(`${label}: controlLoop.lastFailurePreconditionFingerprint must be null or a lowercase SHA-256 digest`);
  }
  if (hasLastFailure !== hasLastFailurePrecondition) {
    blockers.push(`${label}: controlLoop last failure and last failure precondition fingerprints must be recorded or cleared together`);
  }
  if (!SHA256_RE.test(String(control.preconditionFingerprint || ""))) {
    blockers.push(`${label}: controlLoop.preconditionFingerprint must be a lowercase SHA-256 digest`);
  }
  validateFingerprintRefs(
    control.preconditionRefs,
    control.preconditionFingerprint,
    "controlLoop.preconditionRefs",
    label,
    blockers
  );
  if (hasLastFailure) {
    validateFingerprintRefs(
      control.lastFailureEvidenceRefs,
      control.lastFailureFingerprint,
      "controlLoop.lastFailureEvidenceRefs",
      label,
      blockers
    );
    validateFingerprintRefs(
      control.lastFailurePreconditionRefs,
      control.lastFailurePreconditionFingerprint,
      "controlLoop.lastFailurePreconditionRefs",
      label,
      blockers
    );
  } else {
    if (!Array.isArray(control.lastFailureEvidenceRefs) || control.lastFailureEvidenceRefs.length !== 0) {
      blockers.push(`${label}: controlLoop.lastFailureEvidenceRefs must be empty when no last failure is recorded`);
    }
    if (!Array.isArray(control.lastFailurePreconditionRefs) || control.lastFailurePreconditionRefs.length !== 0) {
      blockers.push(`${label}: controlLoop.lastFailurePreconditionRefs must be empty when no last failure is recorded`);
    }
  }
  if (!Number.isInteger(control.sameFailureRetries) || control.sameFailureRetries < 0) {
    blockers.push(`${label}: controlLoop.sameFailureRetries must be a non-negative integer`);
  }
  if (control.sameFailureRetries > 0 && (!hasLastFailure || !hasLastFailurePrecondition)) {
    blockers.push(`${label}: a positive sameFailureRetries count requires a complete last failure/precondition pair`);
  }
  if (!hasLastFailure && control.sameFailureRetries !== 0) {
    blockers.push(`${label}: controlLoop.sameFailureRetries must be zero when no last failure is recorded`);
  }
  const failurePreconditionMatches = hasLastFailurePrecondition
    && control.lastFailurePreconditionFingerprint === control.preconditionFingerprint;
  if (hasLastFailure && !failurePreconditionMatches && control.sameFailureRetries !== 0) {
    blockers.push(`${label}: changed precondition requires sameFailureRetries to reset before another attempt`);
  }
  const stagnated = Number.isInteger(control.unchangedChecks)
    && Number.isInteger(policy.maxUnchangedChecks)
    && control.unchangedChecks >= policy.maxUnchangedChecks;
  const retriesExhausted = Number.isInteger(control.sameFailureRetries)
    && Number.isInteger(policy.maxSameFailureRetries)
    && control.sameFailureRetries >= policy.maxSameFailureRetries
    && hasLastFailure
    && failurePreconditionMatches;
  if ((stagnated || retriesExhausted) && node.state !== "blocked") {
    blockers.push(`${label}: exhausted progress or retry budget requires blocked state and immediate-parent recovery instead of another loop iteration`);
  }
}

function canonicalSharedRuntimeActiveSet(activeSet) {
  if (!Array.isArray(activeSet)) return activeSet;
  return activeSet.map((entry) => canonicalize({
    runRef: entry?.runRef,
    headRef: entry?.headRef,
    preservationEvidenceRefs: canonicalValues(entry?.preservationEvidenceRefs)
  })).sort((left, right) => portableAsciiCompare(left.runRef, right.runRef));
}

function sharedRuntimeActiveSetFingerprint(activeSet) {
  return createHash("sha256")
    .update(portableCanonicalJson(canonicalSharedRuntimeActiveSet(activeSet)))
    .digest("hex");
}

function sharedRuntimeRecoveryClaimKey(receipt) {
  return createHash("sha256")
    .update(portableCanonicalJson({
      actionRef: receipt?.actionRef,
      preActionFingerprint: receipt?.preActionFingerprint,
      recoveryPreconditionFingerprint: receipt?.recoveryPreconditionFingerprint,
      runtimeScopeRef: receipt?.runtimeScopeRef
    }))
    .digest("hex");
}

function sharedRuntimeRecoveryTransitionHash(transition) {
  return createHash("sha256")
    .update(portableCanonicalJson(Object.fromEntries(
      Object.entries(transition || {}).filter(([field]) => field !== "transitionHash")
    )))
    .digest("hex");
}

function validateRuntimeCoordinatorReceipt(receipt, label, blockers) {
  if (!Number.isSafeInteger(receipt.runtimeCoordinatorGeneration)
    || receipt.runtimeCoordinatorGeneration < 1) {
    blockers.push(`${label}.runtimeCoordinatorGeneration must be a positive external admission epoch`);
  }
  if (!SHA256_RE.test(String(receipt.runtimeCoordinatorAttestationHash || ""))) {
    blockers.push(`${label}.runtimeCoordinatorAttestationHash must be a SHA-256 external attestation reference`);
  }
  blockers.push(
    `${label}: destructive shared-runtime recovery is unavailable until a separately implemented external coordinator cryptographically authenticates the claim, anchors monotonic history, and atomically gates every start path`
  );
}

function validateSharedRuntimeActiveSet(activeSet, field, label, blockers) {
  if (!Array.isArray(activeSet)) {
    blockers.push(`${label}: ${field} must be an array`);
    return false;
  }
  const runRefs = new Set();
  let valid = true;
  for (const [index, entry] of activeSet.entries()) {
    const entryLabel = `${label}: ${field}[${index}]`;
    if (!isObject(entry)) {
      blockers.push(`${entryLabel} must be an object`);
      valid = false;
      continue;
    }
    const unexpectedFields = Object.keys(entry).filter((key) => !SHARED_RUNTIME_ACTIVE_ENTRY_FIELDS.has(key));
    if (unexpectedFields.length) {
      blockers.push(`${entryLabel} contains unsupported fields: ${unexpectedFields.sort().join(", ")}`);
      valid = false;
    }
    if (!PORTABLE_CONTROL_REF_RE.test(String(entry.runRef || ""))
      || !PORTABLE_CONTROL_REF_RE.test(String(entry.headRef || ""))) {
      blockers.push(`${entryLabel} requires printable-ASCII runRef and headRef`);
      valid = false;
    } else if (runRefs.has(entry.runRef)) {
      blockers.push(`${label}: ${field} contains duplicate runRef ${entry.runRef}`);
      valid = false;
    } else {
      runRefs.add(entry.runRef);
    }
    if (!isStringArray(entry.preservationEvidenceRefs, { nonEmpty: true })
      || !entry.preservationEvidenceRefs.every((ref) => EVIDENCE_REF_RE.test(ref))
      || !isDeepStrictEqual(entry.preservationEvidenceRefs, canonicalValues(entry.preservationEvidenceRefs))) {
      blockers.push(`${entryLabel}.preservationEvidenceRefs must be a non-empty sorted and deduplicated array of typed evidence references`);
      valid = false;
    }
  }
  if (valid && !isDeepStrictEqual(activeSet, canonicalSharedRuntimeActiveSet(activeSet))) {
    blockers.push(`${label}: ${field} must be canonical and sorted by runRef`);
    valid = false;
  }
  return valid;
}

function validateSharedRuntimeRecoveryReceipts(registry, policy, blockers) {
  const receipts = registry.sharedRuntimeRecoveryReceipts;
  if (receipts === undefined) return;
  if (registry.schemaVersion < 5) {
    blockers.push("sharedRuntimeRecoveryReceipts require schemaVersion 5");
    return;
  }
  if (!policy || !isObject(policy.sharedRuntimeRecovery)) {
    blockers.push("sharedRuntimeRecoveryReceipts require a valid controlLoopPolicy.sharedRuntimeRecovery contract");
    return;
  }
  if (!Array.isArray(receipts)) {
    blockers.push("sharedRuntimeRecoveryReceipts must be an array when configured");
    return;
  }
  const ids = new Set();
  const claimKeys = new Set();
  const nonterminalClaims = [];
  for (const [index, receipt] of receipts.entries()) {
    const label = `shared runtime recovery receipt ${index}`;
    if (!isObject(receipt)) {
      blockers.push(`${label} must be an object`);
      continue;
    }
    const unexpectedFields = Object.keys(receipt).filter((field) => !SHARED_RUNTIME_RECEIPT_FIELDS.has(field));
    const missingFields = [...SHARED_RUNTIME_RECEIPT_FIELDS].filter((field) => !Object.hasOwn(receipt, field));
    if (unexpectedFields.length) {
      blockers.push(`${label} contains unsupported fields: ${unexpectedFields.sort().join(", ")}`);
    }
    if (missingFields.length) {
      blockers.push(`${label} is missing fields: ${missingFields.sort().join(", ")}`);
    }
    if (!isNonEmptyString(receipt.id) || !/^[a-z0-9][a-z0-9._-]*$/.test(receipt.id)) {
      blockers.push(`${label}.id must be a lowercase stable identifier`);
    } else if (ids.has(receipt.id)) {
      blockers.push(`duplicate shared runtime recovery receipt id: ${receipt.id}`);
    } else {
      ids.add(receipt.id);
    }
    if (!PORTABLE_CONTROL_REF_RE.test(String(receipt.actionRef || ""))) {
      blockers.push(`${label}.actionRef must be a portable printable-ASCII reference`);
    }
    if (!EVIDENCE_REF_RE.test(String(receipt.runtimeScopeRef || ""))
      || !String(receipt.runtimeScopeRef || "").startsWith("external:")) {
      blockers.push(`${label}.runtimeScopeRef must be a typed external reference to the shared runtime`);
    }
    const runtimeClaimEvidenceValid = validateFingerprintRefs(
      receipt.runtimeClaimEvidenceRefs,
      receipt.runtimeClaimFingerprint,
      "runtimeClaimEvidenceRefs",
      label,
      blockers
    );
    if (runtimeClaimEvidenceValid
      && !receipt.runtimeClaimEvidenceRefs.some((ref) => ref.startsWith("external:"))) {
      blockers.push(`${label}.runtimeClaimEvidenceRefs must include authoritative external runtime-claim evidence`);
    }
    const admissionClosureEvidenceValid = validateFingerprintRefs(
      receipt.admissionClosureEvidenceRefs,
      receipt.admissionClosureFingerprint,
      "admissionClosureEvidenceRefs",
      label,
      blockers
    );
    if (admissionClosureEvidenceValid
      && !receipt.admissionClosureEvidenceRefs.some((ref) => ref.startsWith("external:"))) {
      blockers.push(`${label}.admissionClosureEvidenceRefs must include authoritative external admission-closure evidence`);
    }
    const recoveryPreconditionValid = validateFingerprintRefs(
      receipt.recoveryPreconditionRefs,
      receipt.recoveryPreconditionFingerprint,
      "recoveryPreconditionRefs",
      label,
      blockers
    );
    const expectedClaimKey = sharedRuntimeRecoveryClaimKey(receipt);
    if (!SHA256_RE.test(String(receipt.claimKey || ""))
      || (recoveryPreconditionValid && receipt.claimKey !== expectedClaimKey)) {
      blockers.push(`${label}.claimKey must match the canonical runtime scope, action, pre-action active-set, and recovery-precondition fingerprints`);
    } else if (claimKeys.has(receipt.claimKey)) {
      blockers.push(`duplicate shared runtime recovery claim key: ${receipt.claimKey}`);
    } else {
      claimKeys.add(receipt.claimKey);
    }
    if (!PORTABLE_CONTROL_REF_RE.test(String(receipt.approvedBy || ""))) {
      blockers.push(`${label}.approvedBy must be a portable printable-ASCII reference`);
    }
    if (receipt.approvedBy !== registry.scope?.ownerRef) {
      blockers.push(`${label}.approvedBy must match scope.ownerRef`);
    }
    if (!isUtcRfc3339Timestamp(receipt.admissionClosedAt)) {
      blockers.push(`${label}.admissionClosedAt must be a UTC RFC3339 timestamp`);
    } else {
      if (Date.parse(receipt.admissionClosedAt) > Date.now()) {
        blockers.push(`${label}.admissionClosedAt may not be in the future`);
      }
      if (isUtcRfc3339Timestamp(receipt.preservedAt)
        && Date.parse(receipt.admissionClosedAt) > Date.parse(receipt.preservedAt)) {
        blockers.push(`${label}.admissionClosedAt must not follow preservedAt`);
      }
    }
    const comparisonFuture = isUtcRfc3339Timestamp(receipt.comparedAt)
      && Date.parse(receipt.comparedAt) > Date.now();
    const comparisonStale = isUtcRfc3339Timestamp(receipt.comparedAt)
      && Number.isInteger(policy.sharedRuntimeRecovery.maxReceiptAgeSeconds)
      && Date.now() - Date.parse(receipt.comparedAt)
        > policy.sharedRuntimeRecovery.maxReceiptAgeSeconds * 1000;
    const comparisonUnsafe = comparisonFuture || comparisonStale;
    if (!isUtcRfc3339Timestamp(receipt.preservedAt) || !isUtcRfc3339Timestamp(receipt.comparedAt)) {
      blockers.push(`${label} requires UTC RFC3339 preservedAt and comparedAt`);
    } else {
      if (Date.parse(receipt.comparedAt) < Date.parse(receipt.preservedAt)) {
        blockers.push(`${label}.comparedAt may not precede preservedAt`);
      }
      if (comparisonFuture && receipt.status !== "aborted") {
        blockers.push(`${label}.comparedAt may not be in the future`);
      }
    }
    const beforeValid = validateSharedRuntimeActiveSet(receipt.beforeActiveSet, "beforeActiveSet", label, blockers);
    const preActionValid = validateSharedRuntimeActiveSet(receipt.preActionActiveSet, "preActionActiveSet", label, blockers);
    if (!SHA256_RE.test(String(receipt.beforeFingerprint || ""))
      || (beforeValid && receipt.beforeFingerprint !== sharedRuntimeActiveSetFingerprint(receipt.beforeActiveSet))) {
      blockers.push(`${label}.beforeFingerprint must match the canonical beforeActiveSet`);
    }
    if (!SHA256_RE.test(String(receipt.preActionFingerprint || ""))
      || (preActionValid && receipt.preActionFingerprint !== sharedRuntimeActiveSetFingerprint(receipt.preActionActiveSet))) {
      blockers.push(`${label}.preActionFingerprint must match the canonical preActionActiveSet`);
    }
    if (!RECOVERY_RECEIPT_DECISIONS.has(receipt.decision)) {
      blockers.push(`${label}.decision must be proceed or abort-and-replan`);
    }
    if (!RECOVERY_RECEIPT_STATUSES.has(receipt.status)) {
      blockers.push(`${label}.status must be prepared, started, completed, failed, or aborted`);
    } else if (receipt.status === "prepared" || receipt.status === "started") {
      nonterminalClaims.push(receipt.id || `receipt-${index}`);
    }
    const activeSetMatches = beforeValid
      && preActionValid
      && receipt.beforeFingerprint === receipt.preActionFingerprint;
    if (activeSetMatches
      && receipt.decision !== "proceed"
      && !(comparisonUnsafe
        && receipt.decision === "abort-and-replan"
        && receipt.status === "aborted")) {
      blockers.push(`${label}: matching active sets require decision proceed`);
    }
    if (!activeSetMatches && receipt.decision !== "abort-and-replan") {
      blockers.push(`${label}: changed active sets require decision abort-and-replan`);
    }
    if (receipt.decision === "abort-and-replan" && receipt.status !== "aborted") {
      blockers.push(`${label}: abort-and-replan decision requires aborted status`);
    }
    const transitions = receipt.transitionReceipts;
    if (!Array.isArray(transitions) || transitions.length === 0) {
      blockers.push(`${label}.transitionReceipts must be a non-empty append-only transition ledger`);
    } else {
      let previousTransition = null;
      for (const [transitionIndex, transition] of transitions.entries()) {
        const transitionLabel = `${label}: transition ${transitionIndex}`;
        if (!isObject(transition)) {
          blockers.push(`${transitionLabel} must be an object`);
          previousTransition = null;
          continue;
        }
        const unexpectedTransitionFields = Object.keys(transition)
          .filter((field) => !SHARED_RUNTIME_TRANSITION_FIELDS.has(field));
        const missingTransitionFields = [...SHARED_RUNTIME_TRANSITION_FIELDS]
          .filter((field) => !Object.hasOwn(transition, field));
        if (unexpectedTransitionFields.length) {
          blockers.push(`${transitionLabel} contains unsupported fields: ${unexpectedTransitionFields.sort().join(", ")}`);
        }
        if (missingTransitionFields.length) {
          blockers.push(`${transitionLabel} is missing fields: ${missingTransitionFields.sort().join(", ")}`);
        }
        if (transition.claimKey !== receipt.claimKey) {
          blockers.push(`${transitionLabel}.claimKey must bind the transition ledger to its runtime-scoped recovery claim`);
        }
        if (transition.sequence !== transitionIndex + 1) {
          blockers.push(`${transitionLabel}.sequence must be contiguous and equal ${transitionIndex + 1}`);
        }
        const expectedPreviousHash = previousTransition?.transitionHash || null;
        if (transition.previousTransitionHash !== expectedPreviousHash) {
          blockers.push(`${transitionLabel}.previousTransitionHash must match the prior transition`);
        }
        if (!SHA256_RE.test(String(transition.transitionHash || ""))
          || transition.transitionHash !== sharedRuntimeRecoveryTransitionHash(transition)) {
          blockers.push(`${transitionLabel}.transitionHash must match the portable canonical transition payload`);
        }
        if (!isUtcRfc3339Timestamp(transition.recordedAt)) {
          blockers.push(`${transitionLabel}.recordedAt must be a UTC RFC3339 timestamp`);
        } else {
          if (previousTransition && isUtcRfc3339Timestamp(previousTransition.recordedAt)
            && Date.parse(transition.recordedAt) < Date.parse(previousTransition.recordedAt)) {
            blockers.push(`${transitionLabel}.recordedAt may not precede the prior transition`);
          }
          if (Number.isInteger(policy.maxClockSkewSeconds)
            && Date.parse(transition.recordedAt) > Date.now() + (policy.maxClockSkewSeconds * 1000)) {
            blockers.push(`${transitionLabel}.recordedAt exceeds the configured clock-skew allowance`);
          }
        }
        const allowedStatuses = transitionIndex === 0
          ? ["prepared", "aborted"]
          : previousTransition?.status === "prepared"
            ? ["started", "aborted"]
            : previousTransition?.status === "started"
              ? ["completed", "failed"]
              : [];
        if (!RECOVERY_RECEIPT_STATUSES.has(transition.status)
          || !allowedStatuses.includes(transition.status)) {
          blockers.push(`${transitionLabel}.status is not a valid monotonic recovery transition`);
        }
        const transitionFailureEvidenceValid = isStringArray(transition.failureEvidenceRefs)
          && transition.failureEvidenceRefs.every((ref) => EVIDENCE_REF_RE.test(ref))
          && isDeepStrictEqual(
            transition.failureEvidenceRefs,
            canonicalValues(transition.failureEvidenceRefs)
          );
        if (!transitionFailureEvidenceValid) {
          blockers.push(`${transitionLabel}.failureEvidenceRefs must be a sorted and deduplicated array of typed evidence references`);
        }
        const transitionClaimed = ["started", "completed", "failed"].includes(transition.status);
        if (transitionClaimed) {
          if (!PORTABLE_CONTROL_REF_RE.test(String(transition.claimOwnerRef || ""))
            || !isUtcRfc3339Timestamp(transition.actionStartedAt)
            || !isUtcRfc3339Timestamp(transition.claimExpiresAt)) {
            blockers.push(`${transitionLabel} requires portable claim owner and UTC action-start/lease timestamps`);
          }
          if (previousTransition?.status === "started"
            && (transition.claimOwnerRef !== previousTransition.claimOwnerRef
              || transition.actionStartedAt !== previousTransition.actionStartedAt
              || transition.claimExpiresAt !== previousTransition.claimExpiresAt)) {
            blockers.push(`${transitionLabel} must preserve the immutable started claim owner, action start, and lease`);
          }
        } else if (transition.claimOwnerRef !== null
          || transition.actionStartedAt !== null
          || transition.claimExpiresAt !== null) {
          blockers.push(`${transitionLabel}: ${transition.status} must not contain claimed-action fields`);
        }
        if (transition.status === "prepared") {
          if (transition.completedAt !== null
            || transition.admissionReopenedAt !== null
            || transition.failureEvidenceRefs?.length) {
            blockers.push(`${transitionLabel}: prepared must not contain terminal evidence`);
          }
        } else if (transition.status === "started") {
          if (transition.recordedAt !== transition.actionStartedAt) {
            blockers.push(`${transitionLabel}.recordedAt must equal actionStartedAt`);
          }
          if (transition.completedAt !== null
            || transition.admissionReopenedAt !== null
            || transition.failureEvidenceRefs?.length) {
            blockers.push(`${transitionLabel}: started must not contain terminal evidence`);
          }
        } else {
          if (!isUtcRfc3339Timestamp(transition.completedAt)) {
            blockers.push(`${transitionLabel}: ${transition.status} requires completedAt`);
          } else if (transition.recordedAt !== transition.completedAt) {
            blockers.push(`${transitionLabel}.recordedAt must equal completedAt`);
          }
          if (transition.status === "failed" && transition.failureEvidenceRefs?.length === 0) {
            blockers.push(`${transitionLabel}: failed requires failureEvidenceRefs`);
          }
          if (transition.status !== "failed" && transition.failureEvidenceRefs?.length) {
            blockers.push(`${transitionLabel}: only failed may contain failureEvidenceRefs`);
          }
          if (!isUtcRfc3339Timestamp(transition.admissionReopenedAt)) {
            blockers.push(`${transitionLabel}: ${transition.status} requires admissionReopenedAt from the runtime coordination authority`);
          } else {
            if (isUtcRfc3339Timestamp(transition.completedAt)
              && Date.parse(transition.admissionReopenedAt) < Date.parse(transition.completedAt)) {
              blockers.push(`${transitionLabel}.admissionReopenedAt may not precede completedAt`);
            }
            if (Number.isInteger(policy.maxClockSkewSeconds)
              && Date.parse(transition.admissionReopenedAt)
                > Date.now() + (policy.maxClockSkewSeconds * 1000)) {
              blockers.push(`${transitionLabel}.admissionReopenedAt exceeds the configured clock-skew allowance`);
            }
          }
        }
        previousTransition = transition;
      }
      const latestTransition = transitions.at(-1);
      for (const field of [
        "status", "claimOwnerRef", "actionStartedAt", "claimExpiresAt",
        "completedAt", "failureEvidenceRefs", "admissionReopenedAt"
      ]) {
        if (!isDeepStrictEqual(receipt[field], latestTransition?.[field])) {
          blockers.push(`${label}.${field} must match the latest append-only transition receipt`);
        }
      }
    }
    const failureEvidenceValid = isStringArray(receipt.failureEvidenceRefs)
      && receipt.failureEvidenceRefs.every((ref) => EVIDENCE_REF_RE.test(ref))
      && isDeepStrictEqual(receipt.failureEvidenceRefs, canonicalValues(receipt.failureEvidenceRefs));
    if (!failureEvidenceValid) {
      blockers.push(`${label}.failureEvidenceRefs must be a sorted and deduplicated array of typed evidence references`);
    } else if (receipt.status === "failed" && receipt.failureEvidenceRefs.length === 0) {
      blockers.push(`${label}: failed status requires failureEvidenceRefs`);
    } else if (receipt.status !== "failed" && receipt.failureEvidenceRefs.length !== 0) {
      blockers.push(`${label}: failureEvidenceRefs must be empty unless status is failed`);
    }
    const actionClaimed = ["started", "completed", "failed"].includes(receipt.status);
    if (actionClaimed) {
      if (receipt.decision !== "proceed") {
        blockers.push(`${label}: ${receipt.status} status requires decision proceed`);
      }
      if (!PORTABLE_CONTROL_REF_RE.test(String(receipt.claimOwnerRef || ""))) {
        blockers.push(`${label}: ${receipt.status} receipt requires a portable printable-ASCII claimOwnerRef`);
      }
      if (!isUtcRfc3339Timestamp(receipt.actionStartedAt)) {
        blockers.push(`${label}: ${receipt.status} receipt requires actionStartedAt`);
      } else if (isUtcRfc3339Timestamp(receipt.comparedAt)) {
        if (Date.parse(receipt.actionStartedAt) < Date.parse(receipt.comparedAt)) {
          blockers.push(`${label}.actionStartedAt may not precede comparedAt`);
        }
        if (Number.isInteger(policy.sharedRuntimeRecovery.maxReceiptAgeSeconds)
          && Date.parse(receipt.actionStartedAt) - Date.parse(receipt.comparedAt)
            > policy.sharedRuntimeRecovery.maxReceiptAgeSeconds * 1000) {
          blockers.push(`${label}: action began after the pre-action comparison freshness window`);
        }
        if (Number.isInteger(policy.maxClockSkewSeconds)
          && Date.parse(receipt.actionStartedAt) > Date.now() + (policy.maxClockSkewSeconds * 1000)) {
          blockers.push(`${label}.actionStartedAt exceeds the configured clock-skew allowance`);
        }
      }
      if (!isUtcRfc3339Timestamp(receipt.claimExpiresAt)) {
        blockers.push(`${label}: ${receipt.status} receipt requires claimExpiresAt`);
      } else if (isUtcRfc3339Timestamp(receipt.actionStartedAt)) {
        const leaseDuration = Date.parse(receipt.claimExpiresAt) - Date.parse(receipt.actionStartedAt);
        if (leaseDuration <= 0) {
          blockers.push(`${label}.claimExpiresAt must follow actionStartedAt`);
        }
        if (Number.isInteger(policy.sharedRuntimeRecovery.maxClaimLeaseSeconds)
          && leaseDuration > policy.sharedRuntimeRecovery.maxClaimLeaseSeconds * 1000) {
          blockers.push(`${label}: recovery claim lease exceeds controlLoopPolicy.sharedRuntimeRecovery.maxClaimLeaseSeconds`);
        }
        if (receipt.status === "started" && Date.parse(receipt.claimExpiresAt) <= Date.now()) {
          blockers.push(`${label}: started recovery claim lease expired and the same receipt must be reconciled to a terminal status before any new claim`);
        }
      }
    } else if (receipt.actionStartedAt !== null && receipt.actionStartedAt !== undefined) {
      blockers.push(`${label}: ${receipt.status} receipt must not set actionStartedAt`);
    } else if (receipt.claimOwnerRef !== null && receipt.claimOwnerRef !== undefined) {
      blockers.push(`${label}: ${receipt.status} receipt must not set claimOwnerRef`);
    } else if (receipt.claimExpiresAt !== null && receipt.claimExpiresAt !== undefined) {
      blockers.push(`${label}: ${receipt.status} receipt must not set claimExpiresAt`);
    }
    if (receipt.status === "prepared") {
      if (receipt.decision !== "proceed") blockers.push(`${label}: prepared status requires decision proceed`);
      if (receipt.completedAt !== null && receipt.completedAt !== undefined) {
        blockers.push(`${label}: prepared receipt must not set completedAt`);
      }
      if (isUtcRfc3339Timestamp(receipt.comparedAt)
        && Number.isInteger(policy.sharedRuntimeRecovery.maxReceiptAgeSeconds)
        && Date.now() - Date.parse(receipt.comparedAt) > policy.sharedRuntimeRecovery.maxReceiptAgeSeconds * 1000) {
        blockers.push(`${label}: prepared pre-action comparison receipt is stale and recovery must abort/replan`);
      }
    } else if (receipt.status === "started") {
      if (receipt.completedAt !== null && receipt.completedAt !== undefined) {
        blockers.push(`${label}: started receipt must not set completedAt`);
      }
    } else if (receipt.status === "completed" || receipt.status === "failed") {
      if (!isUtcRfc3339Timestamp(receipt.completedAt)) {
        blockers.push(`${label}: ${receipt.status} receipt requires completedAt`);
      }
      if (isUtcRfc3339Timestamp(receipt.completedAt)
        && isUtcRfc3339Timestamp(receipt.actionStartedAt)) {
        if (Date.parse(receipt.completedAt) < Date.parse(receipt.actionStartedAt)) {
          blockers.push(`${label}.completedAt may not precede actionStartedAt`);
        }
        if (Number.isInteger(policy.maxClockSkewSeconds)
          && Date.parse(receipt.completedAt) > Date.now() + (policy.maxClockSkewSeconds * 1000)) {
          blockers.push(`${label}.completedAt exceeds the configured clock-skew allowance`);
        }
      }
    } else if (receipt.status === "aborted") {
      if (receipt.decision !== "abort-and-replan") blockers.push(`${label}: aborted status requires decision abort-and-replan`);
      if (!isUtcRfc3339Timestamp(receipt.completedAt)) {
        blockers.push(`${label}: aborted receipt requires completedAt`);
      } else if (isUtcRfc3339Timestamp(receipt.comparedAt)
        && !comparisonFuture
        && Date.parse(receipt.completedAt) < Date.parse(receipt.comparedAt)) {
        blockers.push(`${label}.completedAt may not precede comparedAt`);
      }
    }
    validateRuntimeCoordinatorReceipt(receipt, label, blockers);
  }
  if (nonterminalClaims.length > 1) {
    blockers.push(`sharedRuntimeRecoveryReceipts may contain at most one prepared or started claim; found ${nonterminalClaims.join(", ")}`);
  }
}

function validateOwnerDirectives(registry, nodesById, blockers) {
  const directives = registry.ownerDirectives;
  if (!Array.isArray(directives)) {
    blockers.push("ownerDirectives must be an array");
    return;
  }
  if (registry.coordinationMode !== "hybrid" && directives.length) {
    blockers.push("ownerDirectives require coordinationMode hybrid");
  }
  const ids = new Set();
  for (const directive of directives) {
    const label = `owner directive ${directive?.id || "<missing-id>"}`;
    if (!isObject(directive)) {
      blockers.push("every ownerDirectives entry must be an object");
      continue;
    }
    if (!SAFE_DIRECTIVE_ID_RE.test(String(directive.id || ""))) blockers.push(`${label}: id must be a safe lowercase slug`);
    else if (ids.has(directive.id)) blockers.push(`duplicate owner directive id: ${directive.id}`);
    else ids.add(directive.id);
    if (!DIRECTIVE_KINDS.has(directive.kind)) blockers.push(`${label}: kind must be owner-directive or owner-intervention`);
    if (directive.issuedByRef !== registry.scope?.ownerRef) blockers.push(`${label}: issuedByRef must match scope.ownerRef`);
    if (!DIRECTIVE_REFERENCE_RE.test(String(directive.directiveRef || ""))) {
      blockers.push(`${label}: directiveRef must be a task, task-message, or tracker reference`);
    }
    if (!DIRECTIVE_IMPACTS.has(directive.contractImpact)) blockers.push(`${label}: contractImpact must be within-contract or replan-required`);
    if (!DIRECTIVE_STATES.has(directive.status)) blockers.push(`${label}: invalid status`);
    if (!Number.isSafeInteger(directive.registryRevisionAtIssue) || directive.registryRevisionAtIssue < 0
      || directive.registryRevisionAtIssue > registry.revision) {
      blockers.push(`${label}: registryRevisionAtIssue must be a non-negative revision no newer than the registry`);
    }
    if (!isUtcRfc3339Timestamp(directive.createdAt)) blockers.push(`${label}: createdAt must be a UTC RFC3339 timestamp`);
    const target = nodesById.get(directive.targetNodeId);
    const targetParent = target?.parentId ? nodesById.get(target.parentId) : null;
    const logicalParent = logicalParentBinding(registry, target, targetParent);
    if (!target) blockers.push(`${label}: targetNodeId must reference a configured node`);
    if (target && !["manager", "worker"].includes(target.role)) blockers.push(`${label}: targetNodeId must identify a Manager or Worker`);
    if (target && directive.targetParentIdAtIssue !== target.parentId) blockers.push(`${label}: targetParentIdAtIssue must match the target's immutable parent`);
    if (!isTaskBackedNode(target)) {
      blockers.push(`${label}: issuance requires a live target task`);
    } else if (directive.targetTaskIdAtIssue !== target.taskId) {
      blockers.push(`${label}: targetTaskIdAtIssue must identify the target's live task`);
    }
    if (!logicalParent && !isTaskBackedNode(targetParent)) {
      blockers.push(`${label}: issuance requires a live immediate-parent task`);
    } else if (!logicalParent && directive.targetParentTaskIdAtIssue !== targetParent.taskId) {
      blockers.push(`${label}: targetParentTaskIdAtIssue must identify the immediate parent's live task`);
    } else if (logicalParent && directive.targetParentTaskIdAtIssue !== null) {
      blockers.push(`${label}: logical root parent requires a null targetParentTaskIdAtIssue`);
    }
    if (target?.state === "terminal" && !DIRECTIVE_TERMINAL_STATES.has(directive.status)) {
      blockers.push(`${label}: an open directive cannot target a terminal node`);
    }
    if (!SHA256_RE.test(String(directive.workContractHashAtIssue || ""))) blockers.push(`${label}: workContractHashAtIssue must be a lowercase SHA-256 digest`);
    if (target && ["issued", "acknowledged"].includes(directive.status)) {
      if (directive.workContractHashAtIssue !== materializedWorkContractHash(registry, target, targetParent)) {
        blockers.push(`${label}: open directive workContractHashAtIssue must match the current target contract`);
      }
    }
    if (directive.status !== "issued" && !isUtcRfc3339Timestamp(directive.acknowledgedAt)) {
      blockers.push(`${label}: acknowledgedAt is required after issuance`);
    }
    if (directive.status !== "issued") {
      if (!isTaskBackedNode(target)) {
        blockers.push(`${label}: acknowledgement requires a live target task`);
      }
      if (directive.acknowledgedByNodeId !== directive.targetNodeId) {
        blockers.push(`${label}: acknowledgedByNodeId must identify the target node`);
      }
      if (directive.acknowledgedByTaskId !== target?.taskId) {
        blockers.push(`${label}: acknowledgedByTaskId must identify the target's live task`);
      }
      if (!isNonEmptyString(directive.acknowledgementRef)) {
        blockers.push(`${label}: acknowledgementRef is required after issuance`);
      }
      if (isUtcRfc3339Timestamp(directive.acknowledgedAt)
        && isUtcRfc3339Timestamp(directive.createdAt)
        && Date.parse(directive.acknowledgedAt) < Date.parse(directive.createdAt)) {
        blockers.push(`${label}: acknowledgedAt may not precede createdAt`);
      }
    }
    if (DIRECTIVE_TERMINAL_STATES.has(directive.status)) {
      if (!isNonEmptyString(directive.resolutionRef)) {
        blockers.push(`${label}: terminal directive status requires resolutionRef`);
      }
      if (!isUtcRfc3339Timestamp(directive.resolvedAt)) {
        blockers.push(`${label}: terminal directive status requires resolvedAt`);
      }
      if (directive.resolvedByNodeId !== directive.targetNodeId) {
        blockers.push(`${label}: resolvedByNodeId must identify the target node`);
      }
      if (directive.resolvedByTaskId !== target?.taskId) {
        blockers.push(`${label}: resolvedByTaskId must identify the target's live task`);
      }
      if (isUtcRfc3339Timestamp(directive.resolvedAt)
        && isUtcRfc3339Timestamp(directive.acknowledgedAt)
        && Date.parse(directive.resolvedAt) < Date.parse(directive.acknowledgedAt)) {
        blockers.push(`${label}: resolvedAt may not precede acknowledgedAt`);
      }
      if (target?.parentId) {
        if (!isUtcRfc3339Timestamp(directive.parentObservedAt)) {
          blockers.push(`${label}: terminal directive status requires parentObservedAt`);
        }
        if (directive.parentObservedByNodeId !== directive.targetParentIdAtIssue) {
          blockers.push(`${label}: parentObservedByNodeId must identify the target's immediate parent`);
        }
        if (!logicalParent && directive.parentObservedByTaskId !== targetParent?.taskId) {
          blockers.push(`${label}: parentObservedByTaskId must identify the immediate parent's live task`);
        } else if (logicalParent && directive.parentObservedByTaskId !== null) {
          blockers.push(`${label}: logical root reconciliation requires a null parentObservedByTaskId`);
        }
        if (!isNonEmptyString(directive.parentReconciliationRef)) {
          blockers.push(`${label}: terminal directive status requires parentReconciliationRef`);
        }
        if (isUtcRfc3339Timestamp(directive.parentObservedAt)
          && isUtcRfc3339Timestamp(directive.resolvedAt)
          && Date.parse(directive.parentObservedAt) < Date.parse(directive.resolvedAt)) {
          blockers.push(`${label}: parentObservedAt may not precede resolvedAt`);
        }
      }
    }
  }
}

function coordinationModeFor(registry) {
  return registry?.schemaVersion >= 4 && registry.coordinationMode === "hybrid" ? "hybrid" : "managed";
}

function governedOwnerDirectives(registry) {
  if (registry?.schemaVersion < 4) return [];
  return arrayOrEmpty(registry.ownerDirectives).filter(isObject);
}

function openOwnerDirectivesFor(registry, nodeId) {
  return governedOwnerDirectives(registry).filter((directive) => (
    directive.targetNodeId === nodeId && !DIRECTIVE_TERMINAL_STATES.has(directive.status)
  ));
}

function hasOpenReplanDirective(registry, nodeId) {
  return openOwnerDirectivesFor(registry, nodeId).some((directive) => directive.contractImpact === "replan-required");
}

function openReplanDirectiveIdsFor(registry, nodeId) {
  return canonicalValues(openOwnerDirectivesFor(registry, nodeId)
    .filter((directive) => directive.contractImpact === "replan-required")
    .map((directive) => directive.id)
    .filter(isNonEmptyString));
}

function replanBoundaryDirectiveIdsFor(registry, node, nodesById) {
  const ids = [];
  const seen = new Set();
  let current = node;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    ids.push(...openReplanDirectiveIdsFor(registry, current.id));
    current = current.parentId ? nodesById.get(current.parentId) : null;
  }
  return canonicalValues(ids);
}

export function materializedWorkContractHash(registry, node, parent) {
  return createHash("sha256").update(JSON.stringify(materializedWorkContract(registry, node, parent))).digest("hex");
}

function parentSnapshot(parent) {
  if (!parent) return null;
  return {
    id: parent.id,
    state: parent.state,
    taskId: parent.taskId,
    trustLevel: parent.trustLevel,
    authority: canonicalAuthority(parent.authority)
  };
}

function reservationCapacity(nodes, parent, maxActiveNodes) {
  const activeNodeCount = nodes.filter((candidate) => ACTIVE_STATES.has(candidate.state)).length;
  const reservedNodeCount = nodes.filter(hasLaunchReservation).length;
  const activeChildCount = parent ? nodes.filter((candidate) => candidate.parentId === parent.id && ACTIVE_STATES.has(candidate.state)).length : 0;
  const reservedChildCount = parent ? nodes.filter((candidate) => candidate.parentId === parent.id && hasLaunchReservation(candidate)).length : 0;
  return {
    activeNodeCount,
    reservedNodeCount,
    maxActiveNodes,
    ...(parent ? {
      parentId: parent.id,
      activeChildCount,
      reservedChildCount,
      maxActiveChildren: parent.authority?.maxActiveChildren
    } : {})
  };
}

function reservationValidityFor(registry, node, parent, nodes, maxActiveNodes, reservation) {
  const workContractHash = materializedWorkContractHash(registry, node, parent);
  const nodesById = new Map(nodes.map((candidate) => [candidate.id, candidate]));
  return {
    expectedRegistryRevision: registry.revision,
    expectedRegistryStatus: registry.status,
    expectedNode: {
      id: node.id,
      state: node.state,
      taskId: node.taskId,
      launchReservationKey: reservation.key,
      parentTaskId: node.parentTaskId ?? null,
      trustLevel: node.trustLevel,
      authority: canonicalAuthority(node.authority),
      materializedWorkContractHash: workContractHash
    },
    expectedParent: parentSnapshot(parent),
    capacity: reservationCapacity(nodes, parent, maxActiveNodes),
    ...(registry.schemaVersion >= 4 ? {
      openReplanBoundaryDirectiveIds: replanBoundaryDirectiveIdsFor(registry, node, nodesById)
    } : {}),
    materializedWorkContractHash: workContractHash
  };
}

function taskBindingBlockers(registry, node, parent) {
  const blockers = [];
  const label = `node ${node.id || "<missing-id>"}`;
  const binding = node.taskBinding;
  if (!isObject(binding)) {
    blockers.push(`${label}: task-backed node requires immutable taskBinding metadata`);
    return blockers;
  }
  const workContractHash = materializedWorkContractHash(registry, node, parent);
  const expectedLaunchKey = isNonEmptyString(registry.scope?.id) ? launchKeyFor(registry, node, parent) : null;
  if (!isNonEmptyString(binding.launchKey)) blockers.push(`${label}: taskBinding.launchKey must be a non-empty single-line string`);
  else if (expectedLaunchKey && binding.launchKey !== expectedLaunchKey) blockers.push(`${label}: taskBinding.launchKey must match the immutable materialized work contract`);
  if (typeof binding.workContractHash !== "string" || !/^[a-f0-9]{64}$/.test(binding.workContractHash)) blockers.push(`${label}: taskBinding.workContractHash must be a SHA-256 hex digest`);
  else if (binding.workContractHash !== workContractHash) blockers.push(`${label}: taskBinding.workContractHash must match the immutable materialized work contract`);
  if (binding.nodeId !== node.id) blockers.push(`${label}: taskBinding.nodeId must match node identity`);
  if (binding.taskId !== node.taskId) blockers.push(`${label}: taskBinding.taskId must match taskId`);
  const firstmateBindingRequiresTitleProof = isCodexNativeFirstmateAdapter(registry.clientAdapter)
    && !explicitLegacyFirstmateBinding(registry, node, binding);
  if (binding.externalTitle !== undefined && binding.externalTitle !== node.title) {
    blockers.push(`${label}: taskBinding.externalTitle must match the verified task title`);
  }
  if (firstmateBindingRequiresTitleProof && binding.externalTitle !== node.title) {
    blockers.push(`${label}: non-legacy Firstmate taskBinding requires externalTitle matching the verified task title`);
  }
  if (binding.titleVerification !== undefined || firstmateBindingRequiresTitleProof) {
    const verification = binding.titleVerification;
    if (!isObject(verification) || verification.method !== "rename-and-readback" || verification.verified !== true) {
      blockers.push(`${label}: taskBinding.titleVerification must prove rename-and-readback verification`);
    }
    if (binding.externalTitle !== node.title) {
      blockers.push(`${label}: taskBinding.titleVerification requires externalTitle matching the verified task title`);
    }
  }
  if (node.role === "boss") {
    if ((binding.parentNodeId ?? null) !== null) blockers.push(`${label}: Boss taskBinding.parentNodeId must be null`);
    if ((binding.parentTaskId ?? null) !== null) blockers.push(`${label}: Boss taskBinding.parentTaskId must be null`);
  } else {
    if ((binding.parentNodeId ?? null) !== (node.parentId ?? null)) blockers.push(`${label}: taskBinding.parentNodeId must match immutable parent node identity`);
    if ((binding.parentTaskId ?? null) !== (node.parentTaskId ?? null)) {
      blockers.push(`${label}: taskBinding.parentTaskId must match immutable parent task identity`);
    }
  }
  if (!Number.isSafeInteger(binding.boundRevision) || binding.boundRevision < 0 || binding.boundRevision > registry.revision) {
    blockers.push(`${label}: taskBinding.boundRevision must be a registry revision at or before the current revision`);
  }
  if (!isUtcRfc3339Timestamp(binding.boundAt)) blockers.push(`${label}: taskBinding.boundAt must be a UTC RFC3339 timestamp`);
  if (binding.materializationAttempt !== undefined) {
    const attempt = binding.materializationAttempt;
    if (!isObject(attempt)
      || attempt.broker !== "codex-native-firstmate-at-most-once-v1"
      || typeof attempt.attemptLedgerTip !== "string"
      || !SHA256_RE.test(attempt.attemptLedgerTip)
      || typeof attempt.sourceContractHash !== "string"
      || !SHA256_RE.test(attempt.sourceContractHash)
      || typeof attempt.taskReadbackHash !== "string"
      || !SHA256_RE.test(attempt.taskReadbackHash)) {
      blockers.push(`${label}: taskBinding.materializationAttempt must seal the at-most-once broker, ledger tip, source contract, and task readback hashes`);
    }
  }
  blockers.push(...taskBindingAttestationBlockers(registry, node, binding));
  return blockers;
}

function taskBindingUpdate({ registry, launchKey, workContractHash, node, parent, boundRevision }) {
  return {
    launchKey,
    workContractHash,
    nodeId: node.id,
    taskId: "external task ID returned by the adapter",
    ...(isCodexNativeFirstmateAdapter(registry.clientAdapter) ? {
      externalTitle: node.title,
      titleVerification: {
        method: "rename-and-readback",
        verified: true
      }
    } : {}),
    parentNodeId: node.parentId ?? null,
    parentTaskId: logicalParentBinding(registry, node, parent) ? null : parent?.taskId ?? null,
    boundRevision,
    boundAt: "UTC RFC3339 timestamp of the atomic bind",
    attestation: {
      algorithm: BINDING_ATTESTATION_ALGORITHM,
      keyId: registry.bindingAttestation?.keyId || "configured binding attestor key ID",
      signature: "base64 Ed25519 signature from the trusted external binding attestor"
    }
  };
}

function reservationValidityMatchesCurrent(reservation, expectedValidity) {
  if (!Number.isSafeInteger(reservation.validity?.expectedRegistryRevision)
    || reservation.validity.expectedRegistryRevision !== reservation.baseRevision + 1) {
    return false;
  }
  const persistedCurrentState = { ...reservation.validity };
  const expectedCurrentState = { ...expectedValidity };
  delete persistedCurrentState.expectedRegistryRevision;
  delete expectedCurrentState.expectedRegistryRevision;
  return reservation.workContractHash === expectedValidity.materializedWorkContractHash
    && isDeepStrictEqual(persistedCurrentState, expectedCurrentState);
}

function hasDelegationAuthority(node) {
  return isObject(node?.authority) && node.authority.canDelegate === true && trustRank(node.trustLevel) >= trustRank("T3");
}

function authorityInheritanceBlockers(node, parent) {
  const blockers = [];
  const label = `node ${node.id || "<missing-id>"}`;
  if (!parent || !isObject(node.authority) || !isObject(parent.authority)) return blockers;
  if (TRUST_RANK.has(node.trustLevel) && TRUST_RANK.has(parent.trustLevel) && trustRank(node.trustLevel) > trustRank(parent.trustLevel)) {
    blockers.push(`${label}: trustLevel ${node.trustLevel} exceeds parent ${parent.id} trustLevel ${parent.trustLevel}`);
  }
  for (const field of ["allowedReads", "allowedWrites", "allowedExternalActions"]) {
    const parentValues = new Set(arrayOrEmpty(parent.authority[field]));
    for (const value of arrayOrEmpty(node.authority[field])) {
      if (!parentValues.has(value)) blockers.push(`${label}: authority.${field} entry ${value} exceeds parent scope`);
    }
  }
  const parentApprovalGates = new Set(arrayOrEmpty(parent.authority.approvalGates));
  const childApprovalGates = new Set(arrayOrEmpty(node.authority.approvalGates));
  for (const gate of parentApprovalGates) {
    if (!childApprovalGates.has(gate)) blockers.push(`${label}: authority.approvalGates is missing parent gate ${gate}`);
  }
  if (node.authority.canDelegate && !parent.authority.canDelegate) blockers.push(`${label}: delegation exceeds parent authority`);
  if (Number.isInteger(parent.authority.maxActiveChildren) && node.authority.maxActiveChildren > parent.authority.maxActiveChildren) {
    blockers.push(`${label}: maxActiveChildren ${node.authority.maxActiveChildren} exceeds parent budget ${parent.authority.maxActiveChildren}`);
  }
  return blockers;
}

function launchEligibilityBlockers({ registry, node, parent, nodes, nodesById, maxActiveNodes, mode }) {
  const blockers = [];
  const label = `node ${node.id || "<missing-id>"}`;
  const hasReservation = hasLaunchReservation(node);
  const logicalParent = logicalParentBinding(registry, node, parent);
  const activatesRegistry = activatesRegistryOnLaunch(registry, node, parent);
  const requiresActiveRegistry = mode === "reservation" || (!activatesRegistry && node.role !== "boss");
  const block = (code, message) => blockers.push({ code, message: `${label}: ${message}` });

  if (!isNonEmptyString(node.id)) block("node-id", "launch eligibility requires a single-line node id");
  if (!Array.isArray(node.dependencies) || !dependenciesSatisfied(node, nodesById)) {
    block("dependencies", "launch eligibility requires completed dependencies");
  }
  if (requiresActiveRegistry && registry.status !== "active") {
    block("registry-status", "launch eligibility requires active orchestration");
  }
  if (!["queued", "eligible"].includes(node.state) || isNonEmptyString(node.taskId)) {
    block("task-identity", "launch eligibility requires a queued or eligible node without taskId");
  }
  if (replanBoundaryDirectiveIdsFor(registry, node, nodesById).length) {
    block("owner-replan", "launch eligibility requires every replan-required owner directive to be resolved and reconciled");
  }
  if (node.parentTaskId !== undefined && node.parentTaskId !== null) {
    block("parent-task-identity", "launch eligibility requires no bound parentTaskId");
  }
  if (mode === "launch" && hasReservation) {
    block("reservation", "launch eligibility requires no pending launch reservation");
  }
  if (mode === "reservation" && !hasReservation) {
    block("reservation", "launch eligibility requires a pending launch reservation");
  }
  const attestorError = bindingAttestationConfigError(registry);
  if (attestorError) {
    block("binding-attestation", `launch eligibility requires a trusted binding attestor: ${attestorError}`);
  }

  if (node.role !== "boss") {
    if (!logicalParent && !isTaskBackedNode(parent)) {
      block("parent-task", `launch eligibility requires task-backed parent ${node.parentId || "<missing-parent>"}`);
    }
    if (!logicalParent && !MANAGING_STATES.has(parent?.state)) {
      block("parent-state", `launch eligibility requires parent ${node.parentId || "<missing-parent>"} in an active managing state`);
    }
    if (!hasDelegationAuthority(parent)) {
      block("parent-authority", `launch eligibility requires parent ${node.parentId || "<missing-parent>"} with T3 delegation authority`);
    }
    for (const gate of arrayOrEmpty(parent?.authority?.approvalGates)) {
      if (!arrayOrEmpty(node.authority?.approvalGates).includes(gate)) {
        block("approval-gate", `launch eligibility requires parent approval gate ${gate}`);
      }
    }
    if (Number.isInteger(parent?.authority?.maxActiveChildren)) {
      const occupiedChildren = nodes.filter((candidate) => candidate.parentId === parent.id && (ACTIVE_STATES.has(candidate.state) || hasLaunchReservation(candidate))).length;
      const exceedsCapacity = mode === "reservation"
        ? occupiedChildren > parent.authority.maxActiveChildren
        : occupiedChildren >= parent.authority.maxActiveChildren;
      if (exceedsCapacity) block("parent-capacity", `launch eligibility exceeds parent ${parent.id} active-child budget`);
    }
  }

  if (Number.isInteger(maxActiveNodes)) {
    const occupiedNodes = nodes.filter((candidate) => ACTIVE_STATES.has(candidate.state) || hasLaunchReservation(candidate)).length;
    const exceedsCapacity = mode === "reservation" ? occupiedNodes > maxActiveNodes : occupiedNodes >= maxActiveNodes;
    if (exceedsCapacity) block("project-capacity", "launch eligibility exceeds project active-node budget");
  }
  return blockers;
}

function launchSpecFailure(node, parent, blocker) {
  switch (blocker.code) {
    case "task-identity":
      return `Node ${node.id} already has task state; launch-spec only materializes queued or eligible nodes without taskId.`;
    case "parent-task":
      return `Node ${node.id} cannot launch before parent ${parent?.id || node.parentId} has a taskId.`;
    case "parent-state":
      return `Node ${node.id} cannot launch because parent ${parent?.id || node.parentId} is not in an active managing state.`;
    case "dependencies":
      return `Node ${node.id} cannot launch before all dependencies are completed.`;
    case "owner-replan":
      return `Node ${node.id} cannot launch while a replan-required owner directive remains open.`;
    case "reservation":
      return `Node ${node.id} has a pending launch reservation and cannot be materialized again.`;
    case "registry-status":
      return `Node ${node.id} cannot launch while project orchestration is inactive.`;
    case "parent-authority":
      return `Node ${node.id} cannot launch because parent ${parent?.id || node.parentId} lacks T3 delegation authority.`;
    case "parent-capacity":
      return `Node ${node.id} cannot launch because parent ${parent?.id || node.parentId} has exhausted its active-child budget.`;
    case "project-capacity":
      return `Node ${node.id} cannot launch because the project active-node budget is exhausted.`;
    case "binding-attestation":
      return `Node ${node.id} cannot launch without a trusted external binding attestor.`;
    default:
      return blocker.message;
  }
}

function validateAuthority(node, parent, defaultLevel, maxLevel, blockers) {
  const label = `node ${node.id || "<missing-id>"}`;
  if (!TRUST_RANK.has(node.trustLevel)) {
    blockers.push(`${label}: trustLevel must be T0-T5`);
    return;
  }
  if (trustRank(node.trustLevel) > trustRank(maxLevel)) {
    blockers.push(`${label}: trustLevel ${node.trustLevel} exceeds project maxLevel ${maxLevel}`);
  }
  if (trustRank(node.trustLevel) > trustRank(defaultLevel)) {
    if (!isObject(node.trustApproval)) {
      blockers.push(`${label}: trust promotion above ${defaultLevel} requires structured trustApproval`);
    } else {
      if (!isNonEmptyString(node.trustApproval.approvedBy)) blockers.push(`${label}: trustApproval.approvedBy is required`);
      if (!isApprovalTimestamp(node.trustApproval.approvedAt)) blockers.push(`${label}: trustApproval.approvedAt must be YYYY-MM-DD or UTC RFC3339 seconds`);
      if (!isStringArray(node.trustApproval.evidence, { nonEmpty: true })) blockers.push(`${label}: trustApproval.evidence must be non-empty`);
    }
  }
  if (!isObject(node.authority)) {
    blockers.push(`${label}: authority envelope is required`);
    return;
  }
  for (const field of AUTHORITY_ARRAY_FIELDS) {
    if (!isStringArray(node.authority[field])) blockers.push(`${label}: authority.${field} must be an array of single-line strings`);
  }
  if (typeof node.authority.canDelegate !== "boolean") blockers.push(`${label}: authority.canDelegate must be boolean`);
  if (!Number.isInteger(node.authority.maxActiveChildren) || node.authority.maxActiveChildren < 0) {
    blockers.push(`${label}: authority.maxActiveChildren must be a non-negative integer`);
  }
  if (trustRank(node.trustLevel) <= trustRank("T1")) {
    if (arrayOrEmpty(node.authority.allowedWrites).length) blockers.push(`${label}: ${node.trustLevel} may not allow writes`);
    if (arrayOrEmpty(node.authority.allowedExternalActions).length) blockers.push(`${label}: ${node.trustLevel} may not allow external actions`);
  }
  if (trustRank(node.trustLevel) <= trustRank("T2") && node.authority.canDelegate) {
    blockers.push(`${label}: delegation requires T3 or higher`);
  }
  if (trustRank(node.trustLevel) <= trustRank("T2") && arrayOrEmpty(node.authority.allowedExternalActions).length) {
    blockers.push(`${label}: external actions require T3 or higher`);
  }
  blockers.push(...authorityInheritanceBlockers(node, parent));
}

function validateRegistry(registry) {
  const blockers = [];
  const warnings = [];
  const githubProfiles = loadGithubProfiles();
  if (!isObject(registry)) return { blockers: ["registry root must be a JSON object"], warnings, nodes: [], nodesById: new Map() };
  if (!SUPPORTED_REGISTRY_SCHEMA_VERSIONS.has(registry.schemaVersion)) blockers.push("schemaVersion must be 2, 3, 4, or 5");
  else if (registry.schemaVersion === 2) warnings.push("schemaVersion 2 is supported for existing bindings; migrate to 3 or newer before relying on requiredSkills as immutable work-contract data");
  else if (registry.schemaVersion === 3) warnings.push("schemaVersion 3 is supported for existing bindings; migrate to 4 before enabling hybrid coordination and owner directives");
  else if (registry.schemaVersion === 4) warnings.push("schemaVersion 4 is supported for existing bindings; migrate to 5 before using optional root materialization and logical Manager parent bindings");
  if (registry.schemaVersion < 4
    && registry.ownerDirectives !== undefined
    && (!Array.isArray(registry.ownerDirectives) || registry.ownerDirectives.length)) {
    blockers.push("ownerDirectives require schemaVersion 4");
  }
  if (!Number.isSafeInteger(registry.revision) || registry.revision < 0) blockers.push("revision must be a non-negative safe integer");
  if (!["inactive", "active"].includes(registry.status)) blockers.push("status must be inactive or active");
  if (!isNonEmptyString(registry.prefix)) blockers.push("prefix must be a non-empty single-line string");
  if (!isObject(registry.scope)) blockers.push("scope is required");
  if (!isNonEmptyString(registry.scope?.id)) blockers.push("scope.id must be a non-empty single-line string");
  if (!SCOPE_KINDS.has(registry.scope?.kind)) blockers.push("scope.kind must be repository, project, program, personal-folder, or custom");
  if (!isNonEmptyString(registry.scope?.rootRef)) blockers.push("scope.rootRef must be a non-empty single-line reference");
  if (!isNonEmptyString(registry.scope?.objective)) blockers.push("scope.objective must be a non-empty single-line string");
  if (registry.schemaVersion >= 4) {
    if (!COORDINATION_MODES.has(registry.coordinationMode)) blockers.push("coordinationMode must be managed or hybrid");
    if (!isNonEmptyString(registry.scope?.ownerRef)) blockers.push("scope.ownerRef must identify the project owner in schemaVersion 4");
  }
  if (registry.schemaVersion >= 5) {
    if (!isObject(registry.rootControl) || !ROOT_MATERIALIZATION_MODES.has(registry.rootControl.materialization)) {
      blockers.push("rootControl.materialization must be required or optional in schemaVersion 5");
    }
  }
  const controlLoopPolicy = validateControlLoopPolicy(registry, blockers, warnings);
  validateReportingPolicy(registry.reportingPolicy, blockers);
  validateSharedRuntimeRecoveryReceipts(registry, controlLoopPolicy, blockers);
  if (registry.bindingAttestation !== undefined && registry.bindingAttestation !== null) {
    if (!isObject(registry.bindingAttestation)
      || registry.bindingAttestation.algorithm !== BINDING_ATTESTATION_ALGORITHM
      || !isNonEmptyString(registry.bindingAttestation.keyId)) {
      blockers.push("bindingAttestation must declare algorithm ed25519 and a non-empty keyId when configured");
    }
  }
  if (registry.clientAdapter !== undefined && registry.clientAdapter !== null) {
    const adapter = registry.clientAdapter;
    if (!isObject(adapter)) blockers.push("clientAdapter must be null or an object");
    else {
      if (!isNonEmptyString(adapter.id)) blockers.push("clientAdapter.id must be a non-empty single-line string");
      if (!isNonEmptyString(adapter.profile)) blockers.push("clientAdapter.profile must be a non-empty single-line string");
      if (!['inactive', 'active'].includes(adapter.status)) blockers.push("clientAdapter.status must be inactive or active");
      if (adapter.status === "active" && registry.schemaVersion >= 3 && !isNonEmptyString(adapter.requiredSkill)) {
        blockers.push("active schemaVersion 3 or newer clientAdapter requires requiredSkill");
      }
      if (adapter.requiredSkill !== undefined && (!isNonEmptyString(adapter.requiredSkill) || !SKILL_NAME_RE.test(adapter.requiredSkill))) {
        blockers.push("clientAdapter.requiredSkill must be a lowercase skill slug when configured");
      }
      if (DEPRECATED_SKILL_ALIASES.has(adapter.requiredSkill)) {
        blockers.push(`clientAdapter.requiredSkill must use ${DEPRECATED_SKILL_ALIASES.get(adapter.requiredSkill)}; ${adapter.requiredSkill} is a compatibility-only alias`);
      }
      if (typeof adapter.standingTaskCreationGrant !== "boolean") {
        blockers.push("clientAdapter.standingTaskCreationGrant must be boolean");
      }
      if (registry.status === "active" && adapter.status !== "active") {
        blockers.push("configured clientAdapter must be active when orchestration is active");
      }
    }
  }
  if (!isObject(registry.trustPolicy)) blockers.push("trustPolicy is required");
  const defaultLevel = registry.trustPolicy?.defaultLevel;
  const maxLevel = registry.trustPolicy?.maxLevel;
  if (!TRUST_RANK.has(defaultLevel)) blockers.push("trustPolicy.defaultLevel must be T0-T5");
  if (!TRUST_RANK.has(maxLevel)) blockers.push("trustPolicy.maxLevel must be T0-T5");
  if (TRUST_RANK.has(defaultLevel) && TRUST_RANK.has(maxLevel) && trustRank(defaultLevel) > trustRank(maxLevel)) {
    blockers.push("trustPolicy.defaultLevel may not exceed maxLevel");
  }
  if (registry.trustPolicy?.promotionRequiresHumanApproval !== true) {
    blockers.push("trustPolicy.promotionRequiresHumanApproval must be true");
  }
  if (registry.trustPolicy?.childMayExceedParent !== false) blockers.push("trustPolicy.childMayExceedParent must be false");
  if (!isObject(registry.trustPolicy?.limits)) blockers.push("trustPolicy.limits is required");
  const maxActiveNodes = registry.trustPolicy?.limits?.maxActiveNodes;
  const maxDelegationDepth = registry.trustPolicy?.limits?.maxDelegationDepth;
  if (!Number.isInteger(maxActiveNodes) || maxActiveNodes < 1) blockers.push("trustPolicy.limits.maxActiveNodes must be a positive integer");
  if (!Number.isInteger(maxDelegationDepth) || maxDelegationDepth < 0) blockers.push("trustPolicy.limits.maxDelegationDepth must be a non-negative integer");
  if (!Array.isArray(registry.nodes)) blockers.push("nodes must be an array");
  const nodes = Array.isArray(registry.nodes) ? registry.nodes.filter(isObject) : [];
  if (Array.isArray(registry.nodes) && nodes.length !== registry.nodes.length) blockers.push("every node must be a JSON object");
  const nodesById = new Map();
  const nodesByTaskId = new Map();
  for (const node of nodes) {
    if (!isNonEmptyString(node.id)) {
      blockers.push("every node requires a single-line id");
      continue;
    }
    if (nodesById.has(node.id)) blockers.push(`duplicate node id: ${node.id}`);
    nodesById.set(node.id, node);
  }
  if (registry.schemaVersion >= 4) validateOwnerDirectives(registry, nodesById, blockers);
  const bosses = nodes.filter((node) => node.role === "boss");
  if (bosses.length > 1) blockers.push("only one Boss is allowed");
  if (registry.status === "active" && bosses.length !== 1) blockers.push("active orchestration requires exactly one Boss");
  if (registry.status === "inactive" && nodes.length === 0) warnings.push("orchestration is scaffolded but inactive; configure a Boss and nodes before activation");
  if (isCodexNativeFirstmateAdapter(registry.clientAdapter) && registry.clientAdapter.status === "active") {
    blockers.push(...legacyTaskBindingInventoryBlockers(registry, registry.clientAdapter, nodesById));
    blockers.push(...firstmatePinPolicyBlockers(registry.clientAdapter));
  }

  for (const node of nodes) {
    const label = `node ${node.id}`;
    const dependencies = arrayOrEmpty(node.dependencies);
    if (!ROLES.has(node.role)) blockers.push(`${label}: role must be boss, manager, or worker`);
    if (!STATES.has(node.state)) blockers.push(`${label}: invalid state ${node.state || "<missing>"}`);
    if (!isNonEmptyString(node.workRef)) blockers.push(`${label}: workRef is required`);
    if (!isNonEmptyString(node.workKind) || !/^[a-z][a-z0-9-]*$/.test(node.workKind)) blockers.push(`${label}: workKind must be a lowercase slug`);
    if (!isStringArray(node.governingProtocols, { nonEmpty: true })) blockers.push(`${label}: governingProtocols must be a non-empty string array`);
    else if (!node.governingProtocols.includes(CORE_GOVERNING_PROTOCOL)) blockers.push(`${label}: governingProtocols must include ${CORE_GOVERNING_PROTOCOL}`);
    if (node.requiredSkills !== undefined && (!isStringArray(node.requiredSkills) || !node.requiredSkills.every((skill) => SKILL_NAME_RE.test(skill)))) {
      blockers.push(`${label}: requiredSkills must be an array of lowercase skill slugs`);
    }
    for (const skill of arrayOrEmpty(node.requiredSkills)) {
      if (DEPRECATED_SKILL_ALIASES.has(skill)) {
        blockers.push(`${label}: requiredSkills must use ${DEPRECATED_SKILL_ALIASES.get(skill)}; ${skill} is a compatibility-only alias`);
      }
    }
    if (!isNonEmptyString(node.label)) blockers.push(`${label}: label is required`);
    if (!isNonEmptyString(node.objective)) blockers.push(`${label}: objective is required`);
    validateStageTracking(node.stageTracking, label, blockers);
    if (!Array.isArray(node.dependencies) || !node.dependencies.every(isNonEmptyString)) blockers.push(`${label}: dependencies must be an array of node ids`);
    const parent = node.parentId ? nodesById.get(node.parentId) : null;
    if (node.role === "boss" && node.parentId !== null) blockers.push(`${label}: Boss parentId must be null`);
    if (node.role === "boss" && node.parentTaskId !== undefined && node.parentTaskId !== null) {
      blockers.push(`${label}: Boss parentTaskId must be null`);
    }
    if (node.role !== "boss" && !isNonEmptyString(node.parentId)) blockers.push(`${label}: non-Boss nodes require parentId`);
    if (node.role !== "boss" && isNonEmptyString(node.parentId) && !parent) blockers.push(`${label}: parent ${node.parentId} does not exist`);
    if (node.role === "manager" && parent?.role !== "boss") blockers.push(`${label}: Manager parent must be the Boss`);
    if (registry.schemaVersion >= 5) {
      if (!PARENT_BINDING_MODES.has(node.parentBindingMode)) blockers.push(`${label}: parentBindingMode must be task or logical`);
      if (node.role !== "manager" && node.parentBindingMode === "logical") blockers.push(`${label}: only a Manager may use logical parent binding`);
      if (node.parentBindingMode === "logical" && !logicalParentBinding(registry, node, parent)) {
        blockers.push(`${label}: logical parent binding requires optional root materialization and the Boss as immediate parent`);
      }
    }
    const expectedTitle = titleForNode(node, nodesById, registry.prefix || "<PREFIX>", registry.clientAdapter, registry.scope);
    if (!isNonEmptyString(node.title) || (expectedTitle && node.title !== expectedTitle)) {
      blockers.push(`${label}: title must equal ${expectedTitle || "the registry-derived title"}`);
    }
    if (node.taskId !== null && node.taskId !== undefined) {
      if (!isNonEmptyString(node.taskId)) blockers.push(`${label}: taskId must be a non-empty single-line string when present`);
      else if (nodesByTaskId.has(node.taskId)) blockers.push(`${label}: taskId ${node.taskId} duplicates node ${nodesByTaskId.get(node.taskId)}`);
      else nodesByTaskId.set(node.taskId, node.id);
    }
    if (TASK_STATES.has(node.state) && !isNonEmptyString(node.taskId)) blockers.push(`${label}: task-backed state ${node.state} requires taskId`);
    if (["queued", "eligible"].includes(node.state) && node.taskId) blockers.push(`${label}: graph state ${node.state} must not claim a live taskId`);
    if (registry.status === "inactive" && (TASK_STATES.has(node.state) || isNonEmptyString(node.taskId))) {
      blockers.push(`${label}: inactive orchestration may not contain task-backed nodes`);
    }
    if (node.launchReservation !== undefined && node.launchReservation !== null) {
      if (!isObject(node.launchReservation)) {
        blockers.push(`${label}: launchReservation must be an object when present`);
      } else {
        const reservation = node.launchReservation;
        if (!isNonEmptyString(reservation.key)) blockers.push(`${label}: launchReservation.key must be a non-empty single-line string`);
        if (!Number.isSafeInteger(reservation.baseRevision) || reservation.baseRevision < 0) {
          blockers.push(`${label}: launchReservation.baseRevision must be a non-negative safe integer`);
        } else if (Number.isSafeInteger(registry.revision) && reservation.baseRevision >= registry.revision) {
          blockers.push(`${label}: launchReservation.baseRevision must precede registry revision`);
        }
        if (!["queued", "eligible"].includes(node.state) || node.taskId) {
          blockers.push(`${label}: launchReservation requires a queued or eligible node without taskId`);
        }
        if (isNonEmptyString(registry.scope?.id) && Number.isSafeInteger(reservation.baseRevision) && isNonEmptyString(reservation.key)) {
          const expectedKey = launchKeyFor(registry, node, parent);
          if (reservation.key !== expectedKey) blockers.push(`${label}: launchReservation.key does not match the current materialized work contract`);
        }
        if (!isObject(reservation.validity)) {
          blockers.push(`${label}: launchReservation.validity is required`);
        } else {
          const expectedValidity = reservationValidityFor(registry, node, parent, nodes, maxActiveNodes, reservation);
          if (!reservationValidityMatchesCurrent(reservation, expectedValidity)) {
            blockers.push(`${label}: launchReservation validity no longer matches registry status, work contract, authority, capacity, or task identity`);
          }
        }
        if (reservation.materializationAttempt !== undefined) {
          const attempt = reservation.materializationAttempt;
          const { markerHash: _markerHash, ...markerPayload } = isObject(attempt) ? attempt : {};
          if (!isObject(attempt)
            || attempt.schemaVersion !== 1
            || attempt.broker !== "codex-native-firstmate-at-most-once-v1"
            || attempt.state !== "create-issued"
            || attempt.launchKey !== reservation.key
            || attempt.workContractHash !== reservation.workContractHash
            || typeof attempt.sourceContractHash !== "string"
            || !SHA256_RE.test(attempt.sourceContractHash)
            || typeof attempt.attemptLedgerTip !== "string"
            || !SHA256_RE.test(attempt.attemptLedgerTip)
            || typeof attempt.nativeCallIssued !== "boolean"
            || !isUtcRfc3339Timestamp(attempt.issuedAt)
            || typeof attempt.markerHash !== "string"
            || !SHA256_RE.test(attempt.markerHash)
            || brokerHash(markerPayload) !== attempt.markerHash) {
            blockers.push(`${label}: launchReservation.materializationAttempt must seal the durable at-most-once issuance marker`);
          }
        }
        blockers.push(...launchEligibilityBlockers({
          registry,
          node,
          parent,
          nodes,
          nodesById,
          maxActiveNodes,
          mode: "reservation"
        }).map((blocker) => blocker.message));
      }
    }
    if (node.role !== "boss" && isTaskBackedNode(node)) {
      const logicalParent = logicalParentBinding(registry, node, parent);
      if (!logicalParent && !isTaskBackedNode(parent)) blockers.push(`${label}: task-backed non-Boss node requires task-backed parent ${parent?.id || node.parentId}`);
      if (!logicalParent && !isNonEmptyString(node.parentTaskId)) {
        blockers.push(`${label}: task-backed non-Boss node requires immutable parentTaskId`);
      } else if (!logicalParent && node.parentTaskId !== parent?.taskId) {
        blockers.push(`${label}: parentTaskId must match immediate parent ${parent?.id || node.parentId} taskId; replace parent tasks only after bound descendants are reconciled`);
      } else if (logicalParent && node.parentTaskId !== undefined && node.parentTaskId !== null) {
        blockers.push(`${label}: logical parent binding must keep parentTaskId null`);
      }
    } else if (node.role !== "boss" && node.parentTaskId !== undefined && node.parentTaskId !== null) {
      blockers.push(`${label}: unmaterialized non-Boss node must not claim parentTaskId`);
    }
    if (isTaskBackedNode(node)) {
      blockers.push(...taskBindingBlockers(registry, node, parent));
    } else if (node.taskBinding !== undefined && node.taskBinding !== null) {
      blockers.push(`${label}: unmaterialized node must not claim taskBinding metadata`);
    }
    if (node.role !== "boss" && ACTIVE_STATES.has(node.state) && parent) {
      if (!logicalParentBinding(registry, node, parent) && !MANAGING_STATES.has(parent.state)) {
        blockers.push(`${label}: active non-Boss node requires parent ${parent.id} in an active managing state`);
      }
      if (!hasDelegationAuthority(parent)) {
        blockers.push(`${label}: active non-Boss node requires parent ${parent.id} with T3 delegation authority`);
      }
    }
    if (node.state === "working" && !isNonEmptyString(node.nextAction)) blockers.push(`${label}: working state requires nextAction`);
    if (node.state === "waiting" && !isNonEmptyString(node.waitingOn)) blockers.push(`${label}: waiting state requires waitingOn`);
    if (node.state === "blocked" && (!isNonEmptyString(node.blocker) || !isNonEmptyString(node.unblockAction))) {
      blockers.push(`${label}: blocked state requires blocker and unblockAction`);
    }
    validateNodeControlLoop(registry, node, parent, controlLoopPolicy, label, blockers);
    const openReplanDirectiveIds = openReplanDirectiveIdsFor(registry, node.id);
    if (node.blockedByDirectiveIds !== undefined
      && (!isStringArray(node.blockedByDirectiveIds) || !node.blockedByDirectiveIds.every((id) => SAFE_DIRECTIVE_ID_RE.test(id)))) {
      blockers.push(`${label}: blockedByDirectiveIds must be an array of owner directive ids when present`);
    }
    const claimedBlockedDirectiveIds = canonicalValues(node.blockedByDirectiveIds);
    if (openReplanDirectiveIds.length && isTaskBackedNode(node)) {
      if (node.state !== "blocked") {
        blockers.push(`${label}: an open replan-required owner directive requires the active target to be blocked at its current boundary`);
      }
      if (!isDeepStrictEqual(claimedBlockedDirectiveIds, openReplanDirectiveIds)) {
        blockers.push(`${label}: blockedByDirectiveIds must exactly identify open replan-required owner directives`);
      }
    } else if (claimedBlockedDirectiveIds.length) {
      blockers.push(`${label}: blockedByDirectiveIds requires an active target with an open replan-required owner directive`);
    }
    if (node.state === "ready-for-parent" && !isStringArray(node.handoffEvidence, { nonEmpty: true })) {
      blockers.push(`${label}: ready-for-parent state requires handoffEvidence`);
    }
    if (node.state === "eligible" && !dependenciesSatisfied(node, nodesById)) {
      blockers.push(`${label}: eligible state requires completed dependencies`);
    }
    if (ACTIVE_STATES.has(node.state) && !dependenciesSatisfied(node, nodesById)) {
      blockers.push(`${label}: active state requires completed dependencies`);
    }
    if (node.role !== "boss") {
      if (!isObject(node.completionProfile) || !COMPLETION_TYPES.has(node.completionProfile.type)) {
        blockers.push(`${label}: completionProfile.type must name a supported profile`);
      } else if (!isStringArray(node.completionProfile.requiredEvidence, { nonEmpty: true })) {
        blockers.push(`${label}: completionProfile.requiredEvidence must be non-empty`);
      } else if (node.completionProfile.type !== "repository-merge"
        && ["pr", "merged", "post-merge-stable"].includes(node.stageTracking?.stage)) {
        blockers.push(`${label}: stageTracking may use pr, merged, or post-merge-stable only for repository-merge completion`);
      }
    }
    if (node.state === "terminal") {
      if (!TERMINAL_DISPOSITIONS.has(node.terminalDisposition)) blockers.push(`${label}: terminal state requires completed, cancelled, or superseded terminalDisposition`);
      if (node.terminalDisposition === "completed" && !dependenciesSatisfied(node, nodesById)) {
        blockers.push(`${label}: completed terminal state requires completed dependencies`);
      }
      if (!isStringArray(node.completionEvidence, { nonEmpty: true })) blockers.push(`${label}: terminal state requires completionEvidence`);
      const missingEvidence = missingCompletionEvidence(node);
      if (missingEvidence.length) blockers.push(`${label}: completionEvidence is missing required evidence: ${missingEvidence.join(", ")}`);
    }
    for (const dependency of dependencies) {
      if (!nodesById.has(dependency)) blockers.push(`${label}: dependency ${dependency} does not exist`);
      if (dependency === node.id) blockers.push(`${label}: node may not depend on itself`);
    }
    if (TRUST_RANK.has(defaultLevel) && TRUST_RANK.has(maxLevel)) validateAuthority(node, parent, defaultLevel, maxLevel, blockers);
    const externalActions = arrayOrEmpty(node.authority?.allowedExternalActions);
    const githubCapabilities = externalActions.filter((action) => action.startsWith("github.") && !action.startsWith("github.profile."));
    const githubWrites = githubCapabilities.filter((action) => !action.endsWith(".read"));
    const githubProfileMarkers = externalActions.filter((action) => action.startsWith("github.profile."));
    if (githubWrites.length && githubProfileMarkers.length !== 1) {
      blockers.push(`${label}: write-capable GitHub authority requires exactly one github.profile.<profile-id> marker`);
    }
    if (githubProfileMarkers.length === 1) {
      const profileId = githubProfileMarkers[0].slice("github.profile.".length);
      const profile = githubProfiles.get(profileId);
      if (!profile) blockers.push(`${label}: GitHub profile marker references unknown profile ${profileId}`);
      else {
        const allowed = new Set(arrayOrEmpty(profile.githubAuthority?.allowedCapabilities));
        for (const capability of githubCapabilities) {
          if (!allowed.has(capability)) blockers.push(`${label}: ${capability} exceeds GitHub profile ${profileId}`);
        }
      }
    }
  }
  if (graphHasCycle(nodes, (node) => (node.parentId ? [node.parentId] : []))) blockers.push("parent graph contains a cycle");
  if (graphHasCycle(nodes, (node) => arrayOrEmpty(node.dependencies))) blockers.push("dependency graph contains a cycle");
  if (graphHasCycle(nodes, (node) => [...(node.parentId ? [node.parentId] : []), ...arrayOrEmpty(node.dependencies)])) {
    blockers.push("orchestration graph contains a parent/dependency cycle");
  }
  for (const node of nodes) {
    for (const dependencyId of arrayOrEmpty(node.dependencies)) {
      const dependency = nodesById.get(dependencyId);
      if (!dependency) continue;
      if (isAncestor(dependencyId, node, nodesById) || isAncestor(node.id, dependency, nodesById)) {
        blockers.push(`node ${node.id}: dependency ${dependencyId} crosses the parent hierarchy`);
      }
    }
  }
  if (Number.isInteger(maxDelegationDepth)) {
    for (const node of nodes) {
      let depth = 0;
      let current = node;
      const seen = new Set();
      while (current?.parentId && !seen.has(current.id)) {
        seen.add(current.id);
        depth += 1;
        current = nodesById.get(current.parentId);
      }
      if (depth > maxDelegationDepth) blockers.push(`node ${node.id}: delegation depth ${depth} exceeds project limit ${maxDelegationDepth}`);
    }
  }
  if (Number.isInteger(maxActiveNodes)) {
    const activeNodes = nodes.filter((node) => ACTIVE_STATES.has(node.state)).length;
    if (activeNodes > maxActiveNodes) blockers.push(`${activeNodes} active nodes exceed project limit ${maxActiveNodes}`);
    const occupiedNodes = nodes.filter((node) => ACTIVE_STATES.has(node.state) || hasLaunchReservation(node)).length;
    if (occupiedNodes > maxActiveNodes) blockers.push(`${occupiedNodes} active or reserved nodes exceed project limit ${maxActiveNodes}`);
  }
  for (const parent of nodes) {
    if (!isObject(parent.authority) || !Number.isInteger(parent.authority.maxActiveChildren)) continue;
    const children = nodes.filter((node) => node.parentId === parent.id);
    const activeChildren = children.filter((node) => ACTIVE_STATES.has(node.state)).length;
    if (activeChildren > parent.authority.maxActiveChildren) {
      blockers.push(`node ${parent.id}: ${activeChildren} active children exceed maxActiveChildren ${parent.authority.maxActiveChildren}`);
    }
    const occupiedChildren = children.filter((node) => ACTIVE_STATES.has(node.state) || hasLaunchReservation(node)).length;
    if (occupiedChildren > parent.authority.maxActiveChildren) {
      blockers.push(`node ${parent.id}: ${occupiedChildren} active or reserved children exceed maxActiveChildren ${parent.authority.maxActiveChildren}`);
    }
    if (["terminal", "ready-for-parent"].includes(parent.state) && children.some((node) => node.state !== "terminal")) {
      blockers.push(`node ${parent.id}: ${parent.state} parent has non-terminal children`);
    }
  }
  return { blockers, warnings, nodes, nodesById };
}

function validateLoadedRegistry(loaded) {
  const findings = validateRegistry(loaded.registry);
  if (loaded.source === "tracked-example") findings.blockers.push(...validateTrackedExampleRegistry(loaded.registry));
  return findings;
}

export function validateCurrentOrchestrationRegistry() {
  const loaded = loadRegistry({ liveRequired: true, selection: environmentLocalSelection(), trackedExampleOnly: false });
  if (!loaded.exists) return { registry: null, blockers: [loaded.error || `missing ${registryLabel(loaded)}`], warnings: [], nodes: [], nodesById: new Map() };
  if (loaded.error) return { registry: null, blockers: [`invalid registry: ${loaded.error}`], warnings: [], nodes: [], nodesById: new Map() };
  return { registry: loaded.registry, ...validateRegistry(loaded.registry) };
}

function printHelp(io) {
  io.stdout("Usage: ./{{CLI_NAME}} orchestration <command> [argument] [--operator <name>] [--instance <name>] [--example]");
  io.stdout("");
  io.stdout("Commands:");
  io.stdout("  status             Summarize configured project orchestration");
  io.stdout("  instances          List private orchestration instances for one operator");
  io.stdout("  init [name]        Create a private inactive instance from the tracked example");
  io.stdout("  migrate [name]     Copy a legacy tracked registry into a private instance");
  io.stdout("  adapter-status     Inspect Codex-native Firstmate adapter posture");
  io.stdout("  taxonomy           Preview presentation profiles and task-title grammar");
  io.stdout("  hierarchy          Show role, title, and parent-link taxonomy");
  io.stdout("  trust              Show the T0-T5 trust ladder and inheritance rules");
  io.stdout("  validate           Validate registry structure, state, trust, and authority");
  io.stdout("  liveness           Show progress, retry, and recovery-loop posture");
  io.stdout("  report             Compute a private-live per-lane report without storing observations");
  io.stdout("  reconcile          Diff private-live claims from observations; propose transitions only");
  io.stdout("  directives         Show governed direct owner instructions and reconciliation state");
  io.stdout("  next               List dependency-eligible nodes");
  io.stdout("  prompt boss        Print a bounded Boss prompt");
  io.stdout("  prompt <node-id>   Print a bounded prompt for a configured node");
  io.stdout("  launch-spec <id>   Print a JSON task-creation contract for a client adapter");
  io.stdout("");
  io.stdout("init and migrate only create a private 0600 local instance; all other commands are read-only and no command creates tasks or mutates external systems.");
  io.stdout("report and reconcile require a selected private live instance; --example explicitly inspects the tracked inactive contract offline.");
  io.stdout("--example forces status, validate, adapter-status, taxonomy, liveness, report, or reconcile to inspect the tracked inactive example without resolving private runtime state.");
  io.stdout("Use --operator/--instance for orchestration commands or REPO_ORCHESTRATION_OPERATOR/REPO_ORCHESTRATION_INSTANCE for composing facades; raw state paths are unsupported.");
}

function livenessOwnerFor(registry, node, nodesById) {
  const parent = node.parentId ? nodesById.get(node.parentId) : null;
  const ownerRef = livenessOwnerRef(registry, node, parent);
  if (!ownerRef) return "missing-owner";
  return node.role === "boss" || !isTaskBackedNode(parent)
    ? `project-owner:${ownerRef}`
    : `parent-task:${ownerRef}`;
}

function controlLoopCondition(node, policy) {
  if (!ACTIVE_STATES.has(node.state)) return "not-active";
  if (!policy || !isObject(node.controlLoop)) return "unconfigured";
  const failurePreconditionMatches = node.controlLoop.lastFailurePreconditionFingerprint
    && node.controlLoop.lastFailurePreconditionFingerprint === node.controlLoop.preconditionFingerprint;
  const stagnated = Number.isInteger(node.controlLoop.unchangedChecks)
    && Number.isInteger(policy.maxUnchangedChecks)
    && node.controlLoop.unchangedChecks >= policy.maxUnchangedChecks;
  const retriesExhausted = Number.isInteger(node.controlLoop.sameFailureRetries)
    && Number.isInteger(policy.maxSameFailureRetries)
    && node.controlLoop.sameFailureRetries >= policy.maxSameFailureRetries
    && node.controlLoop.lastFailureFingerprint
    && failurePreconditionMatches;
  if (stagnated || retriesExhausted) return "blocked-budget-exhausted";
  if (node.controlLoop.checkMode === "event") {
    if (isUtcRfc3339Timestamp(node.controlLoop.watchdogAt)
      && Date.parse(node.controlLoop.watchdogAt) <= Date.now()) {
      return "event-watchdog-overdue";
    }
    return "waiting-for-event";
  }
  if (isUtcRfc3339Timestamp(node.controlLoop.nextCheckAt)
    && Date.parse(node.controlLoop.nextCheckAt) <= Date.now()) {
    return "scheduled-overdue";
  }
  return "scheduled";
}

function runLiveness(io) {
  const loaded = loadRegistry();
  if (!loaded.exists || loaded.error) {
    io.stdout("configured: false");
    io.stdout(`reason: ${toonString(loaded.error || `missing ${registryLabel(loaded)}`)}`);
    return 1;
  }
  const findings = validateLoadedRegistry(loaded);
  const policy = loaded.registry.controlLoopPolicy;
  io.stdout(`configured: ${Boolean(policy)}`);
  io.stdout(`registry: ${toonString(registryLabel(loaded))}`);
  io.stdout(`progress_signal: ${toonString(policy?.progressSignal || "unconfigured")}`);
  io.stdout(`quiet_activity_counts_as_progress: ${policy?.quietActivityCountsAsProgress === true}`);
  io.stdout(`max_unchanged_checks: ${Number.isInteger(policy?.maxUnchangedChecks) ? policy.maxUnchangedChecks : -1}`);
  io.stdout(`max_same_failure_retries: ${Number.isInteger(policy?.maxSameFailureRetries) ? policy.maxSameFailureRetries : -1}`);
  io.stdout(`max_control_interval_seconds: ${Number.isInteger(policy?.maxControlIntervalSeconds) ? policy.maxControlIntervalSeconds : -1}`);
  io.stdout(`shared_runtime_pre_action_compare: ${policy?.sharedRuntimeRecovery?.requirePreActionCompare === true}`);
  io.stdout(`max_shared_runtime_claim_lease_seconds: ${Number.isInteger(policy?.sharedRuntimeRecovery?.maxClaimLeaseSeconds) ? policy.sharedRuntimeRecovery.maxClaimLeaseSeconds : -1}`);
  io.stdout(`shared_runtime_scoped_claim_required: ${policy?.sharedRuntimeRecovery?.requireRuntimeScopedClaim === true}`);
  io.stdout(`shared_runtime_admission_closure_required: ${policy?.sharedRuntimeRecovery?.requireAdmissionClosure === true}`);
  io.stdout(`shared_runtime_unmanaged_start_behavior: ${toonString(policy?.sharedRuntimeRecovery?.unmanagedStartBehavior || "unconfigured")}`);
  io.stdout(`nodes[${findings.nodes.length}]{id,state,liveness_owner,condition,owner_action_required,check_mode,unchanged_checks,same_failure_retries,next_control}:`);
  let overdueControls = 0;
  for (const node of findings.nodes) {
    const control = node.controlLoop;
    const nextControl = control?.checkMode === "event"
      ? `${control.wakeEvent || ""}${control.watchdogAt ? ` (watchdog ${control.watchdogAt})` : ""}`
      : control?.nextCheckAt || "";
    const condition = controlLoopCondition(node, policy);
    const ownerActionRequired = condition === "blocked-budget-exhausted"
      || condition === "scheduled-overdue"
      || condition === "event-watchdog-overdue";
    if (condition === "scheduled-overdue" || condition === "event-watchdog-overdue") overdueControls += 1;
    io.stdout(`  ${toonString(node.id)},${toonString(node.state)},${toonString(livenessOwnerFor(loaded.registry, node, findings.nodesById))},${toonString(condition)},${ownerActionRequired},${toonString(control?.checkMode || "")},${Number.isInteger(control?.unchangedChecks) ? control.unchangedChecks : -1},${Number.isInteger(control?.sameFailureRetries) ? control.sameFailureRetries : -1},${toonString(nextControl)}`);
  }
  const recoveryReceipts = arrayOrEmpty(loaded.registry.sharedRuntimeRecoveryReceipts);
  io.stdout(`shared_runtime_recovery_claims[${recoveryReceipts.length}]{id,runtime_scope,status,claim_owner,condition,owner_action_required,claim_expires_at,admission_closed_at,admission_reopened_at}:`);
  let recoveryClaimsRequiringAction = 0;
  for (const receipt of recoveryReceipts) {
    let condition = receipt?.status || "invalid";
    if (receipt?.status === "prepared"
      && isUtcRfc3339Timestamp(receipt.comparedAt)
      && Number.isInteger(policy?.sharedRuntimeRecovery?.maxReceiptAgeSeconds)
      && Date.now() - Date.parse(receipt.comparedAt) > policy.sharedRuntimeRecovery.maxReceiptAgeSeconds * 1000) {
      condition = "prepared-comparison-stale";
    } else if (receipt?.status === "started"
      && isUtcRfc3339Timestamp(receipt.claimExpiresAt)
      && Date.parse(receipt.claimExpiresAt) <= Date.now()) {
      condition = "started-claim-expired";
    }
    const ownerActionRequired = condition === "prepared-comparison-stale"
      || condition === "started-claim-expired";
    if (ownerActionRequired) recoveryClaimsRequiringAction += 1;
    io.stdout(`  ${toonString(receipt?.id || "")},${toonString(receipt?.runtimeScopeRef || "")},${toonString(receipt?.status || "")},${toonString(receipt?.claimOwnerRef || "")},${toonString(condition)},${ownerActionRequired},${toonString(receipt?.claimExpiresAt || "")},${toonString(receipt?.admissionClosedAt || "")},${toonString(receipt?.admissionReopenedAt || "")}`);
  }
  printFindings(io, findings);
  if (overdueControls) io.stdout(`owner_action_required: ${overdueControls} overdue control${overdueControls === 1 ? "" : "s"}`);
  if (recoveryClaimsRequiringAction) {
    io.stdout(`owner_action_required: ${recoveryClaimsRequiringAction} stale or expired shared-runtime recovery claim${recoveryClaimsRequiringAction === 1 ? "" : "s"}`);
  }
  return findings.blockers.length || overdueControls || recoveryClaimsRequiringAction ? 1 : 0;
}

function completionProfileCoverageBlockers(nodes, completionProfiles) {
  const blockers = [];
  const expectedByType = new Map();
  for (const node of nodes) {
    if (node.role === "boss" || !isObject(node.completionProfile)) continue;
    const { type, requiredEvidence } = node.completionProfile;
    if (!COMPLETION_TYPES.has(type) || !isStringArray(requiredEvidence, { nonEmpty: true })) continue;
    const expected = expectedByType.get(type) || new Set();
    for (const evidence of requiredEvidence) expected.add(evidence);
    expectedByType.set(type, expected);
  }
  for (const [type, expected] of expectedByType) {
    const configured = completionProfiles[type];
    if (!isStringArray(configured, { nonEmpty: true })
      || !isDeepStrictEqual(canonicalValues(configured), [...expected].sort())) {
      blockers.push(`clientAdapter.completionProfiles.${type} must exactly cover registry required evidence`);
    }
  }
  return blockers;
}

function presentationTaxonomyBlockers(registry, adapter) {
  const blockers = [];
  const taxonomy = presentationTaxonomy(adapter);
  if (!taxonomy) {
    blockers.push("clientAdapter.presentationTaxonomy must select portable, nautical, or executive");
    return blockers;
  }
  if (!isNonEmptyString(taxonomy.repositoryIdentity)) {
    blockers.push("clientAdapter.presentationTaxonomy.repositoryIdentity is required");
  }
  if (taxonomy.profile === "executive") {
    if (!isStringArray(taxonomy.managerCatalog, { nonEmpty: true })) {
      blockers.push("clientAdapter.presentationTaxonomy.managerCatalog must be a non-empty C-suite title catalog");
    }
    if (!isStringArray(taxonomy.workerCatalog, { nonEmpty: true })) {
      blockers.push("clientAdapter.presentationTaxonomy.workerCatalog must be a non-empty Worker title catalog");
    }
  }
  for (const node of arrayOrEmpty(registry.nodes)) {
    if (!isObject(node) || !ROLES.has(node.role)) continue;
    const displayRole = displayRoleForNode(node, taxonomy);
    if (taxonomy.profile === "executive") {
      if (node.role === "boss" && node.displayRole !== undefined && node.displayRole !== "CEO") {
        blockers.push(`node ${node.id || "<missing-id>"}: executive Boss displayRole must be CEO when configured`);
      }
      if (node.role === "manager" && !arrayOrEmpty(taxonomy.managerCatalog).includes(displayRole)) {
        blockers.push(`node ${node.id || "<missing-id>"}: executive Manager displayRole must be in managerCatalog`);
      }
      if (node.role === "worker" && !arrayOrEmpty(taxonomy.workerCatalog).includes(displayRole)) {
        blockers.push(`node ${node.id || "<missing-id>"}: executive Worker displayRole must be in workerCatalog`);
      }
    } else if (node.displayRole !== undefined && node.displayRole !== displayRole) {
      blockers.push(`node ${node.id || "<missing-id>"}: ${taxonomy.profile} displayRole must remain ${displayRole}`);
    }
  }
  return blockers;
}

function firstmatePinPolicyBlockers(adapter) {
  const retention = adapter?.retention;
  if (isObject(retention)
    && retention.pinBoss === true
    && retention.pinNonterminalManagers === true
    && retention.pinWorkers === false
    && retention.managerUnpinPolicy === "after-terminal-landed-work-evidence-and-parent-reconciliation"
    && retention.reconcilePinDrift === true) {
    return [];
  }
  return ["clientAdapter.retention must pin the resident Boss and nonterminal Managers, never pin Workers, unpin terminal Managers only after evidence and parent reconciliation, and reconcile pin drift"];
}

function firstmateTaskPinLifecycle(registry, node) {
  if (!isCodexNativeFirstmateAdapter(registry.clientAdapter)) return null;
  const initialState = node.role === "boss" || node.role === "manager" ? "pinned" : "unpinned";
  const terminalManagerRequirements = [
    "terminal completion evidence satisfies the completion profile",
    "completion profile's landed-work evidence is recorded",
    "immediate-parent reconciliation is recorded"
  ];
  const requiredStateTransitions = node.role === "boss"
    ? [{ requiredState: "pinned", while: "materialized-resident" }]
    : node.role === "manager"
      ? [
          { requiredState: "pinned", while: "materialized-nonterminal" },
          { requiredState: "unpinned", afterAll: terminalManagerRequirements }
        ]
      : [{ requiredState: "unpinned", while: "always" }];
  return {
    initialState,
    requiredWhile: node.role === "boss"
      ? "materialized-resident"
      : node.role === "manager"
        ? "materialized-nonterminal"
        : "never",
    requiredStateTransitions,
    terminalManagerUnpin: node.role === "manager" ? {
      allowedOnlyAfter: terminalManagerRequirements
    } : { allowed: false },
    driftReconciliation: {
      inspectDuring: "each bounded parent control check",
      correctTo: "current-required-state",
      countsAsProgress: false
    }
  };
}

function firstmateActivationBlockers(registry, adapter, { materializingNodeId = null } = {}) {
  const blockers = [];
  if (!isObject(registry) || registry.status !== "active") {
    blockers.push("orchestration must be active");
  }
  if (!isObject(adapter) || adapter.profile !== CODEX_FIRSTMATE_PROFILE || adapter.status !== "active") {
    blockers.push("clientAdapter must select an active codex-native-firstmate profile");
    return blockers;
  }

  blockers.push(...legacyTaskBindingInventoryBlockers(registry, adapter, new Map(arrayOrEmpty(registry.nodes)
    .filter(isObject)
    .filter((node) => isNonEmptyString(node.id))
    .map((node) => [node.id, node]))));

  const bosses = arrayOrEmpty(registry.nodes).filter((node) => isObject(node) && node.role === "boss");
  const optionalUnmaterializedBoss = bosses.length === 1
    && rootMaterializationFor(registry) === "optional"
    && !isTaskBackedNode(bosses[0]);
  const bossBeingMaterialized = bosses.length === 1
    && bosses[0].id === materializingNodeId
    && !isTaskBackedNode(bosses[0]);
  if (bosses.length !== 1 || (!optionalUnmaterializedBoss && !bossBeingMaterialized && !isTaskBackedNode(bosses[0]))) {
    blockers.push("one task-backed Firstmate Boss is required");
  } else if ((optionalUnmaterializedBoss || bossBeingMaterialized) && adapter.bossTaskId !== null) {
    blockers.push("clientAdapter.bossTaskId must remain null until the pending Boss task is materialized");
  } else if (!isNonEmptyString(adapter.bossTaskId) || adapter.bossTaskId !== bosses[0].taskId) {
    if (!optionalUnmaterializedBoss && !bossBeingMaterialized) blockers.push("clientAdapter.bossTaskId must match the task-backed Firstmate Boss");
  }

  if (typeof adapter.standingTaskCreationGrant !== "boolean") {
    blockers.push("clientAdapter.standingTaskCreationGrant must declare the task-creation posture");
  } else if (!adapter.standingTaskCreationGrant && !isNonEmptyString(adapter.taskCreationApprovalGate)) {
    blockers.push("clientAdapter.taskCreationApprovalGate is required without a standing task-creation grant");
  }
  if (!isObject(adapter.completionProfiles)
    || Object.keys(adapter.completionProfiles).length === 0
    || Object.entries(adapter.completionProfiles).some(([type, evidence]) => !COMPLETION_TYPES.has(type) || !isStringArray(evidence, { nonEmpty: true }))) {
    blockers.push("clientAdapter.completionProfiles must configure supported profiles with required evidence");
  } else {
    blockers.push(...completionProfileCoverageBlockers(arrayOrEmpty(registry.nodes), adapter.completionProfiles));
  }
  blockers.push(...presentationTaxonomyBlockers(registry, adapter));
  if (!isNonEmptyString(adapter.baseRef)) blockers.push("clientAdapter.baseRef is required");

  const worktreePolicy = adapter.worktreePolicy;
  if (!isObject(worktreePolicy)
    || worktreePolicy.mode !== "managed"
    || worktreePolicy.parallelWrites !== "disjoint-only"
    || worktreePolicy.landedWorkProofRequiredBeforeArchive !== true) {
    blockers.push("clientAdapter.worktreePolicy must require managed, disjoint worktrees and landed-work proof before archive");
  }

  for (const integration of ["browserIntegration", "githubIntegration"]) {
    if (!isNonEmptyString(adapter[integration]) || adapter[integration] === "unconfigured") {
      blockers.push(`clientAdapter.${integration} must record a deliberate integration choice`);
    }
  }
  for (const boundary of ["browserAuthenticationBoundary", "githubAuthenticationBoundary"]) {
    if (!isNonEmptyString(adapter[boundary])) blockers.push(`clientAdapter.${boundary} is required`);
  }
  if (adapter.githubIntegration !== "not-used") {
    const policy = adapter.githubProfilePolicy;
    if (!isObject(policy)
      || !isNonEmptyString(policy.facadeCommand)
      || policy.requireNodeProfileBindingForWrites !== true
      || policy.forbidAmbientGlobalAuth !== true
      || !isNonEmptyString(policy.gitTransportBoundary)) {
      blockers.push("clientAdapter.githubProfilePolicy must configure the facade, node profile binding, ambient-auth refusal, and Git transport boundary");
    }
  }

  const heartbeat = adapter.heartbeat;
  if (!isObject(heartbeat)
    || !isNonEmptyString(heartbeat.mode)
    || heartbeat.mode === "disabled"
    || !isNonEmptyString(heartbeat.cadence)
    || !isNonEmptyString(heartbeat.registryMutator)) {
    blockers.push("clientAdapter.heartbeat must configure mode, cadence, and registry mutator");
  }

  const retention = adapter.retention;
  blockers.push(...firstmatePinPolicyBlockers(adapter));
  if (!isObject(retention)
    || !isNonEmptyString(retention.archivePolicy)
    || retention.archivePolicy === "unconfigured"
    || !isNonEmptyString(retention.handoffPolicy)) {
    blockers.push("clientAdapter.retention must configure handoff/archive policy");
  }
  if (!isNonEmptyString(adapter.reconciliationPolicy) || adapter.reconciliationPolicy === "unconfigured") {
    blockers.push("clientAdapter.reconciliationPolicy is required");
  }
  if (registry.schemaVersion >= 4 && registry.coordinationMode === "hybrid") {
    const direct = adapter.ownerDirectMessaging;
    const directTargetRoles = new Set(arrayOrEmpty(direct?.targetRoles));
    if (!isObject(direct)
      || direct.enabled !== true
      || !isStringArray(direct.targetRoles, { nonEmpty: true })
      || direct.targetRoles.length !== 2
      || directTargetRoles.size !== 2
      || !["manager", "worker"].every((role) => directTargetRoles.has(role))
      || direct.recordDirectivesInRegistry !== true
      || direct.parentReconciliationRequired !== true
      || direct.authorityExpansionFromMessage !== false) {
      blockers.push("hybrid Firstmate coordination requires ownerDirectMessaging with governed registry records, parent reconciliation, and no authority expansion from messages");
    }
  }

  const attestorError = bindingAttestationConfigError(registry);
  if (attestorError) blockers.push(`binding assurance is required: ${attestorError}`);
  return blockers;
}

function runAdapterStatus(io) {
  const loaded = loadRegistry();
  const adapter = isObject(loaded.registry?.clientAdapter) ? loaded.registry.clientAdapter : null;
  const assets = CODEX_FIRSTMATE_ASSETS.map((relPath) => ({
    path: relPath,
    present: fs.existsSync(path.join(CONFIG.repoRoot, relPath))
  }));
  const presentCount = assets.filter((asset) => asset.present).length;
  const selected = adapter?.profile === CODEX_FIRSTMATE_PROFILE;
  const registryFindings = validateLoadedRegistry(loaded);
  const registryValid = Boolean(loaded.exists && !loaded.error && registryFindings.blockers.length === 0);
  const activationBlockers = registryValid
    ? firstmateActivationBlockers(loaded.registry, adapter)
    : ["registry must be valid", ...registryFindings.blockers];
  if (presentCount !== assets.length) activationBlockers.push("all Firstmate profile assets must be present");

  io.stdout(`profile: ${toonString(CODEX_FIRSTMATE_PROFILE)}`);
  io.stdout(`registry: ${toonString(registryLabel(loaded))}`);
  io.stdout(`registry_source: ${toonString(loaded.source)}`);
  io.stdout(`registry_state: ${toonString(!loaded.exists ? "missing" : loaded.error ? "invalid" : loaded.live ? loaded.registry.status : "inactive-example")}`);
  io.stdout(`registry_valid: ${registryValid}`);
  io.stdout(`adapter_state: ${toonString(!adapter ? "unconfigured" : adapter.status)}`);
  io.stdout(`adapter_selected: ${selected}`);
  io.stdout(`repo_local_scope: true`);
  io.stdout(`assets_present: ${presentCount}`);
  io.stdout(`assets_expected: ${assets.length}`);
  io.stdout(`assets[${assets.length}]{path,present}:`);
  for (const asset of assets) io.stdout(`  ${toonString(asset.path)},${asset.present}`);
  io.stdout("native_capabilities[10]{capability,detection,status}:");
  io.stdout('  "persistent tasks","Codex client runtime","verify before activation"');
  io.stdout('  "managed worktrees","Codex client runtime","verify before activation"');
  io.stdout('  "task title/pin/archive/handoff","Codex client runtime","resident Boss and nonterminal Managers pinned; Workers never pinned"');
  io.stdout('  "at-most-once task materialization broker","repository-private Codex adapter","required; native create has no idempotency key and ambiguous issuance never retries"');
  io.stdout('  "Goal mode","Codex client runtime","optional"');
  io.stdout('  "subagents","Codex client runtime","read-heavy helpers only"');
  io.stdout('  "automations/heartbeats","Codex client runtime","disabled until configured"');
  io.stdout('  "hooks","Codex client runtime","optional guardrail adapter"');
  io.stdout('  "Browser","Codex client runtime","unconfigured"');
  io.stdout('  "Git UI/integration","Codex client runtime","unconfigured"');
  io.stdout("required_external_dependencies[0]:");
  io.stdout("optional_adapters[6]:");
  io.stdout('  "no-mistakes (repository-merge completion gate)"');
  io.stdout('  "GitHub connector or CLI"');
  io.stdout('  "Chrome"');
  io.stdout('  "Lavish"');
  io.stdout('  "Treehouse/tmux for non-Codex adapters"');
  io.stdout('  "Codex app-server headless fallback"');
  io.stdout(`orchestration_active: ${Boolean(registryValid && loaded.registry?.status === "active")}`);
  io.stdout(`activation_ready: ${activationBlockers.length === 0}`);
  io.stdout(`activation_blockers[${activationBlockers.length}]:`);
  for (const blocker of activationBlockers) io.stdout(`  ${toonString(blocker)}`);
  io.stdout(renderHelpBlock([
    `Read ops/protocols/CODEX-NATIVE-FIRSTMATE.md`,
    `Configure the repo-local adapter deliberately before activation`,
    `Run ./${CONFIG.cliName} orchestration validate`
  ]));
  return loaded.error ? 1 : 0;
}

function runTaxonomy(io) {
  const loaded = loadRegistry();
  if (!loaded.exists || loaded.error) {
    io.stdout('valid: false');
    io.stdout(`registry: ${toonString(registryLabel(loaded))}`);
    io.stdout(`error: ${toonString(loaded.error || `missing ${registryLabel(loaded)}`)}`);
    return 1;
  }
  const taxonomy = presentationTaxonomy(loaded.registry?.clientAdapter);
  const managerCatalog = arrayOrEmpty(taxonomy?.managerCatalog || DEFAULT_EXECUTIVE_MANAGER_CATALOG);
  const workerCatalog = arrayOrEmpty(taxonomy?.workerCatalog || DEFAULT_EXECUTIVE_WORKER_CATALOG);
  io.stdout(`selected_profile: ${toonString(taxonomy?.profile || "portable")}`);
  io.stdout(`repository_identity: ${toonString(taxonomy?.repositoryIdentity || "configure before activation")}`);
  io.stdout("profiles[3]{profile,boss,manager,worker}:");
  io.stdout('  "portable","Boss","Manager","Worker"');
  io.stdout('  "nautical","Firstmate","Secondmate","Crewmate"');
  io.stdout('  "executive","CEO","configured C-suite title","configured Director, Lead, or Contributor title"');
  io.stdout(`executive_manager_catalog[${managerCatalog.length}]:`);
  for (const title of managerCatalog) io.stdout(`  ${toonString(title)}`);
  io.stdout(`executive_worker_catalog[${workerCatalog.length}]:`);
  for (const title of workerCatalog) io.stdout(`  ${toonString(title)}`);
  io.stdout('title_grammar: "<repository identity> - <display role> - <scope-or-workstream>/<node id>"');
  io.stdout("rules[3]:");
  io.stdout('  "Canonical registry roles remain boss, manager, and worker"');
  io.stdout('  "Display labels never grant authority"');
  io.stdout('  "Create or adopt, rename, and verify the exact title before binding; title failure quarantines the reservation"');
  return 0;
}

function printFindings(io, findings) {
  io.stdout(`blockers[${findings.blockers.length}]:`);
  for (const blocker of findings.blockers) io.stdout(`  ${toonString(blocker)}`);
  io.stdout(`warnings[${findings.warnings.length}]:`);
  for (const warning of findings.warnings) io.stdout(`  ${toonString(warning)}`);
}

function runStatus(io) {
  const loaded = loadRegistry();
  if (!loaded.exists) {
    io.stdout('state: "unconfigured"');
    io.stdout(`registry: ${toonString(registryLabel(loaded))}`);
    if (loaded.error) io.stdout(`error: ${toonString(loaded.error)}`);
    io.stdout(renderHelpBlock([`Restore ${EXAMPLE_REGISTRY_REL_PATH} if it is missing`, `Run ./${CONFIG.cliName} orchestration init ${selectedLocalInstance.instance}`]));
    return loaded.error ? 1 : 0;
  }
  if (loaded.error) {
    io.stdout('state: "invalid"');
    io.stdout(`registry: ${toonString(registryLabel(loaded))}`);
    io.stdout(`error: ${toonString(loaded.error)}`);
    return 1;
  }
  const findings = validateLoadedRegistry(loaded);
  const counts = Object.fromEntries([...STATES].map((state) => [state, findings.nodes.filter((node) => node.state === state).length]));
  io.stdout(`state: ${toonString(loaded.live ? loaded.registry.status : "unconfigured")}`);
  io.stdout(`registry: ${toonString(registryLabel(loaded))}`);
  io.stdout(`registry_source: ${toonString(loaded.source)}`);
  io.stdout(`store_kind: ${toonString(loaded.location?.kind || "tracked-example-only")}`);
  io.stdout(`operator: ${toonString(loaded.location?.operator || "not-applicable")}`);
  io.stdout(`instance: ${toonString(loaded.location?.instance || "not-applicable")}`);
  io.stdout(`prefix: ${toonString(loaded.registry.prefix || "")}`);
  io.stdout(`scope: ${toonString(loaded.registry.scope?.id || "")}`);
  io.stdout(`scope_kind: ${toonString(loaded.registry.scope?.kind || "")}`);
  io.stdout(`coordination_mode: ${toonString(coordinationModeFor(loaded.registry))}`);
  io.stdout(`root_materialization: ${toonString(rootMaterializationFor(loaded.registry))}`);
  io.stdout(`owner_ref: ${toonString(loaded.registry.scope?.ownerRef || "unconfigured")}`);
  io.stdout(`owner_directives: ${governedOwnerDirectives(loaded.registry).length}`);
  io.stdout(`client_adapter: ${toonString(loaded.registry.clientAdapter?.profile || "unconfigured")}`);
  io.stdout(`nodes: ${findings.nodes.length}`);
  io.stdout(`bosses: ${findings.nodes.filter((node) => node.role === "boss").length}`);
  io.stdout(`managers: ${findings.nodes.filter((node) => node.role === "manager").length}`);
  io.stdout(`workers: ${findings.nodes.filter((node) => node.role === "worker").length}`);
  io.stdout("states:");
  for (const [state, count] of Object.entries(counts)) io.stdout(`  ${state}: ${count}`);
  printFindings(io, findings);
  io.stdout(renderHelpBlock([`Run ./${CONFIG.cliName} orchestration validate`, `Run ./${CONFIG.cliName} orchestration next`]));
  return findings.blockers.length ? 1 : 0;
}

function runReport(io, options = {}) {
  const loaded = loadRegistry({ liveRequired: !selectedTrackedExample });
  if (!loaded.exists || loaded.error) {
    io.stdout("orchestration_report:");
    io.stdout('  mode: "read-only"');
    io.stdout('  authority: "none"');
    io.stdout('  observations_cached: false');
    io.stdout(`  registry: ${toonString(registryLabel(loaded))}`);
    io.stdout(`  error: ${toonString(loaded.error || `missing ${registryLabel(loaded)}`)}`);
    return 1;
  }
  const findings = validateLoadedRegistry(loaded);
  if (findings.blockers.length) {
    io.stdout("orchestration_report:");
    io.stdout('  mode: "read-only"');
    io.stdout('  authority: "none"');
    io.stdout('  observations_cached: false');
    io.stdout(`  registry: ${toonString(registryLabel(loaded))}`);
    printFindings(io, findings);
    return 1;
  }
  const report = collectOrchestrationReport(loaded.registry, {
    repoRoot: CONFIG.repoRoot,
    observationRunner: options.observationRunner,
    now: options.now,
    offline: loaded.source === "tracked-example"
  });
  renderOrchestrationReport(report, io, registryLabel(loaded));
  return 0;
}

function runReconcile(io, options = {}) {
  const loaded = loadRegistry({ liveRequired: !selectedTrackedExample });
  if (!loaded.exists || loaded.error) {
    io.stdout("orchestration_reconcile:");
    io.stdout('  mode: "read-only"');
    io.stdout('  authority: "none"');
    io.stdout("  applied: 0");
    io.stdout(`  registry: ${toonString(registryLabel(loaded))}`);
    io.stdout(`  error: ${toonString(loaded.error || `missing ${registryLabel(loaded)}`)}`);
    return 1;
  }
  const findings = validateLoadedRegistry(loaded);
  if (findings.blockers.length) {
    io.stdout("orchestration_reconcile:");
    io.stdout('  mode: "read-only"');
    io.stdout('  authority: "none"');
    io.stdout("  applied: 0");
    io.stdout(`  registry: ${toonString(registryLabel(loaded))}`);
    printFindings(io, findings);
    return 1;
  }
  const report = collectOrchestrationReport(loaded.registry, {
    repoRoot: CONFIG.repoRoot,
    observationRunner: options.observationRunner,
    now: options.now,
    offline: loaded.source === "tracked-example"
  });
  const reconciliation = reconcileOrchestrationReport(report);
  renderOrchestrationReconcile(reconciliation, io, registryLabel(loaded), report.now);
  return reconciliation.hardErrors.length ? 1 : 0;
}

function runDirectives(io) {
  const loaded = loadRegistry({ liveRequired: true });
  if (!loaded.exists || loaded.error) {
    io.stdout("directives: 0");
    io.stdout(`reason: ${toonString(loaded.error || `missing ${registryLabel(loaded)}`)}`);
    return 1;
  }
  const findings = validateRegistry(loaded.registry);
  const directives = governedOwnerDirectives(loaded.registry);
  io.stdout(`coordination_mode: ${toonString(coordinationModeFor(loaded.registry))}`);
  io.stdout(`directives: ${directives.length}`);
  io.stdout(`records[${directives.length}]{id,target_node,target_task_at_issue,target_parent,target_parent_task_at_issue,impact,status,acknowledged_at,acknowledged_by_node,acknowledged_by_task,acknowledgement_ref,resolution_ref,resolved_at,resolved_by_node,resolved_by_task,parent_observed_at,parent_observed_by_node,parent_observed_by_task,parent_reconciliation_ref,directive_ref}:`);
  for (const directive of directives) {
    io.stdout(`  ${toonString(directive.id || "")},${toonString(directive.targetNodeId || "")},${toonString(directive.targetTaskIdAtIssue || "")},${toonString(directive.targetParentIdAtIssue || "")},${toonString(directive.targetParentTaskIdAtIssue || "")},${toonString(directive.contractImpact || "")},${toonString(directive.status || "")},${toonString(directive.acknowledgedAt || "")},${toonString(directive.acknowledgedByNodeId || "")},${toonString(directive.acknowledgedByTaskId || "")},${toonString(directive.acknowledgementRef || "")},${toonString(directive.resolutionRef || "")},${toonString(directive.resolvedAt || "")},${toonString(directive.resolvedByNodeId || "")},${toonString(directive.resolvedByTaskId || "")},${toonString(directive.parentObservedAt || "")},${toonString(directive.parentObservedByNodeId || "")},${toonString(directive.parentObservedByTaskId || "")},${toonString(directive.parentReconciliationRef || "")},${toonString(directive.directiveRef || "")}`);
  }
  if (!directives.length) io.stdout('message: "No governed owner directives"');
  printFindings(io, findings);
  return findings.blockers.length ? 1 : 0;
}

function runHierarchy(io) {
  io.stdout("roles[3]{role,work_shape,title_pattern}:");
  io.stdout('  "Boss","portfolio","<PREFIX> - Boss"');
  io.stdout('  "Manager","workstream","<PREFIX> - Manager - <WORK-REF> <area>"');
  io.stdout('  "Worker","work unit","<PREFIX> - Worker for <PARENT-ROLE> <PARENT-WORK-REF> - <WORK-REF> <responsibility>"');
  io.stdout("rules[4]:");
  io.stdout('  "One logical Boss per project"');
  io.stdout('  "Task-bound children record the immediate parent task; schema-v5 logical Managers may bind to an optional unmaterialized Boss root"');
  io.stdout('  "Role defines responsibility; trust and authority define permission"');
  io.stdout('  "Goal chains, research, operations, and artifacts are completion profiles, not separate hierarchies"');
  return 0;
}

function runTrust(io) {
  io.stdout(`levels[${TRUST_LEVELS.length}]{level,name,maximum_default_authority}:`);
  for (const level of TRUST_LEVELS) io.stdout(`  ${toonString(level.id)},${toonString(level.name)},${toonString(level.authority)}`);
  io.stdout("rules[4]:");
  io.stdout('  "A role never grants authority"');
  io.stdout('  "Children may not exceed parent trust, authority scope, or delegation budget"');
  io.stdout('  "Promotion requires recorded evidence and configured human approval"');
  io.stdout('  "Demotion or revocation may be immediate"');
  return 0;
}

function runValidate(io) {
  const loaded = loadRegistry();
  if (!loaded.exists) {
    io.stdout('valid: false');
    io.stdout(`blockers[1]: ${toonString(loaded.error || `missing ${registryLabel(loaded)}`)}`);
    return 1;
  }
  if (loaded.error) {
    io.stdout('valid: false');
    io.stdout(`blockers[1]: ${toonString(`invalid registry: ${loaded.error}`)}`);
    return 1;
  }
  const findings = validateLoadedRegistry(loaded);
  io.stdout(`valid: ${findings.blockers.length === 0}`);
  io.stdout(`target: ${toonString(loaded.source)}`);
  io.stdout(`registry: ${toonString(registryLabel(loaded))}`);
  io.stdout(`state: ${toonString(loaded.registry.status)}`);
  io.stdout(`nodes: ${findings.nodes.length}`);
  printFindings(io, findings);
  return findings.blockers.length ? 1 : 0;
}

function dependenciesSatisfied(node, nodesById) {
  if (!Array.isArray(node.dependencies)) return false;
  return arrayOrEmpty(node.dependencies).every((dependency) => {
    const prerequisite = nodesById.get(dependency);
    return prerequisite?.state === "terminal" && prerequisite.terminalDisposition === "completed";
  });
}

function runNext(io) {
  const loaded = loadRegistry({ liveRequired: true });
  if (!loaded.exists || loaded.error) {
    io.stdout("eligible: 0");
    io.stdout(`reason: ${toonString(loaded.error || `missing ${registryLabel(loaded)}`)}`);
    return 1;
  }
  const findings = validateRegistry(loaded.registry);
  if (findings.blockers.length) {
    io.stdout("eligible: 0");
    printFindings(io, findings);
    return 1;
  }
  const eligible = findings.nodes.filter((node) => {
    if (!["queued", "eligible"].includes(node.state) || hasLaunchReservation(node)) return false;
    const parent = node.parentId ? findings.nodesById.get(node.parentId) : null;
    return launchEligibilityBlockers({
      registry: loaded.registry,
      node,
      parent,
      nodes: findings.nodes,
      nodesById: findings.nodesById,
      maxActiveNodes: loaded.registry.trustPolicy.limits.maxActiveNodes,
      mode: "launch"
    }).length === 0;
  });
  io.stdout(`eligible: ${eligible.length}`);
  io.stdout(`nodes[${eligible.length}]{id,role,work_ref,work_kind,state,title}:`);
  for (const node of eligible) {
    io.stdout(`  ${toonString(node.id)},${toonString(node.role)},${toonString(node.workRef)},${toonString(node.workKind)},${toonString(node.state)},${toonString(node.title)}`);
  }
  if (!eligible.length) io.stdout('message: "No dependency-eligible nodes"');
  return 0;
}

function roleResponsibilities(role) {
  if (role === "boss") return [
    "Own portfolio health, dependency graph, Manager boundaries, escalation, and fan-in order.",
    "Create or activate Managers only within the configured trust and delegation envelope."
  ];
  if (role === "manager") return [
    "Own this bounded workstream, its child graph, evidence review, and parent handoff.",
    "Create or activate Workers only when delegation is authorized and work is independently scoped."
  ];
  return [
    "Own one bounded, independently verifiable outcome.",
    "Report progress, risks, evidence, and handoff to the immediate parent."
  ];
}

function resolvePromptNode(nodeId, loaded, findings) {
  return findings.nodesById.get(nodeId) || null;
}

function buildPromptLines(node, parent, registry) {
  const lines = [];
  lines.push(`Title: ${node.title}`);
  lines.push(`Node ID: ${node.id}`);
  lines.push(`Work reference: ${node.workRef}`);
  lines.push(`Work kind: ${node.workKind}`);
  lines.push(`Governing protocols: ${node.governingProtocols.join(", ")}`);
  lines.push(`Required skills (load in order): ${requiredSkillsFor(registry, node).join(", ")}`);
  lines.push(`Parent binding mode: ${node.parentBindingMode || "task"}`);
  lines.push(`Immediate parent task ID: ${logicalParentBinding(registry, node, parent) ? "logical-root" : parent?.taskId || "none"}`);
  lines.push(`Coordination mode: ${coordinationModeFor(registry)}`);
  const directives = openOwnerDirectivesFor(registry, node.id);
  const replanDirectiveIds = replanBoundaryDirectiveIdsFor(registry, node, new Map(registry.nodes.map((candidate) => [candidate.id, candidate])));
  lines.push(`Open owner directives: ${directives.map((directive) => `${directive.id} (${directive.contractImpact}; ${directive.directiveRef})`).join(", ") || "none"}`);
  lines.push(`State: ${node.state}`);
  lines.push(`Trust level: ${node.trustLevel}`);
  if (node.trustApproval) lines.push(`Trust approval: ${node.trustApproval.approvedBy} at ${node.trustApproval.approvedAt}`);
  lines.push(`Completion profile: ${node.completionProfile?.type || "portfolio-control"}`);
  lines.push("");
  lines.push("Authority envelope:");
  lines.push(`- Allowed reads: ${(node.authority.allowedReads || []).join(", ") || "none"}`);
  lines.push(`- Allowed writes: ${(node.authority.allowedWrites || []).join(", ") || "none"}`);
  lines.push(`- Allowed external actions: ${(node.authority.allowedExternalActions || []).join(", ") || "none"}`);
  lines.push(`- Approval gates: ${(node.authority.approvalGates || []).join(", ") || "none"}`);
  lines.push(`- Delegation: ${node.authority.canDelegate ? `allowed, max ${node.authority.maxActiveChildren} active children` : "not allowed"}`);
  lines.push(`- Stop conditions: ${(node.authority.stopConditions || []).join(", ") || "none"}`);
  lines.push("");
  lines.push("Objective:");
  lines.push(node.objective);
  lines.push("");
  lines.push("Role:");
  for (const responsibility of roleResponsibilities(node.role)) lines.push(`- ${responsibility}`);
  lines.push("- Role does not expand the authority envelope.");
  if (registry.controlLoopPolicy) {
    lines.push("- A heartbeat or quiet attached process is not progress. Update the evidence fingerprint only when Git, tracker, child, PR, check, or completion evidence materially changes.");
    lines.push(`- Stop and block for immediate-parent recovery after ${registry.controlLoopPolicy.maxUnchangedChecks} unchanged checks or ${registry.controlLoopPolicy.maxSameFailureRetries} retries of the same failure/precondition pair; another identical retry is forbidden until a changed precondition is recorded and the retry counter is reset.`);
  }
  lines.push("");
  lines.push("First action:");
  if (replanDirectiveIds.length) {
    lines.push(`- Stop at the owner-replan boundary for ${replanDirectiveIds.join(", ")}; do not execute further task work until replan or supersession is recorded and reconciled.`);
  } else {
    lines.push("- Read project instructions and governing domain protocols, confirm dependency inputs, then return a concise plan with target surfaces, risks, verification, evidence, and exit criteria before substantial work.");
  }
  return lines;
}

function loadPromptTarget(nodeId, io) {
  if (!nodeId) {
    renderUsageError(io, {
      code: "missing-node-id",
      command: "orchestration prompt",
      message: "Missing node id",
      hints: [`Run ./${CONFIG.cliName} orchestration prompt boss`, `Run ./${CONFIG.cliName} orchestration next`]
    });
    return { code: 2 };
  }
  const loaded = loadRegistry({ liveRequired: true });
  if (!loaded.exists || loaded.error) {
    io.stderr(loaded.error || `Missing ${registryLabel(loaded)}`);
    return { code: 1 };
  }
  const findings = validateRegistry(loaded.registry);
  if (findings.blockers.length) {
    io.stderr("Orchestration registry has blockers; run orchestration validate.");
    return { code: 1 };
  }
  const node = resolvePromptNode(nodeId, loaded, findings);
  if (!node) {
    io.stderr(`Orchestration node not found: ${nodeId}`);
    return { code: 1 };
  }
  if (node.state === "terminal") {
    io.stderr(`Node ${node.id} is terminal and should not be launched again without a successor node.`);
    return { code: 1 };
  }
  if (["queued", "eligible"].includes(node.state) && !dependenciesSatisfied(node, findings.nodesById)) {
    io.stderr(`Node ${node.id} is not dependency-eligible.`);
    return { code: 1 };
  }
  const parent = node.parentId ? findings.nodesById.get(node.parentId) : null;
  return { code: 0, node, parent, findings, loaded };
}

function runPrompt(nodeId, io) {
  const target = loadPromptTarget(nodeId, io);
  if (target.code !== 0) return target.code;
  for (const line of buildPromptLines(target.node, target.parent, target.loaded.registry)) io.stdout(line);
  return 0;
}

function runLaunchSpec(nodeId, io) {
  const target = loadPromptTarget(nodeId, io);
  if (target.code !== 0) return target.code;
  const { node, parent, findings, loaded } = target;
  const missingSkills = missingProjectLocalSkills(loaded.registry, node);
  if (missingSkills.length) {
    io.stderr(`Node ${node.id} is missing required project-local skills: ${missingSkills.join(", ")}.`);
    return 1;
  }
  const eligibilityBlocker = launchEligibilityBlockers({
    registry: loaded.registry,
    node,
    parent,
    nodes: findings.nodes,
    nodesById: findings.nodesById,
    maxActiveNodes: loaded.registry.trustPolicy.limits.maxActiveNodes,
    mode: "launch"
  })[0];
  if (eligibilityBlocker) {
    io.stderr(launchSpecFailure(node, parent, eligibilityBlocker));
    return 1;
  }
  const configured = findings.nodesById.has(node.id);
  const firstmate = isCodexNativeFirstmateAdapter(loaded.registry.clientAdapter);
  const logicalParent = logicalParentBinding(loaded.registry, node, parent);
  const activatesRegistry = activatesRegistryOnLaunch(loaded.registry, node, parent);
  const requiresLogicalManagerLivenessHandoff = node.role === "boss"
    && loaded.registry.schemaVersion >= 5
    && loaded.registry.rootControl?.materialization === "optional"
    && Boolean(loaded.registry.controlLoopPolicy);
  const logicalManagerLivenessHandoffUpdate =
    "atomically append hash-linked liveness-owner handoff observations to every active logical Manager controlLoop";
  const workContract = materializedWorkContract(loaded.registry, node, parent);
  const workContractHash = materializedWorkContractHash(loaded.registry, node, parent);
  const launchKey = launchKeyFor(loaded.registry, node, parent);
  const pinLifecycle = firstmateTaskPinLifecycle(loaded.registry, node);
  const reservation = {
    launchKey,
    workContract: { algorithm: "sha256", hash: workContractHash, payload: workContract },
    expectedRegistryRevision: loaded.registry.revision,
    expectedRegistryStatus: loaded.registry.status,
    expectedNode: {
      id: node.id,
      exists: configured,
      state: node.state,
      taskId: null,
      parentTaskId: null,
      launchReservation: null,
      trustLevel: node.trustLevel,
      authority: canonicalAuthority(node.authority)
    },
    expectedParent: parentSnapshot(parent),
    capacity: reservationCapacity(findings.nodes, parent, loaded.registry.trustPolicy.limits.maxActiveNodes)
  };
  const reservedRegistry = {
    ...loaded.registry,
    revision: loaded.registry.revision + 1,
    ...(activatesRegistry ? { status: "active" } : {})
  };
  const reservedNode = {
    ...node,
    launchReservation: { key: launchKey, baseRevision: loaded.registry.revision, workContractHash }
  };
  const reservedNodes = configured
    ? findings.nodes.map((candidate) => (candidate.id === node.id ? reservedNode : candidate))
    : [...findings.nodes, reservedNode];
  const reservedParent = parent ? reservedNodes.find((candidate) => candidate.id === parent.id) : null;
  const reservationValidity = reservationValidityFor(
    reservedRegistry,
    reservedNode,
    reservedParent,
    reservedNodes,
    loaded.registry.trustPolicy.limits.maxActiveNodes,
    reservedNode.launchReservation
  );
  const persistedReservation = {
    ...reservedNode.launchReservation,
    validity: reservationValidity
  };
  const issuanceRegistryRevision = reservationValidity.expectedRegistryRevision + (firstmate ? 1 : 0);
  const expectedBindRevision = issuanceRegistryRevision + 1;
  io.stdout(JSON.stringify({
    schemaVersion: loaded.registry.schemaVersion,
    ...(loaded.registry.schemaVersion >= 4 ? { coordinationMode: loaded.registry.coordinationMode } : {}),
    ...(loaded.registry.schemaVersion >= 5 ? { rootControl: loaded.registry.rootControl } : {}),
    ...(loaded.registry.schemaVersion >= 5 && loaded.registry.controlLoopPolicy
      ? { controlLoopPolicy: loaded.registry.controlLoopPolicy }
      : {}),
    operation: "create-task",
    nodeId: node.id,
    role: node.role,
    ...(loaded.registry.schemaVersion >= 5 ? { parentBindingMode: node.parentBindingMode } : {}),
    title: node.title,
    parentTaskId: logicalParent ? null : parent?.taskId || null,
    ...(loaded.registry.schemaVersion >= 3 ? { requiredSkills: requiredSkillsFor(loaded.registry, node) } : {}),
    trustLevel: node.trustLevel,
    authority: canonicalAuthority(node.authority),
    ...(pinLifecycle ? { pinLifecycle } : {}),
    workContract: { algorithm: "sha256", hash: workContractHash },
    taskBinding: taskBindingUpdate({
      registry: loaded.registry,
      launchKey,
      workContractHash,
      node,
      parent,
      boundRevision: expectedBindRevision
    }),
    externalTask: {
      idempotencyKey: launchKey,
      reconciliationKey: launchKey,
      ...(firstmate ? {
        requiredTitle: node.title,
        requiredCreateBehavior: "Use the repository-private at-most-once broker. Seal issuance in the live reservation and persist the matching create-issued receipt after the immediate registry CAS and before the sole inert native create call; Codex does not accept launchKey as a native idempotency key.",
        requiredAdoptBehavior: "Adopt only one exact self-authenticating launch-envelope match, then verify title, repository, source base, parent contract, inert state, and pin posture before attestation and bind.",
        pinLifecycle,
        materializationBroker: {
          protocol: "codex-native-firstmate-at-most-once-v1",
          required: true,
          nativeCreateAcceptsIdempotencyKey: false,
          durableState: "git-common-private-0600-hash-linked-ledger",
          preCreateOrder: ["registry-reservation-CAS", "immediate-contract-CAS", "persist-registry-issuance-marker", "persist-create-issued-receipt", "one-inert-native-create-call"],
          positiveReconciliation: "one-exact-self-authenticating-launch-envelope-match",
          zeroMatchBehavior: "quarantine-without-create-retry",
          ambiguousMatchBehavior: "quarantine-for-manual-reconciliation",
          rawCreateAllowed: false,
          activationOrder: ["exact-readback", "durable-external-attestation", "bind-inert", "issue-activation-once", "positive-activation-and-pin-readback", "mark-working"]
        }
      } : {}),
      indeterminateCreateBehavior: firstmate
        ? "Keep the reservation and create-issued ledger state. Resume only from one exact positive task readback; zero or ambiguous matches never authorize another native create."
        : "Keep the reservation and reconcile the external task by launchKey before any retry or release."
    },
    prompt: buildPromptLines(node, parent, loaded.registry).join("\n"),
    reservation,
    callback: {
      registry: registryLabel(loaded),
      registrySelector: {
        operator: loaded.location.operator,
        instance: loaded.location.instance
      },
      mode: configured ? "update-node" : "insert-node",
      registryNode: configured ? undefined : node,
      reserve: {
        operation: "compare-and-set-reserve",
        ...reservation,
        onSuccess: {
          registryRevision: loaded.registry.revision + 1,
          ...(activatesRegistry ? { status: "active" } : {}),
          launchReservation: persistedReservation
        }
      },
      preCreate: {
        operation: "compare-and-set-reservation-validity",
        requiredReservationKey: launchKey,
        ...reservationValidity,
        onFailure: "Do not create a task; reconcile any existing external task by launchKey."
      },
      bind: {
        operation: "compare-and-set-bind",
        requiredReservationKey: launchKey,
        ...reservationValidity,
        expectedRegistryRevision: issuanceRegistryRevision,
        ...(firstmate ? {
          requiredMaterializationAttempt: {
            broker: "codex-native-firstmate-at-most-once-v1",
            state: "create-issued",
            launchKey,
            workContractHash,
            sourceContractHash: "exact source contract hash from the broker",
            attemptLedgerTip: "reserved receipt hash",
            markerHash: "SHA-256 of the issuance marker"
          }
        } : {}),
        requiredUpdates: [
          "taskId",
          ...(firstmate ? ["verified externalTitle and titleVerification matching the registry title"] : []),
          ...(pinLifecycle ? [`verified native task pin state=${pinLifecycle.initialState} and lifecycle reconciliation contract`] : []),
          ...(node.role === "boss" || logicalParent ? [] : ["parentTaskId=immediate parent taskId"]),
          "Ed25519-attested taskBinding with immutable launch key, work-contract hash, node/task/parent identities, bind revision, and bind time",
          "state=working",
          "nextAction",
          ...(loaded.registry.controlLoopPolicy ? ["initialize controlLoop progress, retry budget, and next-control fields"] : []),
          ...(requiresLogicalManagerLivenessHandoff ? [logicalManagerLivenessHandoffUpdate] : []),
          "clear launchReservation"
        ],
        taskBinding: taskBindingUpdate({
          registry: loaded.registry,
          launchKey,
          workContractHash,
          node,
          parent,
          boundRevision: expectedBindRevision
        }),
        mustAdvanceRegistryRevision: true,
        onFailure: "Keep the reservation quarantined and reconcile the external task by launchKey; do not create another task after a title or bind failure."
      },
      reconcile: {
        operation: "compare-and-set-reconcile-bind",
        externalTask: {
          reconciliationKey: launchKey,
          idempotencyKey: launchKey,
          requireExistingTask: true,
          createAllowed: false,
          ...(firstmate ? {
            requiredTitle: node.title,
            renameAndVerifyBeforeBind: true,
            pinLifecycle,
            materializationBroker: {
              protocol: "codex-native-firstmate-at-most-once-v1",
              requireExistingPositiveMatch: true,
              createAllowed: false,
              zeroMatchBehavior: "quarantine-without-create-retry"
            }
          } : {})
        },
        requiredReservation: {
          key: launchKey,
          baseRevision: loaded.registry.revision
        },
        readLatestRegistryRevision: true,
        requiredCurrentEligibility: {
          registryStatus: "active",
          completedDependencies: true,
          node: {
            id: node.id,
            state: node.state,
            taskId: null,
            parentTaskId: null,
            launchReservationKey: launchKey,
            trustLevel: node.trustLevel,
            authority: canonicalAuthority(node.authority),
            materializedWorkContractHash: workContractHash
          },
          ...(parent ? {
            parentId: parent.id,
            parentTaskRequired: !logicalParent,
            parentManagingStateRequired: !logicalParent,
            logicalParentBinding: logicalParent,
            parentDelegationAuthorityRequired: true,
            parentApprovalGatesRequired: canonicalValues(parent.authority?.approvalGates),
            parentAuthorityInheritance: {
              requireCurrentParentToChildValidation: true,
              childTrustMayNotExceedParent: true,
              allowedReadsSubset: true,
              allowedWritesSubset: true,
              allowedExternalActionsSubset: true,
              inheritedApprovalGatesRequired: true,
              delegatedBudgetWithinParent: true
            }
          } : {}),
          capacityRequired: true,
          ...(loaded.registry.schemaVersion >= 4 ? { openReplanBoundaryDirectiveIds: [] } : {}),
          materializedWorkContractHash: workContractHash
        },
        requiredUpdates: [
          "taskId from reconciled external task",
          ...(firstmate ? ["verified externalTitle and titleVerification matching the registry title"] : []),
          ...(pinLifecycle ? [`verified native task pin state=${pinLifecycle.initialState} and lifecycle reconciliation contract`] : []),
          ...(node.role === "boss" || logicalParent ? [] : ["parentTaskId=immediate parent taskId"]),
          "Ed25519-attested taskBinding with immutable launch key, work-contract hash, node/task/parent identities, latest bind revision, and bind time",
          "state=working",
          "nextAction",
          ...(loaded.registry.controlLoopPolicy ? ["initialize controlLoop progress, retry budget, and next-control fields"] : []),
          ...(requiresLogicalManagerLivenessHandoff ? [logicalManagerLivenessHandoffUpdate] : []),
          "clear launchReservation"
        ],
        mustAdvanceRegistryRevision: true,
        onFailure: "Keep the reservation quarantined for explicit cancel or replan; do not create another task.",
        taskBinding: taskBindingUpdate({
          registry: loaded.registry,
          launchKey,
          workContractHash,
          node,
          parent,
          boundRevision: "latest registry revision plus one"
        }),
        onSuccess: "Bind the reconciled task against the latest registry revision without another external create."
      },
      requiredUpdates: configured
        ? [
          ...(activatesRegistry ? ["status=active"] : []),
          "taskId",
          ...(node.role === "boss" || logicalParent ? [] : ["parentTaskId=immediate parent taskId"]),
          "taskBinding",
          "state=working",
          "nextAction",
          ...(loaded.registry.controlLoopPolicy ? ["controlLoop"] : []),
          ...(requiresLogicalManagerLivenessHandoff ? [logicalManagerLivenessHandoffUpdate] : [])
        ]
        : [
          "insert registryNode", "status=active", "taskId", "taskBinding", "state=working", "nextAction",
          ...(loaded.registry.controlLoopPolicy ? ["controlLoop"] : []),
          ...(requiresLogicalManagerLivenessHandoff ? [logicalManagerLivenessHandoffUpdate] : [])
        ]
    }
  }, null, 2));
  return 0;
}

function brokerHash(value) {
  return createHash("sha256").update(portableCanonicalJson(value)).digest("hex");
}

function brokerGitCommit(repoRoot, ref) {
  if (!isNonEmptyString(ref)) throw new Error("Codex materialization requires a configured clientAdapter.baseRef");
  const result = spawnSync("git", ["-C", repoRoot, "rev-parse", "--verify", `${ref}^{commit}`], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: gitTopologyEnvironment()
  });
  if (result.status !== 0 || !/^[a-f0-9]{40,64}$/.test(result.stdout.trim())) {
    throw new Error(`cannot resolve the exact Codex materialization base ref: ${ref}`);
  }
  return result.stdout.trim();
}

function brokerSourceContract(registry, repoRoot) {
  const adapter = registry.clientAdapter;
  const source = {
    repositoryIdentity: adapter.presentationTaxonomy?.repositoryIdentity,
    repositoryRoot: repoRoot,
    scopeRootRef: registry.scope?.rootRef,
    baseRef: adapter.baseRef,
    baseCommit: brokerGitCommit(repoRoot, adapter.baseRef),
    worktreePolicy: adapter.worktreePolicy
  };
  if (!isNonEmptyString(source.repositoryIdentity)
    || !isNonEmptyString(source.scopeRootRef)
    || !isObject(source.worktreePolicy)) {
    throw new Error("Codex materialization requires sealed repository identity, scope root, and worktree policy");
  }
  return source;
}

function brokerPrivateAttemptRoot(location) {
  return path.join(
    location.storePath,
    "operators",
    location.operator,
    "materialization-attempts",
    location.instance
  );
}

function replacePrivateRegistryCas(location, expectedRevision, nextRegistry) {
  const loaded = loadPrivateRegistry(location);
  if (!loaded.exists || loaded.error) {
    throw new Error(loaded.error || "private orchestration instance disappeared during materialization");
  }
  if (loaded.registry.revision !== expectedRevision) {
    throw new Error("private orchestration revision changed during materialization CAS");
  }
  const findings = validateRegistry(nextRegistry);
  if (findings.blockers.length) {
    throw new Error(`materialization CAS would install an invalid registry: ${findings.blockers[0]}`);
  }
  const temporary = `${location.path}.materialization-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let fd;
  try {
    fd = fs.openSync(temporary, "wx", 0o600);
    fs.writeFileSync(fd, `${JSON.stringify(nextRegistry, null, 2)}\n`, "utf8");
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(temporary, location.path);
    fs.chmodSync(location.path, 0o600);
    const directoryFd = fs.openSync(path.dirname(location.path), "r");
    try {
      fs.fsyncSync(directoryFd);
    } finally {
      fs.closeSync(directoryFd);
    }
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

function brokerSelectedNode(location, nodeId) {
  const loaded = loadPrivateRegistry(location);
  if (!loaded.exists || loaded.error) {
    throw new Error(loaded.error || "private orchestration instance is unavailable");
  }
  const findings = validateRegistry(loaded.registry);
  if (findings.blockers.length) throw new Error(`registry is invalid: ${findings.blockers[0]}`);
  const node = findings.nodesById.get(nodeId);
  if (!node) throw new Error(`configured orchestration node not found: ${nodeId}`);
  const parent = node.parentId ? findings.nodesById.get(node.parentId) : null;
  return { loaded, findings, node, parent };
}

function brokerReservationMatches(registry, node, parent, nodes) {
  const reservation = node.launchReservation;
  if (!isObject(reservation)) return false;
  const expected = reservationValidityFor(
    registry,
    node,
    parent,
    nodes,
    registry.trustPolicy.limits.maxActiveNodes,
    reservation
  );
  return reservationValidityMatchesCurrent(reservation, expected);
}

// This private adapter entrypoint is imported by the registered Codex
// controller. It is deliberately not routed through the public repository CLI:
// inspection remains public, while native task mutation requires injected
// controller, attestor, and exact readback capabilities.
export async function materializeCodexTask(options = {}) {
  const repoRoot = resolvedRepoRoot();
  const selection = options.selection || environmentLocalSelection();
  const location = instanceLocation(selection);
  const initial = brokerSelectedNode(location, options.nodeId);
  const { node, parent } = initial;
  if (!isCodexNativeFirstmateAdapter(initial.loaded.registry.clientAdapter)) {
    throw new Error("selected private instance does not use the Codex-native Firstmate adapter");
  }
  const adapterPinBlocker = firstmatePinPolicyBlockers(initial.loaded.registry.clientAdapter)[0];
  if (adapterPinBlocker) throw new Error(adapterPinBlocker);
  const activatesRegistry = activatesRegistryOnLaunch(initial.loaded.registry, node, parent);
  const activationRegistry = activatesRegistry
    ? { ...initial.loaded.registry, status: "active" }
    : initial.loaded.registry;
  const activationBlocker = firstmateActivationBlockers(
    activationRegistry,
    initial.loaded.registry.clientAdapter,
    { materializingNodeId: activatesRegistry ? node.id : null }
  )[0];
  if (activationBlocker) throw new Error(`Codex materialization is not activation-ready: ${activationBlocker}`);
  const existingBrokerBinding = ["blocked", "working"].includes(node.state)
    && isNonEmptyString(node.taskId)
    && node.taskBinding?.materializationAttempt?.broker === "codex-native-firstmate-at-most-once-v1";
  if (!existingBrokerBinding) {
    const launchMode = hasLaunchReservation(node) ? "reservation" : "launch";
    const launchBlocker = launchEligibilityBlockers({
      registry: initial.loaded.registry,
      node,
      parent,
      nodes: initial.findings.nodes,
      nodesById: initial.findings.nodesById,
      maxActiveNodes: initial.loaded.registry.trustPolicy.limits.maxActiveNodes,
      mode: launchMode
    })[0];
    if (launchBlocker) throw new Error(launchBlocker.message);
  }
  const missingSkills = missingProjectLocalSkills(initial.loaded.registry, node);
  if (missingSkills.length) {
    throw new Error(`node ${node.id} is missing required project-local skills: ${missingSkills.join(", ")}`);
  }
  if (initial.loaded.registry.controlLoopPolicy
    && !existingBrokerBinding
    && !isObject(options.initialControlLoop)) {
    throw new Error("Codex materialization requires parent-owned initialControlLoop state when controlLoopPolicy is configured");
  }
  if (!isNonEmptyString(options.nextAction)) {
    throw new Error("Codex materialization requires a concrete nextAction for post-activation state");
  }

  const source = brokerSourceContract(initial.loaded.registry, repoRoot);
  const workContractHash = materializedWorkContractHash(initial.loaded.registry, node, parent);
  const launchKey = launchKeyFor(initial.loaded.registry, node, parent);
  const contract = {
    schemaVersion: 1,
    scopeId: initial.loaded.registry.scope.id,
    operator: location.operator,
    instance: location.instance,
    launchKey,
    workContractHash,
    node: {
      id: node.id,
      role: node.role,
      title: node.title,
      state: node.state,
      ...(initial.loaded.registry.schemaVersion >= 5 ? { parentBindingMode: node.parentBindingMode } : {})
    },
    parent: parent ? {
      id: parent.id,
      role: parent.role,
      taskId: logicalParentBinding(initial.loaded.registry, node, parent) ? null : parent.taskId
    } : null,
    source,
    sourceContractHash: brokerHash(source),
    attestationKeyId: initial.loaded.registry.bindingAttestation.keyId,
    pinLifecycle: firstmateTaskPinLifecycle(initial.loaded.registry, node)
  };

  const reserve = async (_contract, { reconcile = false } = {}) => {
    const current = brokerSelectedNode(location, node.id);
    const currentHash = materializedWorkContractHash(current.loaded.registry, current.node, current.parent);
    const currentKey = launchKeyFor(current.loaded.registry, current.node, current.parent);
    if (currentHash !== workContractHash || currentKey !== launchKey) {
      throw new Error("materialized work contract changed before reservation");
    }
    if (!isDeepStrictEqual(brokerSourceContract(current.loaded.registry, repoRoot), source)) {
      throw new Error("repository source contract changed before reservation");
    }
    if (hasLaunchReservation(current.node)) {
      if (current.node.launchReservation.key !== launchKey
        || current.node.launchReservation.workContractHash !== workContractHash
        || !brokerReservationMatches(current.loaded.registry, current.node, current.parent, current.findings.nodes)) {
        throw new Error("existing launch reservation does not match the sealed materialization contract");
      }
      return {
        registryRevision: current.loaded.registry.revision,
        created: false,
        reconcile,
        createIssued: current.node.launchReservation.materializationAttempt || null
      };
    }
    if (reconcile
      && ["blocked", "working"].includes(current.node.state)
      && current.node.taskId
      && current.node.taskBinding?.launchKey === launchKey
      && current.node.taskBinding?.workContractHash === workContractHash) {
      return {
        registryRevision: current.loaded.registry.revision,
        created: false,
        reconcile,
        bound: true
      };
    }
    if (reconcile) throw new Error("materialization receipt ledger exists but its registry reservation is missing");
    const blocker = launchEligibilityBlockers({
      registry: current.loaded.registry,
      node: current.node,
      parent: current.parent,
      nodes: current.findings.nodes,
      nodesById: current.findings.nodesById,
      maxActiveNodes: current.loaded.registry.trustPolicy.limits.maxActiveNodes,
      mode: "launch"
    })[0];
    if (blocker) throw new Error(blocker.message);
    const activatesRegistry = activatesRegistryOnLaunch(current.loaded.registry, current.node, current.parent);
    const reservedRegistry = {
      ...current.loaded.registry,
      revision: current.loaded.registry.revision + 1,
      ...(activatesRegistry ? { status: "active" } : {})
    };
    const reservedNode = {
      ...current.node,
      launchReservation: {
        key: launchKey,
        baseRevision: current.loaded.registry.revision,
        workContractHash
      }
    };
    const reservedNodes = current.findings.nodes.map((candidate) => candidate.id === node.id ? reservedNode : candidate);
    const reservedParent = current.parent
      ? reservedNodes.find((candidate) => candidate.id === current.parent.id)
      : null;
    reservedNode.launchReservation.validity = reservationValidityFor(
      reservedRegistry,
      reservedNode,
      reservedParent,
      reservedNodes,
      reservedRegistry.trustPolicy.limits.maxActiveNodes,
      reservedNode.launchReservation
    );
    reservedRegistry.nodes = reservedNodes.map((candidate) => candidate.id === node.id ? reservedNode : candidate);
    replacePrivateRegistryCas(location, current.loaded.registry.revision, reservedRegistry);
    return {
      registryRevision: reservedRegistry.revision,
      created: true,
      createIssued: null
    };
  };

  const preCreate = async (_contract, { attemptLedgerTip, nativeCallIssued }) => {
    const current = brokerSelectedNode(location, node.id);
    if (!brokerReservationMatches(current.loaded.registry, current.node, current.parent, current.findings.nodes)) {
      throw new Error("immediate pre-create registry CAS no longer matches the reserved contract");
    }
    if (launchKeyFor(current.loaded.registry, current.node, current.parent) !== launchKey
      || materializedWorkContractHash(current.loaded.registry, current.node, current.parent) !== workContractHash
      || !isDeepStrictEqual(brokerSourceContract(current.loaded.registry, repoRoot), source)) {
      throw new Error("immediate pre-create task, authority, capacity, or source contract changed");
    }
    if (current.node.launchReservation.materializationAttempt) {
      return current.node.launchReservation.materializationAttempt;
    }
    const markerPayload = {
      schemaVersion: 1,
      broker: "codex-native-firstmate-at-most-once-v1",
      state: "create-issued",
      launchKey,
      workContractHash,
      sourceContractHash: contract.sourceContractHash,
      attemptLedgerTip,
      nativeCallIssued,
      issuedAt: new Date().toISOString()
    };
    const marker = {
      ...markerPayload,
      markerHash: brokerHash(markerPayload)
    };
    const nextRegistry = {
      ...current.loaded.registry,
      revision: current.loaded.registry.revision + 1
    };
    const nextNode = {
      ...current.node,
      launchReservation: {
        ...current.node.launchReservation,
        materializationAttempt: marker
      }
    };
    const nextNodes = current.findings.nodes.map((candidate) => candidate.id === node.id ? nextNode : candidate);
    nextRegistry.nodes = nextNodes;
    replacePrivateRegistryCas(location, current.loaded.registry.revision, nextRegistry);
    return marker;
  };

  const prepareBinding = async ({ task, attemptLedgerTip, boundAt }) => {
    const current = brokerSelectedNode(location, node.id);
    if (isObject(current.node.taskBinding)
      && current.node.taskId === task.id
      && current.node.taskBinding.launchKey === launchKey
      && current.node.taskBinding.materializationAttempt?.attemptLedgerTip === attemptLedgerTip) {
      return {
        ...current.node.taskBinding,
        attestation: {
          algorithm: BINDING_ATTESTATION_ALGORITHM,
          keyId: current.loaded.registry.bindingAttestation.keyId,
          signature: ""
        }
      };
    }
    if (!hasLaunchReservation(current.node) || current.node.launchReservation.key !== launchKey) {
      throw new Error("binding preparation requires the exact pending launch reservation");
    }
    return {
      launchKey,
      workContractHash,
      nodeId: node.id,
      taskId: task.id,
      externalTitle: task.title,
      titleVerification: { method: "rename-and-readback", verified: true },
      parentNodeId: node.parentId ?? null,
      parentTaskId: logicalParentBinding(current.loaded.registry, current.node, current.parent)
        ? null
        : current.parent?.taskId ?? null,
      boundRevision: current.loaded.registry.revision + 1,
      boundAt,
      materializationAttempt: {
        broker: "codex-native-firstmate-at-most-once-v1",
        attemptLedgerTip,
        sourceContractHash: contract.sourceContractHash,
        taskReadbackHash: brokerHash(task)
      },
      attestation: {
        algorithm: BINDING_ATTESTATION_ALGORITHM,
        keyId: current.loaded.registry.bindingAttestation.keyId,
        signature: ""
      }
    };
  };

  const readBinding = async ({ binding, expectedState }) => {
    const current = brokerSelectedNode(location, node.id);
    if (!current.node.taskBinding && hasLaunchReservation(current.node)) return "absent";
    return current.node.taskId === binding.taskId
      && current.node.state === expectedState
      && isDeepStrictEqual(current.node.taskBinding, binding)
      ? "exact"
      : "conflict";
  };

  const bindInert = async ({ task, binding }) => {
    const current = brokerSelectedNode(location, node.id);
    if (!brokerReservationMatches(current.loaded.registry, current.node, current.parent, current.findings.nodes)) {
      throw new Error("attested bind CAS no longer matches the reserved registry");
    }
    if (binding.boundRevision !== current.loaded.registry.revision + 1) {
      throw new Error("attested binding revision does not match the next registry revision");
    }
    const nextNode = {
      ...current.node,
      taskId: task.id,
      parentTaskId: binding.parentTaskId,
      taskBinding: binding,
      launchReservation: null,
      state: "blocked",
      blocker: "Native task is inert until activation readback is confirmed.",
      unblockAction: "Confirm the exact attested task activation and required pin state.",
      ...(initial.loaded.registry.controlLoopPolicy ? { controlLoop: options.initialControlLoop } : {})
    };
    const next = {
      ...current.loaded.registry,
      revision: current.loaded.registry.revision + 1,
      nodes: current.findings.nodes.map((candidate) => candidate.id === node.id ? nextNode : candidate)
    };
    replacePrivateRegistryCas(location, current.loaded.registry.revision, next);
  };

  const markWorking = async ({ task, binding }) => {
    const current = brokerSelectedNode(location, node.id);
    if (current.node.state === "working"
      && current.node.taskId === task.id
      && isDeepStrictEqual(current.node.taskBinding, binding)) {
      return;
    }
    if (current.node.state !== "blocked"
      || current.node.taskId !== task.id
      || !isDeepStrictEqual(current.node.taskBinding, binding)) {
      throw new Error("post-activation registry state does not match the exact inert binding");
    }
    const nextNode = {
      ...current.node,
      state: "working",
      nextAction: options.nextAction
    };
    delete nextNode.blocker;
    delete nextNode.unblockAction;
    const next = {
      ...current.loaded.registry,
      revision: current.loaded.registry.revision + 1,
      nodes: current.findings.nodes.map((candidate) => candidate.id === node.id ? nextNode : candidate)
    };
    replacePrivateRegistryCas(location, current.loaded.registry.revision, next);
  };

  const reconcileCompletedBinding = async ({ task, binding }) => {
    const current = brokerSelectedNode(location, node.id);
    if (current.node.taskBinding
      || !hasLaunchReservation(current.node)
      || current.node.launchReservation.key !== launchKey
      || !brokerReservationMatches(current.loaded.registry, current.node, current.parent, current.findings.nodes)) {
      throw new Error("completed binding reconciliation requires the exact pending launch reservation");
    }
    const nextNode = {
      ...current.node,
      taskId: task.id,
      parentTaskId: binding.parentTaskId,
      taskBinding: binding,
      launchReservation: null,
      state: "working",
      nextAction: options.nextAction
    };
    delete nextNode.blocker;
    delete nextNode.unblockAction;
    const next = {
      ...current.loaded.registry,
      revision: current.loaded.registry.revision + 1,
      nodes: current.findings.nodes.map((candidate) => candidate.id === node.id ? nextNode : candidate)
    };
    replacePrivateRegistryCas(location, current.loaded.registry.revision, next);
  };

  return materializeCodexTaskWithBroker({
    contract,
    attemptRoot: brokerPrivateAttemptRoot(location),
    privateRoot: location.storePath,
    native: options.native,
    attestor: options.attestor,
    publicKeyBase64: process.env[BINDING_PUBLIC_KEY_ENV],
    checkpoint: options.checkpoint,
    callbacks: {
      reserve,
      preCreate,
      prepareBinding,
      attestationPayload: (binding) => taskBindingAttestationPayload(initial.loaded.registry, binding),
      readBinding,
      bindInert,
      markWorking,
      reconcileCompletedBinding,
      reconcileActivation: options.reconcileActivation
    }
  });
}

export async function runOrchestration(argv, io, options = {}) {
  const parsed = parseLocalSelection(argv, io);
  if (!parsed.ok) return 2;
  const [command = "status", ...rest] = parsed.argv;
  if (argv.includes("--help") || argv.includes("-h") || command === "help") {
    printHelp(io);
    return 0;
  }
  if (parsed.trackedExampleOnly && !TRACKED_EXAMPLE_COMMANDS.has(command)) {
    renderUsageError(io, {
      code: "tracked-example-inspection-only",
      command: `orchestration ${command}`,
      message: "--example is limited to read-only tracked-example inspection commands",
      hints: [`Use --example with status, validate, liveness, report, reconcile, adapter-status, or taxonomy`, `Select a named private instance for operational commands`]
    });
    return 2;
  }
  switch (command) {
    case "status":
      if (rejectUnexpectedArgs(rest, io, { command: "orchestration status", hints: [`Run ./${CONFIG.cliName} orchestration status`] })) return 2;
      return runStatus(io);
    case "instances":
      if (rejectUnexpectedArgs(rest, io, { command: "orchestration instances", hints: [`Run ./${CONFIG.cliName} orchestration instances --operator ${selectedLocalInstance.operator}`] })) return 2;
      return runInstances(io);
    case "init":
      if (rest.length > 1 || rest[0]?.startsWith("-")) {
        renderUsageError(io, {
          code: "invalid-orchestration-init-arguments",
          command: "orchestration init",
          message: "init accepts at most one private instance name",
          details: rest,
          hints: [`Run ./${CONFIG.cliName} orchestration init <name>`]
        });
        return 2;
      }
      return runInit(rest[0], io);
    case "migrate":
      if (rest.length > 1 || rest[0]?.startsWith("-")) {
        renderUsageError(io, {
          code: "invalid-orchestration-migrate-arguments",
          command: "orchestration migrate",
          message: "migrate accepts at most one private instance name",
          details: rest,
          hints: [`Run ./${CONFIG.cliName} orchestration migrate <name>`]
        });
        return 2;
      }
      return runMigrate(rest[0], io);
    case "adapter-status":
      if (rejectUnexpectedArgs(rest, io, { command: "orchestration adapter-status", hints: [`Run ./${CONFIG.cliName} orchestration adapter-status`] })) return 2;
      return runAdapterStatus(io);
    case "taxonomy":
      if (rejectUnexpectedArgs(rest, io, { command: "orchestration taxonomy", hints: [`Run ./${CONFIG.cliName} orchestration taxonomy`] })) return 2;
      return runTaxonomy(io);
    case "hierarchy":
      if (rejectUnexpectedArgs(rest, io, { command: "orchestration hierarchy", hints: [`Run ./${CONFIG.cliName} orchestration hierarchy`] })) return 2;
      return runHierarchy(io);
    case "trust":
      if (rejectUnexpectedArgs(rest, io, { command: "orchestration trust", hints: [`Run ./${CONFIG.cliName} orchestration trust`] })) return 2;
      return runTrust(io);
    case "validate":
      if (rejectUnexpectedArgs(rest, io, { command: "orchestration validate", hints: [`Run ./${CONFIG.cliName} orchestration validate`] })) return 2;
      return runValidate(io);
    case "liveness":
      if (rejectUnexpectedArgs(rest, io, { command: "orchestration liveness", hints: [`Run ./${CONFIG.cliName} orchestration liveness`] })) return 2;
      return runLiveness(io);
    case "report":
      if (rejectUnexpectedArgs(rest, io, { command: "orchestration report", hints: [`Run ./${CONFIG.cliName} orchestration report`] })) return 2;
      return runReport(io, options);
    case "reconcile":
      if (rejectUnexpectedArgs(rest, io, { command: "orchestration reconcile", hints: [`Run ./${CONFIG.cliName} orchestration reconcile`] })) return 2;
      return runReconcile(io, options);
    case "directives":
      if (rejectUnexpectedArgs(rest, io, { command: "orchestration directives", hints: [`Run ./${CONFIG.cliName} orchestration directives`] })) return 2;
      return runDirectives(io);
    case "next":
      if (rejectUnexpectedArgs(rest, io, { command: "orchestration next", hints: [`Run ./${CONFIG.cliName} orchestration next`] })) return 2;
      return runNext(io);
    case "prompt":
      if (rest.length > 1 || rest[0]?.startsWith("-")) {
        renderUsageError(io, {
          code: "invalid-orchestration-prompt-arguments",
          command: "orchestration prompt",
          message: "Prompt accepts exactly one node id",
          details: rest,
          hints: [`Run ./${CONFIG.cliName} orchestration prompt <node-id>`]
        });
        return 2;
      }
      return runPrompt(rest[0], io);
    case "launch-spec":
      if (rest.length !== 1 || rest[0]?.startsWith("-")) {
        renderUsageError(io, {
          code: "invalid-orchestration-launch-spec-arguments",
          command: "orchestration launch-spec",
          message: "launch-spec accepts exactly one node id",
          details: rest,
          hints: [`Run ./${CONFIG.cliName} orchestration launch-spec <node-id>`]
        });
        return 2;
      }
      return runLaunchSpec(rest[0], io);
    default:
      renderUsageError(io, {
        code: "unknown-orchestration-command",
        command: "orchestration",
        message: `Unknown orchestration command: ${command}`,
        hints: [`Run ./${CONFIG.cliName} orchestration help`]
      });
      return 2;
  }
}
