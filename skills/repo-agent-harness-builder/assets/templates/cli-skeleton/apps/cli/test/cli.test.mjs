import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { generateKeyPairSync, sign as signPayload } from "node:crypto";
import { fileURLToPath } from "node:url";
import { CONFIG, setRepoRootForTests } from "../src/config.mjs";
import { renderHelp } from "../src/help.mjs";
import { main } from "../src/main.mjs";
import { runLavish } from "../src/lavish/index.mjs";
import { collectNoMistakesStatus, runNoMistakes } from "../src/no-mistakes/index.mjs";
import { materializedWorkContractHash, taskBindingAttestationPayload, taskBindingLegacyAttestationDigest } from "../src/orchestration/index.mjs";
import { runCommand } from "../src/util/exec.mjs";
import { redactSecrets } from "../src/util/exec.mjs";
import { findSecretIndicators } from "../src/util/secrets.mjs";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const sourceRoot = path.resolve(testDir, "../../..");
let repoRoot = sourceRoot;
let fixtureMergeCounter = 0;
const bindingAttestor = generateKeyPairSync("ed25519");
const BINDING_ATTESTOR_KEY_ID = "fixture-binding-attestor";
const BINDING_ATTESTOR_PUBLIC_KEY = bindingAttestor.publicKey.export({ type: "spki", format: "der" }).toString("base64");

function copyFixture(source, destination) {
  fs.cpSync(source, destination, {
    recursive: true,
    filter: (src) => {
      const rel = path.relative(source, src);
      return rel === "" || !rel.split(path.sep).some((part) => part === ".git" || part === "node_modules" || part === "coverage");
    }
  });
}

