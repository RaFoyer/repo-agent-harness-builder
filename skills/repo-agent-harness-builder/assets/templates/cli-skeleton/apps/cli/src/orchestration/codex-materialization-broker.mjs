import fs from "node:fs";
import path from "node:path";
import {
  createHash,
  createPublicKey,
  randomUUID,
  verify as verifySignature
} from "node:crypto";

const RECEIPT_SCHEMA_VERSION = 1;
const SHA256_RE = /^[a-f0-9]{64}$/;
const FORWARD_STAGES = [
  "reserved",
  "create-issued",
  "observed",
  "attestation-requested",
  "attested",
  "bind-issued",
  "bound-inert",
  "activation-issued",
  "activation-confirmed",
  "completed"
];
const STAGE_INDEX = new Map(FORWARD_STAGES.map((stage, index) => [stage, index]));

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function sha256(value) {
  const input = typeof value === "string" || Buffer.isBuffer(value)
    ? value
    : canonicalJson(value);
  return createHash("sha256").update(input).digest("hex");
}

function privateStat(fileSystem, target, expectedType, expectedMode) {
  const stat = fileSystem.lstatSync(target);
  if (stat.isSymbolicLink()) throw new Error(`private materialization ${expectedType} may not be a symlink: ${target}`);
  if (expectedType === "directory" && !stat.isDirectory()) {
    throw new Error(`private materialization path must be a directory: ${target}`);
  }
  if (expectedType === "file" && !stat.isFile()) {
    throw new Error(`private materialization path must be a regular file: ${target}`);
  }
  if ((stat.mode & 0o777) !== expectedMode) {
    throw new Error(`private materialization ${expectedType} must have mode ${expectedMode.toString(8)}: ${target}`);
  }
  return stat;
}

function ensurePrivateDirectory(fileSystem, directory) {
  const missing = [];
  let cursor = path.resolve(directory);
  while (!fileSystem.existsSync(cursor)) {
    missing.push(cursor);
    const parent = path.dirname(cursor);
    if (parent === cursor) throw new Error("private materialization directory has no existing ancestor");
    cursor = parent;
  }
  privateStat(fileSystem, cursor, "directory", fileSystem.statSync(cursor).mode & 0o777);
  for (const target of missing.reverse()) {
    fileSystem.mkdirSync(target, { mode: 0o700 });
    fileSystem.chmodSync(target, 0o700);
  }
  for (let current = path.resolve(directory); current !== cursor; current = path.dirname(current)) {
    privateStat(fileSystem, current, "directory", 0o700);
  }
  if (path.resolve(directory) === cursor) {
    const stat = fileSystem.lstatSync(cursor);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new Error(`private materialization path must be a real directory: ${cursor}`);
    }
    fileSystem.chmodSync(cursor, 0o700);
  }
}

function assertPrivatePathWithinRoot(fileSystem, privateRoot, target) {
  const root = path.resolve(privateRoot);
  const selected = path.resolve(target);
  if (selected !== root && !selected.startsWith(`${root}${path.sep}`)) {
    throw new Error("private materialization path escapes its trusted store root");
  }
  if (!fileSystem.existsSync(root)) {
    throw new Error("private materialization store root is missing");
  }
  let current = root;
  while (true) {
    const stat = fileSystem.lstatSync(current);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new Error(`private materialization path must have real directory ancestors: ${current}`);
    }
    if (current === selected) return;
    const remaining = path.relative(current, selected);
    const next = path.join(current, remaining.split(path.sep)[0]);
    if (next === current) throw new Error("private materialization path cannot advance beneath its trusted store root");
    current = next;
    if (!fileSystem.existsSync(current)) return;
  }
}

function fsyncDirectory(fileSystem, directory) {
  const fd = fileSystem.openSync(directory, "r");
  try {
    fileSystem.fsyncSync(fd);
  } finally {
    fileSystem.closeSync(fd);
  }
}

function atomicCreateJson(fileSystem, target, value) {
  ensurePrivateDirectory(fileSystem, path.dirname(target));
  const content = `${JSON.stringify(value, null, 2)}\n`;
  let fd;
  try {
    fd = fileSystem.openSync(target, "wx", 0o600);
    fileSystem.writeFileSync(fd, content, "utf8");
    fileSystem.fsyncSync(fd);
    fileSystem.closeSync(fd);
    fd = undefined;
    fileSystem.chmodSync(target, 0o600);
    fsyncDirectory(fileSystem, path.dirname(target));
  } finally {
    if (fd !== undefined) fileSystem.closeSync(fd);
  }
}

function atomicReplaceJson(fileSystem, target, value) {
  ensurePrivateDirectory(fileSystem, path.dirname(target));
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  const content = `${JSON.stringify(value, null, 2)}\n`;
  let fd;
  try {
    fd = fileSystem.openSync(temporary, "wx", 0o600);
    fileSystem.writeFileSync(fd, content, "utf8");
    fileSystem.fsyncSync(fd);
    fileSystem.closeSync(fd);
    fd = undefined;
    fileSystem.renameSync(temporary, target);
    fileSystem.chmodSync(target, 0o600);
    fsyncDirectory(fileSystem, path.dirname(target));
  } finally {
    if (fd !== undefined) fileSystem.closeSync(fd);
    if (fileSystem.existsSync(temporary)) fileSystem.unlinkSync(temporary);
  }
}

function readPrivateJson(fileSystem, target) {
  privateStat(fileSystem, target, "file", 0o600);
  return JSON.parse(fileSystem.readFileSync(target, "utf8"));
}

