import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createHash,
  generateKeyPairSync,
  sign as signPayload
} from "node:crypto";
import {
  codexMaterializationPinDecision,
  inspectCodexMaterializationLock,
  materializeCodexTaskWithBroker,
  reconcileStaleCodexMaterializationLock,
  validateCodexMaterializationReceipts
} from "../src/orchestration/codex-materialization-broker.mjs";

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

function hash(value) {
  const input = typeof value === "string" ? value : JSON.stringify(canonicalize(value));
  return createHash("sha256").update(input).digest("hex");
}

function fixtureContract(role = "manager") {
  const source = {
    repositoryIdentity: "Example Repository",
    repositoryRoot: "/private/example/repository",
    scopeRootRef: "example/repository",
    baseRef: "refs/remotes/origin/main",
    baseCommit: "a".repeat(40),
    worktreePolicy: {
      mode: "managed",
      parallelWrites: "disjoint-only",
      landedWorkProofRequiredBeforeArchive: true
    }
  };
  const workContractHash = hash({ objective: "Implement one bounded change.", role });
  return {
    schemaVersion: 1,
    scopeId: "example-repository",
    operator: "owner",
    instance: "live",
    launchKey: `orchestration:example-repository:${role}-feature:${workContractHash}`,
    workContractHash,
    node: {
      id: `${role}-feature`,
      role,
      title: `Example Repository - ${role === "manager" ? "Manager" : role === "boss" ? "Boss" : "Worker"} - FEATURE/${role}-feature`,
      state: "eligible",
      parentBindingMode: role === "boss" ? "task" : "task"
    },
    parent: role === "boss" ? null : { id: "boss", role: "boss", taskId: "task-boss" },
    source,
    sourceContractHash: hash(source),
    attestationKeyId: "fixture-attestor",
    pinLifecycle: {
      initialState: role === "worker" ? "unpinned" : "pinned"
    }
  };
}