async function withFixture(fn, options = {}) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "harness-cli-test-"));
  copyFixture(sourceRoot, fixtureRoot);
  const previousRoot = repoRoot;
  const previousEnv = process.env.NODE_ENV;
  const previousBindingKey = process.env.ORCHESTRATION_BINDING_PUBLIC_KEY;
  const previousBindingKeyId = process.env.ORCHESTRATION_BINDING_KEY_ID;
  repoRoot = fixtureRoot;
  process.env.NODE_ENV = "test";
  process.env.ORCHESTRATION_BINDING_PUBLIC_KEY = BINDING_ATTESTOR_PUBLIC_KEY;
  process.env.ORCHESTRATION_BINDING_KEY_ID = BINDING_ATTESTOR_KEY_ID;
  setRepoRootForTests(fixtureRoot);
  try {
    if (options.git !== false) {
      const init = runCommand("git", ["init", "-q"], { cwd: repoRoot });
      assert.equal(init.ok, true, init.stderr);
    }
    return await fn();
  } finally {
    repoRoot = previousRoot;
    setRepoRootForTests(previousRoot);
    if (previousEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnv;
    if (previousBindingKey === undefined) delete process.env.ORCHESTRATION_BINDING_PUBLIC_KEY;
    else process.env.ORCHESTRATION_BINDING_PUBLIC_KEY = previousBindingKey;
    if (previousBindingKeyId === undefined) delete process.env.ORCHESTRATION_BINDING_KEY_ID;
    else process.env.ORCHESTRATION_BINDING_KEY_ID = previousBindingKeyId;
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

function fixtureTest(name, fn, options = {}) {
  test(name, async () => withFixture(fn, options));
}

async function withFile(rel, content, fn) {
  const fullPath = path.join(repoRoot, rel);
  const original = fs.readFileSync(fullPath, "utf-8");
  fs.writeFileSync(fullPath, content, "utf-8");
  try {
    return await fn();
  } finally {
    fs.writeFileSync(fullPath, original, "utf-8");
  }
}

function writeGoalChain(content) {
  const goalChainPath = path.join(repoRoot, "docs", "reference", "implementation-goal-chain.md");
  fs.mkdirSync(path.dirname(goalChainPath), { recursive: true });
  fs.writeFileSync(goalChainPath, content, "utf-8");
}

function writeOrchestrationRegistry(registry) {
  const registryPath = path.join(repoRoot, "ops", "orchestration.json");
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
  fs.writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`, "utf-8");
}

function orchestrationAuthority({
  reads = ["project"],
  writes = [],
  external = [],
  canDelegate = false,
  maxActiveChildren = 0
} = {}) {
  return {
    allowedReads: reads,
    allowedWrites: writes,
    allowedExternalActions: external,
    approvalGates: ["activation"],
    canDelegate,
    maxActiveChildren,
    stopConditions: ["authority-gap", "scope-unclear"]
  };
}

function canonicalAuthorityForTest(authority) {
  return {
    ...authority,
    ...Object.fromEntries(["allowedReads", "allowedWrites", "allowedExternalActions", "approvalGates", "stopConditions"].map((field) => [
      field,
      [...new Set(authority[field] || [])].sort()
    ]))
  };
}

function taskBindingForTest(registry, node, {
  boundRevision = registry.revision,
  boundAt = "2026-07-16T12:00:00Z",
  requiresVerifiedTitle = registry.clientAdapter?.profile === "codex-native-firstmate"
} = {}) {
  const parent = node.parentId ? registry.nodes.find((candidate) => candidate.id === node.parentId) : null;
  const workContractHash = materializedWorkContractHash(registry, node, parent);
  const binding = {
    launchKey: `orchestration:${registry.scope.id}:${node.id}:${workContractHash}`,
    workContractHash,
    nodeId: node.id,
    taskId: node.taskId,
    ...(requiresVerifiedTitle ? {
      externalTitle: node.title,
      titleVerification: {
        method: "rename-and-readback",
        verified: true
      }
    } : {}),
    parentNodeId: node.parentId,
    parentTaskId: parent?.taskId || null,
    boundRevision,
    boundAt,
    attestation: {
      algorithm: "ed25519",
      keyId: BINDING_ATTESTOR_KEY_ID
    }
  };
  return {
    ...binding,
    attestation: {
      ...binding.attestation,
      signature: signPayload(null, Buffer.from(taskBindingAttestationPayload(registry, binding)), bindingAttestor.privateKey).toString("base64")
    }
  };
}

function selfConsistentReservationValidity(registry, node, parent) {
  const activeStates = new Set(["working", "waiting", "blocked", "ready-for-parent"]);
  const hasReservation = (candidate) => Boolean(candidate.launchReservation && typeof candidate.launchReservation === "object" && !Array.isArray(candidate.launchReservation));
  const activeNodeCount = registry.nodes.filter((candidate) => activeStates.has(candidate.state)).length;
  const reservedNodeCount = registry.nodes.filter(hasReservation).length;
  const validity = {
    expectedRegistryRevision: registry.revision,
    expectedRegistryStatus: registry.status,
    expectedNode: {
      id: node.id,
      state: node.state,
      taskId: node.taskId,
      launchReservationKey: node.launchReservation.key,
      parentTaskId: node.parentTaskId ?? null,
      trustLevel: node.trustLevel,
      authority: canonicalAuthorityForTest(node.authority),
      materializedWorkContractHash: materializedWorkContractHash(registry, node, parent)
    },
    expectedParent: parent ? {
      id: parent.id,
      state: parent.state,
      taskId: parent.taskId,
      trustLevel: parent.trustLevel,
      authority: canonicalAuthorityForTest(parent.authority)
    } : null,
    capacity: {
      activeNodeCount,
      reservedNodeCount,
      maxActiveNodes: registry.trustPolicy.limits.maxActiveNodes
    }
  };
  if (parent) {
    validity.capacity.parentId = parent.id;
    validity.capacity.activeChildCount = registry.nodes.filter((candidate) => candidate.parentId === parent.id && activeStates.has(candidate.state)).length;
    validity.capacity.reservedChildCount = registry.nodes.filter((candidate) => candidate.parentId === parent.id && hasReservation(candidate)).length;
    validity.capacity.maxActiveChildren = parent.authority.maxActiveChildren;
  }
  return validity;
}

function validOrchestrationRegistry() {
  const registry = {
    schemaVersion: 2,
    revision: 0,
    status: "active",
    prefix: CONFIG.projectName,
    scope: {
      id: "knowledge-refresh",
      kind: "project",
      rootRef: "repository-root",
      objective: "Refresh project knowledge and record a research decision."
    },
    bindingAttestation: {
      algorithm: "ed25519",
      keyId: BINDING_ATTESTOR_KEY_ID
    },
    trustPolicy: {
      defaultLevel: "T1",
      maxLevel: "T4",
      promotionRequiresHumanApproval: true,
      childMayExceedParent: false,
      limits: { maxActiveNodes: 6, maxDelegationDepth: 2 }
    },
    nodes: [
      {
        id: "boss",
        role: "boss",
        workRef: "portfolio",
        workKind: "governance",
        governingProtocols: ["AGENT-ORCHESTRATION"],
        label: "Project control plane",
        title: `${CONFIG.projectName} - Boss`,
        taskId: "task-boss",
        parentId: null,
        dependencies: [],
        state: "working",
        trustLevel: "T3",
        trustApproval: {
          approvedBy: "project-owner",
          approvedAt: "2026-07-16",
          evidence: ["bounded integration and delegation approval"]
        },
        authority: orchestrationAuthority({
          writes: ["project-files"],
          external: ["tracker-update"],
          canDelegate: true,
          maxActiveChildren: 2
        }),
        objective: "Keep the project scope controlled and evidence-backed.",
        nextAction: "Review eligible project work."
      },
      {
        id: "manager-docs",
        role: "manager",
        workRef: "DOCS-4",
        workKind: "documentation",
        governingProtocols: ["AGENT-ORCHESTRATION", "DOCUMENT-QUALITY"],
        label: "Documentation refresh",
        title: `${CONFIG.projectName} - Manager - DOCS-4 Documentation refresh`,
        taskId: null,
        parentId: "boss",
        dependencies: [],
        state: "eligible",
        trustLevel: "T1",
        authority: orchestrationAuthority(),
        objective: "Plan and review a bounded documentation refresh.",
        completionProfile: {
          type: "artifact",
          requiredEvidence: ["approved documentation artifact"]
        }
      },
      {
        id: "worker-research",
        role: "worker",
        workRef: "RES-2",
        workKind: "research",
        governingProtocols: ["AGENT-ORCHESTRATION", "DOCUMENT-QUALITY"],
        label: "Research decision",
        title: `${CONFIG.projectName} - Worker for Boss - RES-2 Research decision`,
        taskId: null,
        parentId: "boss",
        dependencies: ["manager-docs"],
        state: "queued",
        trustLevel: "T1",
        authority: orchestrationAuthority(),
        objective: "Produce an evidence-backed decision for parent review.",
        completionProfile: {
          type: "human-decision",
          requiredEvidence: ["recorded human decision", "downstream disposition"]
        }
      }
    ]
  };
  const boss = registry.nodes.find((node) => node.id === "boss");
  boss.taskBinding = taskBindingForTest(registry, boss);
  return registry;
}

function configuredFirstmateAdapter(registry, profile = "portable") {
  const boss = registry.nodes.find((node) => node.role === "boss");
  const adapter = {
    id: "codex-app",
    profile: "codex-native-firstmate",
    status: "active",
    bossTaskId: boss.taskId,
    standingTaskCreationGrant: false,
    taskCreationApprovalGate: "per-task-human-approval",
    completionProfiles: {
      artifact: ["approved documentation artifact"],
      "human-decision": ["downstream disposition", "recorded human decision"]
    },
    presentationTaxonomy: {
      profile,
      repositoryIdentity: CONFIG.repoSlug,
      managerCatalog: ["CTO", "COO"],
      workerCatalog: ["Director", "Lead", "Contributor"]
    },
    baseRef: "{{DEFAULT_BRANCH}}",
    worktreePolicy: {
      mode: "managed",
      parallelWrites: "disjoint-only",
      landedWorkProofRequiredBeforeArchive: true
    },
    browserIntegration: "not-used",
    browserAuthenticationBoundary: "repository-scoped",
    githubIntegration: "not-used",
    githubAuthenticationBoundary: "repository-scoped",
    heartbeat: {
      mode: "manual",
      cadence: "on-demand",
      registryMutator: "project-owner"
    },
    retention: {
      pinBoss: true,
      archivePolicy: "manual-after-landed-proof",
      handoffPolicy: "parent-review-before-archive"
    },
    reconciliationPolicy: "quarantine-and-human-reconcile",
    legacyTaskBindings: []
  };
  const displayRoles = profile === "portable"
    ? { boss: "Boss", manager: "Manager", worker: "Worker" }
    : profile === "nautical"
      ? { boss: "Firstmate", manager: "Secondmate", worker: "Crewmate" }
      : { boss: "CEO", manager: "CTO", worker: "Lead" };
  for (const node of registry.nodes) {
    if (profile === "executive" && node.role !== "boss") node.displayRole = displayRoles[node.role];
    node.title = `${CONFIG.repoSlug} - ${displayRoles[node.role]} - ${(node.role === "boss" ? registry.scope.id : node.workRef)}/${node.id}`;
  }
  boss.taskBinding = taskBindingForTest(registry, boss, { requiresVerifiedTitle: true });
  return adapter;
}

function createFixtureCommit(message = "fixture commit", branch = "{{DEFAULT_BRANCH}}") {
  const checkout = runCommand("git", ["checkout", "-B", branch], { cwd: repoRoot });
  assert.equal(checkout.ok, true, checkout.stderr);
  const commit = runCommand("git", [
    "-c",
    "user.name=Harness Test",
    "-c",
    "user.email=harness-test@example.invalid",
    "commit",
    "--allow-empty",
    "-m",
    message
  ], { cwd: repoRoot });
  assert.equal(commit.ok, true, commit.stderr);
  const revParse = runCommand("git", ["rev-parse", "HEAD"], { cwd: repoRoot });
  assert.equal(revParse.ok, true, revParse.stderr);
  return revParse.stdout.trim();
}

function gitWithFixtureUser(args) {
  return runCommand("git", [
    "-c",
    "user.name=Harness Test",
    "-c",
    "user.email=harness-test@example.invalid",
    ...args
  ], { cwd: repoRoot });
}

function createFixtureMergeCommit(pr = 45, message = "fixture merge", body = "") {
  const checkoutDefault = runCommand("git", ["checkout", "-B", "{{DEFAULT_BRANCH}}"], { cwd: repoRoot });
  assert.equal(checkoutDefault.ok, true, checkoutDefault.stderr);

  const head = runCommand("git", ["rev-parse", "--verify", "HEAD"], { cwd: repoRoot });
  if (!head.ok) {
    const base = gitWithFixtureUser(["commit", "--allow-empty", "-m", "base integration commit"]);
    assert.equal(base.ok, true, base.stderr);
  }

  const branch = `feature/goal-${++fixtureMergeCounter}`;
  const checkoutFeature = runCommand("git", ["checkout", "-B", branch], { cwd: repoRoot });
  assert.equal(checkoutFeature.ok, true, checkoutFeature.stderr);
  const featureCommit = gitWithFixtureUser(["commit", "--allow-empty", "-m", `${message} implementation`]);
  assert.equal(featureCommit.ok, true, featureCommit.stderr);

  const backToDefault = runCommand("git", ["checkout", "{{DEFAULT_BRANCH}}"], { cwd: repoRoot });
  assert.equal(backToDefault.ok, true, backToDefault.stderr);
  const mergeArgs = ["merge", "--no-ff", branch, "-m", `Merge pull request #${pr} from test/${branch}`];
  if (body) mergeArgs.push("-m", body);
  const merge = gitWithFixtureUser(mergeArgs);
  assert.equal(merge.ok, true, merge.stderr);

  const revParse = runCommand("git", ["rev-parse", "HEAD"], { cwd: repoRoot });
  assert.equal(revParse.ok, true, revParse.stderr);
  return revParse.stdout.trim();
}

function createFixtureSquashCommit(pr = 45, message = "fixture squash") {
  const checkoutDefault = runCommand("git", ["checkout", "-B", "{{DEFAULT_BRANCH}}"], { cwd: repoRoot });
  assert.equal(checkoutDefault.ok, true, checkoutDefault.stderr);

  const head = runCommand("git", ["rev-parse", "--verify", "HEAD"], { cwd: repoRoot });
  if (!head.ok) {
    const base = gitWithFixtureUser(["commit", "--allow-empty", "-m", "base integration commit"]);
    assert.equal(base.ok, true, base.stderr);
  }

  const squash = gitWithFixtureUser(["commit", "--allow-empty", "-m", `${message} (#${pr})`]);
  assert.equal(squash.ok, true, squash.stderr);

  const revParse = runCommand("git", ["rev-parse", "HEAD"], { cwd: repoRoot });
  assert.equal(revParse.ok, true, revParse.stderr);
  return revParse.stdout.trim();
}

function checkoutDefaultBranch() {
  const checkout = runCommand("git", ["checkout", "{{DEFAULT_BRANCH}}"], { cwd: repoRoot });
  assert.equal(checkout.ok, true, checkout.stderr);
}

async function withTrackerIssuePattern(pattern, fn) {
  const previous = CONFIG.trackerIssuePattern;
  CONFIG.trackerIssuePattern = pattern;
  try {
    return await fn();
  } finally {
    CONFIG.trackerIssuePattern = previous;
  }
}

async function withRequiredGoalCloseoutFields(fields, fn) {
  const previous = CONFIG.requiredGoalCloseoutFields;
  CONFIG.requiredGoalCloseoutFields = fields;
  try {
    return await fn();
  } finally {
    CONFIG.requiredGoalCloseoutFields = previous;
  }
}

async function withoutRequiredGoalCloseoutFields(fn) {
  const hadField = Object.prototype.hasOwnProperty.call(CONFIG, "requiredGoalCloseoutFields");
  const previous = CONFIG.requiredGoalCloseoutFields;
  delete CONFIG.requiredGoalCloseoutFields;
  try {
    return await fn();
  } finally {
    if (hadField) CONFIG.requiredGoalCloseoutFields = previous;
  }
}

function capture() {
  const out = [];
  const err = [];
  return {
    io: {
      stdout: (line = "") => out.push(line),
      stderr: (line = "") => err.push(line)
    },
    out,
    err
  };
}

function localPathPattern() {
  return new RegExp([
    String.raw`/` + "Users" + String.raw`/`,
    String.raw`/` + "home" + String.raw`/`,
    String.raw`/` + "tmp" + String.raw`/`,
    String.raw`/` + "private" + String.raw`/` + "var" + String.raw`/`,
    String.raw`~` + String.raw`/`
  ].join("|"));
}

function exampleLocalPath() {
  return ["", "Users", "example", "private"].join("/");
}

function noMistakesTestEnv() {
  return { HOME: repoRoot };
}

function fakeCommandRunner(responses) {
  const calls = [];
  let index = 0;
  const runImpl = (command, args = [], options = {}) => {
    calls.push({ command, args, options });
    const key = [command, ...args].join(" ");
    const response = Array.isArray(responses)
      ? responses[index++]
      : responses[key] || responses.default || { ok: false, status: 1, stdout: "", stderr: "" };
    return {
      ok: response.ok ?? response.status === 0,
      status: response.status ?? (response.ok ? 0 : 1),
      stdout: response.stdout || "",
      stderr: response.stderr || ""
    };
  };
  return { runImpl, calls };
}

test("help lists core commands", () => {
  const help = renderHelp();
  assert.match(help, /preflight/);
  assert.match(help, /precommit/);
  assert.match(help, /verify/);
  assert.match(help, /qa status/);
  assert.match(help, /secrets/);
  assert.match(help, /connections/);
  assert.match(help, /connections auth-plan/);
  assert.match(help, /connections env/);
  assert.match(help, /orchestration status/);
  assert.match(help, /orchestration adapter-status/);
  assert.match(help, /orchestration taxonomy/);
  assert.match(help, /orchestration validate/);
  assert.match(help, /orchestration prompt/);
  assert.match(help, /orchestration launch-spec/);
  assert.match(help, /goals status/);
  assert.match(help, /design status/);
  assert.match(help, /ergonomics status/);
  assert.match(help, /no-mistakes status/);
  assert.match(help, /lavish status/);
  assert.match(help, /lavish update/);
  assert.match(help, /checklist/);
});

fixtureTest("Codex-native Firstmate adapter is repo-local, inactive, dependency-light, and read-only by default", async () => {
  const registryPath = path.join(repoRoot, "ops", "orchestration.json");
  const before = fs.readFileSync(registryPath, "utf-8");
  const beforeMtime = fs.statSync(registryPath).mtimeMs;
  const { io, out, err } = capture();
  const code = await main(["orchestration", "adapter-status"], io);
  assert.equal(code, 0, err.join("\n"));
  const text = out.join("\n");
  assert.match(text, /profile: "codex-native-firstmate"/);
  assert.match(text, /registry_state: "inactive"/);
  assert.match(text, /registry_valid: true/);
  assert.match(text, /adapter_state: "unconfigured"/);
  assert.match(text, /repo_local_scope: true/);
  assert.match(text, /assets_present: 8/);
  for (const profile of ["firstmate-boss", "firstmate-manager", "firstmate-worker"]) {
    const profilePath = path.join(repoRoot, ".codex", "agents", `${profile}.toml`);
    assert.equal(fs.existsSync(profilePath), true);
    const profileText = fs.readFileSync(profilePath, "utf-8");
    assert.match(profileText, new RegExp(`name = "${profile}"`));
    assert.match(profileText, /description = "/);
  }
  assert.equal(fs.existsSync(path.join(repoRoot, ".codex", "agents", "boss.toml")), false);
  assert.match(text, /required_external_dependencies\[0\]:/);
  assert.match(text, /orchestration_active: false/);
  assert.match(text, /activation_ready: false/);
  assert.equal(fs.readFileSync(registryPath, "utf-8"), before);
  assert.equal(fs.statSync(registryPath).mtimeMs, beforeMtime);
});

fixtureTest("Codex-native Firstmate adapter readiness requires complete explicit activation configuration", async () => {
  const inactiveRegistry = JSON.parse(fs.readFileSync(path.join(repoRoot, "ops", "orchestration.json"), "utf-8"));
  inactiveRegistry.clientAdapter = configuredFirstmateAdapter(validOrchestrationRegistry());
  writeOrchestrationRegistry(inactiveRegistry);

  const inactive = capture();
  assert.equal(await main(["orchestration", "adapter-status"], inactive.io), 0, inactive.err.join("\n"));
  assert.match(inactive.out.join("\n"), /adapter_selected: true/);
  assert.match(inactive.out.join("\n"), /orchestration_active: false/);
  assert.match(inactive.out.join("\n"), /activation_ready: false/);

  const activeRegistry = validOrchestrationRegistry();
  activeRegistry.clientAdapter = configuredFirstmateAdapter(activeRegistry);
  writeOrchestrationRegistry(activeRegistry);
  const active = capture();
  assert.equal(await main(["orchestration", "adapter-status"], active.io), 0, active.err.join("\n"));
  assert.match(active.out.join("\n"), /orchestration_active: true/);
  assert.match(active.out.join("\n"), /activation_ready: true/);

  for (const [name, mutate, expectedBlocker] of [
    ["Boss task identity", (registry) => { registry.clientAdapter.bossTaskId = null; }, /bossTaskId/],
    ["task-creation decision", (registry) => { registry.clientAdapter.taskCreationApprovalGate = null; }, /taskCreationApprovalGate/],
    ["completion profiles", (registry) => { registry.clientAdapter.completionProfiles = {}; }, /completionProfiles/],
    ["completion profile coverage", (registry) => { delete registry.clientAdapter.completionProfiles["human-decision"]; }, /completionProfiles\.human-decision must exactly cover registry required evidence/],
    ["completion evidence coverage", (registry) => { registry.clientAdapter.completionProfiles.artifact = ["wrong evidence"]; }, /completionProfiles\.artifact must exactly cover registry required evidence/],
    ["presentation taxonomy", (registry) => { registry.nodes.find((node) => node.id === "boss").displayRole = "Captain"; }, /portable displayRole must remain Boss/],
    ["base ref", (registry) => { registry.clientAdapter.baseRef = null; }, /baseRef/],
    ["worktree policy", (registry) => { registry.clientAdapter.worktreePolicy.mode = "unmanaged"; }, /worktreePolicy/],
    ["Browser choice", (registry) => { registry.clientAdapter.browserIntegration = "unconfigured"; }, /browserIntegration/],
    ["Browser boundary", (registry) => { registry.clientAdapter.browserAuthenticationBoundary = null; }, /browserAuthenticationBoundary/],
    ["GitHub choice", (registry) => { registry.clientAdapter.githubIntegration = "unconfigured"; }, /githubIntegration/],
    ["GitHub boundary", (registry) => { registry.clientAdapter.githubAuthenticationBoundary = null; }, /githubAuthenticationBoundary/],
    ["heartbeat ownership", (registry) => { delete registry.clientAdapter.heartbeat.registryMutator; }, /heartbeat must configure mode, cadence, and registry mutator/],
    ["retention policy", (registry) => { registry.clientAdapter.retention.handoffPolicy = null; }, /retention must configure pin, handoff, and archive policy/],
    ["reconciliation policy", (registry) => { registry.clientAdapter.reconciliationPolicy = null; }, /reconciliationPolicy/],
    ["binding assurance", (registry) => { registry.bindingAttestation = null; }, /registry must be valid/]
  ]) {
    const partialRegistry = validOrchestrationRegistry();
    partialRegistry.clientAdapter = configuredFirstmateAdapter(partialRegistry);
    mutate(partialRegistry);
    writeOrchestrationRegistry(partialRegistry);
    const partial = capture();
    assert.equal(await main(["orchestration", "adapter-status"], partial.io), 0, `${name}: ${partial.err.join("\n")}`);
    assert.match(partial.out.join("\n"), name === "binding assurance" ? /orchestration_active: false/ : /orchestration_active: true/, name);
    assert.match(partial.out.join("\n"), /activation_ready: false/, name);
    assert.match(partial.out.join("\n"), expectedBlocker, name);
  }

  activeRegistry.prefix = "";
  writeOrchestrationRegistry(activeRegistry);
  const invalid = capture();
  assert.equal(await main(["orchestration", "adapter-status"], invalid.io), 0, invalid.err.join("\n"));
  assert.match(invalid.out.join("\n"), /registry_valid: false/);
  assert.match(invalid.out.join("\n"), /orchestration_active: false/);
  assert.match(invalid.out.join("\n"), /activation_ready: false/);
});

fixtureTest("active orchestration rejects an explicitly configured inactive client adapter", async () => {
  const registry = validOrchestrationRegistry();
  registry.clientAdapter = {
    id: "codex-app",
    profile: "codex-native-firstmate",
    status: "inactive",
    standingTaskCreationGrant: false
  };
  writeOrchestrationRegistry(registry);
  const { io, out } = capture();
  const code = await main(["orchestration", "validate"], io);
  assert.equal(code, 1);
  assert.match(out.join("\n"), /configured clientAdapter must be active when orchestration is active/);
});

fixtureTest("Codex-native Firstmate taxonomy preserves canonical roles and exact titles", async () => {
  const expectedDisplayRoles = {
    portable: ["Boss", "Manager", "Worker"],
    nautical: ["Firstmate", "Secondmate", "Crewmate"],
    executive: ["CEO", "CTO", "Lead"]
  };
  for (const [profile, displayRoles] of Object.entries(expectedDisplayRoles)) {
    const registry = validOrchestrationRegistry();
    registry.clientAdapter = configuredFirstmateAdapter(registry, profile);
    writeOrchestrationRegistry(registry);
    const validation = capture();
    assert.equal(await main(["orchestration", "validate"], validation.io), 0, `${profile}: ${validation.out.concat(validation.err).join("\n")}`);
    const posture = capture();
    assert.equal(await main(["orchestration", "adapter-status"], posture.io), 0, `${profile}: ${posture.err.join("\n")}`);
    assert.match(posture.out.join("\n"), /activation_ready: true/);
    assert.deepEqual(registry.nodes.map((node) => node.role), ["boss", "manager", "worker"]);
    assert.deepEqual(registry.nodes.map((node) => node.title), [
      `${CONFIG.repoSlug} - ${displayRoles[0]} - knowledge-refresh/boss`,
      `${CONFIG.repoSlug} - ${displayRoles[1]} - DOCS-4/manager-docs`,
      `${CONFIG.repoSlug} - ${displayRoles[2]} - RES-2/worker-research`
    ]);
  }

  const taxonomy = capture();
  assert.equal(await main(["orchestration", "taxonomy"], taxonomy.io), 0, taxonomy.err.join("\n"));
  const taxonomyText = taxonomy.out.join("\n");
  assert.match(taxonomyText, /profiles\[3\]\{profile,boss,manager,worker\}/);
  assert.match(taxonomyText, /"portable","Boss","Manager","Worker"/);
  assert.match(taxonomyText, /"nautical","Firstmate","Secondmate","Crewmate"/);
  assert.match(taxonomyText, /"executive","CEO","configured C-suite title","configured Director, Lead, or Contributor title"/);
  assert.match(taxonomyText, /Display labels never grant authority/);
});

test("no args renders content-first agent home view", async () => {
  const { io, out, err } = capture();
  const code = await main([], io);
  assert.equal(code, 0, err.join("\n"));
  assert.deepEqual(err, []);
  const text = out.join("\n");
  assert.match(text, new RegExp(`bin: "\\./${CONFIG.cliName}"`));
  assert.match(text, /description:/);
  assert.match(text, /commands\[10\]\{command,purpose\}:/);
  assert.match(text, /"preflight","Run read-only session-start checks"/);
  assert.match(text, /"ergonomics status","Audit agent-facing CLI ergonomics"/);
  assert.match(text, /"no-mistakes status","Check branch-to-PR validation gate setup"/);
  assert.match(text, /"lavish status","Check optional Lavish review-surface posture"/);
  assert.match(text, /"orchestration status","Inspect structured project delegation posture"/);
  assert.match(text, /help\[3\]:/);
  assert.doesNotMatch(text, /Usage:/);
  const localPathPattern = new RegExp([
    String.raw`/` + "Users" + String.raw`/`,
    String.raw`/` + "home" + String.raw`/`,
    String.raw`/` + "tmp" + String.raw`/`,
    String.raw`/` + "private" + String.raw`/` + "var" + String.raw`/`,
    String.raw`~` + String.raw`/`
  ].join("|"));
  assert.doesNotMatch(text, localPathPattern);
});

test("lavish status is local and non-mutating", async () => {
  const { io, out, err } = capture();
  const code = await runLavish(["status"], io, { commandExistsImpl: () => true });
  assert.equal(code, 0, err.join("\n"));
  const text = out.join("\n");
  assert.match(text, /lavish:/);
  assert.match(text, /module: "inactive-optional"/);
  assert.match(text, /protocol: "present"/);
  assert.match(text, /npx_available: true/);
  assert.match(text, new RegExp(`update_check: "\\./${CONFIG.cliName} lavish update --check"`));
  assert.match(text, /tracker_capture:/);
});

test("lavish update defaults to check mode", async () => {
  const runner = fakeCommandRunner({
    "npx -y lavish-axi update --check": { ok: true, stdout: "lavish-axi 0.1.37 is current\n" }
  });
  const { io, out, err } = capture();
  const code = await runLavish(["update"], io, { runImpl: runner.runImpl });
  assert.equal(code, 0, err.join("\n"));
  assert.deepEqual(runner.calls.map((call) => [call.command, call.args]), [["npx", ["-y", "lavish-axi", "update", "--check"]]]);
  const text = out.join("\n");
  assert.match(text, /action: "update"/);
  assert.match(text, /mode: "check"/);
  assert.match(text, /ok: true/);
});

test("lavish update help is local and does not invoke npx", async () => {
  const runner = fakeCommandRunner({
    default: { ok: false, status: 1, stderr: "should not run\n" }
  });
  const { io, out, err } = capture();
  const code = await runLavish(["update", "--help"], io, { runImpl: runner.runImpl });
  assert.equal(code, 0, err.join("\n"));
  assert.deepEqual(runner.calls, []);
  const text = out.join("\n");
  assert.match(text, new RegExp(`Usage: \\./${CONFIG.cliName} lavish update \\[--check\\|--apply\\]`));
  assert.match(text, /Defaults to --check/);
});

test("lavish update apply is explicit", async () => {
  const runner = fakeCommandRunner({
    "npx -y lavish-axi update": { ok: true, stdout: "updated\n" }
  });
  const { io, out, err } = capture();
  const code = await runLavish(["update", "--apply"], io, { runImpl: runner.runImpl });
  assert.equal(code, 0, err.join("\n"));
  assert.deepEqual(runner.calls.map((call) => [call.command, call.args]), [["npx", ["-y", "lavish-axi", "update"]]]);
  assert.match(out.join("\n"), /mode: "apply"/);
});

test("lavish tracker capture drafts a proposal without writing", async () => {
  const { io, out, err } = capture();
  const code = await runLavish(
    ["tracker", "capture", "--issue", "INT-936", "--artifact", ".lavish/review.html", "--decisions", "docs/lavish-decisions.md"],
    io
  );
  assert.equal(code, 0, err.join("\n"));
  const text = out.join("\n");
  assert.match(text, /tracker_update_proposal:/);
  assert.match(text, /mode: dry-run/);
  assert.match(text, /write_authority: none/);
  assert.match(text, /issue: "INT-936"/);
  assert.match(text, /artifact: "\.lavish\/review\.html"/);
  assert.match(text, /decisions_source: "docs\/lavish-decisions\.md"/);
  assert.match(text, /No-mistakes gate/);
});

test("lavish tracker capture requires an issue", async () => {
  const { io, out, err } = capture();
  const code = await runLavish(["tracker", "capture", "--artifact", ".lavish/review.html"], io);
  assert.equal(code, 2);
  assert.deepEqual(err, []);
  assert.match(out.join("\n"), /code: missing-issue/);
});

test("lavish tracker capture rejects flag-like separated issue values", async () => {
  const { io, out, err } = capture();
  const code = await runLavish(["tracker", "capture", "--issue", "--dry-run"], io);
  assert.equal(code, 2);
  assert.deepEqual(err, []);
  const text = out.join("\n");
  assert.match(text, /code: missing-flag-value/);
  assert.doesNotMatch(text, /tracker_update_proposal:/);
});

test("lavish tracker capture rejects flag-like inline issue values", async () => {
  const { io, out, err } = capture();
  const code = await runLavish(["tracker", "capture", "--issue=--artifact"], io);
  assert.equal(code, 2);
  assert.deepEqual(err, []);
  const text = out.join("\n");
  assert.match(text, /code: missing-flag-value/);
  assert.doesNotMatch(text, /tracker_update_proposal:/);
});

test("lavish tracker reconcile previews the goal handoff sequence", async () => {
  const { io, out, err } = capture();
  const code = await runLavish(["tracker", "reconcile", "--issue", "INT-936"], io);
  assert.equal(code, 0, err.join("\n"));
  const text = out.join("\n");
  assert.match(text, /lavish_tracker_reconcile:/);
  assert.match(text, /mode: dry-run/);
  assert.match(text, /issue: "INT-936"/);
  assert.match(text, /"capture decisions in tracker","proposal-first"/);
  assert.match(text, /"run no-mistakes when initialized","strongly recommended before merge"/);
});

test("lavish tracker reconcile rejects flag-like separated issue values", async () => {
  const { io, out, err } = capture();
  const code = await runLavish(["tracker", "reconcile", "--issue", "--dry-run"], io);
  assert.equal(code, 2);
  assert.deepEqual(err, []);
  const text = out.join("\n");
  assert.match(text, /code: missing-flag-value/);
  assert.doesNotMatch(text, /lavish_tracker_reconcile:/);
});

test("lavish tracker reconcile rejects flag-like inline issue values", async () => {
  const { io, out, err } = capture();
  const code = await runLavish(["tracker", "reconcile", "--issue=--dry-run"], io);
  assert.equal(code, 2);
  assert.deepEqual(err, []);
  const text = out.join("\n");
  assert.match(text, /code: missing-flag-value/);
  assert.doesNotMatch(text, /lavish_tracker_reconcile:/);
});

test("unknown top-level command is a structured usage error on stdout", async () => {
  const { io, out, err } = capture();
  const code = await main(["publsh"], io);
  assert.equal(code, 2);
  assert.deepEqual(err, []);
  const text = out.join("\n");
  assert.match(text, /error:/);
  assert.match(text, /code: unknown-command/);
  assert.match(text, /command: "publsh"/);
  assert.match(text, /Run \.\/{{CLI_NAME}} help for available commands/);
});

test("design status reports inactive module without design-system source", async () => {
  const { io, out, err } = capture();
  const code = await main(["design", "status"], io);
  assert.equal(code, 0, err.join("\n"));
  const text = out.join("\n");
  assert.match(text, /design system: inactive/);
  assert.match(text, /ops\/protocols\/DESIGN-SYSTEM\.md/);
  assert.match(text, /source: no known source pointers found/);
  assert.match(text, /activation:/);
});

fixtureTest("design status reports present manifest as unverified while inactive", async () => {
  fs.mkdirSync(path.join(repoRoot, "design-system"), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, "design-system", "manifest.json"), JSON.stringify({ name: "demo" }), "utf-8");
  const { io, out, err } = capture();
  const code = await main(["design", "status"], io);
  assert.equal(code, 0, err.join("\n"));
  const text = out.join("\n");
  assert.match(text, /design system: inactive/);
  assert.match(text, /source: design-system\/manifest\.json \(present, unverified\)/);
  assert.doesNotMatch(text, /source-discovered/);
});

fixtureTest("design status follows protocol status and known source pointers", async () => {
  const protocolPath = path.join(repoRoot, "ops", "protocols", "DESIGN-SYSTEM.md");
  const protocol = fs.readFileSync(protocolPath, "utf-8").replace(/^status:\s*inactive/m, "status: active");
  fs.writeFileSync(protocolPath, protocol, "utf-8");
  fs.mkdirSync(path.join(repoRoot, "design-system"), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, "design-system", "tokens.json"), JSON.stringify({ color: {} }), "utf-8");
  const { io, out, err } = capture();
  const code = await main(["design", "status"], io);
  assert.equal(code, 0, err.join("\n"));
  const text = out.join("\n");
  assert.match(text, /design system: declared active \(unverified\)/);
  assert.match(text, /source: design-system\/tokens\.json \(present, unverified\)/);
});

fixtureTest("design status accepts quoted front matter status", async () => {
  const protocolPath = path.join(repoRoot, "ops", "protocols", "DESIGN-SYSTEM.md");
  const protocol = fs.readFileSync(protocolPath, "utf-8").replace(/^status:\s*inactive/m, 'status: "active"');
  fs.writeFileSync(protocolPath, protocol, "utf-8");
  const { io, out, err } = capture();
  const code = await main(["design", "status"], io);
  assert.equal(code, 0, err.join("\n"));
  assert.match(out.join("\n"), /design system: declared active \(unverified\)/);
});

fixtureTest("design status treats mixed-case active status as unverified", async () => {
  const protocolPath = path.join(repoRoot, "ops", "protocols", "DESIGN-SYSTEM.md");
  const protocol = fs.readFileSync(protocolPath, "utf-8").replace(/^status:\s*inactive/m, "status: Active");
  fs.writeFileSync(protocolPath, protocol, "utf-8");
  const { io, out, err } = capture();
  const code = await main(["design", "status"], io);
  assert.equal(code, 0, err.join("\n"));
  assert.match(out.join("\n"), /design system: declared active \(unverified\)/);
});

fixtureTest("design status ignores status lines outside protocol front matter", async () => {
  const protocolPath = path.join(repoRoot, "ops", "protocols", "DESIGN-SYSTEM.md");
  fs.appendFileSync(protocolPath, "\n```yaml\nstatus: active\n```\n", "utf-8");
  const { io, out, err } = capture();
  const code = await main(["design", "status"], io);
  assert.equal(code, 0, err.join("\n"));
  assert.match(out.join("\n"), /design system: inactive/);
});

fixtureTest("design status reads inactive CRLF protocol front matter", async () => {
  const protocolPath = path.join(repoRoot, "ops", "protocols", "DESIGN-SYSTEM.md");
  const protocol = fs.readFileSync(protocolPath, "utf-8").replace(/\n/g, "\r\n");
  fs.writeFileSync(protocolPath, protocol, "utf-8");
  const { io, out, err } = capture();
  const code = await main(["design", "status"], io);
  assert.equal(code, 0, err.join("\n"));
  assert.match(out.join("\n"), /design system: inactive/);
});

fixtureTest("design status reads active CRLF protocol front matter", async () => {
  const protocolPath = path.join(repoRoot, "ops", "protocols", "DESIGN-SYSTEM.md");
  const protocol = fs
    .readFileSync(protocolPath, "utf-8")
    .replace(/^status:\s*inactive/m, "status: active")
    .replace(/\n/g, "\r\n");
  fs.writeFileSync(protocolPath, protocol, "utf-8");
  const { io, out, err } = capture();
  const code = await main(["design", "status"], io);
  assert.equal(code, 0, err.join("\n"));
  assert.match(out.join("\n"), /design system: declared active \(unverified\)/);
});

fixtureTest("design status degrades to unknown when protocol path is unreadable", async () => {
  const protocolPath = path.join(repoRoot, "ops", "protocols", "DESIGN-SYSTEM.md");
  fs.rmSync(protocolPath, { force: true });
  fs.mkdirSync(protocolPath);
  const { io, out, err } = capture();
  const code = await main(["design", "status"], io);
  assert.equal(code, 0, err.join("\n"));
  assert.match(out.join("\n"), /design system: unknown/);
});

test("design help resolves CLI name without template placeholders", async () => {
  const { io, out, err } = capture();
  const code = await main(["design", "help"], io);
  assert.equal(code, 0, err.join("\n"));
  const text = out.join("\n");
  assert.ok(text.includes(`./${CONFIG.cliName} design <command>`));
  assert.doesNotMatch(text, /\{\{CLI_NAME\}\}/);
});

test("unknown design subcommands fail with help pointer", async () => {
  const { io, out, err } = capture();
  const code = await main(["design", "validate"], io);
  assert.equal(code, 2);
  assert.deepEqual(err, []);
  const text = out.join("\n");
  assert.ok(text.includes(`./${CONFIG.cliName} design status`));
  assert.doesNotMatch(text, /\{\{CLI_NAME\}\}/);
});

test("unknown commands fail with help pointer", async () => {
  const { io, out, err } = capture();
  const code = await main(["does-not-exist"], io);
  assert.equal(code, 2);
  assert.deepEqual(err, []);
  assert.match(out.join("\n"), /help/);
});

test("ergonomics status audits the agent-facing CLI contract", async () => {
  const { io, out, err } = capture();
  const code = await main(["ergonomics", "status"], io);
  assert.equal(code, 0, err.join("\n"));
  assert.deepEqual(err, []);
  const text = out.join("\n");
  assert.match(text, /agent_cli_ergonomics:/);
  assert.match(text, /"home-view","pass"/);
  assert.match(text, /"dispatch-usage-errors","pass"/);
  assert.match(text, /"tests-cover-contract","pass"/);
  assert.match(text, /"warning-budget","pass"/);
  assert.match(text, /status: pass/);
  assert.match(text, /warnings: 0/);
  assert.doesNotMatch(text, /warnings\[/);
});

test("ergonomics strict audit passes with zero warnings", async () => {
  const { io, out, err } = capture();
  const code = await main(["ergonomics", "audit", "--strict"], io);
  assert.equal(code, 0);
  assert.deepEqual(err, []);
  assert.match(out.join("\n"), /warnings: 0/);
});

test("qa axi aliases the ergonomics audit", async () => {
  const { io, out, err } = capture();
  const code = await main(["qa", "axi"], io);
  assert.equal(code, 0, err.join("\n"));
  assert.deepEqual(err, []);
  assert.match(out.join("\n"), /agent_cli_ergonomics:/);
});

test("qa axi rejects unknown flags with structured stdout", async () => {
  const { io, out, err } = capture();
  const code = await main(["qa", "axi", "--bogus"], io);
  assert.equal(code, 2);
  assert.deepEqual(err, []);
  assert.match(out.join("\n"), /code: unknown-flag/);
});

test("ergonomics rejects unexpected positional args", async () => {
  for (const argv of [
    ["ergonomics", "status", "extra"],
    ["ergonomics", "audit", "extra"],
    ["ergonomics", "audit", "--strict", "extra"],
    ["qa", "axi", "status", "extra"]
  ]) {
    const { io, out, err } = capture();
    const code = await main(argv, io);
    assert.equal(code, 2, `${argv.join(" ")} should be a usage error`);
    assert.deepEqual(err, []);
    assert.match(out.join("\n"), /code: unexpected-argument/);
  }
});

test("command families reject unexpected args before doing work", async () => {
  const sensitiveArg = ["super", "secret", "token", "like", "value", "1234567890ABCDEF"].join("-");
  const cases = [
    ["context", "--bogus"],
    ["doctor", "--bogus"],
    ["protocols", "extra"],
    ["preflight", "extra"],
    ["checklist", "--bogus"],
    ["design", "status", "--bogus"],
    ["skills", "status", "extra"],
    ["self", "check", "extra"],
    ["secrets", "doctor", "--bogus"],
    ["connections", "status", "--bogus"],
    ["orchestration", "status", "--bogus"],
    ["goals", "status", "--bogus"],
    ["qa", "status", "--bogus"],
    ["no-mistakes", "status", "--bogus"],
    ["no-mistakes", "setup", "--bogus"],
    ["lavish", "status", "--bogus"],
    ["ergonomics", "status", sensitiveArg],
    ["verify", "--bogus"],
    ["precommit", "--bogus"],
    ["precommit", "hook-status", "--bogus"]
  ];

  for (const argv of cases) {
    const { io, out, err } = capture();
    const code = await main(argv, io);
    assert.equal(code, 2, `${argv.join(" ")} should be a usage error`);
    assert.deepEqual(err, [], `${argv.join(" ")} should report usage errors on stdout`);
    const text = out.join("\n");
    assert.match(text, /error:\n  code: (unknown-flag|unexpected-argument)/, argv.join(" "));
    assert.equal(text.includes(sensitiveArg), false);
  }
});

fixtureTest("ergonomics status blocks missing ergonomics protocol", async () => {
  fs.rmSync(path.join(repoRoot, "ops", "protocols", "AGENT-CLI-ERGONOMICS.md"));
  const { io, out, err } = capture();
  const code = await main(["ergonomics", "status"], io);
  assert.equal(code, 1);
  assert.deepEqual(err, []);
  assert.match(out.join("\n"), /protocol-active","blocker/);
});

test("secret redaction hides common values", () => {
  const localPath = ["/", "Users", "example", "private"].join("/");
  const highEntropy = ["9f8A7b6C", "5d4E3f2G", "1h0I9j8K", "7l6M5n4O"].join("");
  const text = redactSecrets(`${"tok"}en=abc123 ${"sk-"}testvalue ${"ghp_"}exampletoken ${localPath} ${highEntropy}`);
  assert.doesNotMatch(text, /abc123/);
  assert.equal(text.includes(`${"sk-"}testvalue`), false);
  assert.equal(text.includes(`${"ghp_"}exampletoken`), false);
  assert.equal(text.includes(localPath), false);
  assert.equal(text.includes(highEntropy), false);
  assert.match(text, /<redacted>/);
});

test("secret scanner detects JSON credential values", () => {
  const findings = findSecretIndicators(JSON.stringify({ [`tok${"en"}`]: "super-secret-json-token" }));
  assert.ok(findings.length > 0);
  assert.match(findings.join("\n"), /token/);
});

test("secret scanner does not treat test-prefixed values as placeholders", () => {
  const findings = findSecretIndicators(`${"api_key"}=corp-test-key-9f8a2c7e6d5b4a3c`);
  assert.ok(findings.length > 0);
  assert.match(findings.join("\n"), /api_key/);
});

test("secret scanner detects underscore-prefixed auth tokens and netrc entries", () => {
  const findings = findSecretIndicators(`//registry/:_${"auth"}${"Tok"}en=${"npm_"}abcdefghijklmnopqrstuvwxyz\n${"mach"}ine example.com login user ${"pass"}word super-secret`);
  assert.match(findings.join("\n"), /authToken|npm token|netrc/i);
});

test("secret scanner detects URL-embedded credentials and connection fields", () => {
  const findings = findSecretIndicators(`${"DATABASE_URL"}=${"postgres"}://${"user"}:${"realpass"}@example.com/db\n${"dsn"}=${"mysql"}://${"user"}:${"realpass"}@example.com/db`);
  assert.match(findings.join("\n"), /URL-embedded credential|DATABASE_URL|dsn/i);
});

test("secret scanner detects high-entropy values under off-pattern keys", () => {
  const highEntropyValue = ["Hx9Qa7Lm2Pz8", "Rt5Nv3Cy6Kw1", "Bb4Uf0Sd9Je2", "Yg7Qm5"].join("");
  const findings = findSecretIndicators(`apitoken_blob="${highEntropyValue}"`);
  assert.match(findings.join("\n"), /high-entropy/i);
});

test("secret scanner detects credential substrings in key names", () => {
  const lowerHexValue = ["a1b2c3d4e5f6", "a7b8c9d0e1f2", "a3b4c5d6e7f8", "a9b0"].join("");
  const firstFieldName = `${"secret"}_${"value"}`;
  const secondFieldName = `${"api"}${"token"}_blob`;
  const findings = findSecretIndicators(`${firstFieldName}="${lowerHexValue}"\n${secondFieldName}="${lowerHexValue}"`);
  assert.match(findings.join("\n"), /secret_value|apitoken_blob/);
});

test("secret scanner ignores non-credential parser token fields", () => {
  const findings = findSecretIndicators("evidenceTokens = row.split('|').map((part) => part.trim())");
  assert.equal(findings.length, 0);
});

fixtureTest("connections status blocks credential values in registry JSON", async () => {
  const registryPath = "ops/connections.json";
  const registry = JSON.parse(fs.readFileSync(path.join(repoRoot, registryPath), "utf-8"));
  registry.connections[0][`tok${"en"}`] = "super-secret-json-token";

  await withFile(registryPath, JSON.stringify(registry, null, 2) + "\n", async () => {
    const { io, err } = capture();
    const code = await main(["connections", "status"], io);
    assert.equal(code, 1);
    assert.match(err.join("\n"), /credential|secret|token/i);
  });
});

fixtureTest("connections status blocks unsafe credentialRefs", async () => {
  const registryPath = "ops/connections.json";
  const registry = JSON.parse(fs.readFileSync(path.join(repoRoot, registryPath), "utf-8"));
  registry.connections[0].status = "configured";
  registry.connections[0].owner = "repo-maintainers";
  registry.connections[0].credentialRefs = [`${"ya"}29.real-looking-token-value-that-is-not-a-reference`];

  await withFile(registryPath, JSON.stringify(registry, null, 2) + "\n", async () => {
    const { io, err } = capture();
    const code = await main(["connections", "status"], io);
    assert.equal(code, 1);
    assert.match(err.join("\n"), /credentialRef|Google OAuth token/i);
  });
});

fixtureTest("connections status blocks write-capable scopeRefs without approval", async () => {
  const registryPath = "ops/connections.json";
  const registry = JSON.parse(fs.readFileSync(path.join(repoRoot, registryPath), "utf-8"));
  registry.connections[0].status = "configured";
  registry.connections[0].owner = "repo-maintainers";
  registry.connections[0].credentialRefs = ["env:GMAIL_TOKEN"];
  registry.connections[0].allowedOperations = ["read"];
  registry.connections[0].scopeRefs = ["gmail.send"];
  delete registry.connections[0].writeApproval;

  await withFile(registryPath, JSON.stringify(registry, null, 2) + "\n", async () => {
    const { io, err } = capture();
    const code = await main(["connections", "status"], io);
    assert.equal(code, 1);
    assert.match(err.join("\n"), /write-capable operations or scopes/i);
  });
});

fixtureTest("connections status treats unknown OAuth scopes as write-capable by default", async () => {
  const registryPath = "ops/connections.json";
  const registry = JSON.parse(fs.readFileSync(path.join(repoRoot, registryPath), "utf-8"));
  registry.connections[0].status = "configured";
  registry.connections[0].owner = "repo-maintainers";
  registry.connections[0].credentialRefs = ["env:GOOGLE_WORKSPACE_TOKEN"];
  registry.connections[0].allowedOperations = ["read"];
  registry.connections[0].scopeRefs = [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/spreadsheets"
  ];
  delete registry.connections[0].writeApproval;

  await withFile(registryPath, JSON.stringify(registry, null, 2) + "\n", async () => {
    const { io, err } = capture();
    const code = await main(["connections", "status"], io);
    assert.equal(code, 1);
    assert.match(err.join("\n"), /write-capable operations or scopes/i);
  });
});

fixtureTest("connections status allows configured read-only scopes without writeApproval", async () => {
  const registryPath = "ops/connections.json";
  const registry = JSON.parse(fs.readFileSync(path.join(repoRoot, registryPath), "utf-8"));
  registry.connections[0].status = "configured";
  registry.connections[0].owner = "repo-maintainers";
  registry.connections[0].credentialRefs = ["env:GOOGLE_WORKSPACE_TOKEN"];
  registry.connections[0].allowedOperations = ["read"];
  registry.connections[0].scopeRefs = ["https://www.googleapis.com/auth/drive.readonly"];
  delete registry.connections[0].writeApproval;

  await withFile(registryPath, JSON.stringify(registry, null, 2) + "\n", async () => {
    const { io, err } = capture();
    const code = await main(["connections", "status"], io);
    assert.equal(code, 0, err.join("\n"));
  });
});

fixtureTest("connections status blocks connector write scopes in common scope fields", async () => {
  const registryPath = "ops/connections.json";
  const registry = JSON.parse(fs.readFileSync(path.join(repoRoot, registryPath), "utf-8"));
  registry.connectorProfiles = [
    {
      id: "write-google-workspace",
      provider: "google-workspace",
      status: "configured",
      authStorageClass: "provider-secure-storage",
      scopes: ["https://www.googleapis.com/auth/drive"]
    }
  ];

  await withFile(registryPath, JSON.stringify(registry, null, 2) + "\n", async () => {
    const { io, err } = capture();
    const code = await main(["connections", "status"], io);
    assert.equal(code, 1);
    assert.match(err.join("\n"), /write-capable connector scopes/i);
  });
});

fixtureTest("connections status requires explicit connector write approval", async () => {
  const registryPath = "ops/connections.json";
  const registry = JSON.parse(fs.readFileSync(path.join(repoRoot, registryPath), "utf-8"));
  registry.connectorProfiles = [
    {
      id: "write-with-disabled-approval",
      provider: "google-workspace",
      status: "configured",
      authStorageClass: "provider-secure-storage",
      scopes: ["https://www.googleapis.com/auth/drive"],
      writeApproval: { required: false }
    }
  ];

  await withFile(registryPath, JSON.stringify(registry, null, 2) + "\n", async () => {
    const { io, err } = capture();
    const code = await main(["connections", "status"], io);
    assert.equal(code, 1);
    assert.match(err.join("\n"), /writeApproval\.required=true/i);
  });
});

fixtureTest("connections status classifies object-valued connector scope fields", async () => {
  const registryPath = "ops/connections.json";
  const registry = JSON.parse(fs.readFileSync(path.join(repoRoot, registryPath), "utf-8"));
  registry.connectorProfiles = [
    {
      id: "object-scope-map",
      provider: "google-workspace",
      status: "configured",
      authStorageClass: "provider-secure-storage",
      writeScopes: {
        drive: ["https://www.googleapis.com/auth/drive"]
      }
    }
  ];

  await withFile(registryPath, JSON.stringify(registry, null, 2) + "\n", async () => {
    const { io, err } = capture();
    const code = await main(["connections", "status"], io);
    assert.equal(code, 1);
    assert.match(err.join("\n"), /writeApproval\.required=true/i);
  });
});

fixtureTest("connections status blocks unrecognized connector scope fields", async () => {
  const registryPath = "ops/connections.json";
  const registry = JSON.parse(fs.readFileSync(path.join(repoRoot, registryPath), "utf-8"));
  registry.connectorProfiles = [
    {
      id: "unknown-scope-field",
      provider: "google-workspace",
      status: "configured",
      authStorageClass: "provider-secure-storage",
      grantScopes: ["drive.readonly"]
    }
  ];

  await withFile(registryPath, JSON.stringify(registry, null, 2) + "\n", async () => {
    const { io, err } = capture();
    const code = await main(["connections", "status"], io);
    assert.equal(code, 1);
    assert.match(err.join("\n"), /unrecognized scope field grantScopes/i);
  });
});

test("connections plan explains setup without secrets", async () => {
  const { io, out } = capture();
  const code = await main(["connections", "plan"], io);
  assert.equal(code, 0);
  const text = out.join("\\n");
  assert.match(text, /least-privilege/);
  assert.match(text, /credentials outside the repository/);
  assert.match(text, /connector profile inventory/i);
  assert.match(text, /example-google-workspace/);
  assert.match(text, /drive: example-drive/);
  assert.match(text, /endpoint drive: configured/);
  assert.match(text, /expected account domain: configured/);
  assert.match(text, /auth profile boundary: repository/);
  assert.match(text, /config root strategy: env/);
  assert.doesNotMatch(text, /drivemcp\.googleapis\.com|\/mcp\/v1|example\.com/);
  assert.match(text, /does not require live auth/i);
});

fixtureTest("connections auth-plan describes repository-scoped auth without starting a flow", async () => {
  const { io, out, err } = capture();
  const code = await main(["connections", "auth-plan", "--profile", "example-gcloud", "--browser", "Chrome", "--flow", "browser"], io);
  assert.equal(code, 0, err.join("\n"));
  const text = out.join("\n");
  assert.match(text, /Connector auth plan: example-gcloud/);
  assert.match(text, /repo_id: [a-z0-9-]+--[a-f0-9]{12}/);
  assert.match(text, /profile_boundary: repository/);
  assert.match(text, /config_root_strategy: env/);
  assert.match(text, /selected_browser: "Chrome"/);
  assert.match(text, /starts_auth: false/);
  assert.match(text, /opens_browser: false/);
  assert.match(text, /prints_authorization_values: false/);
  assert.doesNotMatch(text, /https?:\/\/|device code|callback state|ya29\.|credentials\.json/i);
  assert.doesNotMatch(text, localPathPattern());
});

fixtureTest("connections auth-plan rejects flow types outside the profile contract", async () => {
  const { io, err } = capture();
  const code = await main(["connections", "auth-plan", "--profile", "example-gcloud", "--flow", "device-code"], io);
  assert.equal(code, 1);
  assert.match(err.join("\n"), /requested auth flow/i);
});

fixtureTest("connections env renders env-var config-root guidance without local paths", async () => {
  const { io, out, err } = capture();
  const code = await main(["connections", "env", "--profile", "example-gcloud"], io);
  assert.equal(code, 0, err.join("\n"));
  const text = out.join("\n");
  assert.match(text, /Connector auth environment: example-gcloud/);
  assert.match(text, /strategy: env/);
  assert.match(text, /env: CLOUDSDK_CONFIG/);
  assert.match(text, /export CLOUDSDK_CONFIG=\\?"\$\{XDG_CONFIG_HOME:-\$HOME\/\.config\}\/agent-connectors\/[a-z0-9-]+--[a-f0-9]{12}\/gcloud\\?"/);
  assert.doesNotMatch(text, localPathPattern());
});

fixtureTest("connections env renders config-dir flag guidance for Neon-style CLIs", async () => {
  const { io, out, err } = capture();
  const code = await main(["connections", "env", "--profile", "example-neon"], io);
  assert.equal(code, 0, err.join("\n"));
  const text = out.join("\n");
  assert.match(text, /strategy: flag/);
  assert.match(text, /flag: --config-dir/);
  assert.match(text, /executable: neonctl/);
  assert.match(text, /command_hint: "neonctl --config-dir/);
  assert.doesNotMatch(text, localPathPattern());
});

fixtureTest("connections status blocks unsafe auth profile config-root metadata", async () => {
  const registryPath = "ops/connections.json";
  const registry = JSON.parse(fs.readFileSync(path.join(repoRoot, registryPath), "utf-8"));
  registry.connectorProfiles = [
    {
      id: "bad-gcloud-auth",
      provider: "gcloud",
      status: "configured",
      authStorageClass: "repository-scoped-config-root",
      cliAuth: {
        profileBoundary: "repository",
        globalStatePolicy: "refuse-global-mutable-state",
        configRoot: {
          strategy: "env",
          env: "cloudsdk_config",
          providerSubdir: "../gcloud"
        },
        authFlowTypes: ["browser"]
      }
    }
  ];

  await withFile(registryPath, JSON.stringify(registry, null, 2) + "\n", async () => {
    const { io, err } = capture();
    const code = await main(["connections", "status"], io);
    assert.equal(code, 1);
    const text = err.join("\n");
    assert.match(text, /safe env name/i);
    assert.match(text, /providerSubdir/i);
  });
});

fixtureTest("connections list is count-bearing with an explicit empty state", async () => {
  const registryPath = "ops/connections.json";
  const registry = JSON.parse(fs.readFileSync(path.join(repoRoot, registryPath), "utf-8"));
  registry.connections = [];

  await withFile(registryPath, JSON.stringify(registry, null, 2) + "\n", async () => {
    const { io, out, err } = capture();
    const code = await main(["connections", "list"], io);
    assert.equal(code, 0, err.join("\n"));
    const text = out.join("\n");
    assert.match(text, /count: 0/);
    assert.match(text, /connections\[0\]\{id,provider,authority_class,status\}:/);
    assert.match(text, /empty: no registered external authorities/);
    assert.match(text, /help\[1\]:/);
  });
});

test("connections doctor missing profile is a structured usage error on stdout", async () => {
  const { io, out, err } = capture();
  const code = await main(["connections", "doctor"], io);
  assert.equal(code, 2);
  assert.deepEqual(err, []);
  assert.match(out.join("\n"), /code: missing-profile/);
  assert.match(out.join("\n"), /connections doctor --profile <profile-id>/);
});

test("core command smoke paths run", async () => {
  for (const argv of [["context"], ["doctor"], ["protocols"], ["preflight"], ["orchestration", "status"], ["ergonomics", "status"], ["no-mistakes", "status"], ["lavish", "status"], ["secrets", "help"], ["qa", "status"], ["self", "check"]]) {
    const { io, err } = capture();
    const code = await main(argv, io);
    assert.equal(code, 0, `${argv.join(" ")} failed: ${err.join("\n")}`);
  }
});

fixtureTest("preflight requires the orchestration protocol required by harness verification", async () => {
  fs.rmSync(path.join(repoRoot, "ops", "protocols", "AGENT-ORCHESTRATION.md"));

  const { io, err } = capture();
  const code = await main(["preflight"], io);

  assert.equal(code, 1);
  assert.match(err.join("\n"), /Missing protocol: ops\/protocols\/AGENT-ORCHESTRATION\.md/);
});

test("verify dry-run lists delegated checks", async () => {
  const { io, out, err } = capture();
  const code = await main(["verify", "--dry-run"], io);
  assert.equal(code, 0, err.join("\n"));
  assert.match(out.join("\n"), /doctor/);
  assert.match(out.join("\n"), /preflight/);
  assert.match(out.join("\n"), /ergonomics status/);
  assert.match(out.join("\n"), /no-mistakes status/);
  assert.match(out.join("\n"), /lavish status/);
  assert.match(out.join("\n"), /qa no-masking/);
  assert.match(out.join("\n"), /precommit --all/);
});

fixtureTest("no-mistakes status is value-safe when the tool is unavailable", async () => {
  const { runImpl } = fakeCommandRunner({
    "no-mistakes --version": { ok: false, status: 1 }
  });
  const status = collectNoMistakesStatus({ repoRoot, runImpl, env: noMistakesTestEnv() });
  assert.equal(status.available, false);
  assert.equal(status.config, "present");

  const { io, out, err } = capture();
  const code = await runNoMistakes(["status"], io, { repoRoot, runImpl, env: noMistakesTestEnv() });
  assert.equal(code, 0, err.join("\n"));
  assert.deepEqual(err, []);
  const text = out.join("\n");
  assert.match(text, /no_mistakes:/);
  assert.match(text, /available: false/);
  assert.match(text, /initialized: false/);
  assert.match(text, /config: present/);
  assert.doesNotMatch(text, localPathPattern());
  assert.doesNotMatch(text, /fork\.git/);
});

fixtureTest("no-mistakes status degrades when user-local agent config is unavailable", async () => {
  const env = { HOME: path.join(repoRoot, "home") };
  fs.mkdirSync(env.HOME, { recursive: true });
  fs.writeFileSync(path.join(env.HOME, ".no-mistakes"), "not a directory\n", "utf-8");
  const { runImpl } = fakeCommandRunner({
    "no-mistakes --version": { ok: false, status: 1 }
  });

  const status = collectNoMistakesStatus({ repoRoot, runImpl, env });
  assert.equal(status.agent_config, "unavailable");
  assert.equal(status.agent, null);

  const { io, out, err } = capture();
  const code = await runNoMistakes(["status"], io, { repoRoot, runImpl, env });
  assert.equal(code, 0, err.join("\n"));
  assert.deepEqual(err, []);
  const text = out.join("\n");
  assert.match(text, /agent_config: unavailable/);
  assert.doesNotMatch(text, /ENOTDIR|not a directory/);
  assert.doesNotMatch(text, localPathPattern());
});

fixtureTest("no-mistakes status summarizes initialized setup without raw status output", async () => {
  const forkUrl = "https://github.com/example/private-fork.git";
  const { runImpl } = fakeCommandRunner({
    "no-mistakes --version": { ok: true, status: 0, stdout: `no-mistakes 1.2.3 ${forkUrl} ${exampleLocalPath()}\n` },
    "no-mistakes status": { ok: true, status: 0, stdout: `repo: ${exampleLocalPath()}\ngate: ${exampleLocalPath()}/gate.git\ndaemon running\nrepo initialized\n` },
    "no-mistakes axi": {
      ok: true,
      status: 0,
      stdout: [
        "current_branch: RA/test-no-mistakes",
        "active_run:",
        '  id: "01CURRENT"',
        "  branch: RA/test-no-mistakes",
        "  status: running"
      ].join("\n")
    }
  });
  const { io, out, err } = capture();
  const code = await runNoMistakes(["status"], io, { repoRoot, runImpl, env: noMistakesTestEnv() });
  assert.equal(code, 0, err.join("\n"));
  const text = out.join("\n");
  assert.match(text, /available: true/);
  assert.match(text, /initialized: true/);
  assert.match(text, /repo_state: initialized/);
  assert.match(text, /daemon: ready/);
  assert.match(text, /agent_config: missing/);
  assert.match(text, /agent: "\(unset\)"/);
  assert.match(text, /current_branch: "RA\/test-no-mistakes"/);
  assert.match(text, /current_run: "RA\/test-no-mistakes running 01CURRENT"/);
  assert.match(text, /version: "no-mistakes 1\.2\.3"/);
  assert.doesNotMatch(text, /github\.com\/example|private-fork|example\/private|repo initialized/);
  assert.doesNotMatch(text, localPathPattern());
});

fixtureTest("no-mistakes status reports active runs on other branches", async () => {
  const { runImpl } = fakeCommandRunner({
    "no-mistakes --version": { ok: true, status: 0, stdout: "no-mistakes 1.2.3\n" },
    "no-mistakes status": { ok: true, status: 0, stdout: "gate: configured\ndaemon running\n" },
    "no-mistakes axi": {
      ok: true,
      status: 0,
      stdout: [
        "current_branch: RA/current-work",
        "other_branch_active_run:",
        '  id: "01OTHER"',
        "  branch: RA/other-validation",
        "  status: running",
        "runs[3]{id,branch,status,head,pr}:",
        '  "01OTHER",RA/other-validation,running,abc123,"https://github.com/example/private/pull/1"',
        '  "01SECOND",RA/second-validation,pending,def456,""',
        '  "01OLD",RA/old-validation,failed,aaa111,""'
      ].join("\n")
    }
  });
  const { io, out, err } = capture();
  const code = await runNoMistakes(["status"], io, { repoRoot, runImpl, env: noMistakesTestEnv() });
  assert.equal(code, 0, err.join("\n"));
  const text = out.join("\n");
  assert.match(text, /other_runs:/);
  assert.match(text, /RA\/other-validation running 01OTHER/);
  assert.match(text, /RA\/second-validation pending 01SECOND/);
  assert.match(text, /leave active validations in other branches\/worktrees alone/);
  assert.doesNotMatch(text, /RA\/old-validation|github\.com\/example|private\/pull/);
});

fixtureTest("no-mistakes status does not treat non-git success output as initialized", async () => {
  const { runImpl } = fakeCommandRunner({
    "no-mistakes --version": { ok: true, status: 0, stdout: "no-mistakes 1.2.3\n" },
    "no-mistakes status": { ok: true, status: 0, stdout: "not in a git repository\n" }
  });
  const status = collectNoMistakesStatus({ repoRoot, runImpl, env: noMistakesTestEnv() });
  assert.equal(status.available, true);
  assert.equal(status.initialized, false);
  assert.equal(status.repo_state, "not-ready");

  const { io, out, err } = capture();
  const code = await runNoMistakes(["status"], io, { repoRoot, runImpl, env: noMistakesTestEnv() });
  assert.equal(code, 0, err.join("\n"));
  const text = out.join("\n");
  assert.match(text, /available: true/);
  assert.match(text, /initialized: false/);
  assert.match(text, /repo_state: not-ready/);
});

test("no-mistakes unknown subcommands do not echo arbitrary input", async () => {
  const sensitiveCommand = "https://github.com/example/private-fork.git";
  const { io, out, err } = capture();
  const code = await runNoMistakes([sensitiveCommand], io, { runImpl: () => ({ ok: false, status: 1, stdout: "", stderr: "" }) });
  assert.equal(code, 2);
  assert.deepEqual(err, []);
  const text = out.join("\n");
  assert.match(text, /code: unknown-no-mistakes-command/);
  assert.doesNotMatch(text, /github\.com\/example|private-fork/);
});

test("no-mistakes setup rejects unsupported agent values safely", async () => {
  const cases = [
    { args: ["setup", "--agent", "https://github.com/example/private-agent.git"], hidden: /github\.com\/example|private-agent/ },
    { args: ["setup", "--agent", "acp:"], hidden: /agent: acp:/ },
    { args: ["setup", "--agent=acp:"], hidden: /agent: acp:/ },
    { args: ["setup", "--agent", "acp:../private-agent"], hidden: /\.\.\/private-agent/ },
    { args: ["setup", "--agent", "acp:private agent"], hidden: /private agent/ }
  ];

  for (const entry of cases) {
    let calls = 0;
    const { io, out, err } = capture();
    const code = await runNoMistakes(entry.args, io, {
      runImpl: () => {
        calls += 1;
        return { ok: false, status: 1, stdout: "", stderr: "" };
      }
    });
    assert.equal(code, 2);
    assert.equal(calls, 0);
    assert.deepEqual(err, []);
    const text = out.join("\n");
    assert.match(text, /code: unknown-flag/);
    assert.match(text, /detail: "--agent"/);
    assert.doesNotMatch(text, entry.hidden);
  }
});

fixtureTest("no-mistakes setup runs init, post-checks status, and hides fork URLs", async () => {
  const forkUrl = "https://github.com/example/fork.git";
  const { runImpl, calls } = fakeCommandRunner([
    { ok: true, status: 0, stdout: "no-mistakes 1.2.3\n" },
    { ok: false, status: 1, stderr: `not initialized at ${exampleLocalPath()}\n` },
    { ok: true, status: 0, stdout: "initialized\n" },
    { ok: true, status: 0, stdout: "no-mistakes 1.2.3\n" },
    { ok: true, status: 0, stdout: "gate: configured\ndaemon running\nrepo initialized\n" },
    { ok: true, status: 0, stdout: "current_branch: RA/test-no-mistakes\n" }
  ]);
  const { io, out, err } = capture();
  const code = await runNoMistakes(["setup", "--fork-url", forkUrl], io, { repoRoot, runImpl, env: noMistakesTestEnv() });
  assert.equal(code, 0, err.join("\n"));
  assert.deepEqual(calls[2].args, ["init", "--fork-url", forkUrl]);
  const excludeText = fs.readFileSync(path.join(repoRoot, ".git", "info", "exclude"), "utf-8");
  assert.match(excludeText, /(^|\n)\.no-mistakes\/\n/);
  const text = out.join("\n");
  assert.match(text, /no_mistakes_setup:/);
  assert.match(text, /status: ok/);
  assert.match(text, /fork_url: provided/);
  assert.match(text, /agent_config: unchanged/);
  assert.match(text, /agent: "unchanged"/);
  assert.match(text, /local_exclude: (added|present)/);
  assert.match(text, /post_check: pass/);
  assert.doesNotMatch(text, /github\.com\/example|repo initialized/);
  assert.doesNotMatch(text, localPathPattern());
});

fixtureTest("no-mistakes setup can pin a user-local agent when requested", async () => {
  const { runImpl } = fakeCommandRunner([
    { ok: true, status: 0, stdout: "no-mistakes 1.2.3\n" },
    { ok: false, status: 1, stderr: "not initialized\n" },
    { ok: true, status: 0, stdout: "initialized\n" },
    { ok: true, status: 0, stdout: "no-mistakes 1.2.3\n" },
    { ok: true, status: 0, stdout: "gate: configured\ndaemon running\nrepo initialized\n" },
    { ok: true, status: 0, stdout: "current_branch: RA/test-no-mistakes\n" }
  ]);
  const env = noMistakesTestEnv();
  const { io, out, err } = capture();
  const code = await runNoMistakes(["setup", "--agent", "codex"], io, { repoRoot, runImpl, env });
  assert.equal(code, 0, err.join("\n"));
  assert.match(fs.readFileSync(path.join(env.HOME, ".no-mistakes", "config.yaml"), "utf-8"), /^agent: codex$/m);
  const text = out.join("\n");
  assert.match(text, /agent_config: updated/);
  assert.match(text, /agent: "codex"/);
  assert.match(text, /codex pins no-mistakes fixes to Codex/);
  assert.doesNotMatch(text, localPathPattern());
});

fixtureTest("no-mistakes setup fails when an explicit agent pin cannot be written", async () => {
  const { runImpl } = fakeCommandRunner([
    { ok: true, status: 0, stdout: "no-mistakes 1.2.3\n" },
    { ok: false, status: 1, stderr: "not initialized\n" },
    { ok: true, status: 0, stdout: "initialized\n" },
    { ok: true, status: 0, stdout: "no-mistakes 1.2.3\n" },
    { ok: true, status: 0, stdout: "gate: configured\ndaemon running\nrepo initialized\n" },
    { ok: true, status: 0, stdout: "current_branch: RA/test-no-mistakes\n" }
  ]);
  const env = { HOME: path.join(repoRoot, "home") };
  fs.mkdirSync(env.HOME, { recursive: true });
  fs.writeFileSync(path.join(env.HOME, ".no-mistakes"), "not a directory\n", "utf-8");
  const { io, out, err } = capture();
  const code = await runNoMistakes(["setup", "--agent", "codex"], io, { repoRoot, runImpl, env });
  assert.equal(code, 1, err.join("\n"));
  assert.deepEqual(err, []);
  const text = out.join("\n");
  assert.match(text, /status: agent-config-failed/);
  assert.match(text, /initialized: true/);
  assert.match(text, /agent_config: unavailable/);
  assert.match(text, /agent: "unchanged"/);
  assert.match(text, /post_check: pass/);
  assert.doesNotMatch(text, /ENOTDIR|not a directory/);
  assert.doesNotMatch(text, localPathPattern());
});

fixtureTest("no-mistakes setup can pin a safe ACP target when requested", async () => {
  const { runImpl } = fakeCommandRunner([
    { ok: true, status: 0, stdout: "no-mistakes 1.2.3\n" },
    { ok: false, status: 1, stderr: "not initialized\n" },
    { ok: true, status: 0, stdout: "initialized\n" },
    { ok: true, status: 0, stdout: "no-mistakes 1.2.3\n" },
    { ok: true, status: 0, stdout: "gate: configured\ndaemon running\nrepo initialized\n" },
    { ok: true, status: 0, stdout: "current_branch: RA/test-no-mistakes\n" }
  ]);
  const env = noMistakesTestEnv();
  const { io, out, err } = capture();
  const code = await runNoMistakes(["setup", "--agent", "acp:local-agent_1.2"], io, { repoRoot, runImpl, env });
  assert.equal(code, 0, err.join("\n"));
  assert.match(fs.readFileSync(path.join(env.HOME, ".no-mistakes", "config.yaml"), "utf-8"), /^agent: acp:local-agent_1\.2$/m);
  const text = out.join("\n");
  assert.match(text, /agent_config: updated/);
  assert.match(text, /agent: "acp:configured"/);
  assert.match(text, /acp:configured pins no-mistakes through a configured ACP target/);
  assert.doesNotMatch(text, localPathPattern());
});

fixtureTest("no-mistakes setup supports git worktree pointer files for local exclude", async () => {
  const actualGitDir = path.join(repoRoot, ".git-worktree");
  fs.mkdirSync(path.join(actualGitDir, "info"), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, ".git"), `gitdir: ${path.relative(repoRoot, actualGitDir)}\n`, "utf-8");
  const { runImpl } = fakeCommandRunner([
    { ok: true, status: 0, stdout: "no-mistakes 1.2.3\n" },
    { ok: false, status: 1, stderr: "not initialized\n" },
    { ok: true, status: 0, stdout: "initialized\n" },
    { ok: true, status: 0, stdout: "no-mistakes 1.2.3\n" },
    { ok: true, status: 0, stdout: "gate: configured\ndaemon running\nrepo initialized\n" },
    { ok: true, status: 0, stdout: "current_branch: RA/test-no-mistakes\n" }
  ]);
  const { io, out, err } = capture();
  const code = await runNoMistakes(["setup"], io, { repoRoot, runImpl, env: noMistakesTestEnv() });
  assert.equal(code, 0, err.join("\n"));
  assert.match(fs.readFileSync(path.join(actualGitDir, "info", "exclude"), "utf-8"), /(^|\n)\.no-mistakes\/\n/);
  assert.match(out.join("\n"), /local_exclude: added/);
}, { git: false });

fixtureTest("no-mistakes setup degrades when local exclude cannot be written", async () => {
  fs.writeFileSync(path.join(repoRoot, "blocked-gitdir"), "not a directory\n", "utf-8");
  fs.writeFileSync(path.join(repoRoot, ".git"), "gitdir: blocked-gitdir\n", "utf-8");
  const { runImpl } = fakeCommandRunner([
    { ok: true, status: 0, stdout: "no-mistakes 1.2.3\n" },
    { ok: false, status: 1, stderr: "not initialized\n" },
    { ok: true, status: 0, stdout: "initialized\n" },
    { ok: true, status: 0, stdout: "no-mistakes 1.2.3\n" },
    { ok: true, status: 0, stdout: "gate: configured\ndaemon running\nrepo initialized\n" },
    { ok: true, status: 0, stdout: "current_branch: RA/test-no-mistakes\n" }
  ]);
  const { io, out, err } = capture();
  const code = await runNoMistakes(["setup"], io, { repoRoot, runImpl, env: noMistakesTestEnv() });
  assert.equal(code, 0, err.join("\n"));
  const text = out.join("\n");
  assert.match(text, /local_exclude: unavailable/);
  assert.doesNotMatch(text, /blocked-gitdir|ENOTDIR/);
  assert.doesNotMatch(text, localPathPattern());
}, { git: false });

fixtureTest("no-mistakes setup fails closed when init does not pass post-check", async () => {
  const { runImpl } = fakeCommandRunner([
    { ok: true, status: 0, stdout: "no-mistakes 1.2.3\n" },
    { ok: false, status: 1, stderr: "not initialized\n" },
    { ok: true, status: 0, stdout: "initialized\n" },
    { ok: true, status: 0, stdout: "no-mistakes 1.2.3\n" },
    { ok: false, status: 1, stderr: "not initialized\n" }
  ]);
  const { io, out, err } = capture();
  const code = await runNoMistakes(["setup"], io, { repoRoot, runImpl, env: noMistakesTestEnv() });
  assert.equal(code, 1, err.join("\n"));
  const text = out.join("\n");
  assert.match(text, /status: failed/);
  assert.match(text, /post_check: fail/);
});

fixtureTest("no-mistakes setup keeps post-check false for non-git success output", async () => {
  const { runImpl } = fakeCommandRunner([
    { ok: true, status: 0, stdout: "no-mistakes 1.2.3\n" },
    { ok: true, status: 0, stdout: "not in a git repository\n" },
    { ok: false, status: 1, stderr: "init failed\n" },
    { ok: true, status: 0, stdout: "no-mistakes 1.2.3\n" },
    { ok: true, status: 0, stdout: "not in a git repository\n" }
  ]);
  const { io, out, err } = capture();
  const code = await runNoMistakes(["setup"], io, { repoRoot, runImpl, env: noMistakesTestEnv() });
  assert.equal(code, 1, err.join("\n"));
  const text = out.join("\n");
  assert.match(text, /status: failed/);
  assert.match(text, /initialized: false/);
  assert.match(text, /post_check: fail/);
});

fixtureTest("orchestration inactive scaffold requires an explicitly configured Boss before bootstrap", async () => {
  const validation = capture();
  const validationCode = await main(["orchestration", "validate"], validation.io);
  assert.equal(validationCode, 0, validation.err.join("\n"));
  assert.match(validation.out.join("\n"), /valid: true/);
  assert.match(validation.out.join("\n"), /scaffolded but inactive/);

  const trust = capture();
  const trustCode = await main(["orchestration", "trust"], trust.io);
  assert.equal(trustCode, 0, trust.err.join("\n"));
  assert.match(trust.out.join("\n"), /T0.*Observe/);
  assert.match(trust.out.join("\n"), /T5.*Govern/);
  assert.match(trust.out.join("\n"), /role never grants authority/i);

  const prompt = capture();
  const promptCode = await main(["orchestration", "prompt", "boss"], prompt.io);
  assert.equal(promptCode, 1);
  assert.match(prompt.err.join("\n"), /Orchestration node not found: boss/);

  const launch = capture();
  const launchCode = await main(["orchestration", "launch-spec", "boss"], launch.io);
  assert.equal(launchCode, 1);
  assert.match(launch.err.join("\n"), /Orchestration node not found: boss/);
});

fixtureTest("orchestration supports non-ticket artifact and decision work through one hierarchy", async () => {
  writeOrchestrationRegistry(validOrchestrationRegistry());

  const validation = capture();
  const validationCode = await main(["orchestration", "validate"], validation.io);
  assert.equal(validationCode, 0, validation.out.concat(validation.err).join("\n"));
  assert.match(validation.out.join("\n"), /valid: true/);

  const next = capture();
  const nextCode = await main(["orchestration", "next"], next.io);
  assert.equal(nextCode, 0, next.err.join("\n"));
  const nextText = next.out.join("\n");
  assert.match(nextText, /manager-docs.*documentation/);
  assert.doesNotMatch(nextText, /worker-research/);

  const prompt = capture();
  const promptCode = await main(["orchestration", "prompt", "manager-docs"], prompt.io);
  assert.equal(promptCode, 0, prompt.err.join("\n"));
  const promptText = prompt.out.join("\n");
  assert.match(promptText, /Work kind: documentation/);
  assert.match(promptText, /Governing protocols: AGENT-ORCHESTRATION, DOCUMENT-QUALITY/);
  assert.match(promptText, /Completion profile: artifact/);
  assert.match(promptText, /Immediate parent task ID: task-boss/);

  const launch = capture();
  const launchCode = await main(["orchestration", "launch-spec", "manager-docs"], launch.io);
  assert.equal(launchCode, 0, launch.err.join("\n"));
  const spec = JSON.parse(launch.out.join("\n"));
  assert.equal(spec.parentTaskId, "task-boss");
  assert.equal(spec.callback.mode, "update-node");
  assert.equal(spec.title, `${CONFIG.projectName} - Manager - DOCS-4 Documentation refresh`);
  assert.ok(spec.callback.bind.requiredUpdates.includes("parentTaskId=immediate parent taskId"));
  assert.ok(spec.callback.reconcile.requiredUpdates.includes("parentTaskId=immediate parent taskId"));
});

fixtureTest("orchestration activates configured Boss callbacks", async () => {
  const registry = validOrchestrationRegistry();
  const boss = registry.nodes.find((node) => node.id === "boss");
  registry.status = "inactive";
  boss.state = "eligible";
  boss.taskId = null;
  delete boss.taskBinding;
  delete boss.nextAction;
  writeOrchestrationRegistry(registry);

  const launch = capture();
  const launchCode = await main(["orchestration", "launch-spec", "boss"], launch.io);
  assert.equal(launchCode, 0, launch.err.join("\n"));
  const spec = JSON.parse(launch.out.join("\n"));
  assert.equal(spec.callback.mode, "update-node");
  assert.deepEqual(spec.callback.requiredUpdates, ["status=active", "taskId", "taskBinding", "state=working", "nextAction"]);
  assert.equal(spec.callback.reserve.onSuccess.status, "active");

  registry.status = "active";
  boss.taskId = "task-configured-boss";
  boss.state = "working";
  boss.nextAction = "Review eligible project work.";
  boss.taskBinding = taskBindingForTest(registry, boss);
  writeOrchestrationRegistry(registry);

  const next = capture();
  const nextCode = await main(["orchestration", "next"], next.io);
  assert.equal(nextCode, 0, next.err.join("\n"));
  assert.match(next.out.join("\n"), /manager-docs.*documentation/);
});

fixtureTest("orchestration requires the core protocol for every node", async () => {
  const registry = validOrchestrationRegistry();
  const worker = registry.nodes.find((node) => node.id === "worker-research");
  worker.governingProtocols = ["DOCUMENT-QUALITY"];
  writeOrchestrationRegistry(registry);

  const validation = capture();
  const validationCode = await main(["orchestration", "validate"], validation.io);
  assert.equal(validationCode, 1);
  assert.match(validation.out.join("\n"), /node worker-research: governingProtocols must include AGENT-ORCHESTRATION/);

  const prompt = capture();
  const promptCode = await main(["orchestration", "prompt", "worker-research"], prompt.io);
  assert.equal(promptCode, 1);
  assert.match(prompt.err.join("\n"), /Orchestration registry has blockers/);
});

fixtureTest("orchestration refuses role-based authority escalation and delegation-budget expansion", async () => {
  const registry = validOrchestrationRegistry();
  const manager = registry.nodes.find((node) => node.id === "manager-docs");
  manager.trustLevel = "T4";
  manager.trustApproval = {
    approvedBy: "project-owner",
    approvedAt: "2026-07-16",
    evidence: ["bounded promotion review"]
  };
  manager.authority = orchestrationAuthority({
    reads: ["project", "private-system"],
    writes: ["project-files", "production"],
    external: ["deploy-production"],
    canDelegate: true,
    maxActiveChildren: 5
  });
  writeOrchestrationRegistry(registry);

  const { io, out, err } = capture();
  const code = await main(["orchestration", "validate"], io);
  assert.equal(code, 1, err.join("\n"));
  const text = out.join("\n");
  assert.match(text, /trustLevel T4 exceeds parent boss trustLevel T3/);
  assert.match(text, /authority\.allowedReads entry private-system exceeds parent scope/);
  assert.match(text, /authority\.allowedWrites entry production exceeds parent scope/);
  assert.match(text, /authority\.allowedExternalActions entry deploy-production exceeds parent scope/);
  assert.match(text, /maxActiveChildren 5 exceeds parent budget 2/);
});

fixtureTest("orchestration trust levels remain ceilings even for the Boss role", async () => {
  const registry = validOrchestrationRegistry();
  const boss = registry.nodes.find((node) => node.id === "boss");
  boss.trustLevel = "T1";
  boss.authority.allowedWrites = ["project-files"];
  boss.authority.allowedExternalActions = ["tracker-update"];
  boss.authority.canDelegate = true;
  writeOrchestrationRegistry(registry);

  const { io, out } = capture();
  const code = await main(["orchestration", "validate"], io);
  assert.equal(code, 1);
  const text = out.join("\n");
  assert.match(text, /node boss: T1 may not allow writes/);
  assert.match(text, /node boss: T1 may not allow external actions/);
  assert.match(text, /node boss: delegation requires T3 or higher/);
});

fixtureTest("orchestration requires children to retain every parent approval gate", async () => {
  const registry = validOrchestrationRegistry();
  const boss = registry.nodes.find((node) => node.id === "boss");
  const manager = registry.nodes.find((node) => node.id === "manager-docs");
  const worker = registry.nodes.find((node) => node.id === "worker-research");
  boss.authority.approvalGates = ["activation", "merge"];
  manager.authority.approvalGates = ["activation"];
  writeOrchestrationRegistry(registry);

  const missingGate = capture();
  const missingGateCode = await main(["orchestration", "validate"], missingGate.io);
  assert.equal(missingGateCode, 1);
  assert.match(missingGate.out.join("\n"), /node manager-docs: authority\.approvalGates is missing parent gate merge/);

  const launch = capture();
  const launchCode = await main(["orchestration", "launch-spec", "manager-docs"], launch.io);
  assert.equal(launchCode, 1);
  assert.match(launch.err.join("\n"), /Orchestration registry has blockers/);

  manager.authority.approvalGates = ["activation", "merge"];
  worker.authority.approvalGates = ["activation", "merge"];
  boss.taskBinding = taskBindingForTest(registry, boss);
  writeOrchestrationRegistry(registry);
  const retainedGate = capture();
  const retainedGateCode = await main(["orchestration", "validate"], retainedGate.io);
  assert.equal(retainedGateCode, 0, retainedGate.out.concat(retainedGate.err).join("\n"));
});

fixtureTest("orchestration trust promotion requires an auditable human approval record", async () => {
  const registry = validOrchestrationRegistry();
  delete registry.nodes.find((node) => node.id === "boss").trustApproval;
  writeOrchestrationRegistry(registry);

  const { io, out } = capture();
  const code = await main(["orchestration", "validate"], io);
  assert.equal(code, 1);
  assert.match(out.join("\n"), /trust promotion above T1 requires structured trustApproval/);
});

fixtureTest("orchestration unlocks queued work only from terminal dependency evidence", async () => {
  const registry = validOrchestrationRegistry();
  const manager = registry.nodes.find((node) => node.id === "manager-docs");
  manager.state = "terminal";
  manager.taskId = "task-manager-docs";
  manager.parentTaskId = "task-boss";
  manager.terminalDisposition = "completed";
  manager.completionEvidence = ["approved documentation artifact"];
  manager.taskBinding = taskBindingForTest(registry, manager);
  writeOrchestrationRegistry(registry);

  const next = capture();
  const nextCode = await main(["orchestration", "next"], next.io);
  assert.equal(nextCode, 0, next.err.join("\n"));
  assert.match(next.out.join("\n"), /worker-research.*research/);

  const launch = capture();
  const launchCode = await main(["orchestration", "launch-spec", "worker-research"], launch.io);
  assert.equal(launchCode, 0, launch.err.join("\n"));
  const spec = JSON.parse(launch.out.join("\n"));
  assert.equal(spec.parentTaskId, "task-boss");
  assert.match(spec.prompt, /Completion profile: human-decision/);
});

fixtureTest("orchestration rejects eligible work until every dependency is completed", async () => {
  const registry = validOrchestrationRegistry();
  const worker = registry.nodes.find((node) => node.id === "worker-research");
  worker.state = "eligible";
  writeOrchestrationRegistry(registry);

  const validation = capture();
  const validationCode = await main(["orchestration", "validate"], validation.io);
  assert.equal(validationCode, 1);
  assert.match(validation.out.join("\n"), /node worker-research: eligible state requires completed dependencies/);

  const prompt = capture();
  const promptCode = await main(["orchestration", "prompt", "worker-research"], prompt.io);
  assert.equal(promptCode, 1);
  assert.match(prompt.err.join("\n"), /Orchestration registry has blockers/);

  const launch = capture();
  const launchCode = await main(["orchestration", "launch-spec", "worker-research"], launch.io);
  assert.equal(launchCode, 1);
  assert.match(launch.err.join("\n"), /Orchestration registry has blockers/);
});

fixtureTest("orchestration rejects every active task state until dependencies are completed", async () => {
  for (const [state, stateFields] of [
    ["working", { nextAction: "Prepare the research decision." }],
    ["waiting", { waitingOn: "manager-docs evidence review" }],
    ["blocked", { blocker: "Missing source material.", unblockAction: "Obtain the source material." }],
    ["ready-for-parent", { handoffEvidence: ["draft research decision"] }]
  ]) {
    const registry = validOrchestrationRegistry();
    const worker = registry.nodes.find((node) => node.id === "worker-research");
    worker.state = state;
    worker.taskId = `task-worker-${state}`;
    worker.parentTaskId = "task-boss";
    Object.assign(worker, stateFields);
    writeOrchestrationRegistry(registry);

    const { io, out } = capture();
    const code = await main(["orchestration", "validate"], io);
    assert.equal(code, 1, state);
    assert.match(out.join("\n"), /node worker-research: active state requires completed dependencies/);
  }
});

fixtureTest("orchestration reports malformed array-shaped fields without crashing", async () => {
  const registry = validOrchestrationRegistry();
  const worker = registry.nodes.find((node) => node.id === "worker-research");
  const manager = registry.nodes.find((node) => node.id === "manager-docs");
  worker.state = "eligible";
  worker.dependencies = { manager: "manager-docs" };
  manager.authority.allowedReads = { project: true };
  writeOrchestrationRegistry(registry);

  const { io, out } = capture();
  const code = await main(["orchestration", "validate"], io);
  assert.equal(code, 1);
  const text = out.join("\n");
  assert.match(text, /node worker-research: dependencies must be an array of node ids/);
  assert.match(text, /node manager-docs: authority\.allowedReads must be an array of single-line strings/);
});

fixtureTest("orchestration requires every declared completion evidence item before terminal work validates", async () => {
  const registry = validOrchestrationRegistry();
  const manager = registry.nodes.find((node) => node.id === "manager-docs");
  manager.state = "terminal";
  manager.taskId = "task-manager-docs";
  manager.parentTaskId = "task-boss";
  manager.terminalDisposition = "completed";
  manager.completionEvidence = ["unrelated artifact"];
  writeOrchestrationRegistry(registry);

  const { io, out } = capture();
  const code = await main(["orchestration", "validate"], io);
  assert.equal(code, 1);
  assert.match(out.join("\n"), /completionEvidence is missing required evidence: approved documentation artifact/);
});

fixtureTest("orchestration rejects completed terminal work with unfinished prerequisites", async () => {
  const registry = validOrchestrationRegistry();
  const manager = registry.nodes.find((node) => node.id === "manager-docs");
  const prerequisite = registry.nodes.find((node) => node.id === "worker-research");
  prerequisite.id = "worker-prerequisite";
  prerequisite.workRef = "PRE-1";
  prerequisite.label = "Prerequisite research";
  prerequisite.title = `${CONFIG.projectName} - Worker for Boss - PRE-1 Prerequisite research`;
  prerequisite.dependencies = [];
  manager.dependencies = [prerequisite.id];
  manager.state = "terminal";
  manager.taskId = "task-manager-docs";
  manager.parentTaskId = "task-boss";
  manager.terminalDisposition = "completed";
  manager.completionEvidence = ["approved documentation artifact"];
  writeOrchestrationRegistry(registry);

  const { io, out } = capture();
  const code = await main(["orchestration", "validate"], io);
  assert.equal(code, 1);
  assert.match(out.join("\n"), /node manager-docs: completed terminal state requires completed dependencies/);
});

fixtureTest("orchestration keeps dependents blocked for cancelled or superseded prerequisites", async () => {
  for (const terminalDisposition of ["cancelled", "superseded"]) {
    const registry = validOrchestrationRegistry();
    const manager = registry.nodes.find((node) => node.id === "manager-docs");
    manager.state = "terminal";
    manager.taskId = "task-manager-docs";
    manager.parentTaskId = "task-boss";
    manager.terminalDisposition = terminalDisposition;
    manager.completionEvidence = ["approved documentation artifact"];
    manager.taskBinding = taskBindingForTest(registry, manager);
    writeOrchestrationRegistry(registry);

    const next = capture();
    const nextCode = await main(["orchestration", "next"], next.io);
    assert.equal(nextCode, 0, `${terminalDisposition}: ${next.err.join("\n")}`);
    assert.match(next.out.join("\n"), /eligible: 0/);
    assert.doesNotMatch(next.out.join("\n"), /worker-research.*research/);

    const launch = capture();
    const launchCode = await main(["orchestration", "launch-spec", "worker-research"], launch.io);
    assert.equal(launchCode, 1, terminalDisposition);
    assert.match(launch.err.join("\n"), /not dependency-eligible/);
  }
});

fixtureTest("orchestration rejects terminal ambiguity and duplicate task launches", async () => {
  const registry = validOrchestrationRegistry();
  const manager = registry.nodes.find((node) => node.id === "manager-docs");
  manager.state = "terminal";
  manager.taskId = "task-manager-docs";
  manager.parentTaskId = "task-boss";
  manager.completionEvidence = ["artifact exists"];
  writeOrchestrationRegistry(registry);

  const validation = capture();
  const validationCode = await main(["orchestration", "validate"], validation.io);
  assert.equal(validationCode, 1);
  assert.match(validation.out.join("\n"), /terminal state requires completed, cancelled, or superseded terminalDisposition/);

  writeOrchestrationRegistry(validOrchestrationRegistry());
  const duplicate = capture();
  const duplicateCode = await main(["orchestration", "launch-spec", "boss"], duplicate.io);
  assert.equal(duplicateCode, 1);
  assert.match(duplicate.err.join("\n"), /already has task state/);
});

fixtureTest("orchestration rejects a terminal parent with unfinished child responsibility", async () => {
  const registry = validOrchestrationRegistry();
  const manager = registry.nodes.find((node) => node.id === "manager-docs");
  const worker = registry.nodes.find((node) => node.id === "worker-research");
  manager.state = "terminal";
  manager.taskId = "task-manager-docs";
  manager.parentTaskId = "task-boss";
  manager.terminalDisposition = "completed";
  manager.completionEvidence = ["approved documentation artifact"];
  manager.trustLevel = "T3";
  manager.trustApproval = {
    approvedBy: "project-owner",
    approvedAt: "2026-07-16",
    evidence: ["bounded workstream delegation approval"]
  };
  manager.authority = orchestrationAuthority({ canDelegate: true, maxActiveChildren: 1 });
  worker.parentId = "manager-docs";
  worker.dependencies = [];
  worker.title = `${CONFIG.projectName} - Worker for Manager DOCS-4 - RES-2 Research decision`;
  writeOrchestrationRegistry(registry);

  const { io, out } = capture();
  const code = await main(["orchestration", "validate"], io);
  assert.equal(code, 1);
  assert.match(out.join("\n"), /node manager-docs: terminal parent has non-terminal children/);
});

fixtureTest("orchestration rejects duplicate task IDs and task-backed children without task-backed parents", async () => {
  const duplicateTask = validOrchestrationRegistry();
  const duplicateManager = duplicateTask.nodes.find((node) => node.id === "manager-docs");
  duplicateManager.state = "working";
  duplicateManager.taskId = "task-boss";
  duplicateManager.parentTaskId = "task-boss";
  duplicateManager.nextAction = "Review the documentation refresh.";
  writeOrchestrationRegistry(duplicateTask);

  const duplicate = capture();
  const duplicateCode = await main(["orchestration", "validate"], duplicate.io);
  assert.equal(duplicateCode, 1);
  assert.match(duplicate.out.join("\n"), /node manager-docs: taskId task-boss duplicates node boss/);

  const parentlessTask = validOrchestrationRegistry();
  const manager = parentlessTask.nodes.find((node) => node.id === "manager-docs");
  const worker = parentlessTask.nodes.find((node) => node.id === "worker-research");
  worker.parentId = manager.id;
  worker.title = `${CONFIG.projectName} - Worker for Manager DOCS-4 - RES-2 Research decision`;
  worker.dependencies = [];
  worker.state = "working";
  worker.taskId = "task-worker-research";
  worker.parentTaskId = "task-manager-docs";
  worker.nextAction = "Prepare the research decision.";
  writeOrchestrationRegistry(parentlessTask);

  const missingParentTask = capture();
  const missingParentTaskCode = await main(["orchestration", "validate"], missingParentTask.io);
  assert.equal(missingParentTaskCode, 1);
  assert.match(missingParentTask.out.join("\n"), /node worker-research: task-backed non-Boss node requires task-backed parent manager-docs/);
});

fixtureTest("orchestration rejects task-backed nodes while inactive", async () => {
  const registry = validOrchestrationRegistry();
  registry.status = "inactive";
  writeOrchestrationRegistry(registry);

  const { io, out } = capture();
  const code = await main(["orchestration", "validate"], io);
  assert.equal(code, 1);
  assert.match(out.join("\n"), /node boss: inactive orchestration may not contain task-backed nodes/);
});

fixtureTest("orchestration rejects hierarchical dependency deadlocks and composed graph cycles", async () => {
  const ancestorDependency = validOrchestrationRegistry();
  ancestorDependency.nodes.find((node) => node.id === "worker-research").dependencies = ["boss"];
  writeOrchestrationRegistry(ancestorDependency);

  const direct = capture();
  const directCode = await main(["orchestration", "validate"], direct.io);
  assert.equal(directCode, 1);
  assert.match(direct.out.join("\n"), /node worker-research: dependency boss crosses the parent hierarchy/);

  const combinedCycle = validOrchestrationRegistry();
  const manager = combinedCycle.nodes.find((node) => node.id === "manager-docs");
  const worker = combinedCycle.nodes.find((node) => node.id === "worker-research");
  manager.state = "queued";
  manager.dependencies = ["worker-review"];
  manager.trustLevel = "T3";
  manager.trustApproval = {
    approvedBy: "project-owner",
    approvedAt: "2026-07-16",
    evidence: ["bounded workstream delegation approval"]
  };
  manager.authority = orchestrationAuthority({ canDelegate: true, maxActiveChildren: 1 });
  worker.parentId = "manager-docs";
  worker.dependencies = [];
  worker.title = `${CONFIG.projectName} - Worker for Manager DOCS-4 - RES-2 Research decision`;
  combinedCycle.nodes.push({
    ...worker,
    id: "worker-review",
    workRef: "REV-3",
    label: "Review gate",
    title: `${CONFIG.projectName} - Worker for Boss - REV-3 Review gate`,
    parentId: "boss",
    dependencies: ["worker-research"],
    objective: "Review the research outcome before its parent can complete.",
    completionProfile: {
      type: "artifact",
      requiredEvidence: ["review record"]
    }
  });
  writeOrchestrationRegistry(combinedCycle);

  const composed = capture();
  const composedCode = await main(["orchestration", "validate"], composed.io);
  assert.equal(composedCode, 1);
  assert.match(composed.out.join("\n"), /orchestration graph contains a parent\/dependency cycle/);
});

fixtureTest("orchestration validator rejects graph cycles and project budget overruns", async () => {
  const registry = validOrchestrationRegistry();
  registry.trustPolicy.limits.maxActiveNodes = 1;
  registry.trustPolicy.limits.maxDelegationDepth = 0;
  const boss = registry.nodes.find((node) => node.id === "boss");
  const manager = registry.nodes.find((node) => node.id === "manager-docs");
  const worker = registry.nodes.find((node) => node.id === "worker-research");
  boss.parentId = "manager-docs";
  manager.state = "working";
  manager.taskId = "task-manager-docs";
  manager.parentTaskId = "task-boss";
  manager.nextAction = "Draft the bounded artifact.";
  manager.dependencies = ["worker-research"];
  worker.dependencies = ["manager-docs"];
  writeOrchestrationRegistry(registry);

  const { io, out } = capture();
  const code = await main(["orchestration", "validate"], io);
  assert.equal(code, 1);
  const text = out.join("\n");
  assert.match(text, /parent graph contains a cycle/);
  assert.match(text, /dependency graph contains a cycle/);
  assert.match(text, /delegation depth .* exceeds project limit 0/);
  assert.match(text, /2 active nodes exceed project limit 1/);
});

fixtureTest("orchestration launch contracts enforce delegation and capacity at materialization time", async () => {
  const noDelegation = validOrchestrationRegistry();
  const noDelegationBoss = noDelegation.nodes.find((node) => node.id === "boss");
  noDelegationBoss.authority.canDelegate = false;
  noDelegationBoss.taskBinding = taskBindingForTest(noDelegation, noDelegationBoss);
  writeOrchestrationRegistry(noDelegation);
  const authority = capture();
  const authorityCode = await main(["orchestration", "launch-spec", "manager-docs"], authority.io);
  assert.equal(authorityCode, 1);
  assert.match(authority.err.join("\n"), /parent boss lacks T3 delegation authority/);

  const childBudget = validOrchestrationRegistry();
  const childBudgetBoss = childBudget.nodes.find((node) => node.id === "boss");
  const activeManager = childBudget.nodes.find((node) => node.id === "manager-docs");
  const queuedWorker = childBudget.nodes.find((node) => node.id === "worker-research");
  childBudgetBoss.authority.maxActiveChildren = 1;
  activeManager.state = "working";
  activeManager.taskId = "task-manager-docs";
  activeManager.parentTaskId = "task-boss";
  activeManager.nextAction = "Draft the bounded artifact.";
  childBudgetBoss.taskBinding = taskBindingForTest(childBudget, childBudgetBoss);
  activeManager.taskBinding = taskBindingForTest(childBudget, activeManager);
  queuedWorker.dependencies = [];
  writeOrchestrationRegistry(childBudget);
  const capacity = capture();
  const capacityCode = await main(["orchestration", "launch-spec", "worker-research"], capacity.io);
  assert.equal(capacityCode, 1);
  assert.match(capacity.err.join("\n"), /exhausted its active-child budget/);

  const projectBudget = validOrchestrationRegistry();
  const projectManager = projectBudget.nodes.find((node) => node.id === "manager-docs");
  const projectWorker = projectBudget.nodes.find((node) => node.id === "worker-research");
  projectBudget.trustPolicy.limits.maxActiveNodes = 2;
  projectManager.state = "working";
  projectManager.taskId = "task-manager-docs";
  projectManager.parentTaskId = "task-boss";
  projectManager.nextAction = "Draft the bounded artifact.";
  projectWorker.dependencies = [];
  const projectBoss = projectBudget.nodes.find((node) => node.id === "boss");
  projectBoss.taskBinding = taskBindingForTest(projectBudget, projectBoss);
  projectManager.taskBinding = taskBindingForTest(projectBudget, projectManager);
  writeOrchestrationRegistry(projectBudget);
  const portfolio = capture();
  const portfolioCode = await main(["orchestration", "launch-spec", "worker-research"], portfolio.io);
  assert.equal(portfolioCode, 1);
  assert.match(portfolio.err.join("\n"), /project active-node budget is exhausted/);
});

fixtureTest("orchestration refuses child launches from ready-for-parent nodes", async () => {
  const registry = validOrchestrationRegistry();
  const manager = registry.nodes.find((node) => node.id === "manager-docs");
  const worker = registry.nodes.find((node) => node.id === "worker-research");
  manager.state = "ready-for-parent";
  manager.taskId = "task-manager-docs";
  manager.parentTaskId = "task-boss";
  manager.handoffEvidence = ["approved documentation artifact"];
  manager.trustLevel = "T3";
  manager.trustApproval = {
    approvedBy: "project-owner",
    approvedAt: "2026-07-16",
    evidence: ["bounded workstream delegation approval"]
  };
  manager.authority = orchestrationAuthority({ canDelegate: true, maxActiveChildren: 1 });
  worker.parentId = manager.id;
  worker.dependencies = [];
  worker.title = `${CONFIG.projectName} - Worker for Manager DOCS-4 - RES-2 Research decision`;
  writeOrchestrationRegistry(registry);

  const validation = capture();
  const validationCode = await main(["orchestration", "validate"], validation.io);
  assert.equal(validationCode, 1);
  assert.match(validation.out.join("\n"), /node manager-docs: ready-for-parent parent has non-terminal children/);

  const launch = capture();
  const launchCode = await main(["orchestration", "launch-spec", "worker-research"], launch.io);
  assert.equal(launchCode, 1);
  assert.match(launch.err.join("\n"), /Orchestration registry has blockers/);
});

fixtureTest("orchestration launch specs require a compare-and-set reservation before task creation", async () => {
  const registry = validOrchestrationRegistry();
  const manager = registry.nodes.find((node) => node.id === "manager-docs");
  const worker = registry.nodes.find((node) => node.id === "worker-research");
  registry.trustPolicy.limits.maxActiveNodes = 2;
  worker.dependencies = [];
  registry.nodes.find((node) => node.id === "boss").taskBinding = taskBindingForTest(registry, registry.nodes.find((node) => node.id === "boss"));
  writeOrchestrationRegistry(registry);

  const firstLaunch = capture();
  const firstLaunchCode = await main(["orchestration", "launch-spec", "manager-docs"], firstLaunch.io);
  assert.equal(firstLaunchCode, 0, firstLaunch.err.join("\n"));
  const firstSpec = JSON.parse(firstLaunch.out.join("\n"));
  assert.equal(firstSpec.reservation.expectedRegistryRevision, 0);
  assert.equal(firstSpec.reservation.expectedNode.state, "eligible");
  assert.equal(firstSpec.reservation.expectedParent.id, "boss");
  assert.equal(firstSpec.reservation.expectedParent.state, "working");
  assert.equal(firstSpec.reservation.expectedParent.taskId, "task-boss");
  assert.equal(firstSpec.reservation.expectedParent.trustLevel, "T3");
  assert.deepEqual(firstSpec.reservation.expectedParent.authority, registry.nodes.find((node) => node.id === "boss").authority);
  assert.deepEqual(firstSpec.reservation.capacity, {
    activeNodeCount: 1,
    reservedNodeCount: 0,
    maxActiveNodes: 2,
    parentId: "boss",
    activeChildCount: 0,
    reservedChildCount: 0,
    maxActiveChildren: 2
  });

  registry.revision = 1;
  writeOrchestrationRegistry(registry);
  const refreshedLaunch = capture();
  const refreshedLaunchCode = await main(["orchestration", "launch-spec", "manager-docs"], refreshedLaunch.io);
  assert.equal(refreshedLaunchCode, 0, refreshedLaunch.err.join("\n"));
  const refreshedSpec = JSON.parse(refreshedLaunch.out.join("\n"));
  assert.equal(refreshedSpec.reservation.expectedRegistryRevision, 1);
  assert.equal(refreshedSpec.reservation.launchKey, firstSpec.reservation.launchKey);
  assert.equal(firstSpec.callback.reserve.expectedRegistryRevision, 0);

  manager.launchReservation = refreshedSpec.callback.reserve.onSuccess.launchReservation;
  registry.revision = refreshedSpec.callback.reserve.onSuccess.registryRevision;
  writeOrchestrationRegistry(registry);
  const reservationValidation = capture();
  const reservationValidationCode = await main(["orchestration", "validate"], reservationValidation.io);
  assert.equal(reservationValidationCode, 0, reservationValidation.out.concat(reservationValidation.err).join("\n"));
  const validity = refreshedSpec.callback.reserve.onSuccess.launchReservation.validity;
  assert.equal(validity.expectedRegistryRevision, registry.revision);
  assert.equal(validity.expectedRegistryStatus, "active");
  assert.equal(validity.expectedNode.launchReservationKey, refreshedSpec.reservation.launchKey);
  assert.equal(validity.expectedNode.trustLevel, "T1");
  assert.deepEqual(validity.expectedNode.authority, manager.authority);
  assert.equal(validity.expectedParent.trustLevel, "T3");
  assert.equal(validity.expectedParent.authority.canDelegate, true);
  assert.deepEqual(refreshedSpec.callback.preCreate.expectedNode, validity.expectedNode);
  assert.deepEqual(refreshedSpec.callback.preCreate.expectedParent, validity.expectedParent);
  assert.deepEqual(refreshedSpec.callback.bind.capacity, validity.capacity);
  assert.equal(refreshedSpec.externalTask.idempotencyKey, refreshedSpec.reservation.launchKey);
  assert.match(refreshedSpec.callback.bind.onFailure, /Keep the reservation quarantined and reconcile/);
  assert.equal(refreshedSpec.callback.reconcile.operation, "compare-and-set-reconcile-bind");
  assert.deepEqual(refreshedSpec.callback.reconcile.requiredReservation, {
    key: refreshedSpec.reservation.launchKey,
    baseRevision: refreshedSpec.reservation.expectedRegistryRevision
  });
  assert.equal(refreshedSpec.callback.reconcile.externalTask.reconciliationKey, refreshedSpec.reservation.launchKey);
  assert.equal(refreshedSpec.callback.reconcile.externalTask.createAllowed, false);

  const next = capture();
  const nextCode = await main(["orchestration", "next"], next.io);
  assert.equal(nextCode, 0, next.err.join("\n"));
  assert.doesNotMatch(next.out.join("\n"), /manager-docs/);

  const duplicate = capture();
  const duplicateCode = await main(["orchestration", "launch-spec", "manager-docs"], duplicate.io);
  assert.equal(duplicateCode, 1);
  assert.match(duplicate.err.join("\n"), /pending launch reservation/);
  assert.equal(refreshedSpec.callback.bind.requiredReservationKey, refreshedSpec.reservation.launchKey);

  const capacity = capture();
  const capacityCode = await main(["orchestration", "launch-spec", "worker-research"], capacity.io);
  assert.equal(capacityCode, 1);
  assert.match(capacity.err.join("\n"), /project active-node budget is exhausted/);

  const boss = registry.nodes.find((node) => node.id === "boss");
  boss.authority.canDelegate = false;
  registry.revision += 1;
  writeOrchestrationRegistry(registry);
  const revocation = capture();
  const revocationCode = await main(["orchestration", "validate"], revocation.io);
  assert.equal(revocationCode, 1);
  assert.match(revocation.out.join("\n"), /launchReservation validity no longer matches registry status, work contract, authority, capacity, or task identity/);
});

fixtureTest("orchestration rejects self-consistent reservations that fail launch eligibility", async () => {
  for (const [name, mutate, expectedBlocker] of [
    ["dependencies", (registry, node) => { node.dependencies = ["worker-research"]; }, /launch eligibility requires completed dependencies/],
    ["registry status", (registry) => { registry.status = "inactive"; }, /launch eligibility requires active orchestration/],
    ["parent task", (registry, node, parent) => { parent.state = "queued"; parent.taskId = null; delete parent.nextAction; }, /launch eligibility requires task-backed parent boss/],
    ["parent state", (registry, node, parent) => { parent.state = "ready-for-parent"; parent.handoffEvidence = ["portfolio handoff"]; delete parent.nextAction; }, /launch eligibility requires parent boss in an active managing state/],
    ["delegation authority", (registry, node, parent) => { parent.authority.canDelegate = false; }, /launch eligibility requires parent boss with T3 delegation authority/],
    ["approval gate", (registry, node, parent) => { parent.authority.approvalGates.push("human-review"); }, /launch eligibility requires parent approval gate human-review/],
    ["child capacity", (registry, node, parent) => { parent.authority.maxActiveChildren = 0; }, /launch eligibility exceeds parent boss active-child budget/],
    ["project capacity", (registry) => { registry.trustPolicy.limits.maxActiveNodes = 1; }, /launch eligibility exceeds project active-node budget/],
    ["task identity", (registry, node) => { node.taskId = "task-manager-docs"; }, /launch eligibility requires a queued or eligible node without taskId/]
  ]) {
    const registry = validOrchestrationRegistry();
    writeOrchestrationRegistry(registry);
    const launch = capture();
    const launchCode = await main(["orchestration", "launch-spec", "manager-docs"], launch.io);
    assert.equal(launchCode, 0, `${name}: ${launch.err.join("\n")}`);
    const spec = JSON.parse(launch.out.join("\n"));
    const node = registry.nodes.find((candidate) => candidate.id === "manager-docs");
    const parent = registry.nodes.find((candidate) => candidate.id === "boss");
    node.launchReservation = spec.callback.reserve.onSuccess.launchReservation;
    registry.revision = spec.callback.reserve.onSuccess.registryRevision;
    mutate(registry, node, parent);
    node.launchReservation.validity = selfConsistentReservationValidity(registry, node, parent);
    writeOrchestrationRegistry(registry);

    const validation = capture();
    const validationCode = await main(["orchestration", "validate"], validation.io);
    assert.equal(validationCode, 1, name);
    assert.match(validation.out.join("\n"), expectedBlocker);
    assert.doesNotMatch(validation.out.join("\n"), /launchReservation validity no longer matches registry status, revision, work contract, authority, capacity, or task identity/);
  }
});

fixtureTest("orchestration reservation protocol requires durable launch-key reconciliation", async () => {
  const protocolPath = path.join(repoRoot, "ops", "protocols", "AGENT-ORCHESTRATION.md");
  const protocol = fs.readFileSync(protocolPath, "utf-8");
  assert.match(protocol, /Immediately before task creation, atomically compare the reserved registry against `preCreate`/);
  assert.match(protocol, /externalTask\.idempotencyKey/);
  assert.match(protocol, /On a timeout, crash, ambiguous response, or failed bind, retain the reservation/);
  assert.match(protocol, /do not clear or retry creation until absence is proven/);
  assert.match(protocol, /unrelated valid registry mutation advanced the revision before bind/);
  assert.match(protocol, /target task-identity\/trust\/entire authority envelope including approval gates/);
  assert.match(protocol, /reconciliation never creates a second task/);
});

fixtureTest("orchestration reconciles an existing task after an unrelated revision advance", async () => {
  const registry = validOrchestrationRegistry();
  writeOrchestrationRegistry(registry);
  const launch = capture();
  const launchCode = await main(["orchestration", "launch-spec", "manager-docs"], launch.io);
  assert.equal(launchCode, 0, launch.err.join("\n"));
  const spec = JSON.parse(launch.out.join("\n"));
  const manager = registry.nodes.find((node) => node.id === "manager-docs");
  const boss = registry.nodes.find((node) => node.id === "boss");
  manager.launchReservation = spec.callback.reserve.onSuccess.launchReservation;
  registry.revision = spec.callback.reserve.onSuccess.registryRevision;
  boss.nextAction = "Review a separate portfolio handoff.";
  registry.revision += 1;
  writeOrchestrationRegistry(registry);

  const validation = capture();
  const validationCode = await main(["orchestration", "validate"], validation.io);
  assert.equal(validationCode, 0, validation.out.concat(validation.err).join("\n"));
  assert.equal(spec.callback.bind.expectedRegistryRevision, 1);
  assert.equal(registry.revision, 2);
  assert.equal(spec.callback.reconcile.readLatestRegistryRevision, true);
  assert.equal(spec.callback.reconcile.requiredCurrentEligibility.completedDependencies, true);
  assert.equal(spec.callback.reconcile.requiredCurrentEligibility.node.trustLevel, "T1");
  assert.deepEqual(spec.callback.reconcile.requiredCurrentEligibility.node.authority, manager.authority);
  assert.equal(spec.callback.reconcile.requiredCurrentEligibility.parentDelegationAuthorityRequired, true);
  assert.deepEqual(spec.callback.reconcile.requiredCurrentEligibility.parentAuthorityInheritance, {
    requireCurrentParentToChildValidation: true,
    childTrustMayNotExceedParent: true,
    allowedReadsSubset: true,
    allowedWritesSubset: true,
    allowedExternalActionsSubset: true,
    inheritedApprovalGatesRequired: true,
    delegatedBudgetWithinParent: true
  });
  assert.equal(spec.callback.reconcile.requiredCurrentEligibility.materializedWorkContractHash, spec.workContract.hash);
  assert.equal(spec.callback.reconcile.requiredCurrentEligibility.capacityRequired, true);
  assert.equal(spec.callback.reconcile.externalTask.requireExistingTask, true);
  assert.equal(spec.callback.reconcile.externalTask.createAllowed, false);
  assert.match(spec.callback.reconcile.onSuccess, /without another external create/);
});

fixtureTest("orchestration invalidates reservations after status, authority, capacity, or task changes", async () => {
  for (const [name, mutate] of [
    ["status", (registry) => { registry.status = "inactive"; }],
    ["trust", (registry) => { registry.nodes.find((node) => node.id === "boss").trustLevel = "T4"; }],
    ["approval gates", (registry) => { registry.nodes.find((node) => node.id === "boss").authority.approvalGates.push("human-review"); }],
    ["target trust", (registry) => { registry.nodes.find((node) => node.id === "manager-docs").trustLevel = "T0"; }],
    ["target authority", (registry) => { registry.nodes.find((node) => node.id === "manager-docs").authority.allowedReads = []; }],
    ["target approval gates", (registry) => { registry.nodes.find((node) => node.id === "manager-docs").authority.approvalGates.push("human-review"); }],
    ["capacity", (registry) => { registry.trustPolicy.limits.maxActiveNodes = 5; }],
    ["task identity", (registry) => { registry.nodes.find((node) => node.id === "boss").taskId = "task-boss-replaced"; }]
  ]) {
    const registry = validOrchestrationRegistry();
    writeOrchestrationRegistry(registry);
    const launch = capture();
    const launchCode = await main(["orchestration", "launch-spec", "manager-docs"], launch.io);
    assert.equal(launchCode, 0, `${name}: ${launch.err.join("\n")}`);
    const spec = JSON.parse(launch.out.join("\n"));
    const manager = registry.nodes.find((node) => node.id === "manager-docs");
    manager.launchReservation = spec.callback.reserve.onSuccess.launchReservation;
    registry.revision = spec.callback.reserve.onSuccess.registryRevision;
    mutate(registry);
    registry.revision += 1;
    writeOrchestrationRegistry(registry);

    const validation = capture();
    const validationCode = await main(["orchestration", "validate"], validation.io);
    assert.equal(validationCode, 1, name);
    assert.match(validation.out.join("\n"), /node manager-docs: launchReservation validity no longer matches registry status, work contract, authority, capacity, or task identity/);
  }
});

fixtureTest("orchestration hashes canonical work contracts and quarantines stale payloads", async () => {
  const registry = validOrchestrationRegistry();
  writeOrchestrationRegistry(registry);
  const initial = capture();
  assert.equal(await main(["orchestration", "launch-spec", "manager-docs"], initial.io), 0, initial.err.join("\n"));
  const initialSpec = JSON.parse(initial.out.join("\n"));

  const manager = registry.nodes.find((node) => node.id === "manager-docs");
  manager.governingProtocols.reverse();
  manager.authority.stopConditions.reverse();
  writeOrchestrationRegistry(registry);
  const reordered = capture();
  assert.equal(await main(["orchestration", "launch-spec", "manager-docs"], reordered.io), 0, reordered.err.join("\n"));
  const reorderedSpec = JSON.parse(reordered.out.join("\n"));
  assert.equal(reorderedSpec.workContract.hash, initialSpec.workContract.hash);
  assert.equal(reorderedSpec.reservation.launchKey, initialSpec.reservation.launchKey);

  manager.launchReservation = reorderedSpec.callback.reserve.onSuccess.launchReservation;
  registry.revision = reorderedSpec.callback.reserve.onSuccess.registryRevision;
  manager.objective = "Changed documentation scope after reservation.";
  registry.revision += 1;
  writeOrchestrationRegistry(registry);
  const stalePayload = capture();
  assert.equal(await main(["orchestration", "validate"], stalePayload.io), 1);
  assert.match(stalePayload.out.join("\n"), /launchReservation validity no longer matches registry status, work contract, authority, capacity, or task identity/);
});

fixtureTest("orchestration preserves immutable task bindings across authority normalization and replanning", async () => {
  const registry = validOrchestrationRegistry();
  const boss = registry.nodes.find((node) => node.id === "boss");
  boss.authority.allowedReads = ["project", "project"];
  boss.authority.approvalGates = ["activation", "activation"];
  boss.authority.stopConditions = ["scope-unclear", "authority-gap", "scope-unclear"];
  writeOrchestrationRegistry(registry);

  const normalized = capture();
  assert.equal(await main(["orchestration", "validate"], normalized.io), 0, normalized.out.concat(normalized.err).join("\n"));

  boss.objective = "Change the already-bound project contract.";
  registry.revision += 1;
  writeOrchestrationRegistry(registry);
  const mutated = capture();
  assert.equal(await main(["orchestration", "validate"], mutated.io), 1);
  assert.match(mutated.out.join("\n"), /node boss: taskBinding\.(launchKey|workContractHash) must match the immutable materialized work contract/);

  boss.objective = "Keep the project scope controlled and evidence-backed.";
  boss.taskBinding = taskBindingForTest(registry, boss);
  const manager = registry.nodes.find((node) => node.id === "manager-docs");
  manager.state = "terminal";
  manager.taskId = "task-manager-docs";
  manager.parentTaskId = "task-boss";
  manager.terminalDisposition = "superseded";
  manager.completionEvidence = ["approved documentation artifact"];
  manager.taskBinding = taskBindingForTest(registry, manager);
  registry.nodes.push({
    ...manager,
    id: "manager-docs-successor",
    workRef: "DOCS-5",
    label: "Documentation refresh successor",
    title: `${CONFIG.projectName} - Manager - DOCS-5 Documentation refresh successor`,
    taskId: null,
    parentTaskId: null,
    taskBinding: undefined,
    state: "eligible",
    terminalDisposition: undefined,
    completionEvidence: undefined
  });
  registry.revision += 1;
  writeOrchestrationRegistry(registry);

  const replanned = capture();
  assert.equal(await main(["orchestration", "validate"], replanned.io), 0, replanned.out.concat(replanned.err).join("\n"));
});

fixtureTest("orchestration launch contracts require immutable task binding metadata", async () => {
  const registry = validOrchestrationRegistry();
  writeOrchestrationRegistry(registry);
  const launch = capture();
  assert.equal(await main(["orchestration", "launch-spec", "manager-docs"], launch.io), 0, launch.err.join("\n"));
  const spec = JSON.parse(launch.out.join("\n"));
  assert.equal(spec.taskBinding.launchKey, spec.reservation.launchKey);
  assert.equal(spec.taskBinding.workContractHash, spec.workContract.hash);
  assert.equal(spec.taskBinding.nodeId, "manager-docs");
  assert.equal(spec.taskBinding.externalTitle, undefined);
  assert.equal(spec.taskBinding.parentNodeId, "boss");
  assert.equal(spec.taskBinding.parentTaskId, "task-boss");
  assert.equal(spec.taskBinding.attestation.algorithm, "ed25519");
  assert.equal(spec.taskBinding.attestation.keyId, BINDING_ATTESTOR_KEY_ID);
  assert.ok(spec.callback.bind.requiredUpdates.some((update) => update.startsWith("Ed25519-attested taskBinding")));
  assert.ok(!spec.callback.bind.requiredUpdates.some((update) => update.includes("externalTitle")));
  assert.equal(spec.callback.bind.taskBinding.workContractHash, spec.workContract.hash);
  assert.equal(spec.callback.reconcile.taskBinding.boundRevision, "latest registry revision plus one");
  assert.equal(spec.externalTask.requiredTitle, undefined);
  assert.equal(spec.callback.reconcile.externalTask.renameAndVerifyBeforeBind, undefined);
  assert.match(spec.callback.bind.onFailure, /reservation quarantined/);

  delete registry.nodes.find((node) => node.id === "boss").taskBinding;
  writeOrchestrationRegistry(registry);
  const missing = capture();
  assert.equal(await main(["orchestration", "validate"], missing.io), 1);
  assert.match(missing.out.join("\n"), /node boss: task-backed node requires immutable taskBinding metadata/);
});

fixtureTest("orchestration accepts explicitly inventoried legacy schema-v2 bindings", async () => {
  const registry = validOrchestrationRegistry();
  registry.clientAdapter = configuredFirstmateAdapter(registry);
  const boss = registry.nodes.find((node) => node.id === "boss");
  boss.taskBinding = taskBindingForTest(registry, boss, { requiresVerifiedTitle: false });
  registry.clientAdapter.legacyTaskBindings = [{
    nodeId: boss.id,
    taskId: boss.taskId,
    attestationDigest: taskBindingLegacyAttestationDigest(registry, boss.taskBinding)
  }];
  writeOrchestrationRegistry(registry);
  const valid = capture();
  assert.equal(await main(["orchestration", "validate"], valid.io), 0, valid.out.concat(valid.err).join("\n"));
  const posture = capture();
  assert.equal(await main(["orchestration", "adapter-status"], posture.io), 0, posture.err.join("\n"));
  assert.match(posture.out.join("\n"), /activation_ready: true/);
});

fixtureTest("orchestration rejects supplied binding titles that do not match the registry", async () => {
  const registry = validOrchestrationRegistry();
  const boss = registry.nodes.find((node) => node.id === "boss");
  boss.taskBinding.externalTitle = "Wrong external title";
  boss.taskBinding.attestation.signature = signPayload(
    null,
    Buffer.from(taskBindingAttestationPayload(registry, boss.taskBinding)),
    bindingAttestor.privateKey
  ).toString("base64");
  writeOrchestrationRegistry(registry);
  const invalid = capture();
  assert.equal(await main(["orchestration", "validate"], invalid.io), 1);
  assert.match(invalid.out.join("\n"), /node boss: taskBinding\.externalTitle must match the verified task title/);
});

fixtureTest("orchestration requires verified titles for new Firstmate bindings", async () => {
  const registry = validOrchestrationRegistry();
  registry.clientAdapter = configuredFirstmateAdapter(registry);
  const boss = registry.nodes.find((node) => node.id === "boss");
  delete boss.taskBinding.titleVerification;
  boss.taskBinding.attestation.signature = signPayload(
    null,
    Buffer.from(taskBindingAttestationPayload(registry, boss.taskBinding)),
    bindingAttestor.privateKey
  ).toString("base64");
  writeOrchestrationRegistry(registry);
  const invalid = capture();
  assert.equal(await main(["orchestration", "validate"], invalid.io), 1);
  assert.match(invalid.out.join("\n"), /node boss: taskBinding\.titleVerification must prove rename-and-readback verification/);
  const notReady = capture();
  assert.equal(await main(["orchestration", "adapter-status"], notReady.io), 0, notReady.err.join("\n"));
  assert.match(notReady.out.join("\n"), /activation_ready: false/);

  boss.taskBinding = taskBindingForTest(registry, boss);
  delete boss.taskBinding.externalTitle;
  boss.taskBinding.attestation.signature = signPayload(
    null,
    Buffer.from(taskBindingAttestationPayload(registry, boss.taskBinding)),
    bindingAttestor.privateKey
  ).toString("base64");
  writeOrchestrationRegistry(registry);
  const missingTitle = capture();
  assert.equal(await main(["orchestration", "validate"], missingTitle.io), 1);
  assert.match(missingTitle.out.join("\n"), /node boss: non-legacy Firstmate taskBinding requires externalTitle matching the verified task title/);

  boss.taskBinding = taskBindingForTest(registry, boss);
  writeOrchestrationRegistry(registry);
  const launch = capture();
  assert.equal(await main(["orchestration", "launch-spec", "manager-docs"], launch.io), 0, launch.err.join("\n"));
  const spec = JSON.parse(launch.out.join("\n"));
  assert.equal(spec.taskBinding.externalTitle, spec.title);
  assert.deepEqual(spec.taskBinding.titleVerification, { method: "rename-and-readback", verified: true });
  assert.ok(spec.callback.bind.requiredUpdates.includes("verified externalTitle and titleVerification matching the registry title"));
  assert.equal(spec.callback.reconcile.externalTask.renameAndVerifyBeforeBind, true);
  assert.match(spec.callback.bind.onFailure, /reservation quarantined/);
});

fixtureTest("orchestration rejects tampered Firstmate title verification evidence", async () => {
  const registry = validOrchestrationRegistry();
  registry.clientAdapter = configuredFirstmateAdapter(registry);
  const boss = registry.nodes.find((node) => node.id === "boss");
  boss.taskBinding.titleVerification.verified = false;
  writeOrchestrationRegistry(registry);
  const invalid = capture();
  assert.equal(await main(["orchestration", "validate"], invalid.io), 1);
  assert.match(invalid.out.join("\n"), /node boss: taskBinding\.attestation signature does not match the trusted immutable binding record/);
  assert.match(invalid.out.join("\n"), /node boss: taskBinding\.titleVerification must prove rename-and-readback verification/);
});

fixtureTest("orchestration requires an external attestation for immutable task bindings", async () => {
  const registry = validOrchestrationRegistry();
  const boss = registry.nodes.find((node) => node.id === "boss");
  boss.objective = "A rewritten contract that retains the old task binding signature.";
  const rewrittenHash = materializedWorkContractHash(registry, boss, null);
  boss.taskBinding = {
    ...boss.taskBinding,
    launchKey: `orchestration:${registry.scope.id}:boss:${rewrittenHash}`,
    workContractHash: rewrittenHash
  };
  writeOrchestrationRegistry(registry);

  const rewritten = capture();
  assert.equal(await main(["orchestration", "validate"], rewritten.io), 1);
  assert.match(rewritten.out.join("\n"), /node boss: taskBinding\.attestation signature does not match the trusted immutable binding record/);

  const missingAttestor = validOrchestrationRegistry();
  delete missingAttestor.bindingAttestation;
  writeOrchestrationRegistry(missingAttestor);
  const unavailable = capture();
  assert.equal(await main(["orchestration", "validate"], unavailable.io), 1);
  assert.match(unavailable.out.join("\n"), /node boss: trusted binding attestor is unavailable/);
});

fixtureTest("orchestration rejects Boss parent-task metadata in working and terminal states", async () => {
  for (const state of ["working", "terminal"]) {
    const registry = validOrchestrationRegistry();
    const boss = registry.nodes.find((node) => node.id === "boss");
    boss.state = state;
    if (state === "terminal") {
      boss.terminalDisposition = "completed";
      boss.completionEvidence = ["Boss completion evidence"];
    }
    boss.parentTaskId = "task-unrelated-parent";
    writeOrchestrationRegistry(registry);

    const parentTask = capture();
    assert.equal(await main(["orchestration", "validate"], parentTask.io), 1, state);
    assert.match(parentTask.out.join("\n"), /node boss: Boss parentTaskId must be null/);
  }

  for (const field of ["parentNodeId", "parentTaskId"]) {
    const registry = validOrchestrationRegistry();
    const boss = registry.nodes.find((node) => node.id === "boss");
    boss.taskBinding[field] = "task-unrelated-parent";
    writeOrchestrationRegistry(registry);

    const binding = capture();
    assert.equal(await main(["orchestration", "validate"], binding.io), 1, field);
    assert.match(binding.out.join("\n"), new RegExp(`node boss: Boss taskBinding\\.${field} must be null`));
  }
});

fixtureTest("orchestration requires current parent scope inheritance and immutable parent task identity", async () => {
  const registry = validOrchestrationRegistry();
  const manager = registry.nodes.find((node) => node.id === "manager-docs");
  const boss = registry.nodes.find((node) => node.id === "boss");
  manager.trustLevel = "T2";
  manager.trustApproval = {
    approvedBy: "project-owner",
    approvedAt: "2026-07-16",
    evidence: ["bounded documentation execution approval"]
  };
  manager.authority = orchestrationAuthority({ writes: ["project-files"] });
  manager.state = "working";
  manager.taskId = "task-manager-docs";
  manager.parentTaskId = "task-boss";
  manager.nextAction = "Review the documentation scope.";
  manager.taskBinding = taskBindingForTest(registry, manager);
  writeOrchestrationRegistry(registry);
  const valid = capture();
  assert.equal(await main(["orchestration", "validate"], valid.io), 0, valid.out.concat(valid.err).join("\n"));

  boss.authority.allowedWrites = [];
  registry.revision += 1;
  writeOrchestrationRegistry(registry);
  const revokedScope = capture();
  assert.equal(await main(["orchestration", "validate"], revokedScope.io), 1);
  assert.match(revokedScope.out.join("\n"), /node manager-docs: authority\.allowedWrites entry project-files exceeds parent scope/);

  boss.authority.allowedWrites = ["project-files"];
  boss.taskId = "task-boss-replaced";
  registry.revision += 1;
  writeOrchestrationRegistry(registry);
  const replacedParent = capture();
  assert.equal(await main(["orchestration", "validate"], replacedParent.io), 1);
  assert.match(replacedParent.out.join("\n"), /node manager-docs: parentTaskId must match immediate parent boss taskId/);
});

fixtureTest("orchestration rejects active children whose parent cannot manage delegation", async () => {
  for (const [parentState, trustLevel, canDelegate, expectedBlocker] of [
    ["ready-for-parent", "T3", true, /active non-Boss node requires parent manager-docs in an active managing state/],
    ["working", "T3", false, /active non-Boss node requires parent manager-docs with T3 delegation authority/],
    ["working", "T2", true, /active non-Boss node requires parent manager-docs with T3 delegation authority/]
  ]) {
    const registry = validOrchestrationRegistry();
    const manager = registry.nodes.find((node) => node.id === "manager-docs");
    const worker = registry.nodes.find((node) => node.id === "worker-research");
    manager.state = parentState;
    manager.taskId = "task-manager-docs";
    manager.parentTaskId = "task-boss";
    manager.trustLevel = trustLevel;
    manager.authority = orchestrationAuthority({ canDelegate, maxActiveChildren: 1 });
    if (parentState === "ready-for-parent") manager.handoffEvidence = ["approved documentation artifact"];
    else manager.nextAction = "Manage the research decision.";
    if (trustLevel === "T3") {
      manager.trustApproval = {
        approvedBy: "project-owner",
        approvedAt: "2026-07-16",
        evidence: ["bounded workstream delegation approval"]
      };
    }
    worker.parentId = manager.id;
    worker.dependencies = [];
    worker.title = `${CONFIG.projectName} - Worker for Manager DOCS-4 - RES-2 Research decision`;
    worker.state = "working";
    worker.taskId = "task-worker-research";
    worker.parentTaskId = "task-manager-docs";
    worker.nextAction = "Prepare the research decision.";
    writeOrchestrationRegistry(registry);

    const { io, out } = capture();
    const code = await main(["orchestration", "validate"], io);
    assert.equal(code, 1, `${parentState}/${trustLevel}/${canDelegate}`);
    assert.match(out.join("\n"), expectedBlocker);
  }
});

fixtureTest("orchestration semantically validates trust approval timestamps", async () => {
  for (const approvedAt of ["2026-99-99", "2026-02-29", "2026-01-01T24:00:00Z", "2026-01-01T12:60:00Z", "2026-01-01T12:00:61Z"]) {
    const registry = validOrchestrationRegistry();
    registry.nodes.find((node) => node.id === "boss").trustApproval.approvedAt = approvedAt;
    writeOrchestrationRegistry(registry);

    const { io, out } = capture();
    const code = await main(["orchestration", "validate"], io);
    assert.equal(code, 1, approvedAt);
    assert.match(out.join("\n"), /node boss: trustApproval\.approvedAt must be YYYY-MM-DD or UTC RFC3339 seconds/);
  }

  const registry = validOrchestrationRegistry();
  registry.nodes.find((node) => node.id === "boss").trustApproval.approvedAt = "2024-02-29T23:59:59.123Z";
  writeOrchestrationRegistry(registry);
  const { io, err } = capture();
  const code = await main(["orchestration", "validate"], io);
  assert.equal(code, 0, err.join("\n"));
});

fixtureTest("goals status reports configured implementation goals", async () => {
  writeGoalChain(`# Implementation Goal Chain

## Goal 1: Establish Harness Surface

Objective: add the durable protocol and templates.

## Goal 2: Validate Generated CLI

Objective: prove generated repositories can inspect goal-chain evidence.
`);

  const { io, out, err } = capture();
  const code = await main(["goals", "status"], io);
  assert.equal(code, 0, err.join("\n"));
  assert.match(out.join("\n"), /Goal chain: docs\/reference\/implementation-goal-chain\.md/);
  assert.match(out.join("\n"), /Goal 1: Establish Harness Surface/);
  assert.match(out.join("\n"), /Goal 2: Validate Generated CLI/);
});

fixtureTest("goals verify blocks closing a goal without merge and handoff evidence", async () => {
  writeGoalChain(`# Implementation Goal Chain

## Goal 1: Missing Close Evidence

Objective: land a coherent unit of work.

Issues:
- #123

Verification:
- npm test
`);

  const { io, err } = capture();
  const code = await main(["goals", "verify", "1"], io);
  assert.equal(code, 1);
  assert.match(err.join("\n"), /Missing closeout evidence/i);
  assert.match(err.join("\n"), /Merged PR/i);
  assert.match(err.join("\n"), /Integration commit/i);
  assert.match(err.join("\n"), /Next goal/i);
});

fixtureTest("goals verify accepts a goal with merge, verification, and next-goal evidence", async () => {
  const mergeCommit = createFixtureMergeCommit(45, "goal 1");
  writeGoalChain(`# Implementation Goal Chain

## Goal 1: Complete Harness Surface

Objective: land a coherent unit of work.

Issues:
- #123

Verification:
- npm test: passed

Merged PR: #45
Merge commit: ${mergeCommit}

Residual risks: none

Next goal:
- Goal 2: Validate Generated CLI
`);

  const { io, out, err } = capture();
  const code = await main(["goals", "verify", "1"], io);
  assert.equal(code, 0, err.join("\n"));
  assert.match(out.join("\n"), /Goal 1 has matching local closeout evidence/i);
});

fixtureTest("goals verify rejects unresolved closeout placeholders", async () => {
  writeGoalChain(`# Implementation Goal Chain

## Goal 1: Placeholder Evidence

Objective: land a coherent unit of work.

Issues:
- #123

Verification:
- npm test: passed

Merged PR: #<pr>
Merge commit: <sha>

Next goal:
- <next goal>
`);

  const { io, err } = capture();
  const code = await main(["goals", "verify", "1"], io);
  assert.equal(code, 1);
  assert.match(err.join("\n"), /Merged PR/i);
  assert.match(err.join("\n"), /Integration commit/i);
  assert.match(err.join("\n"), /Next goal/i);
});

fixtureTest("goals verify rejects negated verification evidence", async () => {
  const mergeCommit = createFixtureMergeCommit(45, "goal with failed tests");
  writeGoalChain(`# Implementation Goal Chain

## Goal 1: Negated Verification

Objective: land a coherent unit of work.

Issues:
- #123

Verification:
- npm test: tests did not pass

Merged PR: #45
Merge commit: ${mergeCommit}

Next goal:
- Goal 2: Follow-up
`);

  const { io, err } = capture();
  const code = await main(["goals", "verify", "1"], io);
  assert.equal(code, 1);
  assert.match(err.join("\n"), /Verification result/i);
});

fixtureTest("goals verify rejects mixed passing and failing verification lines", async () => {
  const mergeCommit = createFixtureMergeCommit(45, "goal with mixed verification");
  writeGoalChain(`# Implementation Goal Chain

## Goal 1: Mixed Verification

Objective: land a coherent unit of work.

Issues:
- #123

Verification:
- npm test: passed
- e2e suite failed

Merged PR: #45
Merge commit: ${mergeCommit}

Next goal:
- Goal 2: Follow-up
`);

  const { io, err } = capture();
  const code = await main(["goals", "verify", "1"], io);
  assert.equal(code, 1);
  assert.match(err.join("\n"), /Verification result/i);
  assert.match(err.join("\n"), /e2e suite failed/i);
});

fixtureTest("goals verify rejects mixed pass and fail counts on one verification line", async () => {
  const mergeCommit = createFixtureMergeCommit(45, "goal with mixed verification count");
  writeGoalChain(`# Implementation Goal Chain

## Goal 1: Mixed Count Verification

Objective: land a coherent unit of work.

Issues:
- #123

Verification:
- npm test: 3 passed, 2 failed

Merged PR: #45
Merge commit: ${mergeCommit}

Residual risks: none

Next goal:
- Goal 2: Follow-up
`);

  const { io, err } = capture();
  const code = await main(["goals", "verify", "1"], io);
  assert.equal(code, 1);
  assert.match(err.join("\n"), /Verification result/i);
  assert.match(err.join("\n"), /2 failed/i);
});

fixtureTest("goals verify rejects mid-line failure counts without command keywords", async () => {
  const mergeCommit = createFixtureMergeCommit(45, "goal with midline failure count");
  writeGoalChain(`# Implementation Goal Chain

## Goal 1: Midline Failure Count

Objective: land a coherent unit of work.

Issues:
- #123

Verification:
- unit: passed
- soak reported 3 errors before rerun

Merged PR: #45
Merge commit: ${mergeCommit}

Residual risks: none

Next goal:
- Goal 2: Follow-up
`);

  const { io, err } = capture();
  const code = await main(["goals", "verify", "1"], io);
  assert.equal(code, 1);
  assert.match(err.join("\n"), /3 errors/i);
});

fixtureTest("goals verify rejects non-bulleted field-like failed verification lines", async () => {
  const mergeCommit = createFixtureMergeCommit(45, "goal with field-like failed verification");
  writeGoalChain(`# Implementation Goal Chain

## Goal 1: Field Like Failure

Objective: land a coherent unit of work.

Issues:
- #123

Verification:
- npm test: passed
Integration: failed

Merged PR: #45
Merge commit: ${mergeCommit}

Residual risks: none

Next goal:
- Goal 2: Follow-up
`);

  const { io, err } = capture();
  const code = await main(["goals", "verify", "1"], io);
  assert.equal(code, 1);
  assert.match(err.join("\n"), /Verification result/i);
  assert.match(err.join("\n"), /Integration: failed/i);
});

fixtureTest("goals verify rejects non-whitelisted status labels inside verification", async () => {
  const mergeCommit = createFixtureMergeCommit(45, "goal with pytest failed verification");
  writeGoalChain(`# Implementation Goal Chain

## Goal 1: Non JS Verification

Objective: land a coherent unit of work.

Issues:
- #123

Verification:
- npm test: passed
Pytest: failed

Merged PR: #45
Merge commit: ${mergeCommit}

Residual risks: none

Next goal:
- Goal 2: Follow-up
`);

  const { io, err } = capture();
  const code = await main(["goals", "verify", "1"], io);
  assert.equal(code, 1);
  assert.match(err.join("\n"), /Pytest: failed/i);
});

fixtureTest("goals verify rejects unbulleted failures from non-whitelisted runners", async () => {
  const mergeCommit = createFixtureMergeCommit(45, "goal with playwright failed verification");
  writeGoalChain(`# Implementation Goal Chain

## Goal 1: Playwright Failure

Objective: land a coherent unit of work.

Issues:
- #123

Verification:
- npm test: passed
Playwright: 4 failed

Merged PR: #45
Merge commit: ${mergeCommit}

Residual risks: none

Next goal:
- Goal 2: Follow-up
`);

  const { io, err } = capture();
  const code = await main(["goals", "verify", "1"], io);
  assert.equal(code, 1);
  assert.match(err.join("\n"), /Playwright: 4 failed/i);
});

fixtureTest("goals verify rejects nested verification failure labels", async () => {
  const mergeCommit = createFixtureMergeCommit(45, "goal with nested verification failure");
  writeGoalChain(`# Implementation Goal Chain

## Goal 1: Nested Verification Failure

Objective: land a coherent unit of work.

Issues:
- #123

Verification:
- npm test: passed
Verification: failed

Merged PR: #45
Merge commit: ${mergeCommit}

Residual risks: none

Next goal:
- Goal 2: Follow-up
`);

  const { io, err } = capture();
  const code = await main(["goals", "verify", "1"], io);
  assert.equal(code, 1);
  assert.match(err.join("\n"), /Verification: failed/i);
});

fixtureTest("goals verify rejects summary and details lines with failure counts", async () => {
  for (const line of ["Summary: 3 failed, 100 passed", "Details: 2 failures"]) {
    const mergeCommit = createFixtureMergeCommit(45, `goal with ${line.split(":")[0].toLowerCase()} failure`);
    writeGoalChain(`# Implementation Goal Chain

## Goal 1: Result Bearing Note Label

Objective: land a coherent unit of work.

Issues:
- #123

Verification:
- npm test: passed
${line}

Merged PR: #45
Merge commit: ${mergeCommit}

Residual risks: none

Next goal:
- Goal 2: Follow-up
`);

    const { io, err } = capture();
    const code = await main(["goals", "verify", "1"], io);
    assert.equal(code, 1, `${line} should be evaluated as verification evidence`);
    assert.match(err.join("\n"), /failed|failures/i);
  }
});

fixtureTest("goals verify treats non-status field-like lines after verification as a boundary", async () => {
  const mergeCommit = createFixtureMergeCommit(45, "goal with trailing notes");
  writeGoalChain(`# Implementation Goal Chain

## Goal 1: Verification Notes

Objective: land a coherent unit of work.

Issues:
- #123

Verification:
- npm test: passed
Notes: skipped the slow external integration suite in local verification

Merged PR: #45
Merge commit: ${mergeCommit}

Residual risks: none

Next goal:
- Goal 2: Follow-up
`);

  const { io, out, err } = capture();
  const code = await main(["goals", "verify", "1"], io);
  assert.equal(code, 0, err.join("\n"));
  assert.match(out.join("\n"), /Goal 1 has matching local closeout evidence/i);
});

fixtureTest("goals verify rejects bare positive verification tokens", async () => {
  const mergeCommit = createFixtureMergeCommit(45, "goal with bare ok verification");
  writeGoalChain(`# Implementation Goal Chain

## Goal 1: Bare Positive Verification

Objective: land a coherent unit of work.

Issues:
- #123

Verification:
- manual QA
- ok

Merged PR: #45
Merge commit: ${mergeCommit}

Residual risks: none

Next goal:
- Goal 2: Follow-up
`);

  const { io, err } = capture();
  const code = await main(["goals", "verify", "1"], io);
  assert.equal(code, 1);
  assert.match(err.join("\n"), /Verification result/i);
});

fixtureTest("goals verify accepts positive evidence that mentions negated failures", async () => {
  const mergeCommit = createFixtureMergeCommit(45, "goal with explicit clean results");
  writeGoalChain(`# Implementation Goal Chain

## Goal 1: Positive Evidence With Clean Counts

Objective: land a coherent unit of work.

Issues:
- #123

Verification:
- npm test: passed, no failures
- npm run lint: 0 errors, all pass
- added tests for error handling: passed
- failure-mode regression: passed
- e2e: passed, no tests skipped
- manual QA: passed, nothing blocked
- typecheck: passed, build no longer blocked
- fix verification: passed, 0 failing after fix

Merged PR: #45 add error handling
Merge commit: ${mergeCommit}

Residual risks: none

Next goal:
- Goal 2: Handle error states
`);

  const { io, out, err } = capture();
  const code = await main(["goals", "verify", "1"], io);
  assert.equal(code, 0, err.join("\n"));
  assert.match(out.join("\n"), /Goal 1 has matching local closeout evidence/i);
});

fixtureTest("goals verify accepts a squash integration commit that matches the PR", async () => {
  const squashCommit = createFixtureSquashCommit(45, "Complete harness surface");
  writeGoalChain(`# Implementation Goal Chain

## Goal 1: Squash Merge Evidence

Objective: land a coherent unit of work.

Issues:
- #123

Verification:
- npm test: passed

Merged PR: #45
Merge commit: ${squashCommit}

Residual risks: none

Next goal:
- Goal 2: Follow-up
`);

  const { io, out, err } = capture();
  const code = await main(["goals", "verify", "1"], io);
  assert.equal(code, 0, err.join("\n"));
  assert.match(out.join("\n"), /Goal 1 has matching local closeout evidence/i);
});

fixtureTest("goals verify accepts non-GitHub tracker issue keys", async () => {
  const mergeCommit = createFixtureMergeCommit(45, "goal with jira issue");
  writeGoalChain(`# Implementation Goal Chain

## Goal 1: External Tracker Evidence

Objective: land a coherent unit of work.

Issues:
- ENG-123 External tracker issue

Verification:
- npm test: passed

Merged PR: #45
Merge commit: ${mergeCommit}

Residual risks: none

Next goal:
- Goal 2: Follow-up
`);

  const { io, out, err } = capture();
  const code = await main(["goals", "verify", "1"], io);
  assert.equal(code, 0, err.join("\n"));
  assert.match(out.join("\n"), /Goal 1 has matching local closeout evidence/i);
});

fixtureTest("goals verify accepts inline tracker keys and Azure-style refs", async () => {
  const mergeCommit = createFixtureMergeCommit(45, "goal with azure issue");
  writeGoalChain(`# Implementation Goal Chain

## Goal 1: Azure Tracker Evidence

Objective: land a coherent unit of work.

Issues:
- Fixes ENG-123 and AB#456

Verification:
- npm test: passed

Merged PR: #45
Merge commit: ${mergeCommit}

Residual risks: none

Next goal:
- Goal 2: Follow-up
`);

  const { io, out, err } = capture();
  const code = await main(["goals", "verify", "1"], io);
  assert.equal(code, 0, err.join("\n"));
  assert.match(out.join("\n"), /Goal 1 has matching local closeout evidence/i);
});

fixtureTest("goals verify accepts standards-like tracker project keys except obvious standards tokens", async () => {
  const mergeCommit = createFixtureMergeCommit(45, "goal with sql tracker issue");
  writeGoalChain(`# Implementation Goal Chain

## Goal 1: SQL Tracker Evidence

Objective: land a coherent unit of work.

Issues:
- SQL-17: External tracker issue

Verification:
- npm test: passed

Merged PR: #45
Merge commit: ${mergeCommit}

Residual risks: none

Next goal:
- Goal 2: Follow-up
`);

  const { io, out, err } = capture();
  const code = await main(["goals", "verify", "1"], io);
  assert.equal(code, 0, err.join("\n"));
  assert.match(out.join("\n"), /Goal 1 has matching local closeout evidence/i);
});

fixtureTest("goals verify accepts explicit residual-risk absence as not applicable", async () => {
  const mergeCommit = createFixtureMergeCommit(45, "goal with n/a residual risks");
  writeGoalChain(`# Implementation Goal Chain

## Goal 1: Not Applicable Residual Risks

Objective: land a coherent unit of work.

Issues:
- #123

Verification:
- npm test: passed

Merged PR: #45
Merge commit: ${mergeCommit}

Residual risks: N/A

Next goal:
- Goal 2: Follow-up
`);

  const { io, out, err } = capture();
  const code = await main(["goals", "verify", "1"], io);
  assert.equal(code, 0, err.join("\n"));
  assert.match(out.join("\n"), /Goal 1 has matching local closeout evidence/i);
});

fixtureTest("goals verify rejects missing residual risk evidence", async () => {
  const mergeCommit = createFixtureMergeCommit(45, "goal without residual risks");
  writeGoalChain(`# Implementation Goal Chain

Each goal must record residual risks.

## Goal 1: Missing Residual Risks

Objective: land a coherent unit of work.

Issues:
- #123

Verification:
- npm test: passed

Merged PR: #45
Merge commit: ${mergeCommit}

Residual risks:

Next goal:
- Goal 2: Follow-up
`);

  const { io, err } = capture();
  const code = await main(["goals", "verify", "1"], io);
  assert.equal(code, 1);
  assert.match(err.join("\n"), /Residual risks/i);
});

fixtureTest("goals verify rejects missing linked issue evidence", async () => {
  const mergeCommit = createFixtureMergeCommit(45, "goal without linked issue");
  writeGoalChain(`# Implementation Goal Chain

Each goal must include linked issue evidence.

## Goal 1: Missing Linked Issue

Objective: land a coherent unit of work.

Issues:

Verification:
- npm test: passed

Merged PR: #45
Merge commit: ${mergeCommit}

Residual risks: none

Next goal:
- Goal 2: Follow-up
`);

  const { io, err } = capture();
  const code = await main(["goals", "verify", "1"], io);
  assert.equal(code, 1);
  assert.match(err.join("\n"), /Linked issue/i);
});

fixtureTest("goals verify rejects absent required linked issue and residual-risk fields", async () => {
  const mergeCommit = createFixtureMergeCommit(45, "goal without required closeout fields");
  writeGoalChain(`# Implementation Goal Chain

## Goal 1: Missing Required Closeout Fields

Objective: land a coherent unit of work.

Verification:
- npm test: passed

Merged PR: #45
Merge commit: ${mergeCommit}

Next goal:
- Goal 2: Follow-up
`);

  const { io, err } = capture();
  const code = await main(["goals", "verify", "1"], io);
  assert.equal(code, 1);
  assert.match(err.join("\n"), /Linked issue/i);
  assert.match(err.join("\n"), /Residual risks/i);
});

fixtureTest("goals verify can enforce only declared closeout fields for migrated chains", async () => {
  const mergeCommit = createFixtureMergeCommit(45, "migrated goal without optional fields");
  await withRequiredGoalCloseoutFields([], async () => {
    writeGoalChain(`# Implementation Goal Chain

## Goal 1: Migrated Goal

Objective: land a coherent unit of work.

Verification:
- npm test: passed

Merged PR: #45
Merge commit: ${mergeCommit}

Next goal:
- Goal 2: Follow-up
`);

    const { io, out, err } = capture();
    const code = await main(["goals", "verify", "1"], io);
    assert.equal(code, 0, err.join("\n"));
    assert.match(out.join("\n"), /Goal 1 has matching local closeout evidence/i);
  });
});

fixtureTest("goals verify treats missing required-field config as declared-only for migrated chains", async () => {
  const mergeCommit = createFixtureMergeCommit(45, "goal with missing closeout config");
  await withoutRequiredGoalCloseoutFields(async () => {
    writeGoalChain(`# Implementation Goal Chain

## Goal 1: Missing Config Migration

Objective: land a coherent unit of work.

Verification:
- npm test: passed

Merged PR: #45
Merge commit: ${mergeCommit}

Next goal:
- Goal 2: Follow-up
`);

    const { io, out, err } = capture();
    const code = await main(["goals", "verify", "1"], io);
    assert.equal(code, 0, err.join("\n"));
    assert.match(out.join("\n"), /Goal 1 has matching local closeout evidence/i);
  });
});

fixtureTest("goals verify reads linked issue aliases as issue evidence", async () => {
  const mergeCommit = createFixtureMergeCommit(45, "goal with linked issue alias");
  writeGoalChain(`# Implementation Goal Chain

## Goal 1: Linked Issue Alias

Objective: land a coherent unit of work.

Linked issues:
- #123

Verification:
- npm test: passed

Merged PR: #45
Merge commit: ${mergeCommit}

Residual risks: none

Next goal:
- Goal 2: Follow-up
`);

  const { io, out, err } = capture();
  const code = await main(["goals", "verify", "1"], io);
  assert.equal(code, 0, err.join("\n"));
  assert.match(out.join("\n"), /Goal 1 has matching local closeout evidence/i);
});

fixtureTest("goals verify enforces custom required closeout fields", async () => {
  const mergeCommit = createFixtureMergeCommit(45, "goal with custom closeout field");
  await withRequiredGoalCloseoutFields(["Issues?", "Residual risks", "Rollback plan"], async () => {
    writeGoalChain(`# Implementation Goal Chain

## Goal 1: Custom Closeout Field

Objective: land a coherent unit of work.

Issues:
- #123

Verification:
- npm test: passed

Merged PR: #45
Merge commit: ${mergeCommit}

Residual risks: none

Next goal:
- Goal 2: Follow-up
`);

    const { io, err } = capture();
    const code = await main(["goals", "verify", "1"], io);
    assert.equal(code, 1);
    assert.match(err.join("\n"), /Rollback plan/i);
  });
});

fixtureTest("goals verify accepts custom required closeout fields with evidence", async () => {
  const mergeCommit = createFixtureMergeCommit(45, "goal with custom closeout evidence");
  await withRequiredGoalCloseoutFields(["Issues?", "Residual risks", "Rollback plan"], async () => {
    writeGoalChain(`# Implementation Goal Chain

## Goal 1: Custom Closeout Evidence

Objective: land a coherent unit of work.

Issues:
- #123

Verification:
- npm test: passed

Merged PR: #45
Merge commit: ${mergeCommit}

Residual risks: none

Rollback plan:
- revert PR #45

Next goal:
- Goal 2: Follow-up
`);

    const { io, out, err } = capture();
    const code = await main(["goals", "verify", "1"], io);
    assert.equal(code, 0, err.join("\n"));
    assert.match(out.join("\n"), /Goal 1 has matching local closeout evidence/i);
  });
});

fixtureTest("goals verify rejects invalid tracker issue pattern config", async () => {
  const mergeCommit = createFixtureMergeCommit(45, "goal with invalid tracker pattern");
  await withTrackerIssuePattern("[", async () => {
    writeGoalChain(`# Implementation Goal Chain

## Goal 1: Invalid Tracker Pattern

Objective: land a coherent unit of work.

Issues:
- #123

Verification:
- npm test: passed

Merged PR: #45
Merge commit: ${mergeCommit}

Residual risks: none

Next goal:
- Goal 2: Follow-up
`);

    const { io, err } = capture();
    const code = await main(["goals", "verify", "1"], io);
    assert.equal(code, 1);
    assert.match(err.join("\n"), /trackerIssuePattern/i);
  });
});

fixtureTest("goals verify rejects standards-looking prose as linked issue evidence", async () => {
  const mergeCommit = createFixtureMergeCommit(45, "goal with standards prose");
  writeGoalChain(`# Implementation Goal Chain

## Goal 1: Standards Prose

Objective: land a coherent unit of work.

Issues:
- UTF-8: encoding support

Verification:
- npm test: passed

Merged PR: #45
Merge commit: ${mergeCommit}

Residual risks: none

Next goal:
- Goal 2: Follow-up
`);

  const { io, err } = capture();
  const code = await main(["goals", "verify", "1"], io);
  assert.equal(code, 1);
  assert.match(err.join("\n"), /Linked issue/i);
});

fixtureTest("goals verify rejects merged PR prose that says the PR is still open", async () => {
  const mergeCommit = createFixtureMergeCommit(45, "goal with negated pr evidence");
  writeGoalChain(`# Implementation Goal Chain

## Goal 1: Open PR Evidence

Objective: land a coherent unit of work.

Issues:
- #123

Verification:
- npm test: passed

Merged PR: PR #45 is still open, not merged
Merge commit: ${mergeCommit}

Next goal:
- Goal 2: Follow-up
`);

  const { io, err } = capture();
  const code = await main(["goals", "verify", "1"], io);
  assert.equal(code, 1);
  assert.match(err.join("\n"), /Merged PR/i);
});

fixtureTest("goals verify rejects an unrelated ancestor commit", async () => {
  const unrelatedCommit = createFixtureCommit("old unrelated integration commit");
  writeGoalChain(`# Implementation Goal Chain

## Goal 1: Unrelated Ancestor

Objective: land a coherent unit of work.

Issues:
- #123

Verification:
- npm test: passed

Merged PR: #45
Merge commit: ${unrelatedCommit}

Next goal:
- Goal 2: Follow-up
`);

  const { io, err } = capture();
  const code = await main(["goals", "verify", "1"], io);
  assert.equal(code, 1);
  assert.match(err.join("\n"), /Integration commit/i);
});

fixtureTest("goals verify rejects a merge commit for a different PR", async () => {
  const wrongPrCommit = createFixtureMergeCommit(44, "goal with mismatched pr");
  writeGoalChain(`# Implementation Goal Chain

## Goal 1: Mismatched PR

Objective: land a coherent unit of work.

Issues:
- #123

Verification:
- npm test: passed

Merged PR: #45
Merge commit: ${wrongPrCommit}

Next goal:
- Goal 2: Follow-up
`);

  const { io, err } = capture();
  const code = await main(["goals", "verify", "1"], io);
  assert.equal(code, 1);
  assert.match(err.join("\n"), /Integration commit/i);
});

fixtureTest("goals verify rejects a different PR merge commit whose body mentions the recorded PR", async () => {
  const wrongPrCommit = createFixtureMergeCommit(44, "goal with issue body reference", "Closes #45");
  writeGoalChain(`# Implementation Goal Chain

## Goal 1: Body Mentions Recorded PR

Objective: land a coherent unit of work.

Issues:
- #123

Verification:
- npm test: passed

Merged PR: #45
Merge commit: ${wrongPrCommit}

Next goal:
- Goal 2: Follow-up
`);

  const { io, err } = capture();
  const code = await main(["goals", "verify", "1"], io);
  assert.equal(code, 1);
  assert.match(err.join("\n"), /Integration commit/i);
});

fixtureTest("goals verify rejects a local commit that is not on the integration branch", async () => {
  createFixtureCommit("base integration commit");
  const unmergedCommit = createFixtureCommit("unmerged feature commit", "feature/unmerged-goal");
  checkoutDefaultBranch();

  writeGoalChain(`# Implementation Goal Chain

## Goal 1: Unmerged Commit

Objective: land a coherent unit of work.

Issues:
- #123

Verification:
- npm test: passed

Merged PR: #45
Merge commit: ${unmergedCommit}

Next goal:
- Goal 2: Follow-up
`);

  const { io, err } = capture();
  const code = await main(["goals", "verify", "1"], io);
  assert.equal(code, 1);
  assert.match(err.join("\n"), /Integration commit/i);
});

fixtureTest("goals verify rejects broad terminal markers other than none", async () => {
  const mergeCommit = createFixtureMergeCommit(45, "goal with broad final marker");
  writeGoalChain(`# Implementation Goal Chain

## Goal 1: Broad Final Marker

Objective: land a coherent unit of work.

Issues:
- #123

Verification:
- npm test: passed

Merged PR: #45
Merge commit: ${mergeCommit}

Next goal: final
`);

  const { io, err } = capture();
  const code = await main(["goals", "verify", "1"], io);
  assert.equal(code, 1);
  assert.match(err.join("\n"), /Next goal/i);
});

fixtureTest("goals verify rejects terminal-looking next-goal prose", async () => {
  for (const marker of ["done", "complete", "finished"]) {
    const mergeCommit = createFixtureMergeCommit(45, `goal with ${marker} marker`);
    writeGoalChain(`# Implementation Goal Chain

## Goal 1: Terminal Prose ${marker}

Objective: land a coherent unit of work.

Issues:
- #123

Verification:
- npm test: passed

Merged PR: #45
Merge commit: ${mergeCommit}

Next goal: ${marker}
`);

    const { io, err } = capture();
    const code = await main(["goals", "verify", "1"], io);
    assert.equal(code, 1, `${marker} should not pass as a next-goal marker`);
    assert.match(err.join("\n"), /Next goal/i);
  }
});

fixtureTest("goals verify accepts an explicit final goal marker", async () => {
  const mergeCommit = createFixtureMergeCommit(90, "final goal");
  writeGoalChain(`# Implementation Goal Chain

## Goal 9: Final Acceptance

Objective: close the final implementation goal.

Issues:
- #999

Verification:
- npm test: passed

Merged PR: #90
Merge commit: ${mergeCommit}

Residual risks: none

Next goal: none
`);

  const { io, out, err } = capture();
  const code = await main(["goals", "verify", "9"], io);
  assert.equal(code, 0, err.join("\n"));
  assert.match(out.join("\n"), /Goal 9 has matching local closeout evidence/i);
});

fixtureTest("goals start-prompt renders a bounded prompt from the goal chain", async () => {
  writeGoalChain(`# Implementation Goal Chain

## Goal 2: Validate Generated CLI

Objective: prove generated repositories can inspect goal-chain evidence.

Issues:
- #456: Generated CLI support

Verification:
- node --test apps/cli/test/*.test.mjs
`);

  const { io, out, err } = capture();
  const code = await main(["goals", "start-prompt", "2"], io);
  assert.equal(code, 0, err.join("\n"));
  const prompt = out.join("\n");
  assert.match(prompt, /Goal 2: Validate Generated CLI/);
  assert.match(prompt, /Repository:/);
  assert.match(prompt, /Base: {{DEFAULT_BRANCH}}/);
  assert.match(prompt, /Issue: #456: Generated CLI support/);
  assert.match(prompt, /Expected first deliverable:/);
  assert.match(prompt, /Complete only after PR is merged/);
});

fixtureTest("goals start-prompt falls back when a field is empty", async () => {
  writeGoalChain(`# Implementation Goal Chain

## Goal 3: Empty Objective

Objective:

Issues:
- #789: Keep parser fields separate

Verification:
- node --test apps/cli/test/*.test.mjs
`);

  const { io, out, err } = capture();
  const code = await main(["goals", "start-prompt", "3"], io);
  assert.equal(code, 0, err.join("\n"));
  const prompt = out.join("\n");
  assert.match(prompt, /Complete the scoped goal from the goal-chain document/);
  assert.doesNotMatch(prompt, /Objective:\nIssues:/);
  assert.match(prompt, /Issue: #789: Keep parser fields separate/);
});

fixtureTest("goals start-prompt truncates long objectives unless --full is passed", async () => {
  const longObjective = "Coordinate the downstream harness audit. ".repeat(80);
  writeGoalChain(`# Implementation Goal Chain

## Goal 4: Long Objective

Objective: ${longObjective}

Issues:
- #900: Keep prompts bounded

Verification:
- node --test apps/cli/test/*.test.mjs
`);

  const preview = capture();
  const previewCode = await main(["goals", "start-prompt", "4"], preview.io);
  assert.equal(previewCode, 0, preview.err.join("\n"));
  const previewText = preview.out.join("\n");
  assert.match(previewText, /objective_preview:/);
  assert.match(previewText, /truncated: true/);
  assert.match(previewText, /--full/);

  const full = capture();
  const fullCode = await main(["goals", "start-prompt", "4", "--full"], full.io);
  assert.equal(fullCode, 0, full.err.join("\n"));
  const fullText = full.out.join("\n");
  assert.doesNotMatch(fullText, /objective_preview:/);
  assert.match(fullText, new RegExp(longObjective.slice(0, 80).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

fixtureTest("qa status detects Playwright and e2e scripts", async () => {
  const packagePath = path.join(repoRoot, "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf-8"));
  packageJson.scripts = {
    ...(packageJson.scripts || {}),
    "test:e2e": "playwright test",
    "test:e2e:live": "playwright test tests/e2e/live.spec.ts",
    "test:e2e:mocked": "playwright test tests/e2e/mock.spec.ts"
  };
  fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + "\n", "utf-8");
  fs.writeFileSync(path.join(repoRoot, "playwright.config.ts"), "export default {};\n", "utf-8");

  const { io, out, err } = capture();
  const code = await main(["qa", "status"], io);
  assert.equal(code, 0, err.join("\n"));
  assert.match(out.join("\n"), /Playwright config: playwright\.config\.ts/);
  assert.match(out.join("\n"), /test:e2e/);
  assert.match(out.join("\n"), /test:e2e:mocked/);
  assert.match(out.join("\n"), /test:e2e:live/);
});

fixtureTest("qa plan explains browser evidence and live lane gates", async () => {
  const { io, out, err } = capture();
  const code = await main(["qa", "plan"], io);
  assert.equal(code, 0, err.join("\n"));
  assert.match(out.join("\n"), /deterministic E2E/i);
  assert.match(out.join("\n"), /mocked/i);
  assert.match(out.join("\n"), /storage state/i);
  assert.match(out.join("\n"), /screenshots, videos, traces, HARs/i);
});

fixtureTest("qa no-masking blocks route fulfill in deterministic tests", async () => {
  const testFile = path.join(repoRoot, "tests", "e2e", "masked.spec.ts");
  fs.mkdirSync(path.dirname(testFile), { recursive: true });
  fs.writeFileSync(testFile, "await page.route('/api/private', route => route.fulfill({ json: {} }));\n", "utf-8");

  const { io, err } = capture();
  const code = await main(["qa", "no-masking"], io);
  assert.equal(code, 1);
  assert.match(err.join("\n"), /route\.fulfill/);
  assert.match(err.join("\n"), /tests\/e2e\/masked\.spec\.ts/);
});

fixtureTest("qa no-masking scans e2e source paths outside the default roots", async () => {
  const packagePath = path.join(repoRoot, "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf-8"));
  packageJson.scripts = {
    ...(packageJson.scripts || {}),
    "test:e2e": "playwright test apps/web/e2e"
  };
  fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + "\n", "utf-8");
  const testFile = path.join(repoRoot, "apps", "web", "e2e", "masked.spec.ts");
  fs.mkdirSync(path.dirname(testFile), { recursive: true });
  fs.writeFileSync(testFile, "await page.route('/api/private', route => route.abort());\n", "utf-8");

  const { io, err } = capture();
  const code = await main(["qa", "no-masking"], io);
  assert.equal(code, 1);
  assert.match(err.join("\n"), /route\.abort/);
  assert.match(err.join("\n"), /apps\/web\/e2e\/masked\.spec\.ts/);
});

fixtureTest("qa no-masking blocks Cypress network masking", async () => {
  const testFile = path.join(repoRoot, "cypress", "e2e", "masked.cy.ts");
  fs.mkdirSync(path.dirname(testFile), { recursive: true });
  fs.writeFileSync(testFile, "cy.intercept('/api/private', { body: {} });\n", "utf-8");

  const { io, err } = capture();
  const code = await main(["qa", "no-masking"], io);
  assert.equal(code, 1);
  assert.match(err.join("\n"), /cy\.intercept/);
  assert.match(err.join("\n"), /cypress\/e2e\/masked\.cy\.ts/);
});

fixtureTest("qa no-masking fails closed when browser tests are declared but no sources are scanned", async () => {
  const packagePath = path.join(repoRoot, "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf-8"));
  packageJson.scripts = {
    ...(packageJson.scripts || {}),
    "test:e2e": "playwright test apps/web/e2e"
  };
  fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + "\n", "utf-8");
  fs.writeFileSync(path.join(repoRoot, "playwright.config.ts"), "export default { testDir: './apps/web/e2e' };\n", "utf-8");

  const { io, err } = capture();
  const code = await main(["qa", "no-masking"], io);
  assert.equal(code, 1);
  assert.match(err.join("\n"), /no browser test source files were inspected/i);
});

fixtureTest("verify does not fail closed on non-browser qa scripts", async () => {
  const packagePath = path.join(repoRoot, "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf-8"));
  packageJson.scripts = {
    ...(packageJson.scripts || {}),
    qa: "eslint . && tsc --noEmit"
  };
  fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + "\n", "utf-8");

  const { io, err } = capture();
  const code = await main(["verify"], io);
  assert.equal(code, 0, err.join("\n"));
});

