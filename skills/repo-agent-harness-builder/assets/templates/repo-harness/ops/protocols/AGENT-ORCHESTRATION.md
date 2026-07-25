---
protocol_id: AGENT-ORCHESTRATION
title: Agent Orchestration
status: inactive
version: 0.5.0
owner: repo-maintainers
last_reviewed: YYYY-MM-DD
summary: Defines project-wide Boss, Manager, and Worker coordination with explicit trust, authority, state, and evidence boundaries.
related_protocols:
  - AUTOMATIONS
  - CLI-INTERFACE
  - CODEX-NATIVE-FIRSTMATE
  - GOAL-GRAPH
  - ORCHESTRATION-REPORTING
  - PROJECT-TRACKING
---

# Agent Orchestration

## Purpose

Provide one agent-agnostic control plane for structured work across the whole project. The hierarchy applies to engineering, research, documentation, operations, planning, QA, and other work; ticket-backed goal graphs are one execution profile, not the owner of the hierarchy.

## Source Of Truth

- `ops/orchestration.example.json` is tracked policy/example state. It stays inactive and contains no developer identity, task ID, reservation, signature, directive, or live lifecycle state. Repository-specific metadata may use `extensions.<lowercase.dotted.namespace>` only as `{ "kind": "tracked-policy", "schemaVersion": <positive integer>, "policy": { ... } }`. Extension policy is declarative discovery metadata: it must contain no runtime, identity, lifecycle, core-authority, task/thread-reference, or binding fields and cannot alter core eligibility, authority, completion, reservation, or launch semantics.
- Each selected private orchestration instance owns one operator's configured scope, monotonic revision, coordination mode, project-owner identity, governed owner directives, hierarchy, task bindings, trust levels, authority envelopes, dependencies, budgets, launch reservations, and current states.
- In Git repositories, private instances live under the Git common directory so linked worktrees share them without committing them. The resolver ignores ambient Git topology and configuration overrides, refuses symlinked Git metadata, and does not fall back to user state when Git metadata is unreadable. Non-Git project folders use a path-keyed private user-state store. Both stores use named operator and instance selectors; arbitrary path overrides are forbidden.
- The tracked example is a regular file rooted in the repository; neither it nor its path components may be symlinks.
- `clientAdapter` is null in the inactive scaffold. A configured object names the selected client/profile and activation posture; installed adapter files alone do not select it.
- The canonical tracker or approved project record owns work scope and acceptance criteria when one exists.
- Domain protocols own domain-specific completion evidence, such as PR merges, published documents, approved decisions, or verified external operations.
- Markdown ledgers and task titles are human-readable views. They do not override the registry.
- `reportingPolicy` and live-node `stageTracking` are additive reporting
  claims. `ORCHESTRATION-REPORTING.md` defines their read-only registry ×
  observation join and reconciliation semantics. Reports are never a second
  state store.

The tracker work graph, private orchestration graph, client task graph, and evidence graph are related but distinct. Tracker movement does not bind a task; a Codex task ID does not redefine shared scope; a PR or artifact proves an outcome but does not replace lifecycle reconciliation.

## Control Dimensions

Keep these concepts distinct. Coordination role intentionally carries its default work shape; the other dimensions do not follow from role:

| Dimension | Values | Meaning |
| --- | --- | --- |
| Coordination | Boss/portfolio, Manager/workstream, Worker/work unit | Responsibility scope and reporting path |
| Work domain | extensible `workKind` slug | Engineering, research, documentation, operations, or another project domain |
| Lifecycle | queued, eligible, working, waiting, blocked, ready-for-parent, terminal | Current work state |
| Trust | T0 through T5 | Maximum independent operating level granted by project policy |
| Authority | explicit capability IDs, gates, and budgets | What actions this node may actually take |
| Completion | repository-merge, artifact, external-operation, human-decision, custom | Evidence shape required to finish |

A role never grants authority by itself. A Boss at T1 may propose a graph but cannot create tasks or mutate project state. A Worker at T3 may integrate a bounded change when its authority envelope permits it. Trust is an autonomy ceiling, not a general claim about competence or reliability.