function fixtureHarness({
  role = "manager",
  createBehavior,
  activationBehavior,
  attestorBehavior,
  checkpointBehavior
} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-materialization-broker-"));
  const attemptRoot = path.join(root, "attempts");
  const keys = generateKeyPairSync("ed25519");
  const contract = fixtureContract(role);
  const state = {
    reserved: false,
    binding: null,
    registryState: "eligible",
    task: null,
    createCalls: 0,
    activationCalls: 0,
    issuanceMarker: null,
    checkpoints: [],
    publicKeyBase64: keys.publicKey.export({ type: "spki", format: "der" }).toString("base64")
  };
  const exactTask = (id = "task-feature") => ({
    id,
    title: contract.node.title,
    repositoryIdentity: contract.source.repositoryIdentity,
    repositoryRoot: contract.source.repositoryRoot,
    worktreeBase: contract.source.baseCommit,
    pinned: codexMaterializationPinDecision(contract.node).pinned,
    active: false,
    activationState: "inert",
    launchEnvelope: {
      launchKey: contract.launchKey,
      workContractHash: contract.workContractHash,
      nodeId: contract.node.id,
      parentNodeId: contract.parent?.id ?? null,
      parentTaskId: contract.parent?.taskId ?? null,
      sourceContractHash: contract.sourceContractHash
    }
  });
  const native = {
    async discover() {
      return state.task ? [{ id: state.task.id }] : [];
    },
    async createInert() {
      state.createCalls += 1;
      if (createBehavior) return createBehavior({ state, exactTask });
      state.task = exactTask();
      return { id: state.task.id };
    },
    async read(id) {
      assert.equal(id, state.task?.id);
      return { ...state.task };
    },
    async activate(id) {
      assert.equal(id, state.task?.id);
      state.activationCalls += 1;
      if (activationBehavior) return activationBehavior({ state });
      state.task = { ...state.task, active: true, activationState: "active" };
    },
    async readActivation(id) {
      assert.equal(id, state.task?.id);
      return {
        active: state.task?.active === true,
        pinned: state.task?.pinned
      };
    }
  };
  const callbacks = {
    async reserve(_contract, { reconcile = false } = {}) {
      if (state.reserved) {
        return {
          registryRevision: 2,
          created: false,
          reconcile,
          createIssued: state.issuanceMarker
        };
      }
      state.reserved = true;
      return { registryRevision: 2, created: true, reconcile, createIssued: null };
    },
    async preCreate(_contract, { attemptLedgerTip, nativeCallIssued }) {
      if (state.issuanceMarker) return state.issuanceMarker;
      const payload = {
        schemaVersion: 1,
        broker: "codex-native-firstmate-at-most-once-v1",
        state: "create-issued",
        launchKey: contract.launchKey,
        workContractHash: contract.workContractHash,
        sourceContractHash: contract.sourceContractHash,
        attemptLedgerTip,
        nativeCallIssued,
        issuedAt: "2026-07-24T12:00:00Z"
      };
      state.issuanceMarker = { ...payload, markerHash: hash(payload) };
      return state.issuanceMarker;
    },
    async prepareBinding({ task, attemptLedgerTip, boundAt }) {
      return {
        launchKey: contract.launchKey,
        workContractHash: contract.workContractHash,
        nodeId: contract.node.id,
        taskId: task.id,
        externalTitle: task.title,
        titleVerification: { method: "rename-and-readback", verified: true },
        parentNodeId: contract.parent?.id ?? null,
        parentTaskId: contract.parent?.taskId ?? null,
        boundRevision: 3,
        boundAt,
        materializationAttempt: {
          broker: "codex-native-firstmate-at-most-once-v1",
          attemptLedgerTip,
          sourceContractHash: contract.sourceContractHash,
          taskReadbackHash: hash(task)
        },
        attestation: {
          algorithm: "ed25519",
          keyId: contract.attestationKeyId,
          signature: ""
        }
      };
    },
    attestationPayload(binding) {
      return JSON.stringify(canonicalize({ schemaVersion: 5, scopeId: contract.scopeId, binding }));
    },
    async readBinding({ binding }) {
      if (!state.binding) return "absent";
      return JSON.stringify(canonicalize(state.binding)) === JSON.stringify(canonicalize(binding)) ? "exact" : "conflict";
    },
    async bindInert({ binding }) {
      state.binding = binding;
      state.registryState = "blocked";
    },
    async reconcileCompletedBinding({ binding }) {
      state.binding = binding;
      state.registryState = "working";
    },
    async markWorking({ binding }) {
      assert.deepEqual(state.binding, binding);
      state.registryState = "working";
    }
  };
  const attestor = {
    async request({ requestPath, responsePath }) {
      const request = JSON.parse(fs.readFileSync(requestPath, "utf8"));
      if (attestorBehavior) {
        return attestorBehavior({ request, requestPath, responsePath, keys, state });
      }
      const response = {
        schemaVersion: 1,
        requestId: request.requestId,
        payloadSha256: request.payloadSha256,
        algorithm: "ed25519",
        keyId: request.keyId,
        signature: signPayload(null, Buffer.from(request.payload), keys.privateKey).toString("base64")
      };
      fs.writeFileSync(responsePath, `${JSON.stringify(response, null, 2)}\n`, { mode: 0o600 });
      fs.chmodSync(responsePath, 0o600);
    }
  };
  const run = () => materializeCodexTaskWithBroker({
    contract,
    attemptRoot,
    native,
    attestor,
    callbacks,
    publicKeyBase64: keys.publicKey.export({ type: "spki", format: "der" }).toString("base64"),
    now: () => "2026-07-24T12:00:00Z",
    checkpoint: async (stage) => {
      state.checkpoints.push(stage);
      if (checkpointBehavior) await checkpointBehavior({ stage, state });
    }
  });
  return {
    root,
    attemptRoot,
    contract,
    state,
    native,
    attestor,
    callbacks,
    exactTask,
    run,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true })
  };
}