fixtureTest("connections doctor validates connector profile identity and path boundaries", async () => {
  const wrongDomain = capture();
  const wrongDomainCode = await main(["connections", "doctor", "--profile", "example-google-workspace", "--account", "person@outside.test"], wrongDomain.io);
  assert.equal(wrongDomainCode, 1);
  assert.match(wrongDomain.err.join("\n"), /outside expected domain/i);
  assert.doesNotMatch(wrongDomain.err.join("\n"), /person@outside\.test|example\.com/);

  const localInsideRepo = capture();
  const localInsideRepoCode = await main([
    "connections",
    "doctor",
    "--profile",
    "example-google-workspace",
    "--mode",
    "local",
    "--credential-root",
    path.join(repoRoot, ".credentials")
  ], localInsideRepo.io);
  assert.equal(localInsideRepoCode, 1);
  assert.match(localInsideRepo.err.join("\n"), /credential root/i);
  assert.doesNotMatch(localInsideRepo.err.join("\n"), /\.credentials/);
  assert.doesNotMatch(localInsideRepo.err.join("\n"), localPathPattern());

  const remote = capture();
  const remoteCode = await main(["connections", "doctor", "--profile", "example-google-workspace", "--mode", "remote"], remote.io);
  assert.equal(remoteCode, 0, remote.err.join("\n"));
  assert.match(remote.out.join("\n"), /remote connector mode/i);
  assert.match(remote.out.join("\n"), /local token files are not inspected/i);
});