## Scope And Work Taxonomy

One registry governs one explicit orchestration scope, such as a repository, project, program, personal folder, or custom boundary. “One Boss” means one logical Boss per registry scope, not one Boss for every repository visible on the machine.

In this generated repository harness, the default complete scope is this
repository: its own registry, one logical Boss capability, and repo-local
Managers and Workers. No global project list is required. Cross-repository
portfolio control is optional composition above independently governed
repository Bosses and requires separate explicit scope and authority.

Schema version 4 supports `managed` and `hybrid` coordination. Hybrid mode
keeps the resident Boss and immutable parent relationships while allowing the
configured `scope.ownerRef` to talk directly to Managers or Workers. A direct
message never changes trust or authority by itself. Record a durable
`ownerDirectives` entry only when the instruction must survive task history or
affects execution; bind it to `scope.ownerRef`, the target node and live task,
its immutable parent and live task, a typed task, task-message, or tracker
reference, registry revision at issue, and the current work-contract hash.
`within-contract` directives may proceed inside the existing envelope.
Acknowledgement and resolution require evidence bound to both target node and
task IDs; immediate-parent reconciliation likewise binds the live parent node
and task IDs. An open `replan-required` directive prevents scheduling the
target and its descendants, invalidates stale reservations before creation,
binding, or reconciliation, and requires an active target to be `blocked` at
its current boundary with `blockedByDirectiveIds` naming the open directive
until explicit replan or supersession.

Schema version 5 adds `rootControl.materialization` and immutable
`parentBindingMode` values. `required` preserves Boss-first activation.
`optional` lets the project owner start a Manager feature thread with a
`logical` Boss parent before a Boss task exists. The logical Boss contract,
authority envelope, budgets, and Manager reporting relation still exist; only
the client task is unmaterialized. A logical Manager keeps a null
`parentTaskId`, and that null is sealed into its binding so materializing the
Boss later does not invalidate or reparent it. Workers always use `task`
parent binding and therefore require a task-backed immediate parent.

Schema versions 2 through 5 may also carry the additive optional
`reportingPolicy` root object and optional live-node `stageTracking` object.
Their absence remains valid for backward compatibility. Report and reconcile
surface unknown fields or proposed initialization; they never rewrite an older
instance as a side effect.

Every node records:

- `workRef`: a stable project-local identifier; a tracker ticket is recommended when one exists, but is not required
- `workKind`: an extensible lowercase slug such as `engineering`, `research`, `documentation`, `design`, `qa`, `operations`, `planning`, `decision`, or `governance`
- `governingProtocols`: the orchestration protocol plus the domain rules that define permitted actions and acceptable evidence
- optional `requiredSkills`: node-specific lowercase skill slugs; the CLI
  prepends the portable orchestration skill, selected adapter, and applicable
  domain-loop skill in deterministic order
- `completionProfile`: the evidence shape that makes the node terminal

New schema-v5 harnesses configure `controlLoopPolicy`. Progress means a
material change to Git, tracker, child, PR, check, external-operation, or
completion evidence, never merely a heartbeat, attached process, log line, or
repeated status message. The liveness owner hashes a canonical ASCII-sorted set
of typed evidence references and appends each comparison to a private
hash-linked observation history through registry-revision and prior-hash CAS.
Each active node records that evidence fingerprint and time, unchanged-check
count, observer/sequence/prior-receipt/prior-state/result, bounded scheduled
check or event watchdog, last failure fingerprint, the precondition fingerprint
recorded with that failure, same-failure retry count, and current precondition
fingerprint. Every receipt carries the failure/precondition state and retry
count; clearing it requires material progress, and returning to a known pair
restores its historical retry high-water mark. Policy ceilings are 100
unchanged checks, 20 same-pair retries, and 2,592,000 seconds across the
unchanged-check budget.

