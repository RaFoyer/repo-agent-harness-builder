import fs from "node:fs";
import path from "node:path";
import { createHash, createPublicKey, verify as verifySignature } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { CONFIG } from "../config.mjs";
import { rejectUnexpectedArgs, renderHelpBlock, renderUsageError, toonString } from "../util/agent-output.mjs";

const REGISTRY_REL_PATH = "ops/orchestration.json";
const REGISTRY_SCHEMA_VERSION = 4;
const SUPPORTED_REGISTRY_SCHEMA_VERSIONS = new Set([2, 3, 4]);
const COORDINATION_MODES = new Set(["managed", "hybrid"]);
const DIRECTIVE_KINDS = new Set(["owner-directive", "owner-intervention"]);
const DIRECTIVE_IMPACTS = new Set(["within-contract", "replan-required"]);
const DIRECTIVE_STATES = new Set(["issued", "acknowledged", "reconciled", "superseded", "cancelled"]);
const DIRECTIVE_TERMINAL_STATES = new Set(["reconciled", "superseded", "cancelled"]);
const SAFE_DIRECTIVE_ID_RE = /^[a-z][a-z0-9-]{0,95}$/;
const SHA256_RE = /^[a-f0-9]{64}$/;
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
const DEPRECATED_SKILL_ALIASES = new Map([["goal-chain-loop", GOAL_GRAPH_SKILL]]);
const GOAL_GRAPH_PROTOCOLS = new Set(["GOAL-GRAPH", "GOAL-CHAIN"]);
const SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PRESENTATION_PROFILES = new Set(["portable", "nautical", "executive"]);
const PRESENTATION_ROLE_LABELS = {
  portable: { boss: "Boss", manager: "Manager", worker: "Worker" },
  nautical: { boss: "Firstmate", manager: "Secondmate", worker: "Crewmate" }
};
const DEFAULT_EXECUTIVE_MANAGER_CATALOG = ["CTO", "COO", "CPO", "CFO", "CMO", "CRO"];
const DEFAULT_EXECUTIVE_WORKER_CATALOG = ["Director", "Lead", "Contributor"];
const CODEX_FIRSTMATE_ASSETS = [
  ".agents/skills/project-orchestration/SKILL.md",
  ".agents/skills/codex-native-firstmate/SKILL.md",
  ".codex/config.firstmate.example.toml",
  ".codex/agents/firstmate-boss.toml",
  ".codex/agents/firstmate-manager.toml",
  ".codex/agents/firstmate-worker.toml",
  "docs/templates/orchestration/codex-native-firstmate-prompt.txt",
  "docs/templates/orchestration/codex-native-firstmate-adapter.example.json",
  "ops/protocols/CODEX-NATIVE-FIRSTMATE.md"
];

function registryPath() {
  return path.join(CONFIG.repoRoot, REGISTRY_REL_PATH);
}