test("checklist command explains inactive modules", async () => {
  const { io, out } = capture();
  const code = await main(["checklist"], io);
  assert.equal(code, 0);
  assert.match(out.join("\\n"), /inactive/);
  assert.match(out.join("\\n"), /optional modules/);
});

fixtureTest("checklist command blocks active rows with missing evidence paths", async () => {
  const checklistPath = "ops/HARNESS-CHECKLIST.md";
  const original = fs.readFileSync(path.join(repoRoot, checklistPath), "utf-8");
  const broken = `${original}\n| Missing active module | active | \`ops/protocols/DOES-NOT-EXIST.md\` |\n`;

  await withFile(checklistPath, broken, async () => {
    const { io, err } = capture();
    const code = await main(["checklist"], io);
    assert.equal(code, 1);
    assert.match(err.join("\n"), /Missing active module/);
    assert.match(err.join("\n"), /DOES-NOT-EXIST/);
  });
});

fixtureTest("precommit scans filesystem when git metadata is unavailable", async () => {
  const nonGitFile = path.join(repoRoot, "non-git-secret.cfg");
  const hadGit = fs.existsSync(path.join(repoRoot, ".git"));
  if (hadGit) fs.renameSync(path.join(repoRoot, ".git"), path.join(repoRoot, ".git.test-backup"));

  fs.writeFileSync(nonGitFile, `${"pass"}word=non-git-secret-value\n`, "utf-8");
  try {
    const { io, err } = capture();
    const code = await main(["precommit"], io);
    assert.equal(code, 1);
    assert.match(err.join("\n"), /non-git-secret\.cfg/);
    assert.match(err.join("\n"), /password/i);
  } finally {
    fs.rmSync(nonGitFile, { force: true });
    if (hadGit) fs.renameSync(path.join(repoRoot, ".git.test-backup"), path.join(repoRoot, ".git"));
  }
});