The immediate parent owns Manager and Worker liveness; the project owner owns
Boss liveness and owns a logical Manager until a Boss task is actively
managing. Boss bind/reconcile atomically appends the logical-Manager ownership
handoff. An overdue schedule/watchdog or exhausted unchanged/same-pair budget
requires owner action. Another identical retry, replacement task, review run,
or authentication flow is forbidden until a changed precondition is recorded
and the retry counter is reset.

Schema version 3 seals the ordered `requiredSkills` composition into new work-
contract hashes. Schema version 4 also seals coordination mode and owner
identity while validating governed direct-owner instructions. Versions 2
through 4 remain readable so existing externally attested bindings keep their
original hash; migrate deliberately.

This keeps the control plane universal without pretending that all work is software delivery.

## Role Taxonomy

Boss:

- one logical Boss per repository or project
- owns portfolio health, dependency graph, Manager boundaries, escalation, and fan-in order
- runs the recurring portfolio loop over Managers: observe, reconcile, select eligible Manager actions, control cross-Manager fan-in and exceptions, record, and repeat
- does not own every Manager's internal goal graph
- does not absorb implementation that belongs to a Manager or Worker

Manager:

- owns one bounded workstream and its dependency graph/control loop
- runs the recurring workstream loop: observe tracker, base, Worker, and evidence state; audit or rewrite the graph; select eligible Workers; monitor and review; fan in and reconcile; report material exceptions; and repeat until every owned node is terminal
- creates or activates Workers only when its trust level and authority envelope permit delegation
- reviews Worker evidence, manages fan-in, and escalates decisions, external blockers, scope collisions, and integration gates

Worker:

- owns one bounded, independently verifiable outcome
- runs the bounded execution loop: observe assigned inputs, plan, execute, verify, report or hand off to the immediate parent, and repeat until terminal
- reports to its immediate parent
- may create a child Worker only when delegation is authorized and contracts and write sets are safely independent

## Title Grammar

Use this portable grammar unless a configured client presentation taxonomy
selects another grammar. The Codex-native Firstmate adapter owns its configured
display-role and title grammar in `CODEX-NATIVE-FIRSTMATE.md`; it never changes
the canonical role, parentage, lifecycle, trust, authority, or budgets.

`<WORK-REF>` is a stable project reference such as `#123`, `INT-936`, `G2`, `DOCS-4`, or `OPS-7`. Ticket-backed projects should use the canonical ticket reference.

- `<PREFIX> - Boss`
- `<PREFIX> - Manager - <WORK-REF> <workstream or area>`
- `<PREFIX> - Worker for Boss - <WORK-REF> <bounded responsibility>`
- `<PREFIX> - Worker for Manager <PARENT-WORK-REF> - <WORK-REF> <bounded responsibility>`
- `<PREFIX> - Worker for Worker <PARENT-WORK-REF> - <WORK-REF> <bounded responsibility>`

Before a task may be bound, configure `bindingAttestation` with the external attestor's `ed25519` key ID and provide its base64 SPKI public key plus matching key ID through `ORCHESTRATION_BINDING_PUBLIC_KEY` and `ORCHESTRATION_BINDING_KEY_ID`. The public key is a trust anchor outside the mutable registry; keep the matching private key only with the approved adapter or attestation service. Every task-backed node records a signed `taskBinding`: its contract-derived `launchKey`, canonical `workContractHash`, node and task IDs, original parent node and task IDs, bind revision/time, and an Ed25519 attestation over those values. Every task-bound non-Boss node records `parentTaskId`; it must equal its immediate parent's current task ID and its binding's original parent task ID. A schema-v5 logical Manager records the Boss node identity and a null `parentTaskId`, which is sealed into its binding. A Boss has no bound `parentTaskId`, and its binding's `parentNodeId` and `parentTaskId` are both `null`. A Codex-native Firstmate binding additionally records the exact observed `externalTitle` and signed `titleVerification` after rename-and-readback; any supplied external title must equal the registry title. To preserve an otherwise-valid pre-Firstmate schema-v2 binding, list its node ID, task ID, and immutable attestation-payload digest in `clientAdapter.legacyTaskBindings` before activation. That inventory is an explicit migration record, so every non-inventoried Firstmate binding requires both title proof fields. Titles make the hierarchy visible; the externally attested binding makes the external contract and parentage durable. Do not replace a parent task while any bound child remains unreconciled, and supersede/replan rather than mutating a bound contract in place.