function sameCanonicalValue(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function withoutMarkerHash(marker) {
  const { markerHash: _markerHash, ...payload } = marker;
  return payload;
}

function validateIssuanceMarker(marker, contract, expectedLedgerTip) {
  if (!isObject(marker)
    || marker.schemaVersion !== 1
    || marker.broker !== "codex-native-firstmate-at-most-once-v1"
    || marker.state !== "create-issued"
    || marker.launchKey !== contract.launchKey
    || marker.workContractHash !== contract.workContractHash
    || marker.sourceContractHash !== contract.sourceContractHash
    || marker.attemptLedgerTip !== expectedLedgerTip
    || typeof marker.nativeCallIssued !== "boolean"
    || typeof marker.issuedAt !== "string"
    || !marker.issuedAt
    || !SHA256_RE.test(marker.markerHash || "")
    || sha256(withoutMarkerHash(marker)) !== marker.markerHash) {
    throw new Error("registry materialization issuance marker does not match the sealed attempt");
  }
  return marker;
}

function createOrVerifyPrivateJson(fileSystem, target, value) {
  if (!fileSystem.existsSync(target)) {
    atomicCreateJson(fileSystem, target, value);
    return;
  }
  const current = readPrivateJson(fileSystem, target);
  if (!sameCanonicalValue(current, value)) {
    throw new Error(`private materialization artifact already exists with different content: ${target}`);
  }
}

function attemptDirectory(attemptRoot, launchKey) {
  return path.join(path.resolve(attemptRoot), sha256(launchKey));
}

function receiptDirectory(attemptRoot, launchKey) {
  return path.join(attemptDirectory(attemptRoot, launchKey), "receipts");
}

function receiptPayload(receipt) {
  const { receiptHash: _receiptHash, ...payload } = receipt;
  return payload;
}

function effectiveStage(receipts) {
  for (let index = receipts.length - 1; index >= 0; index -= 1) {
    if (receipts[index].stage !== "quarantined") return receipts[index].stage;
  }
  return null;
}

function validateReceiptTransition(receipts, receipt) {
  if (receipt.stage === "quarantined") {
    const priorStage = effectiveStage(receipts);
    if (!priorStage || receipt.resumeFrom !== priorStage) {
      throw new Error("materialization quarantine receipt must preserve the exact prior effective stage");
    }
    return;
  }
  if (!STAGE_INDEX.has(receipt.stage)) throw new Error(`unknown materialization receipt stage: ${receipt.stage}`);
  const priorStage = effectiveStage(receipts);
  if (priorStage === null) {
    if (receipt.stage !== "reserved") throw new Error("materialization receipt chain must begin at reserved");
    return;
  }
  const priorIndex = STAGE_INDEX.get(priorStage);
  const nextIndex = STAGE_INDEX.get(receipt.stage);
  if (nextIndex !== priorIndex + 1) {
    throw new Error(`invalid materialization receipt transition ${priorStage} -> ${receipt.stage}`);
  }
}

export function validateCodexMaterializationReceipts(receipts, { launchKey, contractHash } = {}) {
  if (!Array.isArray(receipts)) throw new Error("materialization receipts must be an array");
  let previousReceiptHash = null;
  const accepted = [];
  for (let index = 0; index < receipts.length; index += 1) {
    const receipt = receipts[index];
    if (!isObject(receipt)
      || receipt.schemaVersion !== RECEIPT_SCHEMA_VERSION
      || receipt.sequence !== index + 1
      || typeof receipt.at !== "string"
      || !receipt.at
      || typeof receipt.launchKey !== "string"
      || !receipt.launchKey
      || !SHA256_RE.test(receipt.contractHash || "")
      || receipt.previousReceiptHash !== previousReceiptHash
      || !SHA256_RE.test(receipt.receiptHash || "")) {
      throw new Error(`invalid materialization receipt envelope at sequence ${index + 1}`);
    }
    if (launchKey && receipt.launchKey !== launchKey) {
      throw new Error("materialization receipt launchKey does not match the selected attempt");
    }
    if (contractHash && receipt.contractHash !== contractHash) {
      throw new Error("materialization receipt contractHash does not match the selected attempt");
    }
    if (sha256(receiptPayload(receipt)) !== receipt.receiptHash) {
      throw new Error(`materialization receipt hash mismatch at sequence ${receipt.sequence}`);
    }
    validateReceiptTransition(accepted, receipt);
    accepted.push(receipt);
    previousReceiptHash = receipt.receiptHash;
  }
  return {
    receipts: accepted,
    stage: effectiveStage(accepted),
    tip: previousReceiptHash
  };
}

function loadReceipts(fileSystem, attemptRoot, launchKey, contractHash) {
  const directory = receiptDirectory(attemptRoot, launchKey);
  if (!fileSystem.existsSync(directory)) {
    const selectedAttemptDirectory = attemptDirectory(attemptRoot, launchKey);
    const anchorPath = path.join(selectedAttemptDirectory, "receipt-anchor.json");
    if (fileSystem.existsSync(anchorPath)) {
      throw new Error("materialization receipt ledger is missing while its durable anchor remains");
    }
    if (fileSystem.existsSync(selectedAttemptDirectory)) {
      privateStat(fileSystem, selectedAttemptDirectory, "directory", 0o700);
      if (fileSystem.readdirSync(selectedAttemptDirectory).length) {
        throw new Error("materialization attempt contains artifacts without a receipt ledger and durable anchor");
      }
    }
    return validateCodexMaterializationReceipts([], { launchKey, contractHash });
  }
  privateStat(fileSystem, directory, "directory", 0o700);
  const names = fileSystem.readdirSync(directory).sort();
  if (names.some((name) => !/^\d{6}-[a-z-]+-[a-f0-9]{16}\.json$/.test(name))) {
    throw new Error("materialization receipt directory contains an unexpected entry");
  }
  const receipts = names
    .map((name) => readPrivateJson(fileSystem, path.join(directory, name)));
  const validated = validateCodexMaterializationReceipts(receipts, { launchKey, contractHash });
  const anchorPath = path.join(attemptDirectory(attemptRoot, launchKey), "receipt-anchor.json");
  if (!fileSystem.existsSync(anchorPath)) {
    throw new Error("materialization receipt ledger has no durable anchor");
  }
  const anchor = readPrivateJson(fileSystem, anchorPath);
  if (anchor.schemaVersion !== 1
    || anchor.launchKey !== launchKey
    || anchor.contractHash !== contractHash
    || anchor.receiptCount !== validated.receipts.length
    || anchor.receiptTip !== validated.tip) {
    throw new Error("materialization receipt ledger does not match its durable anchor");
  }
  return validated;
}

function appendReceipt(fileSystem, attemptRoot, contract, receipt) {
  const loaded = loadReceipts(fileSystem, attemptRoot, contract.launchKey, contract.workContractHash);
  const payload = {
    schemaVersion: RECEIPT_SCHEMA_VERSION,
    sequence: loaded.receipts.length + 1,
    stage: receipt.stage,
    at: receipt.at,
    launchKey: contract.launchKey,
    contractHash: contract.workContractHash,
    previousReceiptHash: loaded.tip,
    ...receipt.details
  };
  validateReceiptTransition(loaded.receipts, payload);
  const sealed = { ...payload, receiptHash: sha256(payload) };
  const fileName = `${String(sealed.sequence).padStart(6, "0")}-${sealed.stage}-${sealed.receiptHash.slice(0, 16)}.json`;
  atomicCreateJson(fileSystem, path.join(receiptDirectory(attemptRoot, contract.launchKey), fileName), sealed);
  atomicReplaceJson(
    fileSystem,
    path.join(attemptDirectory(attemptRoot, contract.launchKey), "receipt-anchor.json"),
    {
      schemaVersion: 1,
      launchKey: contract.launchKey,
      contractHash: contract.workContractHash,
      receiptCount: sealed.sequence,
      receiptTip: sealed.receiptHash
    }
  );
  return sealed;
}

async function withInstanceMaterializationLock(fileSystem, attemptRoot, contract, now, callback) {
  const directory = path.resolve(attemptRoot);
  ensurePrivateDirectory(fileSystem, directory);
  const lockPath = path.join(directory, "materialization.lock");
  const ownerNonce = randomUUID();
  const lock = {
    schemaVersion: 1,
    launchKey: contract.launchKey,
    contractHash: contract.workContractHash,
    ownerNonce,
    pid: process.pid,
    acquiredAt: now()
  };
  let acquired = false;
  try {
    try {
      atomicCreateJson(fileSystem, lockPath, lock);
      acquired = true;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      let holder = "unreadable";
      try {
        const current = readPrivateJson(fileSystem, lockPath);
        holder = `${current.pid || "unknown-pid"} acquired ${current.acquiredAt || "at an unknown time"}`;
      } catch {
        // The unreadable lock still blocks mutation.
      }
      throw new Error(`materialization attempt is locked by ${holder}; reconcile the owner before retry`);
    }
    return await callback();
  } finally {
    if (acquired && fileSystem.existsSync(lockPath)) {
      let current = null;
      try {
        current = readPrivateJson(fileSystem, lockPath);
      } catch {
        current = null;
      }
      if (current?.ownerNonce === ownerNonce) {
        fileSystem.unlinkSync(lockPath);
        fsyncDirectory(fileSystem, directory);
      }
    }
  }
}

function readMaterializationLock(fileSystem, attemptRoot) {
  const directory = path.resolve(attemptRoot);
  privateStat(fileSystem, directory, "directory", 0o700);
  const lockPath = path.join(directory, "materialization.lock");
  const lock = readPrivateJson(fileSystem, lockPath);
  if (lock.schemaVersion !== 1
    || typeof lock.launchKey !== "string"
    || !lock.launchKey
    || !SHA256_RE.test(lock.contractHash || "")
    || typeof lock.ownerNonce !== "string"
    || !lock.ownerNonce
    || !Number.isSafeInteger(lock.pid)
    || lock.pid < 1
    || typeof lock.acquiredAt !== "string"
    || !lock.acquiredAt) {
    throw new Error("materialization lock has an invalid owner envelope");
  }
  return { directory, lockPath, lock, lockHash: sha256(lock) };
}

export function inspectCodexMaterializationLock({ attemptRoot, fileSystem = fs }) {
  const { lock, lockHash } = readMaterializationLock(fileSystem, attemptRoot);
  return {
    schemaVersion: lock.schemaVersion,
    launchKey: lock.launchKey,
    contractHash: lock.contractHash,
    pid: lock.pid,
    acquiredAt: lock.acquiredAt,
    lockHash
  };
}

export async function reconcileStaleCodexMaterializationLock({
  attemptRoot,
  expectedLockHash,
  verifyStaleOwner,
  fileSystem = fs,
}) {
  if (!SHA256_RE.test(expectedLockHash || "") || typeof verifyStaleOwner !== "function") {
    throw new Error("stale lock reconciliation requires an exact lock hash and external owner verifier");
  }
  const initial = readMaterializationLock(fileSystem, attemptRoot);
  if (initial.lockHash !== expectedLockHash) {
    throw new Error("materialization lock changed before stale-owner reconciliation");
  }
  const decision = await verifyStaleOwner({
    lock: inspectCodexMaterializationLock({ attemptRoot, fileSystem }),
    expectedLockHash
  });
  if (!isObject(decision)
    || decision.authorized !== true
    || decision.ownerIsLive !== false
    || typeof decision.decisionId !== "string"
    || !decision.decisionId
    || typeof decision.decidedAt !== "string"
    || !decision.decidedAt
    || !SHA256_RE.test(decision.evidenceHash || "")) {
    throw new Error("external owner verifier did not authorize stale lock reconciliation");
  }
  const current = readMaterializationLock(fileSystem, attemptRoot);
  if (current.lockHash !== expectedLockHash
    || current.lock.ownerNonce !== initial.lock.ownerNonce) {
    throw new Error("materialization lock changed after stale-owner verification");
  }
  const recoveryDirectory = path.join(current.directory, "lock-recoveries");
  ensurePrivateDirectory(fileSystem, recoveryDirectory);
  const recoveryClaimPath = path.join(recoveryDirectory, `${expectedLockHash}.cas-claim.json`);
  try {
    atomicCreateJson(fileSystem, recoveryClaimPath, {
      schemaVersion: 1,
      kind: "codex-materialization-stale-lock-cas-claim",
      lockHash: expectedLockHash,
      ownerNonce: current.lock.ownerNonce,
      decisionId: decision.decisionId,
      evidenceHash: decision.evidenceHash
    });
  } catch (error) {
    if (error.code === "EEXIST") {
      throw new Error("stale lock recovery compare-and-set is already claimed");
    }
    throw error;
  }
  const archivedLockPath = path.join(recoveryDirectory, `${expectedLockHash}.lock.json`);
  if (!fileSystem.existsSync(archivedLockPath)) {
    fileSystem.linkSync(current.lockPath, archivedLockPath);
    fileSystem.chmodSync(archivedLockPath, 0o600);
    fsyncDirectory(fileSystem, recoveryDirectory);
  } else if (!sameCanonicalValue(readPrivateJson(fileSystem, archivedLockPath), current.lock)) {
    throw new Error("stale lock recovery archive conflicts with the selected lock");
  }
  const receipt = {
    schemaVersion: 1,
    kind: "codex-materialization-stale-lock-recovery",
    lockHash: expectedLockHash,
    launchKey: current.lock.launchKey,
    contractHash: current.lock.contractHash,
    ownerPid: current.lock.pid,
    acquiredAt: current.lock.acquiredAt,
    reconciledAt: decision.decidedAt,
    decisionId: decision.decisionId,
    evidenceHash: decision.evidenceHash
  };
  createOrVerifyPrivateJson(
    fileSystem,
    path.join(recoveryDirectory, `${expectedLockHash}.receipt.json`),
    receipt
  );
  const finalCheck = readMaterializationLock(fileSystem, attemptRoot);
  if (finalCheck.lockHash !== expectedLockHash
    || finalCheck.lock.ownerNonce !== initial.lock.ownerNonce) {
    throw new Error("materialization lock changed before stale lock release");
  }
  const releasedLockPath = path.join(recoveryDirectory, `${expectedLockHash}.released-lock.json`);
  if (fileSystem.existsSync(releasedLockPath)) {
    if (!sameCanonicalValue(readPrivateJson(fileSystem, releasedLockPath), finalCheck.lock)) {
      throw new Error("stale lock release archive conflicts with the selected lock");
    }
  } else {
    fileSystem.renameSync(finalCheck.lockPath, releasedLockPath);
    fileSystem.chmodSync(releasedLockPath, 0o600);
  }
  fsyncDirectory(fileSystem, finalCheck.directory);
  return {
    released: true,
    lockHash: expectedLockHash,
    decisionId: decision.decisionId,
    archivePath: archivedLockPath
  };
}

function pinDecision(node) {
  if (node.role === "worker") return { pinned: false, reason: "Workers and transient helpers are never pinned" };
  if (node.role === "boss") return { pinned: true, reason: "The resident Boss remains pinned" };
  if (node.role === "manager" && node.state !== "terminal") {
    return { pinned: true, reason: "A nonterminal Manager remains pinned" };
  }
  throw new Error("terminal Manager materialization is invalid; unpin requires landed-work evidence and parent reconciliation");
}

export function codexMaterializationPinDecision(node) {
  return pinDecision(node);
}

function taskReadbackBlockers(task, contract, { requireInert = true } = {}) {
  const expectedPin = pinDecision(contract.node).pinned;
  const blockers = [];
  if (!isObject(task) || typeof task.id !== "string" || !task.id) {
    return ["native task readback is missing a stable task id"];
  }
  if (task.title !== contract.node.title) blockers.push("native task title does not match the sealed title");
  if (task.repositoryIdentity !== contract.source.repositoryIdentity) {
    blockers.push("native task repository identity does not match the sealed source");
  }
  if (task.repositoryRoot !== contract.source.repositoryRoot) {
    blockers.push("native task repository root does not match the sealed source");
  }
  if (task.worktreeBase !== contract.source.baseCommit) {
    blockers.push("native task worktree base does not match the sealed source commit");
  }
  if (task.pinned !== expectedPin) blockers.push("native task pin state does not match the role lifecycle policy");
  if (requireInert && (task.active !== false || task.activationState !== "inert")) {
    blockers.push("new native task must remain inert before attested binding");
  }
  const envelope = task.launchEnvelope;
  if (!isObject(envelope)
    || envelope.launchKey !== contract.launchKey
    || envelope.workContractHash !== contract.workContractHash
    || envelope.nodeId !== contract.node.id
    || (envelope.parentNodeId ?? null) !== (contract.parent?.id ?? null)
    || (envelope.parentTaskId ?? null) !== (contract.parent?.taskId ?? null)
    || envelope.sourceContractHash !== contract.sourceContractHash) {
    blockers.push("native task launch envelope does not match the sealed task, parent, and source contract");
  }
  return blockers;
}

async function exactDiscoveredTask(native, contract) {
  const discovered = await native.discover({ launchKey: contract.launchKey, sourceContractHash: contract.sourceContractHash });
  if (!Array.isArray(discovered)) throw new Error("native discovery must return an array");
  const readbacks = [];
  for (const candidate of discovered) {
    if (!isObject(candidate) || typeof candidate.id !== "string" || !candidate.id) {
      throw new Error("native discovery returned a candidate without a stable task id");
    }
    readbacks.push(await native.read(candidate.id));
  }
  const exact = readbacks.filter((task) => taskReadbackBlockers(task, contract).length === 0);
  if (exact.length > 1) throw new Error("multiple exact native tasks match the launch envelope");
  if (exact.length === 1 && readbacks.length !== 1) {
    throw new Error("native discovery returned an exact task plus mismatched candidates");
  }
  if (exact.length === 0 && readbacks.length > 0) {
    throw new Error(`native discovery returned no exact task: ${taskReadbackBlockers(readbacks[0], contract)[0]}`);
  }
  return exact[0] || null;
}

function verifyAttestorResponse({ request, response, publicKeyBase64 }) {
  if (!isObject(response)
    || response.schemaVersion !== 1
    || response.requestId !== request.requestId
    || response.payloadSha256 !== request.payloadSha256
    || response.algorithm !== "ed25519"
    || response.keyId !== request.keyId
    || typeof response.signature !== "string"
    || !response.signature) {
    throw new Error("external attestor response does not match the durable request");
  }
  const key = createPublicKey({ key: Buffer.from(publicKeyBase64, "base64"), format: "der", type: "spki" });
  if (key.asymmetricKeyType !== "ed25519") throw new Error("binding public key is not Ed25519");
  if (!verifySignature(null, Buffer.from(request.payload), key, Buffer.from(response.signature, "base64"))) {
    throw new Error("external attestor signature does not verify against the configured public key");
  }
}

function validateAttestorRequest({
  request,
  requestReceipt = null,
  contract,
  task,
  attemptLedgerTip,
  expectedTaskReadbackHash
}) {
  let payload;
  try {
    payload = JSON.parse(request?.payload);
  } catch {
    throw new Error("durable attestation request payload is not valid JSON");
  }
  const binding = payload?.binding;
  const expectedRequestId = sha256({
    launchKey: contract.launchKey,
    taskId: task.id,
    payloadSha256: request?.payloadSha256,
    attemptLedgerTip
  });
  if (!isObject(request)
    || request.schemaVersion !== 1
    || request.kind !== "codex-task-binding-attestation"
    || request.requestId !== expectedRequestId
    || request.launchKey !== contract.launchKey
    || request.taskId !== task.id
    || request.keyId !== contract.attestationKeyId
    || request.attemptLedgerTip !== attemptLedgerTip
    || request.payloadSha256 !== sha256(request.payload)
    || !isObject(binding)
    || binding.launchKey !== contract.launchKey
    || binding.workContractHash !== contract.workContractHash
    || binding.nodeId !== contract.node.id
    || binding.taskId !== task.id
    || binding.externalTitle !== contract.node.title
    || binding.titleVerification?.method !== "rename-and-readback"
    || binding.titleVerification?.verified !== true
    || (binding.parentNodeId ?? null) !== (contract.parent?.id ?? null)
    || (binding.parentTaskId ?? null) !== (contract.parent?.taskId ?? null)
    || binding.attestation?.algorithm !== "ed25519"
    || binding.attestation?.keyId !== contract.attestationKeyId
    || binding.materializationAttempt?.broker !== "codex-native-firstmate-at-most-once-v1"
    || binding.materializationAttempt?.attemptLedgerTip !== attemptLedgerTip
    || binding.materializationAttempt?.sourceContractHash !== contract.sourceContractHash
    || binding.materializationAttempt?.taskReadbackHash !== expectedTaskReadbackHash) {
    throw new Error("durable attestation request does not match the sealed task binding");
  }
  if (requestReceipt
    && (requestReceipt.requestId !== request.requestId
      || requestReceipt.payloadSha256 !== request.payloadSha256
      || requestReceipt.taskId !== task.id)) {
    throw new Error("durable attestation request does not match its receipt");
  }
  return payload;
}

function requiredInterfaces(options) {
  const { native, attestor, callbacks } = options;
  for (const [label, value] of [
    ["native.discover", native?.discover],
    ["native.createInert", native?.createInert],
    ["native.read", native?.read],
    ["native.activate", native?.activate],
    ["native.readActivation", native?.readActivation],
    ["attestor.request", attestor?.request],
    ["callbacks.reserve", callbacks?.reserve],
    ["callbacks.preCreate", callbacks?.preCreate],
    ["callbacks.prepareBinding", callbacks?.prepareBinding],
    ["callbacks.attestationPayload", callbacks?.attestationPayload],
    ["callbacks.readBinding", callbacks?.readBinding],
    ["callbacks.bindInert", callbacks?.bindInert],
    ["callbacks.markWorking", callbacks?.markWorking],
    ["callbacks.reconcileCompletedBinding", callbacks?.reconcileCompletedBinding]
  ]) {
    if (typeof value !== "function") throw new Error(`materialization broker requires ${label}`);
  }
}

function quarantine(fileSystem, attemptRoot, contract, now, reasonCode) {
  const loaded = loadReceipts(fileSystem, attemptRoot, contract.launchKey, contract.workContractHash);
  if (!loaded.stage || loaded.stage === "completed") return;
  appendReceipt(fileSystem, attemptRoot, contract, {
    stage: "quarantined",
    at: now(),
    details: { resumeFrom: loaded.stage, reasonCode }
  });
}

export async function materializeCodexTaskWithBroker(options) {
  requiredInterfaces(options);
  const {
    contract,
    attemptRoot,
    native,
    attestor,
    callbacks,
    publicKeyBase64,
    fileSystem = fs,
    now = () => new Date().toISOString(),
    checkpoint = async () => {}
  } = options;
  const expectedPin = isObject(contract?.node) ? pinDecision(contract.node).pinned : null;
  const parentIsValid = contract?.node?.role === "boss"
    ? contract.parent === null
    : isObject(contract?.parent)
      && typeof contract.parent.id === "string"
      && Boolean(contract.parent.id)
      && (contract.node.role === "manager" && contract.node.parentBindingMode === "logical"
        ? contract.parent.taskId === null
        : typeof contract.parent.taskId === "string" && Boolean(contract.parent.taskId));
  if (!isObject(contract)
    || typeof contract.launchKey !== "string"
    || !contract.launchKey
    || !SHA256_RE.test(contract.workContractHash || "")
    || !isObject(contract.node)
    || !["boss", "manager", "worker"].includes(contract.node.role)
    || typeof contract.node.id !== "string"
    || !contract.node.id
    || typeof contract.node.title !== "string"
    || !contract.node.title
    || !parentIsValid
    || !isObject(contract.source)
    || typeof contract.source.repositoryIdentity !== "string"
    || !contract.source.repositoryIdentity
    || typeof contract.source.repositoryRoot !== "string"
    || !path.isAbsolute(contract.source.repositoryRoot)
    || !/^[a-f0-9]{40,64}$/.test(contract.source.baseCommit || "")
    || !SHA256_RE.test(contract.sourceContractHash || "")
    || contract.sourceContractHash !== sha256(contract.source)
    || contract.pinLifecycle?.initialState !== (expectedPin ? "pinned" : "unpinned")
    || typeof publicKeyBase64 !== "string"
    || !publicKeyBase64) {
    throw new Error("materialization broker received an incomplete sealed contract");
  }
  assertPrivatePathWithinRoot(fileSystem, options.privateRoot || path.dirname(attemptRoot), attemptRoot);

  return withInstanceMaterializationLock(fileSystem, attemptRoot, contract, now, async () => {
    let ledger = loadReceipts(fileSystem, attemptRoot, contract.launchKey, contract.workContractHash);
    let reservation;
    if (ledger.receipts.length === 0) {
      reservation = await callbacks.reserve(contract);
      if (reservation.created !== true) {
        throw new Error("existing reservation has no materialization receipt ledger; creation remains quarantined");
      }
      appendReceipt(fileSystem, attemptRoot, contract, {
        stage: "reserved",
        at: now(),
        details: {
          registryRevision: reservation.registryRevision,
          reservationCreated: reservation.created === true,
          sourceContractHash: contract.sourceContractHash
        }
      });
      await checkpoint("reserved", { launchKey: contract.launchKey, registryRevision: reservation.registryRevision });
      ledger = loadReceipts(fileSystem, attemptRoot, contract.launchKey, contract.workContractHash);
    } else {
      reservation = await callbacks.reserve(contract, {
        reconcile: true,
        stage: ledger.stage,
        attemptLedgerTip: ledger.tip
      });
    }

    try {
      if (ledger.stage === "completed") {
        const taskId = ledger.receipts.findLast((receipt) => receipt.taskId)?.taskId;
        const task = await native.read(taskId);
        const blockers = taskReadbackBlockers(task, contract, { requireInert: false });
        if (blockers.length) throw new Error(`completed materialization readback drift: ${blockers[0]}`);
        const activation = await native.readActivation(taskId);
        if (activation?.active !== true || activation?.pinned !== pinDecision(contract.node).pinned) {
          throw new Error("completed materialization activation or pin readback drifted");
        }
        const observedReceipt = ledger.receipts.findLast((receipt) => receipt.stage === "observed");
        const requestReceipt = ledger.receipts.findLast((receipt) => receipt.stage === "attestation-requested");
        const directory = attemptDirectory(attemptRoot, contract.launchKey);
        const request = readPrivateJson(fileSystem, path.join(directory, "attestation.request.json"));
        const response = readPrivateJson(fileSystem, path.join(directory, "attestation.response.json"));
        const requestPayload = validateAttestorRequest({
          request,
          requestReceipt,
          contract,
          task,
          attemptLedgerTip: observedReceipt?.receiptHash,
          expectedTaskReadbackHash: observedReceipt?.taskReadbackHash
        });
        verifyAttestorResponse({ request, response, publicKeyBase64 });
        const binding = {
          ...requestPayload.binding,
          attestation: {
            algorithm: response.algorithm,
            keyId: response.keyId,
            signature: response.signature
          }
        };
        const bindingState = await callbacks.readBinding({ contract, task, binding });
        if (bindingState === "absent") {
          await callbacks.reconcileCompletedBinding({ contract, task, binding, activationReceiptHash: ledger.tip });
        } else if (bindingState !== "exact") {
          throw new Error("completed materialization registry binding conflicts with the attested task");
        }
        if (await callbacks.readBinding({ contract, task, binding }) !== "exact") {
          throw new Error("completed materialization registry binding could not be reconciled");
        }
        await callbacks.markWorking({ contract, task, binding, activationReceiptHash: ledger.tip });
        return { launchKey: contract.launchKey, taskId, state: "working", reconciled: true };
      }

      let task = null;
      let issuedMarker = null;
      if (reservation?.createIssued) {
        const reservedReceipt = ledger.receipts.find((receipt) => receipt.stage === "reserved");
        issuedMarker = validateIssuanceMarker(
          reservation.createIssued,
          contract,
          reservedReceipt?.receiptHash
        );
      }
      let issued = STAGE_INDEX.get(ledger.stage) >= STAGE_INDEX.get("create-issued") || Boolean(issuedMarker);
      if (STAGE_INDEX.get(ledger.stage) <= STAGE_INDEX.get("create-issued")) {
        task = await exactDiscoveredTask(native, contract);
        if (ledger.stage === "reserved") {
          if (!issuedMarker) {
            issuedMarker = validateIssuanceMarker(
              await callbacks.preCreate(contract, {
                attemptLedgerTip: ledger.tip,
                nativeCallIssued: !task
              }),
              contract,
              ledger.tip
            );
          }
          appendReceipt(fileSystem, attemptRoot, contract, {
            stage: "create-issued",
            at: now(),
            details: {
              nativeCallIssued: issuedMarker.nativeCallIssued,
              issuanceMarkerHash: issuedMarker.markerHash,
              ...(task ? { adoptedByExactPositiveReadback: true } : {}),
              ...(reservation?.createIssued ? { recoveredFromRegistryMarker: true } : {})
            }
          });
          await checkpoint("create-issued", { launchKey: contract.launchKey });
          ledger = loadReceipts(fileSystem, attemptRoot, contract.launchKey, contract.workContractHash);
          issued = true;
        }
        if (!task && issuedMarker?.nativeCallIssued === true && !reservation?.createIssued) {
          let created;
          try {
            created = await native.createInert({
              ...contract,
              inert: true,
              executionAuthority: "none-until-attested-bind-and-activation",
              pin: pinDecision(contract.node).pinned
            });
          } catch (error) {
            quarantine(fileSystem, attemptRoot, contract, now, "ambiguous-create-outcome");
            throw new Error(`native create outcome is ambiguous; another create is forbidden: ${error.message || "unknown error"}`);
          }
          if (!isObject(created) || typeof created.id !== "string" || !created.id) {
            quarantine(fileSystem, attemptRoot, contract, now, "missing-created-task-id");
            throw new Error("native create returned no stable task id; another create is forbidden");
          }
          task = await native.read(created.id);
          const blockers = taskReadbackBlockers(task, contract);
          if (blockers.length) {
            quarantine(fileSystem, attemptRoot, contract, now, "created-task-readback-mismatch");
            throw new Error(`${blockers[0]}; another create is forbidden`);
          }
        } else if (!task && issued) {
          quarantine(fileSystem, attemptRoot, contract, now, "zero-positive-reconciliation-matches");
          throw new Error("no exact native task was positively reconciled after create-issued; another create is forbidden");
        }
        appendReceipt(fileSystem, attemptRoot, contract, {
          stage: "observed",
          at: now(),
          details: { taskId: task.id, taskReadbackHash: sha256(task) }
        });
        await checkpoint("observed", { launchKey: contract.launchKey, taskId: task.id });
        ledger = loadReceipts(fileSystem, attemptRoot, contract.launchKey, contract.workContractHash);
      }

      const taskId = ledger.receipts.findLast((receipt) => receipt.taskId)?.taskId;
      if (!task) task = await native.read(taskId);
      const readbackBlockers = taskReadbackBlockers(task, contract, {
        requireInert: STAGE_INDEX.get(ledger.stage) < STAGE_INDEX.get("activation-issued")
      });
      if (readbackBlockers.length) {
        quarantine(fileSystem, attemptRoot, contract, now, "task-readback-drift");
        throw new Error(`${readbackBlockers[0]}; materialization remains quarantined`);
      }

      let binding = null;
      if (STAGE_INDEX.get(ledger.stage) <= STAGE_INDEX.get("observed")) {
        const observedReceipt = ledger.receipts.findLast((receipt) => receipt.stage === "observed");
        binding = await callbacks.prepareBinding({
          contract,
          task,
          attemptLedgerTip: ledger.tip,
          boundAt: observedReceipt.at
        });
        const payload = callbacks.attestationPayload(binding);
        const payloadSha256 = sha256(payload);
        const request = {
          schemaVersion: 1,
          kind: "codex-task-binding-attestation",
          requestId: sha256({
            launchKey: contract.launchKey,
            taskId: task.id,
            payloadSha256,
            attemptLedgerTip: ledger.tip
          }),
          launchKey: contract.launchKey,
          taskId: task.id,
          keyId: contract.attestationKeyId,
          payloadSha256,
          payload,
          attemptLedgerTip: ledger.tip
        };
        validateAttestorRequest({
          request,
          contract,
          task,
          attemptLedgerTip: ledger.tip,
          expectedTaskReadbackHash: observedReceipt.taskReadbackHash
        });
        const directory = attemptDirectory(attemptRoot, contract.launchKey);
        const requestPath = path.join(directory, "attestation.request.json");
        const responsePath = path.join(directory, "attestation.response.json");
        createOrVerifyPrivateJson(fileSystem, requestPath, request);
        appendReceipt(fileSystem, attemptRoot, contract, {
          stage: "attestation-requested",
          at: now(),
          details: { taskId: task.id, requestId: request.requestId, payloadSha256 }
        });
        await checkpoint("attestation-requested", { launchKey: contract.launchKey, taskId: task.id, requestPath, responsePath });
        if (!fileSystem.existsSync(responsePath)) {
          await attestor.request({ requestPath, responsePath, requestId: request.requestId });
        }
        if (!fileSystem.existsSync(responsePath)) {
          quarantine(fileSystem, attemptRoot, contract, now, "attestor-response-missing");
          throw new Error("external attestor did not produce the required durable response");
        }
        const persistedRequest = readPrivateJson(fileSystem, requestPath);
        if (!sameCanonicalValue(persistedRequest, request)) {
          throw new Error("durable attestation request changed during external signing");
        }
        const response = readPrivateJson(fileSystem, responsePath);
        verifyAttestorResponse({ request: persistedRequest, response, publicKeyBase64 });
        binding = {
          ...binding,
          attestation: {
            algorithm: response.algorithm,
            keyId: response.keyId,
            signature: response.signature
          }
        };
        appendReceipt(fileSystem, attemptRoot, contract, {
          stage: "attested",
          at: now(),
          details: {
            taskId: task.id,
            requestId: request.requestId,
            responseHash: sha256(response)
          }
        });
        await checkpoint("attested", { launchKey: contract.launchKey, taskId: task.id });
        ledger = loadReceipts(fileSystem, attemptRoot, contract.launchKey, contract.workContractHash);
      }

      if (!binding) {
        const requestReceipt = ledger.receipts.findLast((receipt) => receipt.stage === "attestation-requested");
        const directory = attemptDirectory(attemptRoot, contract.launchKey);
        const requestPath = path.join(directory, "attestation.request.json");
        const responsePath = path.join(directory, "attestation.response.json");
        const request = readPrivateJson(fileSystem, requestPath);
        const observedReceipt = ledger.receipts.findLast((receipt) => receipt.stage === "observed");
        const requestPayload = validateAttestorRequest({
          request,
          requestReceipt,
          contract,
          task,
          attemptLedgerTip: observedReceipt.receiptHash,
          expectedTaskReadbackHash: observedReceipt.taskReadbackHash
        });
        if (!fileSystem.existsSync(responsePath)) {
          await attestor.request({ requestPath, responsePath, requestId: request.requestId });
        }
        if (!fileSystem.existsSync(responsePath)) {
          throw new Error("external attestor did not produce the required durable response");
        }
        const response = readPrivateJson(fileSystem, responsePath);
        verifyAttestorResponse({ request, response, publicKeyBase64 });
        binding = {
          ...requestPayload.binding,
          attestation: {
            algorithm: response.algorithm,
            keyId: response.keyId,
            signature: response.signature
          }
        };
        if (ledger.stage === "attestation-requested") {
          appendReceipt(fileSystem, attemptRoot, contract, {
            stage: "attested",
            at: now(),
            details: {
              taskId: task.id,
              requestId: request.requestId,
              responseHash: sha256(response)
            }
          });
          ledger = loadReceipts(fileSystem, attemptRoot, contract.launchKey, contract.workContractHash);
        }
      }

      if (STAGE_INDEX.get(ledger.stage) <= STAGE_INDEX.get("attested")) {
        appendReceipt(fileSystem, attemptRoot, contract, {
          stage: "bind-issued",
          at: now(),
          details: { taskId: task.id, bindingHash: sha256(binding) }
        });
        ledger = loadReceipts(fileSystem, attemptRoot, contract.launchKey, contract.workContractHash);
      }
      if (ledger.stage === "bind-issued") {
        const bindingState = await callbacks.readBinding({ contract, task, binding });
        if (bindingState !== "exact") {
          if (bindingState !== "absent") throw new Error("registry contains a conflicting task binding");
          await callbacks.bindInert({ contract, task, binding });
        }
        if (await callbacks.readBinding({ contract, task, binding }) !== "exact") {
          throw new Error("registry did not preserve the exact inert task binding");
        }
        appendReceipt(fileSystem, attemptRoot, contract, {
          stage: "bound-inert",
          at: now(),
          details: { taskId: task.id, bindingHash: sha256(binding) }
        });
        await checkpoint("bound-inert", { launchKey: contract.launchKey, taskId: task.id });
        ledger = loadReceipts(fileSystem, attemptRoot, contract.launchKey, contract.workContractHash);
      }

      if (ledger.stage === "bound-inert") {
        appendReceipt(fileSystem, attemptRoot, contract, {
          stage: "activation-issued",
          at: now(),
          details: { taskId: task.id, activationCallIssued: true }
        });
        await checkpoint("activation-issued", { launchKey: contract.launchKey, taskId: task.id });
        try {
          await native.activate(task.id);
        } catch (error) {
          quarantine(fileSystem, attemptRoot, contract, now, "ambiguous-activation-outcome");
          throw new Error(`native activation outcome is ambiguous; activation will not be reissued: ${error.message || "unknown error"}`);
        }
        ledger = loadReceipts(fileSystem, attemptRoot, contract.launchKey, contract.workContractHash);
      }
      if (ledger.stage === "activation-issued") {
        const activation = await native.readActivation(task.id);
        if (activation?.active !== true || activation?.pinned !== pinDecision(contract.node).pinned) {
          if (typeof callbacks.reconcileActivation !== "function") {
            quarantine(fileSystem, attemptRoot, contract, now, "activation-readback-unconfirmed");
            throw new Error("native activation and pin state are not positively confirmed; explicit externally authorized recovery is required");
          }
          const recovery = await callbacks.reconcileActivation({ contract, task, activation, activationReceiptHash: ledger.tip });
          if (!isObject(recovery)
            || recovery.authorized !== true
            || !isNonEmptyString(recovery.decisionId)
            || !isNonEmptyString(recovery.decidedAt)
            || !SHA256_RE.test(recovery.evidenceHash || "")) {
            throw new Error("activation recovery did not provide an externally authorized outcome");
          }
          const recoveredActivation = await native.readActivation(task.id);
          if (recoveredActivation?.active !== true || recoveredActivation?.pinned !== pinDecision(contract.node).pinned) {
            quarantine(fileSystem, attemptRoot, contract, now, "activation-recovery-unconfirmed");
            throw new Error("externally authorized activation recovery did not produce a positive native readback");
          }
          appendReceipt(fileSystem, attemptRoot, contract, {
            stage: "activation-confirmed",
            at: now(),
            details: {
              taskId: task.id,
              activationReadbackHash: sha256(recoveredActivation),
              activationRecoveryDecisionId: recovery.decisionId,
              activationRecoveryEvidenceHash: recovery.evidenceHash
            }
          });
          await checkpoint("activation-confirmed", { launchKey: contract.launchKey, taskId: task.id });
          ledger = loadReceipts(fileSystem, attemptRoot, contract.launchKey, contract.workContractHash);
        } else {
          appendReceipt(fileSystem, attemptRoot, contract, {
            stage: "activation-confirmed",
            at: now(),
            details: { taskId: task.id, activationReadbackHash: sha256(activation) }
          });
          await checkpoint("activation-confirmed", { launchKey: contract.launchKey, taskId: task.id });
          ledger = loadReceipts(fileSystem, attemptRoot, contract.launchKey, contract.workContractHash);
        }
      }
      if (ledger.stage === "activation-confirmed") {
        await callbacks.markWorking({ contract, task, binding, activationReceiptHash: ledger.tip });
        appendReceipt(fileSystem, attemptRoot, contract, {
          stage: "completed",
          at: now(),
          details: { taskId: task.id, registryState: "working" }
        });
        await checkpoint("completed", { launchKey: contract.launchKey, taskId: task.id });
      }
      return { launchKey: contract.launchKey, taskId: task.id, state: "working", reconciled: false };
    } catch (error) {
      const reasonCode = error?.code || "materialization-failed";
      try {
        quarantine(fileSystem, attemptRoot, contract, now, reasonCode);
      } catch {
        // A malformed ledger must remain untouched for explicit recovery.
      }
      throw error;
    }
  });
}