fixtureTest("precommit blocks symlinks when git metadata is unavailable", async () => {
  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "harness-non-git-outside-"));
  const outsideFixture = path.join(outsideDir, "external-fixture.txt");
  const linkPath = path.join(repoRoot, "non-git-external-link.txt");
  const hadGit = fs.existsSync(path.join(repoRoot, ".git"));
  if (hadGit) fs.renameSync(path.join(repoRoot, ".git"), path.join(repoRoot, ".git.test-backup"));

  fs.writeFileSync(outsideFixture, `${"pass"}word=non-git-external-secret-value\n`, "utf-8");
  fs.symlinkSync(outsideFixture, linkPath);
  try {
    const { io, out, err } = capture();
    const code = await main(["precommit"], io);
    assert.equal(code, 1);
    assert.match(err.join("\n"), /Symlink requires explicit/);
    assert.doesNotMatch(out.join("\n"), /non-git-external-secret-value|password/i);
    assert.doesNotMatch(err.join("\n"), /non-git-external-secret-value|password/i);
  } finally {
    fs.rmSync(linkPath, { force: true });
    fs.rmSync(outsideDir, { recursive: true, force: true });
    if (hadGit) fs.renameSync(path.join(repoRoot, ".git.test-backup"), path.join(repoRoot, ".git"));
  }
});