## Trust Ladder

| Level | Name | Maximum default authority |
| --- | --- | --- |
| T0 | Observe | Read approved context and report; no writes or delegation |
| T1 | Propose | Produce plans, graphs, drafts, and prompts; no project-state mutation |
| T2 | Execute | Make bounded reversible local changes and run approved verification |
| T3 | Integrate | Use approved branches, PRs, tracker transitions, and child-task delegation under gates |
| T4 | Operate | Perform explicitly allowlisted external writes, deployments, or schedules with rollback and audit evidence |
| T5 | Govern | Run a bounded portfolio control loop, delegate within budgets, reconcile evidence, and escalate exceptions |

Trust only limits maximum authority. Each node also needs an authority envelope naming allowed reads, writes, external actions, approval gates, delegation permission, child budget, and stop conditions. Scope entries are named capability identifiers, not implicit filesystem prefix grants. Children may not exceed the parent trust level, named authority scope, approval gates, or child budget: every parent approval gate remains mandatory for every descendant. Project policy also caps total active nodes and delegation depth. Promotion above the default requires a structured `trustApproval` with approver, timestamp, and evidence; a free-form self-assertion is insufficient. Demotion or revocation may be immediate.

For GitHub actions, use exact `github.*` capability IDs. Every write-capable
node must also carry exactly one `github.profile.<profile-id>` marker in
`allowedExternalActions`. The profile marker is part of the sealed authority
envelope and inherits like every other external action. Effective permission is
the intersection of node authority, profile ceiling, actual credential, and
approval gates; role names never grant GitHub permission.

## Lifecycle Rules

- `queued`: graph node exists but is not yet dependency-eligible and has no live task.
- `eligible`: dependencies are satisfied and the parent may activate it.
- `working`: live task with a concrete `nextAction`.
- `waiting`: live task waiting on a named active child or internal dependency.
- `blocked`: live task needs a named decision, approval, authentication repair, external artifact, or system repair, plus an exact `unblockAction`.
- `ready-for-parent`: outcome is complete and evidence is ready for parent review or fan-in.
- `terminal`: the node has a recorded `completed`, `cancelled`, or `superseded` disposition, evidence is reconciled, and the node has no remaining responsibility.

Only `working`, `waiting`, `blocked`, `ready-for-parent`, and `terminal` are task-backed states. The first four are active. `queued` and `eligible` are graph states and must not pretend a task exists. Archive is metadata on a terminal node, not a substitute for disposition and evidence.
An `eligible` or active node is valid only when every declared dependency is terminal with a `completed` disposition.
An inactive registry may not contain task-backed nodes. A `ready-for-parent` node may have only terminal children; it must stay in a managing state while it has unfinished responsibility.

## Completion Profiles

Every non-Boss node declares one completion profile:

- `repository-merge`: merged change plus configured verification evidence
- `artifact`: approved document, analysis, design, media, or other durable artifact
- `external-operation`: verified external-system result plus rollback or reconciliation evidence
- `human-decision`: recorded human decision and downstream disposition
- `custom`: project-defined evidence named by the governing domain protocol

The profile determines terminal evidence. `completionEvidence` must contain every exact evidence identifier declared by `completionProfile.requiredEvidence`; arbitrary evidence does not complete a profile. A PR is not a universal definition of done.

## Required Sequence