function attemptDirectory(fixture) {
  return path.join(fixture.attemptRoot, hash(fixture.contract.launchKey));
}

function receipts(fixture) {
  const directory = path.join(attemptDirectory(fixture), "receipts");
  return fs.readdirSync(directory)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => JSON.parse(fs.readFileSync(path.join(directory, name), "utf8")));
}

test("Codex materialization pin policy pins control tasks and never Workers", () => {
  assert.equal(codexMaterializationPinDecision({ role: "boss", state: "working" }).pinned, true);
  assert.equal(codexMaterializationPinDecision({ role: "manager", state: "waiting" }).pinned, true);
  assert.equal(codexMaterializationPinDecision({ role: "worker", state: "working" }).pinned, false);
  assert.throws(
    () => codexMaterializationPinDecision({ role: "manager", state: "terminal" }),
    /terminal Manager materialization is invalid/
  );
});

test("broker reserves, issues one inert Manager, attests, binds, activates, and records a valid chain", async () => {
  const fixture = fixtureHarness();
  try {
    const result = await fixture.run();
    assert.deepEqual(result, {
      launchKey: fixture.contract.launchKey,
      taskId: "task-feature",
      state: "working",
      reconciled: false
    });
    assert.equal(fixture.state.createCalls, 1);
    assert.equal(fixture.state.activationCalls, 1);
    assert.equal(fixture.state.registryState, "working");
    assert.deepEqual(fixture.state.checkpoints, [
      "reserved",
      "create-issued",
      "observed",
      "attestation-requested",
      "attested",
      "bound-inert",
      "activation-issued",
      "activation-confirmed",
      "completed"
    ]);
    const chain = receipts(fixture);
    assert.equal(chain.length, 10);
    assert.equal(validateCodexMaterializationReceipts(chain, {
      launchKey: fixture.contract.launchKey,
      contractHash: fixture.contract.workContractHash
    }).stage, "completed");
    assert.equal(fs.statSync(attemptDirectory(fixture)).mode & 0o777, 0o700);
    assert.equal(fs.statSync(path.join(attemptDirectory(fixture), "receipt-anchor.json")).mode & 0o777, 0o600);
    const reconciled = await fixture.run();
    assert.equal(reconciled.reconciled, true);
    assert.equal(fixture.state.createCalls, 1);
    assert.equal(fixture.state.activationCalls, 1);
  } finally {
    fixture.cleanup();
  }
});

test("one exact pre-existing task is adopted inertly without a native create call", async () => {
  const fixture = fixtureHarness();
  try {
    fixture.state.task = fixture.exactTask("task-positive-adoption");
    const result = await fixture.run();
    assert.equal(result.taskId, "task-positive-adoption");
    assert.equal(fixture.state.createCalls, 0);
    assert.equal(fixture.state.issuanceMarker.nativeCallIssued, false);
    const issued = receipts(fixture).find((receipt) => receipt.stage === "create-issued");
    assert.equal(issued.nativeCallIssued, false);
    assert.equal(issued.adoptedByExactPositiveReadback, true);
  } finally {
    fixture.cleanup();
  }
});

for (const role of ["boss", "worker"]) {
  test(`broker materializes a ${role} with its role-derived parent and pin contract`, async () => {
    const fixture = fixtureHarness({ role });
    try {
      const result = await fixture.run();
      assert.equal(result.state, "working");
      assert.equal(
        fixture.state.task.pinned,
        role === "boss"
      );
      assert.equal(fixture.state.createCalls, 1);
    } finally {
      fixture.cleanup();
    }
  });
}