fixtureTest("precommit blocks dangling symlinks when git metadata is unavailable", async () => {
  const linkPath = path.join(repoRoot, "non-git-dangling-link.txt");
  const hadGit = fs.existsSync(path.join(repoRoot, ".git"));
  if (hadGit) fs.renameSync(path.join(repoRoot, ".git"), path.join(repoRoot, ".git.test-backup"));

  fs.symlinkSync(path.join(os.tmpdir(), "missing-harness-target"), linkPath);
  try {
    const { io, err } = capture();
    const code = await main(["precommit"], io);
    assert.equal(code, 1);
    assert.match(err.join("\n"), /Symlink requires explicit/);
  } finally {
    fs.rmSync(linkPath, { force: true });
    if (hadGit) fs.renameSync(path.join(repoRoot, ".git.test-backup"), path.join(repoRoot, ".git"));
  }
});

fixtureTest("precommit --all checks untracked files", async () => {
  const untracked = path.join(repoRoot, "untracked-secret.json");
  const hadGit = fs.existsSync(path.join(repoRoot, ".git"));
  if (!hadGit) {
    const init = runCommand("git", ["init", "-q"], { cwd: repoRoot });
    assert.equal(init.ok, true, init.stderr);
  }

  fs.writeFileSync(untracked, JSON.stringify({ [`tok${"en"}`]: "super-secret-json-token" }) + "\n", "utf-8");
  try {
    const { io, err } = capture();
    const code = await main(["precommit", "--all"], io);
    assert.equal(code, 1);
    assert.match(err.join("\n"), /untracked-secret\.json/);
    assert.match(err.join("\n"), /token/i);
  } finally {
    fs.rmSync(untracked, { force: true });
    if (!hadGit) fs.rmSync(path.join(repoRoot, ".git"), { recursive: true, force: true });
  }
});