1. Initialize a named private instance from the tracked inactive example.
2. Configure the project prefix, root materialization policy, trust policy, and logical Boss authority envelope.
3. Map the Boss portfolio, Manager-owned workstreams and goal graphs, Worker nodes, dependencies, completion profiles, and approval gates before creating live tasks.
4. Validate the registry with `./{{CLI_NAME}} orchestration validate`.
5. Use `orchestration next` to identify dependency-eligible work.
6. Inspect a bounded prompt with `orchestration prompt <node-id>`, then emit `orchestration launch-spec <node-id>` when a client is authorized to create the task.
7. Use the client adapter handshake and record the created task ID and, for task-bound children, the immediate parent task ID before implementation begins. A schema-v5 logical Manager records a null parent task ID.
8. Keep node state, next action or blocker, and evidence current.
9. Run `orchestration report` on each heartbeat cadence and annotate its
   computed facts with judgment. Run `orchestration reconcile` to inspect
   discrepancies and proposed governed transitions. Both commands are
   read-only; phase 1 has no apply mode or transition authority.
10. Update the evidence fingerprint only when Git, tracker, child, PR, check,
   external-operation, or completion evidence materially changes. Increment
   unchanged or same-failure counters otherwise. Bind each failure to the
   precondition observed with it; after the current precondition changes,
   reset the same-failure counter before another attempt. Through the current
   project-owner or active immediate-parent liveness owner, append a complete
   hash-linked observation using a registry-revision and prior-receipt-hash
   compare-and-set. Never replace, truncate, or reinitialize the receipt chain.
11. At budget exhaustion, block and return control to the immediate parent.
    Retry only after recording a changed precondition.
12. Before any shared-runtime recovery, create a private receipt with the
    preserved active run/head set and compare a second fingerprint immediately
    before action. Before the first snapshot, use an authority keyed to a stable
    runtime scope outside project registries to close new-run admission and
    acquire the single runtime claim. Every start path must consult that
    authority; an unmanaged bypass blocks recovery. Mirror its claim and
    admission fingerprints in the private receipt. Proceed only when the
    active sets match and a registry-revision CAS changes `prepared` to
    `started` with `actionStartedAt` inside the comparison freshness window.
    Derive a ledger-unique claim key from the runtime scope, action, pre-action
    active-set fingerprint, and canonical recovery-precondition fingerprint;
    permit only one `prepared` or `started` mirror in the project ledger. A
    second starter must lose the runtime-authority CAS and performs no side
    effect. `started` records a portable claim owner
    and bounded immutable lease. Append each state change to the hash-linked
    transition ledger; accept only `prepared` → `started` →
    `completed|failed` or `prepared` → `aborted`, with the snapshot matching
    the ledger tip. If it expires, reconcile that same receipt to `completed`
    or evidence-backed `failed` before creating another claim.
    Never repeat a terminal claim key under a new receipt ID; require a changed
    active set or canonical recovery precondition. Reopen admission through the
    same authority during terminal reconciliation. Future, stale, changed, or
    delayed-start receipts abort and replan. A project registry alone never
    acts as a machine-wide runtime lock.
13. Let the immediate parent accept, return, block, or fan in the result.
14. Promote trust only from recorded evidence; reconcile terminal nodes before archive.

## CLI Support

```bash
./{{CLI_NAME}} orchestration status [--example]
./{{CLI_NAME}} orchestration instances
./{{CLI_NAME}} orchestration init <instance>
./{{CLI_NAME}} orchestration migrate <instance>
./{{CLI_NAME}} orchestration hierarchy
./{{CLI_NAME}} orchestration trust
./{{CLI_NAME}} orchestration validate [--example]
./{{CLI_NAME}} orchestration liveness [--example]
./{{CLI_NAME}} orchestration report [--example]
./{{CLI_NAME}} orchestration reconcile [--example]
./{{CLI_NAME}} orchestration directives
./{{CLI_NAME}} orchestration adapter-status [--example]
./{{CLI_NAME}} orchestration taxonomy [--example]
./{{CLI_NAME}} orchestration next
./{{CLI_NAME}} orchestration prompt boss
./{{CLI_NAME}} orchestration prompt <node-id>
./{{CLI_NAME}} orchestration launch-spec <node-id>
```