test("contradictory active/inert native readback cannot pass the inert boundary", async () => {
  const fixture = fixtureHarness({
    createBehavior: ({ state, exactTask }) => {
      state.task = {
        ...exactTask("task-active-before-bind"),
        active: true,
        activationState: "inert"
      };
      return { id: state.task.id };
    }
  });
  try {
    await assert.rejects(fixture.run(), /must remain inert/);
    assert.equal(fixture.state.binding, null);
    assert.equal(fixture.state.activationCalls, 0);
  } finally {
    fixture.cleanup();
  }
});

test("registry issuance marker prevents a second create after ledger and anchor rollback", async () => {
  let crashOnce = true;
  const fixture = fixtureHarness({
    checkpointBehavior: ({ stage }) => {
      if (stage === "create-issued" && crashOnce) {
        crashOnce = false;
        throw new Error("injected crash before native create");
      }
    }
  });
  try {
    await assert.rejects(fixture.run(), /injected crash before native create/);
    assert.equal(fixture.state.createCalls, 0);
    const directory = path.join(attemptDirectory(fixture), "receipts");
    const chain = receipts(fixture);
    for (const name of fs.readdirSync(directory)) {
      const target = path.join(directory, name);
      if (JSON.parse(fs.readFileSync(target, "utf8")).sequence > 1) fs.unlinkSync(target);
    }
    fs.writeFileSync(
      path.join(attemptDirectory(fixture), "receipt-anchor.json"),
      `${JSON.stringify({
        schemaVersion: 1,
        launchKey: fixture.contract.launchKey,
        contractHash: fixture.contract.workContractHash,
        receiptCount: 1,
        receiptTip: chain[0].receiptHash
      }, null, 2)}\n`,
      { mode: 0o600 }
    );
    await assert.rejects(fixture.run(), /another create is forbidden/);
    assert.equal(fixture.state.createCalls, 0);
  } finally {
    fixture.cleanup();
  }
});

test("attempt artifacts without receipts and an anchor fail closed before reservation", async () => {
  const fixture = fixtureHarness();
  try {
    const directory = attemptDirectory(fixture);
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    fs.chmodSync(directory, 0o700);
    fs.writeFileSync(path.join(directory, "attestation.request.json"), "{}\n", { mode: 0o600 });
    await assert.rejects(fixture.run(), /artifacts without a receipt ledger/);
    assert.equal(fixture.state.createCalls, 0);
  } finally {
    fixture.cleanup();
  }
});

test("symlinked private attempt ancestors cannot redirect broker state", async () => {
  const fixture = fixtureHarness();
  try {
    const redirected = path.join(fixture.root, "redirected-attempts");
    fs.mkdirSync(redirected, { mode: 0o700 });
    fs.symlinkSync(redirected, fixture.attemptRoot);
    await assert.rejects(fixture.run(), /real directory ancestors/);
    assert.equal(fixture.state.createCalls, 0);
  } finally {
    fixture.cleanup();
  }
});

test("ambiguous create resumes only from one exact positive task and never creates twice", async () => {
  const fixture = fixtureHarness({
    createBehavior: ({ state, exactTask }) => {
      state.task = exactTask("task-created-before-timeout");
      throw new Error("injected response loss");
    }
  });
  try {
    await assert.rejects(fixture.run(), /another create is forbidden/);
    assert.equal(fixture.state.createCalls, 1);
    const result = await fixture.run();
    assert.equal(result.taskId, "task-created-before-timeout");
    assert.equal(fixture.state.createCalls, 1);
    assert.equal(fixture.state.registryState, "working");
  } finally {
    fixture.cleanup();
  }
});

test("zero positive matches after create-issued remain quarantined without a retry", async () => {
  const fixture = fixtureHarness({
    createBehavior: () => {
      throw new Error("injected unknown external result");
    }
  });
  try {
    await assert.rejects(fixture.run(), /another create is forbidden/);
    await assert.rejects(fixture.run(), /another create is forbidden/);
    assert.equal(fixture.state.createCalls, 1);
    assert.equal(fixture.state.binding, null);
  } finally {
    fixture.cleanup();
  }
});

