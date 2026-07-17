import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { CONFIG } from "../config.mjs";
import { rejectUnexpectedArgs, renderHelpBlock, renderUsageError, toonString } from "../util/agent-output.mjs";

const REGISTRY_REL_PATH = "ops/orchestration.json";
const REGISTRY_SCHEMA_VERSION = 2;
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

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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

function titleForNode(node, nodesById, prefix) {
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

function materializedWorkContract(registry, node, parent) {
  return canonicalize({
    scope: registry.scope,
    trustPolicy: registry.trustPolicy,
    node: {
      id: node.id,
      role: node.role,
      parentId: node.parentId,
      workRef: node.workRef,
      workKind: node.workKind,
      governingProtocols: canonicalValues(node.governingProtocols),
      label: node.label,
      title: node.title,
      objective: node.objective,
      dependencies: canonicalValues(node.dependencies),
      trustLevel: node.trustLevel,
      authority: canonicalAuthority(node.authority),
      completionProfile: isObject(node.completionProfile)
        ? { ...node.completionProfile, requiredEvidence: canonicalValues(node.completionProfile.requiredEvidence) }
        : node.completionProfile
    },
    parent: parent ? {
      id: parent.id,
      taskId: parent.taskId,
      trustLevel: parent.trustLevel,
      authority: canonicalAuthority(parent.authority)
    } : null
  });
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
  if ((binding.parentNodeId ?? null) !== (node.parentId ?? null)) blockers.push(`${label}: taskBinding.parentNodeId must match immutable parent node identity`);
  if ((binding.parentTaskId ?? null) !== (node.role === "boss" ? null : node.parentTaskId ?? null)) {
    blockers.push(`${label}: taskBinding.parentTaskId must match immutable parent task identity`);
  }
  if (!Number.isSafeInteger(binding.boundRevision) || binding.boundRevision < 0 || binding.boundRevision > registry.revision) {
    blockers.push(`${label}: taskBinding.boundRevision must be a registry revision at or before the current revision`);
  }
  if (!isUtcRfc3339Timestamp(binding.boundAt)) blockers.push(`${label}: taskBinding.boundAt must be a UTC RFC3339 timestamp`);
  return blockers;
}

function taskBindingUpdate({ launchKey, workContractHash, node, parent, boundRevision }) {
  return {
    launchKey,
    workContractHash,
    nodeId: node.id,
    taskId: "external task ID returned by the adapter",
    parentNodeId: node.parentId ?? null,
    parentTaskId: parent?.taskId ?? null,
    boundRevision,
    boundAt: "UTC RFC3339 timestamp of the atomic bind"
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
  if (node.parentTaskId !== undefined && node.parentTaskId !== null) {
    block("parent-task-identity", "launch eligibility requires no bound parentTaskId");
  }
  if (mode === "launch" && hasReservation) {
    block("reservation", "launch eligibility requires no pending launch reservation");
  }
  if (mode === "reservation" && !hasReservation) {
    block("reservation", "launch eligibility requires a pending launch reservation");
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
  if (!isObject(registry)) return { blockers: ["registry root must be a JSON object"], warnings, nodes: [], nodesById: new Map() };
  if (registry.schemaVersion !== REGISTRY_SCHEMA_VERSION) blockers.push(`schemaVersion must be ${REGISTRY_SCHEMA_VERSION}`);
  if (!Number.isSafeInteger(registry.revision) || registry.revision < 0) blockers.push("revision must be a non-negative safe integer");
  if (!["inactive", "active"].includes(registry.status)) blockers.push("status must be inactive or active");
  if (!isNonEmptyString(registry.prefix)) blockers.push("prefix must be a non-empty single-line string");
  if (!isObject(registry.scope)) blockers.push("scope is required");
  if (!isNonEmptyString(registry.scope?.id)) blockers.push("scope.id must be a non-empty single-line string");
  if (!SCOPE_KINDS.has(registry.scope?.kind)) blockers.push("scope.kind must be repository, project, program, personal-folder, or custom");
  if (!isNonEmptyString(registry.scope?.rootRef)) blockers.push("scope.rootRef must be a non-empty single-line reference");
  if (!isNonEmptyString(registry.scope?.objective)) blockers.push("scope.objective must be a non-empty single-line string");
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
  const bosses = nodes.filter((node) => node.role === "boss");
  if (bosses.length > 1) blockers.push("only one Boss is allowed");
  if (registry.status === "active" && bosses.length !== 1) blockers.push("active orchestration requires exactly one Boss");
  if (registry.status === "inactive" && nodes.length === 0) warnings.push("orchestration is scaffolded but inactive; configure a Boss and nodes before activation");

  for (const node of nodes) {
    const label = `node ${node.id}`;
    const dependencies = arrayOrEmpty(node.dependencies);
    if (!ROLES.has(node.role)) blockers.push(`${label}: role must be boss, manager, or worker`);
    if (!STATES.has(node.state)) blockers.push(`${label}: invalid state ${node.state || "<missing>"}`);
    if (!isNonEmptyString(node.workRef)) blockers.push(`${label}: workRef is required`);
    if (!isNonEmptyString(node.workKind) || !/^[a-z][a-z0-9-]*$/.test(node.workKind)) blockers.push(`${label}: workKind must be a lowercase slug`);
    if (!isStringArray(node.governingProtocols, { nonEmpty: true })) blockers.push(`${label}: governingProtocols must be a non-empty string array`);
    else if (!node.governingProtocols.includes(CORE_GOVERNING_PROTOCOL)) blockers.push(`${label}: governingProtocols must include ${CORE_GOVERNING_PROTOCOL}`);
    if (!isNonEmptyString(node.label)) blockers.push(`${label}: label is required`);
    if (!isNonEmptyString(node.objective)) blockers.push(`${label}: objective is required`);
    if (!Array.isArray(node.dependencies) || !node.dependencies.every(isNonEmptyString)) blockers.push(`${label}: dependencies must be an array of node ids`);
    const parent = node.parentId ? nodesById.get(node.parentId) : null;
    if (node.role === "boss" && node.parentId !== null) blockers.push(`${label}: Boss parentId must be null`);
    if (node.role !== "boss" && !isNonEmptyString(node.parentId)) blockers.push(`${label}: non-Boss nodes require parentId`);
    if (node.role !== "boss" && isNonEmptyString(node.parentId) && !parent) blockers.push(`${label}: parent ${node.parentId} does not exist`);
    if (node.role === "manager" && parent?.role !== "boss") blockers.push(`${label}: Manager parent must be the Boss`);
    const expectedTitle = titleForNode(node, nodesById, registry.prefix || "<PREFIX>");
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

function printHelp(io) {
  io.stdout("Usage: ./{{CLI_NAME}} orchestration <command> [node-id]");
  io.stdout("");
  io.stdout("Commands:");
  io.stdout("  status             Summarize configured project orchestration");
  io.stdout("  hierarchy          Show role, title, and parent-link taxonomy");
  io.stdout("  trust              Show the T0-T5 trust ladder and inheritance rules");
  io.stdout("  validate           Validate registry structure, state, trust, and authority");
  io.stdout("  next               List dependency-eligible nodes");
  io.stdout("  prompt boss        Print a bounded Boss prompt");
  io.stdout("  prompt <node-id>   Print a bounded prompt for a configured node");
  io.stdout("  launch-spec <id>   Print a JSON task-creation contract for a client adapter");
  io.stdout("");
  io.stdout("All commands are read-only and never create tasks or mutate external systems.");
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
  const eligible = findings.nodes.filter((node) => node.role !== "boss" && ["queued", "eligible"].includes(node.state) && !hasLaunchReservation(node) && dependenciesSatisfied(node, findings.nodesById));
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

function syntheticBoss(registry) {
  return {
    id: "boss",
    role: "boss",
    workRef: "portfolio",
    workKind: "governance",
    governingProtocols: [CORE_GOVERNING_PROTOCOL],
    label: "Project control plane",
    title: `${registry.prefix} - Boss`,
    taskId: null,
    parentId: null,
    state: "eligible",
    trustLevel: registry.trustPolicy.defaultLevel,
    authority: { allowedReads: ["project"], allowedWrites: [], allowedExternalActions: [], approvalGates: ["activation"], canDelegate: false, maxActiveChildren: 0, stopConditions: ["authority-gap"] },
    objective: "Establish the project control plane before activating child work.",
    dependencies: []
  };
}

function resolvePromptNode(nodeId, loaded, findings) {
  const configured = findings.nodesById.get(nodeId);
  if (configured) return configured;
  if (nodeId.toLowerCase() === "boss" && loaded.registry.status === "inactive" && findings.nodes.length === 0) return syntheticBoss(loaded.registry);
  return null;
}

function buildPromptLines(node, parent) {
  const lines = [];
  lines.push(`Title: ${node.title}`);
  lines.push(`Node ID: ${node.id}`);
  lines.push(`Work reference: ${node.workRef}`);
  lines.push(`Work kind: ${node.workKind}`);
  lines.push(`Governing protocols: ${node.governingProtocols.join(", ")}`);
  lines.push(`Immediate parent task ID: ${parent?.taskId || "none"}`);
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
  for (const line of buildPromptLines(target.node, target.parent)) io.stdout(line);
  return 0;
}

function runLaunchSpec(nodeId, io) {
  const target = loadPromptTarget(nodeId, io);
  if (target.code !== 0) return target.code;
  const { node, parent, findings, loaded } = target;
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
    schemaVersion: 2,
    operation: "create-task",
    nodeId: node.id,
    role: node.role,
    title: node.title,
    parentTaskId: parent?.taskId || null,
    trustLevel: node.trustLevel,
    authority: canonicalAuthority(node.authority),
    workContract: { algorithm: "sha256", hash: workContractHash },
    taskBinding: taskBindingUpdate({
      launchKey,
      workContractHash,
      node,
      parent,
      boundRevision: reservationValidity.expectedRegistryRevision + 1
    }),
    externalTask: {
      idempotencyKey: launchKey,
      reconciliationKey: launchKey,
      requiredCreateBehavior: "Use launchKey as the external task API idempotency key.",
      indeterminateCreateBehavior: "Keep the reservation and reconcile the external task by launchKey before any retry or release."
    },
    prompt: buildPromptLines(node, parent).join("\n"),
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
          ...(node.role === "boss" ? [] : ["parentTaskId=immediate parent taskId"]),
          "taskBinding with immutable launch key, work-contract hash, node/task/parent identities, bind revision, and bind time",
          "state=working",
          "nextAction",
          "clear launchReservation"
        ],
        taskBinding: taskBindingUpdate({
          launchKey,
          workContractHash,
          node,
          parent,
          boundRevision: reservationValidity.expectedRegistryRevision + 1
        }),
        mustAdvanceRegistryRevision: true,
        onFailure: "Keep the reservation and reconcile the external task by launchKey; do not create another task."
      },
      reconcile: {
        operation: "compare-and-set-reconcile-bind",
        externalTask: {
          reconciliationKey: launchKey,
          idempotencyKey: launchKey,
          requireExistingTask: true,
          createAllowed: false
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
          ...(node.role === "boss" ? [] : ["parentTaskId=immediate parent taskId"]),
          "taskBinding with immutable launch key, work-contract hash, node/task/parent identities, latest bind revision, and bind time",
          "state=working",
          "nextAction",
          "clear launchReservation"
        ],
        mustAdvanceRegistryRevision: true,
        onFailure: "Keep the reservation quarantined for explicit cancel or replan; do not create another task.",
        taskBinding: taskBindingUpdate({
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
    case "hierarchy":
      if (rejectUnexpectedArgs(rest, io, { command: "orchestration hierarchy", hints: [`Run ./${CONFIG.cliName} orchestration hierarchy`] })) return 2;
      return runHierarchy(io);
    case "trust":
      if (rejectUnexpectedArgs(rest, io, { command: "orchestration trust", hints: [`Run ./${CONFIG.cliName} orchestration trust`] })) return 2;
      return runTrust(io);
    case "validate":
      if (rejectUnexpectedArgs(rest, io, { command: "orchestration validate", hints: [`Run ./${CONFIG.cliName} orchestration validate`] })) return 2;
      return runValidate(io);
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