`init` and `migrate` only create a named private `0600` instance and refuse to overwrite one. All other commands are read-only. No orchestration command creates tasks, updates trackers, merges, deploys, schedules, or sends messages. Select instances with safe `--operator` and `--instance` names, or `REPO_ORCHESTRATION_OPERATOR` and `REPO_ORCHESTRATION_INSTANCE` when another facade composes with orchestration; never accept a raw state path. Use `--example` with `status`, `validate`, `liveness`, `report`, `reconcile`, `adapter-status`, or `taxonomy` when verifying the portable tracked contract. It deliberately bypasses private-instance resolution and ambient instance selectors, cannot be combined with a named selector, and cannot drive operational commands.

When the opt-in Codex-native profile is relevant, inspect the portable
baseline with `./{{CLI_NAME}} orchestration adapter-status --example`, preview
portable presentation labels with
`./{{CLI_NAME}} orchestration taxonomy --example`, and read
`CODEX-NATIVE-FIRSTMATE.md`. After a private instance is
configured, omit `--example` and select that instance to inspect its live
adapter posture. Firstmate is a Codex-facing Boss profile, not a fourth role.
Installed profile assets do not activate orchestration or grant task-creation
authority.

## Client Adapter Handshake

The repository harness is agent-agnostic, so task creation belongs to a thin client adapter. Apart from explicit private-instance initialization and migration, the CLI remains read-only; the adapter performs the compare-and-set operations described by the launch spec.

The inactive scaffold may keep `clientAdapter` null. A configured adapter names
its client ID, profile, status, required skill, and task-creation grant
posture. Active schema-version-3-or-newer adapters must declare their
required skill explicitly; installation alone does not select or activate an
adapter.