fixtureTest("precommit --all blocks symlinks without following outside the repo", async () => {
  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "harness-outside-"));
  const outsideFixture = path.join(outsideDir, "external-fixture.txt");
  const linkPath = path.join(repoRoot, "linked-external-secret.txt");
  fs.writeFileSync(outsideFixture, `${"pass"}word=external-secret-value\n`, "utf-8");
  fs.symlinkSync(outsideFixture, linkPath);
  try {
    const { io, out, err } = capture();
    const code = await main(["precommit", "--all"], io);
    assert.equal(code, 1);
    assert.match(err.join("\n"), /Symlink requires explicit/);
    assert.doesNotMatch(out.join("\n"), /external-secret-value|password/i);
    assert.doesNotMatch(err.join("\n"), /external-secret-value|password/i);
  } finally {
    fs.rmSync(linkPath, { force: true });
    fs.rmSync(outsideDir, { recursive: true, force: true });
  }
});

fixtureTest("precommit --all blocks dangling symlinks without following outside the repo", async () => {
  const linkPath = path.join(repoRoot, "dangling-external-link.txt");
  fs.symlinkSync(path.join(os.tmpdir(), "missing-harness-target"), linkPath);
  try {
    const { io, err } = capture();
    const code = await main(["precommit", "--all"], io);
    assert.equal(code, 1);
    assert.match(err.join("\n"), /Symlink requires explicit/);
  } finally {
    fs.rmSync(linkPath, { force: true });
  }
});