test("mismatched positive discovery remains quarantined and cannot trigger another create", async () => {
  const fixture = fixtureHarness({
    createBehavior: ({ state, exactTask }) => {
      state.task = exactTask("task-mismatched-after-timeout");
      throw new Error("injected response loss");
    }
  });
  try {
    await assert.rejects(fixture.run(), /another create is forbidden/);
    fixture.state.task = { ...fixture.state.task, title: "Wrong task title" };
    await assert.rejects(fixture.run(), /no exact task/);
    assert.equal(fixture.state.createCalls, 1);
    assert.equal(fixture.state.binding, null);
  } finally {
    fixture.cleanup();
  }
});

test("durable attestor request may resume, but its task creation is never repeated", async () => {
  let attestorCalls = 0;
  const fixture = fixtureHarness({
    attestorBehavior: ({ request, responsePath, keys }) => {
      attestorCalls += 1;
      if (attestorCalls === 1) return;
      const response = {
        schemaVersion: 1,
        requestId: request.requestId,
        payloadSha256: request.payloadSha256,
        algorithm: "ed25519",
        keyId: request.keyId,
        signature: signPayload(null, Buffer.from(request.payload), keys.privateKey).toString("base64")
      };
      fs.writeFileSync(responsePath, `${JSON.stringify(response, null, 2)}\n`, { mode: 0o600 });
      fs.chmodSync(responsePath, 0o600);
    }
  });
  try {
    await assert.rejects(fixture.run(), /did not produce the required durable response/);
    const result = await fixture.run();
    assert.equal(result.state, "working");
    assert.equal(attestorCalls, 2);
    assert.equal(fixture.state.createCalls, 1);
  } finally {
    fixture.cleanup();
  }
});

test("attestor cannot rewrite the durable request during signing", async () => {
  const fixture = fixtureHarness({
    attestorBehavior: ({ request, requestPath, responsePath, keys }) => {
      const response = {
        schemaVersion: 1,
        requestId: request.requestId,
        payloadSha256: request.payloadSha256,
        algorithm: "ed25519",
        keyId: request.keyId,
        signature: signPayload(null, Buffer.from(request.payload), keys.privateKey).toString("base64")
      };
      fs.writeFileSync(responsePath, `${JSON.stringify(response, null, 2)}\n`, { mode: 0o600 });
      fs.writeFileSync(
        requestPath,
        `${JSON.stringify({ ...request, taskId: "tampered-task" }, null, 2)}\n`,
        { mode: 0o600 }
      );
    }
  });
  try {
    await assert.rejects(fixture.run(), /request changed during external signing/);
    assert.equal(fixture.state.binding, null);
    assert.equal(fixture.state.activationCalls, 0);
  } finally {
    fixture.cleanup();
  }
});

test("ambiguous activation is read back and completed without a second activation call", async () => {
  const fixture = fixtureHarness({
    activationBehavior: ({ state }) => {
      state.task = { ...state.task, active: true, activationState: "active" };
      throw new Error("injected activation response loss");
    }
  });
  try {
    await assert.rejects(fixture.run(), /activation will not be reissued/);
    assert.equal(fixture.state.activationCalls, 1);
    const result = await fixture.run();
    assert.equal(result.state, "working");
    assert.equal(fixture.state.activationCalls, 1);
  } finally {
    fixture.cleanup();
  }
});