1. Run `orchestration validate`, then select a node from `orchestration next` and run `orchestration launch-spec <node-id>`. Its ordered `requiredSkills` must begin with `project-orchestration`, then the selected client adapter, then `goal-graph-loop` for nodes governed by `GOAL-GRAPH` or its deprecated `GOAL-CHAIN` alias, followed by node-specific skills. Missing project-local skills block materialization; fleet-managed skills resolve through their authoritative distribution and are never required as repository copies.
2. The active client verifies that the current user request or recorded scope grant authorizes task creation.
3. Configure the complete logical Boss node, including its intended delegation authority and budgets, before any launch; the empty inactive scaffold is not launchable. In Boss-first mode, materialize it first. In schema-v5 optional-root mode, a logical Manager may activate the instance before the Boss task exists. Before any external side effect, atomically compare the registry revision, expected registry status, target node state/task identity/trust/entire canonical authority envelope, immediate parent state/task identity or logical-root identity/trust/entire canonical authority envelope, capacity preconditions, and the `workContract.hash` from `reservation`. Canonical authority arrays are stable sorted and deduplicated for reads, writes, external actions, approval gates, and stop conditions. The SHA-256 work-contract hash canonically covers the scope, root policy, project budgets, node title/objective/work reference and kind/governing protocols/ordered required skills/parent binding mode/completion profile/dependencies/trust/authority, and the immediate-parent launch envelope. On a match, add the exact `launchReservation` key with its complete `validity` snapshot, advance the registry revision by one, reserve capacity, and activate the instance when this is its first permitted materialization.
4. If the compare-and-set fails, do not create a task. Re-read the registry and generate a new launch spec; an old spec or duplicate reservation is never reusable.
5. Immediately before task creation, atomically compare the reserved registry against `preCreate`: its revision, status, target task identity/reservation key/trust/entire authority envelope including approval gates/work-contract hash, parent state/task ID/trust/entire authority envelope including approval gates, and project/parent capacity must still match. A changed status, target or parent trust/authority/approval gate, work contract, task identity, capacity, or revision invalidates the reservation before the side effect.
6. Create or adopt the task with the exact title, prompt, and immediate parent from the launch spec. Use `externalTask.idempotencyKey` (the contract-derived `launchKey`) as the task API's durable idempotency key only when that API actually accepts it. An adapter whose native create surface cannot accept the key must use its governed at-most-once broker: seal issuance in the live reservation and persist the matching `create-issued` receipt after the immediate validity CAS and before the sole inert create call, prohibit raw bypasses, treat zero matches as quarantine rather than absence, and resume only from one exact self-authenticating launch-envelope match. Read back and verify exact task, title, repository/source base, signed parent contract, inert state, and role pin posture before attestation and bind; failure keeps the reservation quarantined and never permits another create.
7. Atomically bind the returned task ID only when the complete `bind` current-state contract still matches the reserved registry. Have the trusted external attestor sign the emitted `taskBinding` payload, then persist its Ed25519 attestation with the launch key, canonical work-contract hash, node/task identity, original parent node/task binding, post-bind revision, and UTC RFC3339 bind time. A task-bound non-Boss child records the immediate parent's immutable task ID; a logical Manager records a null parent task ID and immutable Boss node identity. When an optional logical Boss becomes an active managing task, this same bind/reconcile CAS appends a liveness-owner handoff observation to every active logical Manager. Then set `state` to `working`, add `nextAction`, clear the reservation, and advance the revision once. Validation recomputes the canonical contract and parentage and verifies the attestation for every task-backed node; a mismatch stays blocked until explicit supersession/replan. A failed bind preserves the reservation and triggers reconciliation by `launchKey`, never a second create.
8. If the task was created but an unrelated valid registry mutation advanced the revision before bind, look up the task by `launchKey` and use `reconcile` to atomically rebind it. Prove the reservation key and base revision, re-read the latest revision, then re-run active-registry, dependency, target task-identity/trust/entire authority envelope including approval gates/work-contract hash, parent task/managing-state/T3 delegation, the full current parent-to-child authority inheritance predicate (trust, read/write/external-action subsets, inherited approval gates, and delegation budget), and capacity checks before binding the found task. A revoked target or parent authority, changed work contract, invalid prerequisite, identity mismatch, or exhausted capacity fails closed and keeps the reservation quarantined for explicit cancel or replan; reconciliation never creates a second task.
9. If an idempotency-capable external API returns authoritative proof that no task exists for `launchKey`, atomically clear only the matching reservation and advance the revision before generating a new spec. On a timeout, crash, ambiguous response, or failed bind, retain the reservation and reconcile the external task by `launchKey`. A governed at-most-once broker that has persisted `create-issued` never treats a zero-result search as absence and never issues another native create; it stays quarantined until one exact positive task is reconciled or an explicit supersession/cancellation disposition is recorded.
10. The child reports to its immediate parent; the parent reconciles state and evidence in the registry.

`revision` is a non-negative monotonic integer. Every registry mutation advances it exactly once. A pending reservation exists only on a queued or eligible node without a task ID and counts against project and parent active-capacity budgets until it is bound or released.

Observation and shared-runtime active-set fingerprints use the harness portable
canonical JSON form: UTF-8 compact JSON, recursively ASCII-sorted object keys,
no whitespace, and ASCII-sorted/deduplicated reference arrays. Control
references are printable ASCII. Observation sequence starts at one;
`receiptHash` covers every receipt field except itself, and each later
`previousReceiptHash` equals the prior receipt hash. The hash chain validates
transitions; the adapter's registry-revision plus prior-hash compare-and-set
enforces append-only history.

This adapter boundary makes worker launch easy without hiding external writes inside the repo CLI or binding the protocol to Codex, Claude Code, Gemini CLI, Cursor, or another client.

## Guardrails

- Role and trust are orthogonal; never infer authority from a title.
- A child may not exceed its parent trust level, authority scope, or delegated budget.
- A child may not drop an approval gate required by its parent.
- Do not fan out overlapping write sets or unstable contracts.
- Do not create a task from a launch spec whose required task parent is missing or whose dependencies are unsatisfied. Only a schema-v5 logical Manager under an optional Boss root may omit a parent task.
- Do not create a task when a project-local `requiredSkills` entry is missing
  from the repository-local skill installation. Resolve fleet-managed entries
  through their authoritative distribution without copying them downstream.