fixtureTest("precommit keeps raw token-looking filenames for scanning", async () => {
  const suspiciousName = `${"xox"}b-1234567890-fixture.txt`;
  const suspiciousPath = path.join(repoRoot, suspiciousName);
  const hadGit = fs.existsSync(path.join(repoRoot, ".git"));
  if (!hadGit) {
    const init = runCommand("git", ["init", "-q"], { cwd: repoRoot });
    assert.equal(init.ok, true, init.stderr);
  }

  fs.writeFileSync(suspiciousPath, JSON.stringify({ [`tok${"en"}`]: "filename-secret-json-token" }) + "\n", "utf-8");
  try {
    const { io, err } = capture();
    const code = await main(["precommit", "--all"], io);
    assert.equal(code, 1);
    assert.match(err.join("\n"), /fixture\.txt/);
    assert.match(err.join("\n"), /token/i);
  } finally {
    fs.rmSync(suspiciousPath, { force: true });
    if (!hadGit) fs.rmSync(path.join(repoRoot, ".git"), { recursive: true, force: true });
  }
});

fixtureTest("precommit blocks binary credential container filenames", async () => {
  const keyFile = path.join(repoRoot, "client-keystore.p12");
  const hadGit = fs.existsSync(path.join(repoRoot, ".git"));
  if (!hadGit) {
    const init = runCommand("git", ["init", "-q"], { cwd: repoRoot });
    assert.equal(init.ok, true, init.stderr);
  }

  fs.writeFileSync(keyFile, Buffer.from([0, 1, 2, 3, 4]));
  try {
    const { io, err } = capture();
    const code = await main(["precommit", "--all"], io);
    assert.equal(code, 1);
    assert.match(err.join("\n"), /client-keystore\.p12/);
    assert.match(err.join("\n"), /Sensitive filename/i);
  } finally {
    fs.rmSync(keyFile, { force: true });
    if (!hadGit) fs.rmSync(path.join(repoRoot, ".git"), { recursive: true, force: true });
  }
});

fixtureTest("precommit blocks private key filenames even when content looks plain", async () => {
  const keyFile = path.join(repoRoot, "server.key");
  const hadGit = fs.existsSync(path.join(repoRoot, ".git"));
  if (!hadGit) {
    const init = runCommand("git", ["init", "-q"], { cwd: repoRoot });
    assert.equal(init.ok, true, init.stderr);
  }

  fs.writeFileSync(keyFile, "plain fixture text\n", "utf-8");
  try {
    const { io, err } = capture();
    const code = await main(["precommit", "--all"], io);
    assert.equal(code, 1);
    assert.match(err.join("\n"), /server\.key/);
    assert.match(err.join("\n"), /Sensitive filename/i);
  } finally {
    fs.rmSync(keyFile, { force: true });
    if (!hadGit) fs.rmSync(path.join(repoRoot, ".git"), { recursive: true, force: true });
  }
});

fixtureTest("precommit blocks password vault filenames", async () => {
  const vaultFile = path.join(repoRoot, "secrets.kdbx");
  const hadGit = fs.existsSync(path.join(repoRoot, ".git"));
  if (!hadGit) {
    const init = runCommand("git", ["init", "-q"], { cwd: repoRoot });
    assert.equal(init.ok, true, init.stderr);
  }

  fs.writeFileSync(vaultFile, Buffer.from([0, 1, 2, 3, 4]));
  try {
    const { io, err } = capture();
    const code = await main(["precommit", "--all"], io);
    assert.equal(code, 1);
    assert.match(err.join("\n"), /secrets\.kdbx/);
    assert.match(err.join("\n"), /Sensitive filename/i);
  } finally {
    fs.rmSync(vaultFile, { force: true });
    if (!hadGit) fs.rmSync(path.join(repoRoot, ".git"), { recursive: true, force: true });
  }
});

fixtureTest("precommit warns on ambiguous sensitive filenames and supports exact allowlist entries", async () => {
  const certRel = "docs/security/public-root-ca.crt";
  const certFile = path.join(repoRoot, certRel);
  const hadGit = fs.existsSync(path.join(repoRoot, ".git"));
  if (!hadGit) {
    const init = runCommand("git", ["init", "-q"], { cwd: repoRoot });
    assert.equal(init.ok, true, init.stderr);
  }

  fs.mkdirSync(path.dirname(certFile), { recursive: true });
  fs.writeFileSync(certFile, "-----BEGIN CERTIFICATE-----\npublic-demo-certificate\n-----END CERTIFICATE-----\n", "utf-8");
  try {
    const first = capture();
    const firstCode = await main(["precommit", "--all"], first.io);
    assert.equal(firstCode, 0, first.err.join("\n"));
    assert.match(first.out.join("\n"), /Sensitive-looking filename/);

    const allowlistPath = "ops/precommit-allow.txt";
    const originalAllowlist = fs.readFileSync(path.join(repoRoot, allowlistPath), "utf-8");
    await withFile(allowlistPath, `${originalAllowlist.trimEnd()}\n${certRel}\n`, async () => {
      const second = capture();
      const secondCode = await main(["precommit", "--all"], second.io);
      assert.equal(secondCode, 0, second.err.join("\n"));
      assert.doesNotMatch(second.out.join("\n"), /Sensitive-looking filename/);
    });
  } finally {
    fs.rmSync(certFile, { force: true });
    fs.rmSync(path.dirname(certFile), { recursive: true, force: true });
    if (!hadGit) fs.rmSync(path.join(repoRoot, ".git"), { recursive: true, force: true });
  }
});

fixtureTest("precommit blocks plaintext credential filenames", async () => {
  const netrcFile = path.join(repoRoot, ".netrc");
  const npmrcFile = path.join(repoRoot, ".npmrc");
  const hadGit = fs.existsSync(path.join(repoRoot, ".git"));
  if (!hadGit) {
    const init = runCommand("git", ["init", "-q"], { cwd: repoRoot });
    assert.equal(init.ok, true, init.stderr);
  }

  fs.writeFileSync(netrcFile, `${"mach"}ine example.com login user ${"pass"}word super-secret\n`, "utf-8");
  fs.writeFileSync(npmrcFile, `//registry/:_${"auth"}${"Tok"}en=${"npm_"}abcdefghijklmnopqrstuvwxyz\n`, "utf-8");
  try {
    const { io, err } = capture();
    const code = await main(["precommit", "--all"], io);
    assert.equal(code, 1);
    assert.match(err.join("\n"), /\.netrc/);
    assert.match(err.join("\n"), /\.npmrc/);
  } finally {
    fs.rmSync(netrcFile, { force: true });
    fs.rmSync(npmrcFile, { force: true });
    if (!hadGit) fs.rmSync(path.join(repoRoot, ".git"), { recursive: true, force: true });
  }
});

fixtureTest("precommit scans UTF-16 text files", async () => {
  const utf16File = path.join(repoRoot, "utf16-secret.txt");
  fs.writeFileSync(utf16File, Buffer.from(`\ufeff${"pass"}word=utf16-secret-value\n`, "utf16le"));
  try {
    const { io, err } = capture();
    const code = await main(["precommit", "--all"], io);
    assert.equal(code, 1);
    assert.match(err.join("\n"), /utf16-secret\.txt/);
    assert.match(err.join("\n"), /password/i);
  } finally {
    fs.rmSync(utf16File, { force: true });
  }
});

fixtureTest("precommit blocks unsupported binary files unless allowlisted", async () => {
  const binaryFile = path.join(repoRoot, "binary-export.dat");
  fs.writeFileSync(binaryFile, Buffer.from([0, 1, 2, 3, 4]));
  try {
    const { io, err } = capture();
    const code = await main(["precommit", "--all"], io);
    assert.equal(code, 1);
    assert.match(err.join("\n"), /binary-export\.dat/);
    assert.match(err.join("\n"), /Binary or unsupported encoded/);
  } finally {
    fs.rmSync(binaryFile, { force: true });
  }
});

fixtureTest("precommit installs and reports the harness-managed git hook", async () => {
  const hadGit = fs.existsSync(path.join(repoRoot, ".git"));
  if (!hadGit) {
    const init = runCommand("git", ["init", "-q"], { cwd: repoRoot });
    assert.equal(init.ok, true, init.stderr);
  }

  const hookPath = path.join(repoRoot, ".git", "hooks", "pre-commit");
  const backupPath = `${hookPath}.test-backup`;
  const hadHook = fs.existsSync(hookPath);
  if (hadHook) fs.renameSync(hookPath, backupPath);

  try {
    const install = capture();
    const installCode = await main(["precommit", "install-hook"], install.io);
    assert.equal(installCode, 0, install.err.join("\n"));
    assert.match(fs.readFileSync(hookPath, "utf-8"), /repo-agent-harness precommit hook/);

    const status = capture();
    const statusCode = await main(["precommit", "hook-status"], status.io);
    assert.equal(statusCode, 0, status.err.join("\n"));
    assert.match(status.out.join("\n"), /installed/);
  } finally {
    fs.rmSync(hookPath, { force: true });
    if (hadHook) fs.renameSync(backupPath, hookPath);
    if (!hadGit) fs.rmSync(path.join(repoRoot, ".git"), { recursive: true, force: true });
  }
});

fixtureTest("precommit blocks large files that are not content-scanned", async () => {
  const largeFile = path.join(repoRoot, "large-export.log");
  const hadGit = fs.existsSync(path.join(repoRoot, ".git"));
  if (!hadGit) {
    const init = runCommand("git", ["init", "-q"], { cwd: repoRoot });
    assert.equal(init.ok, true, init.stderr);
  }

  fs.writeFileSync(largeFile, Buffer.alloc(1_000_001, "a"));
  try {
    const { io, err } = capture();
    const code = await main(["precommit", "--all"], io);
    assert.equal(code, 1);
    assert.match(err.join("\n"), /large-export\.log/);
    assert.match(err.join("\n"), /Large file requires explicit review/);
  } finally {
    fs.rmSync(largeFile, { force: true });
    if (!hadGit) fs.rmSync(path.join(repoRoot, ".git"), { recursive: true, force: true });
  }
});

fixtureTest("precommit fails closed when git enumeration errors inside a repo", async () => {
  const fakeBin = path.join(repoRoot, ".fake-git-bin");
  const fakeGit = path.join(fakeBin, "git");
  const originalPath = process.env.PATH;
  fs.mkdirSync(fakeBin, { recursive: true });
  fs.writeFileSync(fakeGit, `#!/usr/bin/env sh
if [ "$1" = "rev-parse" ]; then
  echo true
  exit 0
fi
if [ "$1" = "-c" ]; then
  shift 2
fi
echo "simulated git failure" >&2
exit 1
`, "utf-8");
  fs.chmodSync(fakeGit, 0o755);
  process.env.PATH = `${fakeBin}:${originalPath}`;
  try {
    const { io, err } = capture();
    const code = await main(["precommit"], io);
    assert.equal(code, 1);
    assert.match(err.join("\n"), /git diff --cached failed|Precommit cannot safely inspect/);
  } finally {
    process.env.PATH = originalPath;
    fs.rmSync(fakeBin, { recursive: true, force: true });
  }
});


fixtureTest("precommit --all scans non-allowlisted text extensions", async () => {
  const untracked = path.join(repoRoot, "app.cfg");
  const hadGit = fs.existsSync(path.join(repoRoot, ".git"));
  if (!hadGit) {
    const init = runCommand("git", ["init", "-q"], { cwd: repoRoot });
    assert.equal(init.ok, true, init.stderr);
  }

  fs.writeFileSync(untracked, `${"pass"}word=super-secret-config-value\n`, "utf-8");
  try {
    const { io, err } = capture();
    const code = await main(["precommit", "--all"], io);
    assert.equal(code, 1);
    assert.match(err.join("\n"), /app\.cfg/);
    assert.match(err.join("\n"), /password/i);
  } finally {
    fs.rmSync(untracked, { force: true });
    if (!hadGit) fs.rmSync(path.join(repoRoot, ".git"), { recursive: true, force: true });
  }
});

fixtureTest("precommit scans staged content instead of cleaned worktree content", async () => {
  const stagedFile = path.join(repoRoot, "staged-secret.json");
  const hadGit = fs.existsSync(path.join(repoRoot, ".git"));
  if (!hadGit) {
    const init = runCommand("git", ["init", "-q"], { cwd: repoRoot });
    assert.equal(init.ok, true, init.stderr);
  }

  fs.writeFileSync(stagedFile, JSON.stringify({ [`tok${"en"}`]: "staged-secret-json-token" }) + "\n", "utf-8");
  const add = runCommand("git", ["add", "staged-secret.json"], { cwd: repoRoot });
  assert.equal(add.ok, true, add.stderr);
  fs.writeFileSync(stagedFile, JSON.stringify({ ok: true }) + "\n", "utf-8");
  try {
    const { io, err } = capture();
    const code = await main(["precommit"], io);
    assert.equal(code, 1);
    assert.match(err.join("\n"), /staged-secret\.json/);
    assert.match(err.join("\n"), /token/i);
  } finally {
    runCommand("git", ["reset", "-q", "--", "staged-secret.json"], { cwd: repoRoot });
    fs.rmSync(stagedFile, { force: true });
    if (!hadGit) fs.rmSync(path.join(repoRoot, ".git"), { recursive: true, force: true });
  }
});

fixtureTest("precommit blocks staged symlinks instead of scanning link targets", async () => {
  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "harness-staged-outside-"));
  const outsideFixture = path.join(outsideDir, "staged-external-fixture.txt");
  const linkRel = "staged-external-link.txt";
  const linkPath = path.join(repoRoot, linkRel);
  const hadGit = fs.existsSync(path.join(repoRoot, ".git"));
  if (!hadGit) {
    const init = runCommand("git", ["init", "-q"], { cwd: repoRoot });
    assert.equal(init.ok, true, init.stderr);
  }

  fs.writeFileSync(outsideFixture, `${"pass"}word=staged-external-secret-value\n`, "utf-8");
  fs.symlinkSync(outsideFixture, linkPath);
  const add = runCommand("git", ["add", linkRel], { cwd: repoRoot });
  assert.equal(add.ok, true, add.stderr);
  try {
    const { io, out, err } = capture();
    const code = await main(["precommit"], io);
    assert.equal(code, 1);
    assert.match(err.join("\n"), /Staged symlink requires explicit/);
    assert.doesNotMatch(out.join("\n"), /staged-external-secret-value|password/i);
    assert.doesNotMatch(err.join("\n"), /staged-external-secret-value|password/i);
  } finally {
    runCommand("git", ["reset", "-q", "--", linkRel], { cwd: repoRoot });
    fs.rmSync(linkPath, { force: true });
    fs.rmSync(outsideDir, { recursive: true, force: true });
    if (!hadGit) fs.rmSync(path.join(repoRoot, ".git"), { recursive: true, force: true });
  }
});