test("externally authorized activation recovery reconciles a pre-call crash without broker reissue", async () => {
  const fixture = fixtureHarness({
    activationBehavior: () => undefined
  });
  const run = () => materializeCodexTaskWithBroker({
    contract: fixture.contract,
    attemptRoot: fixture.attemptRoot,
    native: fixture.native,
    attestor: fixture.attestor,
    callbacks: {
      ...fixture.callbacks,
      async reconcileActivation({ task }) {
        fixture.state.task = { ...fixture.state.task, id: task.id, active: true, activationState: "active" };
        return {
          authorized: true,
          decisionId: "activation-recovery-decision",
          decidedAt: "2026-07-24T12:00:00Z",
          evidenceHash: hash("activation-recovery-evidence")
        };
      }
    },
    publicKeyBase64: fixture.state.publicKeyBase64,
    now: () => "2026-07-24T12:00:00Z"
  });
  try {
    const result = await run();
    assert.equal(result.state, "working");
    assert.equal(fixture.state.activationCalls, 1);
    const confirmed = receipts(fixture).find((receipt) => receipt.stage === "activation-confirmed");
    assert.equal(confirmed.activationRecoveryDecisionId, "activation-recovery-decision");
  } finally {
    fixture.cleanup();
  }
});

test("completed ledgers repair an exact missing registry binding without another native call", async () => {
  const fixture = fixtureHarness();
  try {
    await fixture.run();
    fixture.state.binding = null;
    fixture.state.registryState = "reserved";
    const reconciled = await fixture.run();
    assert.equal(reconciled.reconciled, true);
    assert.equal(fixture.state.registryState, "working");
    assert.equal(fixture.state.createCalls, 1);
    assert.equal(fixture.state.activationCalls, 1);
  } finally {
    fixture.cleanup();
  }
});

test("lock contention never deletes another materializer owner's lock", async () => {
  const fixture = fixtureHarness();
  try {
    const directory = fixture.attemptRoot;
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    fs.chmodSync(directory, 0o700);
    const lockPath = path.join(directory, "materialization.lock");
    const foreignLock = {
      schemaVersion: 1,
      launchKey: fixture.contract.launchKey,
      contractHash: fixture.contract.workContractHash,
      ownerNonce: "foreign-owner-nonce",
      pid: 4242,
      acquiredAt: "2026-07-24T11:59:00Z"
    };
    fs.writeFileSync(lockPath, `${JSON.stringify(foreignLock, null, 2)}\n`, { mode: 0o600 });
    fs.chmodSync(lockPath, 0o600);
    await assert.rejects(fixture.run(), /locked by 4242/);
    assert.deepEqual(JSON.parse(fs.readFileSync(lockPath, "utf8")), foreignLock);
  } finally {
    fixture.cleanup();
  }
});

test("stale lock release requires exact compare-and-set plus external dead-owner proof", async () => {
  const fixture = fixtureHarness();
  try {
    fs.mkdirSync(fixture.attemptRoot, { recursive: true, mode: 0o700 });
    fs.chmodSync(fixture.attemptRoot, 0o700);
    const lockPath = path.join(fixture.attemptRoot, "materialization.lock");
    fs.writeFileSync(lockPath, `${JSON.stringify({
      schemaVersion: 1,
      launchKey: fixture.contract.launchKey,
      contractHash: fixture.contract.workContractHash,
      ownerNonce: "stale-owner-nonce",
      pid: 4242,
      acquiredAt: "2026-07-24T11:00:00Z"
    }, null, 2)}\n`, { mode: 0o600 });
    fs.chmodSync(lockPath, 0o600);
    const inspected = inspectCodexMaterializationLock({ attemptRoot: fixture.attemptRoot });
    await assert.rejects(
      reconcileStaleCodexMaterializationLock({
        attemptRoot: fixture.attemptRoot,
        expectedLockHash: "f".repeat(64),
        verifyStaleOwner: async () => ({
          authorized: true,
          ownerIsLive: false,
          decisionId: "decision-stale-owner",
          decidedAt: "2026-07-24T12:00:00Z",
          evidenceHash: hash("stale-owner-evidence")
        })
      }),
      /changed before stale-owner reconciliation/
    );
    assert.equal(fs.existsSync(lockPath), true);
    const result = await reconcileStaleCodexMaterializationLock({
      attemptRoot: fixture.attemptRoot,
      expectedLockHash: inspected.lockHash,
      verifyStaleOwner: async ({ lock, expectedLockHash }) => {
        assert.equal(lock.pid, 4242);
        assert.equal(lock.lockHash, expectedLockHash);
        return {
          authorized: true,
          ownerIsLive: false,
          decisionId: "decision-stale-owner",
          decidedAt: "2026-07-24T12:00:00Z",
          evidenceHash: hash("stale-owner-evidence")
        };
      }
    });
    assert.equal(result.released, true);
    assert.equal(fs.existsSync(lockPath), false);
    assert.equal(fs.existsSync(result.archivePath), true);
    const materialized = await fixture.run();
    assert.equal(materialized.state, "working");
  } finally {
    fixture.cleanup();
  }
});