- Never create a task before the launch spec's atomic reservation and immediate `preCreate` comparison succeed; a stale revision, changed status, parent authority or approval gate, task identity, occupied reservation, or exhausted reserved capacity is a pre-side-effect failure.
- Use `launchKey` as the durable external idempotency and reconciliation key only when the external API supports it. Otherwise follow the selected adapter's governed at-most-once issuance protocol: after `create-issued`, a zero-result search stays quarantined and never authorizes another native create.
- Create child tasks only while the parent is `working`, `waiting`, or `blocked`; a `ready-for-parent` node must not acquire new unfinished responsibility.
- Only a dependency with `state: terminal` and `terminalDisposition: completed` satisfies a prerequisite; cancelled or superseded work remains blocking until the registry is replanned to a completed replacement.
- Do not declare dependencies between an ancestor and descendant, and reject cycles that combine parent and dependency links.
- Do not let Managers silently become Workers.
- Do not let the Boss directly operate every goal graph or leave a graph without exactly one Manager owner.
- Do not force the project owner to relay ordinary conversation through the Boss in hybrid mode. Also do not treat direct conversation as authority, reparent work from chat, or close a durable owner directive without resolution and parent-reconciliation evidence.
- Do not let a Worker report around its parent except for material safety risk.
- Do not create a replacement Worker merely because an earlier task or thread is unavailable; first reconcile tracker movements with Git/PR and orchestration evidence and prove the outcome is incomplete and unowned.
- Do not leave a live task idle without a named reason and next control action.
- A heartbeat, attached process, log line, or repeated status response is not
  evidence of progress.
- Do not launch an identical retry, replacement Worker, review run, or auth
  flow after its configured budget is exhausted.
- Before recovering a shared runtime, preserve per-run evidence, record the
  exact active set, and acquire the runtime-scoped claim plus admission closure
  from an external coordinator outside repository and same-user control.
  Local/XDG ledgers and project receipts are not that authority. Until the
  coordinator cryptographically authenticates claims, anchors monotonic
  history, and atomically gates every raw start path, destructive recovery is
  unavailable. Compare the active set again immediately before the action and
  abort/replan if it changed. A missing coordinator blocks recovery, not
  ordinary work. Treat unknown shutdown or resume semantics as non-preserving.
- Do not activate external writes, deployments, schedules, destructive actions, or messages without their domain protocol and approval gate.
- Preserve unrelated user work and keep secrets out of repo, chat, logs, trackers, and artifacts.

## Verification

- `./{{CLI_NAME}} orchestration validate` reports no blockers.
- Exactly one Boss exists when the module is active.
- Every non-Boss node has a valid logical parent and no parent cycle exists; task-bound children also have a valid parent task.
- Titles match the registry-derived grammar.
- Live tasks have task IDs and state-specific control fields.
- Active instances with `controlLoopPolicy` have valid evidence/precondition
  fingerprints, bounded unchanged and retry counters, and exactly one
  scheduled or event-driven next-control condition.
- Trust and authority never exceed parent or project policy; promoted nodes have auditable approval records.
- Active node count, active child count, and delegation depth stay within configured budgets.
- Registry revisions advance monotonically, pending launch reservations consume capacity until they are bound or definitively released, and each reservation's validity snapshot (including its canonical materialized-work-contract hash) matches the current registry before create and bind; a post-create unrelated revision advance may use the reconciliation CAS to bind the task already found by `launchKey`.
- Terminal nodes contain a disposition and evidence required by their completion profile; terminal parents have no non-terminal children.

## Update Rules

When this protocol changes, update `ops/orchestration.example.json`, `AGENTS-TOC.md`, `ops/HARNESS-CHECKLIST.md`, CLI help and tests, orchestration templates, and composing domain protocols such as `GOAL-GRAPH.md`. Migrate private live instances deliberately; never rewrite them as a hidden side effect of scaffold installation.