function loadRegistry() {
  const fullPath = registryPath();
  if (!fs.existsSync(fullPath)) return { exists: false, registry: null, error: "" };
  try {
    return { exists: true, registry: JSON.parse(fs.readFileSync(fullPath, "utf-8")), error: "" };
  } catch (error) {
    return { exists: true, registry: null, error: error.message || "invalid JSON" };
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

function missingRequiredSkills(registry, node) {
  return requiredSkillsFor(registry, node).filter((skillName) => !fs.existsSync(
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

function canonicalValues(value) {
  return [...new Set(arrayOrEmpty(value))].sort();
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
  const nodeContract = {
    id: node.id,
    role: node.role,
    parentId: node.parentId,
    workRef: node.workRef,
    workKind: node.workKind,
    governingProtocols: canonicalValues(node.governingProtocols),
    ...(registry.schemaVersion >= 3 ? { requiredSkills: requiredSkillsFor(registry, node) } : {}),
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
    scope: registry.scope,
    trustPolicy: registry.trustPolicy,
    node: nodeContract,
    parent: parent ? {
      id: parent.id,
      taskId: parent.taskId,
      trustLevel: parent.trustLevel,
      authority: canonicalAuthority(parent.authority)
    } : null
  });
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
    if (!isNonEmptyString(directive.directiveRef)) blockers.push(`${label}: directiveRef must be a non-empty single-line reference`);
    if (!DIRECTIVE_IMPACTS.has(directive.contractImpact)) blockers.push(`${label}: contractImpact must be within-contract or replan-required`);
    if (!DIRECTIVE_STATES.has(directive.status)) blockers.push(`${label}: invalid status`);
    if (!Number.isSafeInteger(directive.registryRevisionAtIssue) || directive.registryRevisionAtIssue < 0
      || directive.registryRevisionAtIssue > registry.revision) {
      blockers.push(`${label}: registryRevisionAtIssue must be a non-negative revision no newer than the registry`);
    }
    if (!isUtcRfc3339Timestamp(directive.createdAt)) blockers.push(`${label}: createdAt must be a UTC RFC3339 timestamp`);
    const target = nodesById.get(directive.targetNodeId);
    if (!target) blockers.push(`${label}: targetNodeId must reference a configured node`);
    if (target && directive.targetParentIdAtIssue !== target.parentId) blockers.push(`${label}: targetParentIdAtIssue must match the target's immutable parent`);
    if (target?.state === "terminal" && !DIRECTIVE_TERMINAL_STATES.has(directive.status)) {
      blockers.push(`${label}: an open directive cannot target a terminal node`);
    }
    if (!SHA256_RE.test(String(directive.workContractHashAtIssue || ""))) blockers.push(`${label}: workContractHashAtIssue must be a lowercase SHA-256 digest`);
    if (target && ["issued", "acknowledged"].includes(directive.status)) {
      const parent = target.parentId ? nodesById.get(target.parentId) : null;
      if (directive.workContractHashAtIssue !== materializedWorkContractHash(registry, target, parent)) {
        blockers.push(`${label}: open directive workContractHashAtIssue must match the current target contract`);
      }
    }
    if (directive.status !== "issued" && !isUtcRfc3339Timestamp(directive.acknowledgedAt)) {
      blockers.push(`${label}: acknowledgedAt is required after issuance`);
    }
    if (DIRECTIVE_TERMINAL_STATES.has(directive.status) && !isNonEmptyString(directive.resolutionRef)) {
      blockers.push(`${label}: terminal directive status requires resolutionRef`);
    }
    if (DIRECTIVE_TERMINAL_STATES.has(directive.status) && target?.parentId && !isUtcRfc3339Timestamp(directive.parentObservedAt)) {
      blockers.push(`${label}: terminal directive status requires parentObservedAt`);
    }
  }
}

function openOwnerDirectivesFor(registry, nodeId) {
  return arrayOrEmpty(registry.ownerDirectives).filter((directive) => (
    directive.targetNodeId === nodeId && !DIRECTIVE_TERMINAL_STATES.has(directive.status)
  ));
}

function hasOpenReplanDirective(registry, nodeId) {
  return openOwnerDirectivesFor(registry, nodeId).some((directive) => directive.contractImpact === "replan-required");
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
    parentTaskId: parent?.taskId ?? null,
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
  const requiresActiveRegistry = mode === "reservation" || node.role !== "boss";
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
  if (hasOpenReplanDirective(registry, node.id)) {
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
    if (!isTaskBackedNode(parent)) {
      block("parent-task", `launch eligibility requires task-backed parent ${node.parentId || "<missing-parent>"}`);
    }
    if (!MANAGING_STATES.has(parent?.state)) {
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
  if (!SUPPORTED_REGISTRY_SCHEMA_VERSIONS.has(registry.schemaVersion)) blockers.push("schemaVersion must be 2, 3, or 4");
  else if (registry.schemaVersion === 2) warnings.push("schemaVersion 2 is supported for existing bindings; migrate to 3 or newer before relying on requiredSkills as immutable work-contract data");
  else if (registry.schemaVersion === 3) warnings.push("schemaVersion 3 is supported for existing bindings; migrate to 4 before enabling hybrid coordination and owner directives");
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
    if (!Array.isArray(node.dependencies) || !node.dependencies.every(isNonEmptyString)) blockers.push(`${label}: dependencies must be an array of node ids`);
    const parent = node.parentId ? nodesById.get(node.parentId) : null;
    if (node.role === "boss" && node.parentId !== null) blockers.push(`${label}: Boss parentId must be null`);
    if (node.role === "boss" && node.parentTaskId !== undefined && node.parentTaskId !== null) {
      blockers.push(`${label}: Boss parentTaskId must be null`);
    }
    if (node.role !== "boss" && !isNonEmptyString(node.parentId)) blockers.push(`${label}: non-Boss nodes require parentId`);
    if (node.role !== "boss" && isNonEmptyString(node.parentId) && !parent) blockers.push(`${label}: parent ${node.parentId} does not exist`);
    if (node.role === "manager" && parent?.role !== "boss") blockers.push(`${label}: Manager parent must be the Boss`);
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
      if (!isTaskBackedNode(parent)) blockers.push(`${label}: task-backed non-Boss node requires task-backed parent ${parent?.id || node.parentId}`);
      if (!isNonEmptyString(node.parentTaskId)) {
        blockers.push(`${label}: task-backed non-Boss node requires immutable parentTaskId`);
      } else if (node.parentTaskId !== parent?.taskId) {
        blockers.push(`${label}: parentTaskId must match immediate parent ${parent?.id || node.parentId} taskId; replace parent tasks only after bound descendants are reconciled`);
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
      if (!MANAGING_STATES.has(parent.state)) {
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

export function validateCurrentOrchestrationRegistry() {
  const loaded = loadRegistry();
  if (!loaded.exists) return { registry: null, blockers: [`missing ${REGISTRY_REL_PATH}`], warnings: [], nodes: [], nodesById: new Map() };
  if (loaded.error) return { registry: null, blockers: [`invalid JSON: ${loaded.error}`], warnings: [], nodes: [], nodesById: new Map() };
  return { registry: loaded.registry, ...validateRegistry(loaded.registry) };
}

function printHelp(io) {
  io.stdout("Usage: ./{{CLI_NAME}} orchestration <command> [node-id]");
  io.stdout("");
  io.stdout("Commands:");
  io.stdout("  status             Summarize configured project orchestration");
  io.stdout("  adapter-status     Inspect Codex-native Firstmate adapter posture");
  io.stdout("  taxonomy           Preview presentation profiles and task-title grammar");
  io.stdout("  hierarchy          Show role, title, and parent-link taxonomy");
  io.stdout("  trust              Show the T0-T5 trust ladder and inheritance rules");
  io.stdout("  validate           Validate registry structure, state, trust, and authority");
  io.stdout("  directives         Show governed direct owner instructions and reconciliation state");
  io.stdout("  next               List dependency-eligible nodes");
  io.stdout("  prompt boss        Print a bounded Boss prompt");
  io.stdout("  prompt <node-id>   Print a bounded prompt for a configured node");
  io.stdout("  launch-spec <id>   Print a JSON task-creation contract for a client adapter");
  io.stdout("");
  io.stdout("All commands are read-only and never create tasks or mutate external systems.");
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

function firstmateActivationBlockers(registry, adapter) {
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
  if (bosses.length !== 1 || !isTaskBackedNode(bosses[0])) {
    blockers.push("one task-backed Firstmate Boss is required");
  } else if (!isNonEmptyString(adapter.bossTaskId) || adapter.bossTaskId !== bosses[0].taskId) {
    blockers.push("clientAdapter.bossTaskId must match the task-backed Firstmate Boss");
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
  if (!isObject(retention)
    || typeof retention.pinBoss !== "boolean"
    || !isNonEmptyString(retention.archivePolicy)
    || retention.archivePolicy === "unconfigured"
    || !isNonEmptyString(retention.handoffPolicy)) {
    blockers.push("clientAdapter.retention must configure pin, handoff, and archive policy");
  }
  if (!isNonEmptyString(adapter.reconciliationPolicy) || adapter.reconciliationPolicy === "unconfigured") {
    blockers.push("clientAdapter.reconciliationPolicy is required");
  }
  if (registry.schemaVersion >= 4 && registry.coordinationMode === "hybrid") {
    const direct = adapter.ownerDirectMessaging;
    if (!isObject(direct)
      || direct.enabled !== true
      || !isStringArray(direct.targetRoles, { nonEmpty: true })
      || !direct.targetRoles.every((role) => ["manager", "worker"].includes(role))
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
  const registryValid = Boolean(loaded.exists && !loaded.error && validateRegistry(loaded.registry).blockers.length === 0);
  const activationBlockers = registryValid ? firstmateActivationBlockers(loaded.registry, adapter) : ["registry must be valid"];
  if (presentCount !== assets.length) activationBlockers.push("all Firstmate profile assets must be present");

  io.stdout(`profile: ${toonString(CODEX_FIRSTMATE_PROFILE)}`);
  io.stdout(`registry: ${toonString(REGISTRY_REL_PATH)}`);
  io.stdout(`registry_state: ${toonString(!loaded.exists ? "missing" : loaded.error ? "invalid" : loaded.registry.status)}`);
  io.stdout(`registry_valid: ${registryValid}`);
  io.stdout(`adapter_state: ${toonString(!adapter ? "unconfigured" : adapter.status)}`);
  io.stdout(`adapter_selected: ${selected}`);
  io.stdout(`repo_local_scope: true`);
  io.stdout(`assets_present: ${presentCount}`);
  io.stdout(`assets_expected: ${assets.length}`);
  io.stdout(`assets[${assets.length}]{path,present}:`);
  for (const asset of assets) io.stdout(`  ${toonString(asset.path)},${asset.present}`);
  io.stdout("native_capabilities[9]{capability,detection,status}:");
  io.stdout('  "persistent tasks","Codex client runtime","verify before activation"');
  io.stdout('  "managed worktrees","Codex client runtime","verify before activation"');
  io.stdout('  "task title/pin/archive/handoff","Codex client runtime","verify before activation"');
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
    io.stdout(`registry: ${toonString(REGISTRY_REL_PATH)}`);
    io.stdout(renderHelpBlock([`Add ${REGISTRY_REL_PATH} from the scaffold template`, `Run ./${CONFIG.cliName} orchestration hierarchy`]));
    return 0;
  }
  if (loaded.error) {
    io.stdout('state: "invalid"');
    io.stdout(`registry: ${toonString(REGISTRY_REL_PATH)}`);
    io.stdout(`error: ${toonString(loaded.error)}`);
    return 1;
  }
  const findings = validateRegistry(loaded.registry);
  const counts = Object.fromEntries([...STATES].map((state) => [state, findings.nodes.filter((node) => node.state === state).length]));
  io.stdout(`state: ${toonString(loaded.registry.status)}`);
  io.stdout(`registry: ${toonString(REGISTRY_REL_PATH)}`);
  io.stdout(`prefix: ${toonString(loaded.registry.prefix || "")}`);
  io.stdout(`scope: ${toonString(loaded.registry.scope?.id || "")}`);
  io.stdout(`scope_kind: ${toonString(loaded.registry.scope?.kind || "")}`);
  io.stdout(`coordination_mode: ${toonString(loaded.registry.coordinationMode || "managed")}`);
  io.stdout(`owner_ref: ${toonString(loaded.registry.scope?.ownerRef || "unconfigured")}`);
  io.stdout(`owner_directives: ${arrayOrEmpty(loaded.registry.ownerDirectives).length}`);
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

function runDirectives(io) {
  const loaded = loadRegistry();
  if (!loaded.exists || loaded.error) {
    io.stdout("directives: 0");
    io.stdout(`reason: ${toonString(!loaded.exists ? `missing ${REGISTRY_REL_PATH}` : `invalid JSON: ${loaded.error}`)}`);
    return 1;
  }
  const findings = validateRegistry(loaded.registry);
  const directives = arrayOrEmpty(loaded.registry.ownerDirectives);
  io.stdout(`coordination_mode: ${toonString(loaded.registry.coordinationMode || "managed")}`);
  io.stdout(`directives: ${directives.length}`);
  io.stdout(`records[${directives.length}]{id,target_node,impact,status,directive_ref}:`);
  for (const directive of directives) {
    io.stdout(`  ${toonString(directive.id || "")},${toonString(directive.targetNodeId || "")},${toonString(directive.contractImpact || "")},${toonString(directive.status || "")},${toonString(directive.directiveRef || "")}`);
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
  io.stdout('  "Every live non-Boss task records its immediate parent task ID"');
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
    io.stdout(`blockers[1]: ${toonString(`missing ${REGISTRY_REL_PATH}`)}`);
    return 1;
  }
  if (loaded.error) {
    io.stdout('valid: false');
    io.stdout(`blockers[1]: ${toonString(`invalid JSON: ${loaded.error}`)}`);
    return 1;
  }
  const findings = validateRegistry(loaded.registry);
  io.stdout(`valid: ${findings.blockers.length === 0}`);
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
  const loaded = loadRegistry();
  if (!loaded.exists || loaded.error) {
    io.stdout("eligible: 0");
    io.stdout(`reason: ${toonString(!loaded.exists ? `missing ${REGISTRY_REL_PATH}` : `invalid JSON: ${loaded.error}`)}`);
    return 1;
  }
  const findings = validateRegistry(loaded.registry);
  if (findings.blockers.length) {
    io.stdout("eligible: 0");
    printFindings(io, findings);
    return 1;
  }
  if (loaded.registry.status !== "active") {
    io.stdout("eligible: 0");
    io.stdout('reason: "orchestration is inactive"');
    return 0;
  }
  const eligible = findings.nodes.filter((node) => node.role !== "boss"
    && ["queued", "eligible"].includes(node.state)
    && !hasLaunchReservation(node)
    && !hasOpenReplanDirective(loaded.registry, node.id)
    && dependenciesSatisfied(node, findings.nodesById));
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
  lines.push(`Immediate parent task ID: ${parent?.taskId || "none"}`);
  lines.push(`Coordination mode: ${registry.coordinationMode || "managed"}`);
  const directives = openOwnerDirectivesFor(registry, node.id);
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
  lines.push("");
  lines.push("First action:");
  lines.push("- Read project instructions and governing domain protocols, confirm dependency inputs, then return a concise plan with target surfaces, risks, verification, evidence, and exit criteria before substantial work.");
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
  const loaded = loadRegistry();
  if (!loaded.exists || loaded.error) {
    io.stderr(!loaded.exists ? `Missing ${REGISTRY_REL_PATH}` : `Invalid ${REGISTRY_REL_PATH}: ${loaded.error}`);
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
  const missingSkills = missingRequiredSkills(loaded.registry, node);
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
  const workContract = materializedWorkContract(loaded.registry, node, parent);
  const workContractHash = materializedWorkContractHash(loaded.registry, node, parent);
  const launchKey = launchKeyFor(loaded.registry, node, parent);
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
    ...(node.role === "boss" ? { status: "active" } : {})
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
  io.stdout(JSON.stringify({
    schemaVersion: loaded.registry.schemaVersion,
    ...(loaded.registry.schemaVersion >= 4 ? { coordinationMode: loaded.registry.coordinationMode } : {}),
    operation: "create-task",
    nodeId: node.id,
    role: node.role,
    title: node.title,
    parentTaskId: parent?.taskId || null,
    ...(loaded.registry.schemaVersion >= 3 ? { requiredSkills: requiredSkillsFor(loaded.registry, node) } : {}),
    trustLevel: node.trustLevel,
    authority: canonicalAuthority(node.authority),
    workContract: { algorithm: "sha256", hash: workContractHash },
    taskBinding: taskBindingUpdate({
      registry: loaded.registry,
      launchKey,
      workContractHash,
      node,
      parent,
      boundRevision: reservationValidity.expectedRegistryRevision + 1
    }),
    externalTask: {
      idempotencyKey: launchKey,
      reconciliationKey: launchKey,
      ...(firstmate ? {
        requiredTitle: node.title,
        requiredCreateBehavior: "Use launchKey as the external task API idempotency key, then set and verify the exact requiredTitle before binding.",
        requiredAdoptBehavior: "Before binding an existing task found by launchKey, rename it to requiredTitle and verify the observed title."
      } : {}),
      indeterminateCreateBehavior: "Keep the reservation and reconcile the external task by launchKey before any retry or release."
    },
    prompt: buildPromptLines(node, parent, loaded.registry).join("\n"),
    reservation,
    callback: {
      registry: REGISTRY_REL_PATH,
      mode: configured ? "update-node" : "insert-node",
      registryNode: configured ? undefined : node,
      reserve: {
        operation: "compare-and-set-reserve",
        ...reservation,
        onSuccess: {
          registryRevision: loaded.registry.revision + 1,
          ...(node.role === "boss" ? { status: "active" } : {}),
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
        requiredUpdates: [
          "taskId",
          ...(firstmate ? ["verified externalTitle and titleVerification matching the registry title"] : []),
          ...(node.role === "boss" ? [] : ["parentTaskId=immediate parent taskId"]),
          "Ed25519-attested taskBinding with immutable launch key, work-contract hash, node/task/parent identities, bind revision, and bind time",
          "state=working",
          "nextAction",
          "clear launchReservation"
        ],
        taskBinding: taskBindingUpdate({
          registry: loaded.registry,
          launchKey,
          workContractHash,
          node,
          parent,
          boundRevision: reservationValidity.expectedRegistryRevision + 1
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
            renameAndVerifyBeforeBind: true
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
            parentTaskRequired: true,
            parentManagingStateRequired: true,
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
          materializedWorkContractHash: workContractHash
        },
        requiredUpdates: [
          "taskId from reconciled external task",
          ...(firstmate ? ["verified externalTitle and titleVerification matching the registry title"] : []),
          ...(node.role === "boss" ? [] : ["parentTaskId=immediate parent taskId"]),
          "Ed25519-attested taskBinding with immutable launch key, work-contract hash, node/task/parent identities, latest bind revision, and bind time",
          "state=working",
          "nextAction",
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
          ...(node.role === "boss" ? ["status=active"] : []),
          "taskId",
          ...(node.role === "boss" ? [] : ["parentTaskId=immediate parent taskId"]),
          "taskBinding",
          "state=working",
          "nextAction"
        ]
        : ["insert registryNode", "status=active", "taskId", "taskBinding", "state=working", "nextAction"]
    }
  }, null, 2));
  return 0;
}

export async function runOrchestration(argv, io) {
  const [command = "status", ...rest] = argv;
  if (argv.includes("--help") || argv.includes("-h") || command === "help") {
    printHelp(io);
    return 0;
  }
  switch (command) {
    case "status":
      if (rejectUnexpectedArgs(rest, io, { command: "orchestration status", hints: [`Run ./${CONFIG.cliName} orchestration status`] })) return 2;
      return runStatus(io);
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