test("only one stale reconciler can claim a lock release compare-and-set", async () => {
  const fixture = fixtureHarness();
  try {
    fs.mkdirSync(fixture.attemptRoot, { recursive: true, mode: 0o700 });
    fs.chmodSync(fixture.attemptRoot, 0o700);
    const lockPath = path.join(fixture.attemptRoot, "materialization.lock");
    fs.writeFileSync(lockPath, `${JSON.stringify({
      schemaVersion: 1,
      launchKey: fixture.contract.launchKey,
      contractHash: fixture.contract.workContractHash,
      ownerNonce: "stale-owner-nonce",
      pid: 4242,
      acquiredAt: "2026-07-24T11:00:00Z"
    }, null, 2)}\n`, { mode: 0o600 });
    fs.chmodSync(lockPath, 0o600);
    const inspected = inspectCodexMaterializationLock({ attemptRoot: fixture.attemptRoot });
    let verifierCalls = 0;
    let releaseVerifier;
    const verifierBarrier = new Promise((resolve) => { releaseVerifier = resolve; });
    const verifyStaleOwner = async () => {
      verifierCalls += 1;
      if (verifierCalls === 2) releaseVerifier();
      await verifierBarrier;
      return {
        authorized: true,
        ownerIsLive: false,
        decisionId: "decision-stale-owner",
        decidedAt: "2026-07-24T12:00:00Z",
        evidenceHash: hash("stale-owner-evidence")
      };
    };
    const results = await Promise.allSettled([
      reconcileStaleCodexMaterializationLock({
        attemptRoot: fixture.attemptRoot,
        expectedLockHash: inspected.lockHash,
        verifyStaleOwner
      }),
      reconcileStaleCodexMaterializationLock({
        attemptRoot: fixture.attemptRoot,
        expectedLockHash: inspected.lockHash,
        verifyStaleOwner
      })
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.match(results.find((result) => result.status === "rejected").reason.message, /compare-and-set is already claimed|ENOENT/);
    assert.equal(fs.existsSync(lockPath), false);
  } finally {
    fixture.cleanup();
  }
});

test("receipt tamper and truncation fail closed before another native call", async () => {
  const fixture = fixtureHarness();
  try {
    await fixture.run();
    const directory = path.join(attemptDirectory(fixture), "receipts");
    const names = fs.readdirSync(directory).filter((name) => name.endsWith(".json")).sort();
    const firstPath = path.join(directory, names[0]);
    const first = JSON.parse(fs.readFileSync(firstPath, "utf8"));
    first.registryRevision = 999;
    fs.writeFileSync(firstPath, `${JSON.stringify(first, null, 2)}\n`, { mode: 0o600 });
    await assert.rejects(fixture.run(), /receipt hash mismatch/);
    assert.equal(fixture.state.createCalls, 1);

    first.registryRevision = 2;
    fs.writeFileSync(firstPath, `${JSON.stringify(first, null, 2)}\n`, { mode: 0o600 });
    fs.unlinkSync(path.join(directory, names.at(-1)));
    await assert.rejects(fixture.run(), /durable anchor/);
    assert.equal(fixture.state.createCalls, 1);
  } finally {
    fixture.cleanup();
  }
});
