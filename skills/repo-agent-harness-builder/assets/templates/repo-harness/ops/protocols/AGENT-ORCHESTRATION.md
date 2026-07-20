---
protocol_id: AGENT-ORCHESTRATION
title: Agent Orchestration
status: inactive
version: 0.3.0
owner: repo-maintainers
last_reviewed: YYYY-MM-DD
summary: Defines project-wide Boss, Manager, and Worker coordination with explicit trust, authority, state, and evidence boundaries.
related_protocols:
  - AUTOMATIONS
  - CLI-INTERFACE
  - CODEX-NATIVE-FIRSTMATE
  - GOAL-GRAPH
  - PROJECT-TRACKING
---

# Agent Orchestration

## Purpose

Provide one agent-agnostic control plane for structured work across the whole project. The hierarchy applies to engineering, research, documentation, operations, planning, QA, and other work; ticket-backed goal graphs are one execution profile, not the owner of the hierarchy.

## Source Of Truth

- `ops/orchestration.json` owns the configured scope, monotonic revision, hierarchy, task parentage, trust levels, authority envelopes, dependencies, budgets, launch reservations, and current states.
- `clientAdapter` is null in the inactive scaffold. A configured object names the selected client/profile and activation posture; installed adapter files alone do not select it.
- The canonical tracker or approved project record owns work scope and acceptance criteria when one exists.
- Domain protocols own domain-specific completion evidence, such as PR merges, published documents, approved decisions, or verified external operations.
- Markdown ledgers and task titles are human-readable views. They do not override the registry.

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
repository: its own registry, one resident Boss capability, and repo-local
Managers and Workers. No global project list is required. Cross-repository
portfolio control is optional composition above independently governed
repository Bosses and requires separate explicit scope and authority.

Every node records:

- `workRef`: a stable project-local identifier; a tracker ticket is recommended when one exists, but is not required
- `workKind`: an extensible lowercase slug such as `engineering`, `research`, `documentation`, `design`, `qa`, `operations`, `planning`, `decision`, or `governance`
- `governingProtocols`: the orchestration protocol plus the domain rules that define permitted actions and acceptable evidence
- optional `requiredSkills`: node-specific lowercase skill slugs; the CLI
  prepends the portable orchestration skill, selected adapter, and applicable
  domain-loop skill in deterministic order
- `completionProfile`: the evidence shape that makes the node terminal

Schema version 3 seals the ordered `requiredSkills` composition into new work-
contract hashes. Version 2 remains readable so existing externally attested
bindings keep their original hash; migrate a v2 registry deliberately before
relying on required skills as immutable binding data.

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

Before a task may be bound, configure `bindingAttestation` with the external attestor's `ed25519` key ID and provide its base64 SPKI public key plus matching key ID through `ORCHESTRATION_BINDING_PUBLIC_KEY` and `ORCHESTRATION_BINDING_KEY_ID`. The public key is a trust anchor outside the mutable registry; keep the matching private key only with the approved adapter or attestation service. Every task-backed node records a signed `taskBinding`: its contract-derived `launchKey`, canonical `workContractHash`, node and task IDs, original parent node and task IDs, bind revision/time, and an Ed25519 attestation over those values. Every task-backed non-Boss node also records `parentTaskId`; it must equal its immediate parent's current task ID and its binding's original parent task ID. A Boss has no bound `parentTaskId`, and its binding's `parentNodeId` and `parentTaskId` are both `null`. A Codex-native Firstmate binding additionally records the exact observed `externalTitle` and signed `titleVerification` after rename-and-readback; any supplied external title must equal the registry title. To preserve an otherwise-valid pre-Firstmate schema-v2 binding, list its node ID, task ID, and immutable attestation-payload digest in `clientAdapter.legacyTaskBindings` before activation. That inventory is an explicit migration record, so every non-inventoried Firstmate binding requires both title proof fields. Titles make the hierarchy visible; the externally attested binding makes the external contract and parentage durable. Do not replace a parent task while any bound child remains unreconciled, and supersede/replan rather than mutating a bound contract in place.

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

1. Configure the project prefix, trust policy, and inactive registry.
2. Define the Boss at an explicit trust level and authority envelope.
3. Map the Boss portfolio, Manager-owned workstreams and goal graphs, Worker nodes, dependencies, completion profiles, and approval gates before creating live tasks.
4. Validate the registry with `./{{CLI_NAME}} orchestration validate`.
5. Use `orchestration next` to identify dependency-eligible work.
6. Inspect a bounded prompt with `orchestration prompt <node-id>`, then emit `orchestration launch-spec <node-id>` when a client is authorized to create the task.
7. Use the client adapter handshake and record the created task ID and immediate parent task ID before implementation begins.
8. Keep node state, next action or blocker, and evidence current.
9. Let the immediate parent accept, return, block, or fan in the result.
10. Promote trust only from recorded evidence; reconcile terminal nodes before archive.

## CLI Support

```bash
./{{CLI_NAME}} orchestration status
./{{CLI_NAME}} orchestration hierarchy
./{{CLI_NAME}} orchestration trust
./{{CLI_NAME}} orchestration validate
./{{CLI_NAME}} orchestration next
./{{CLI_NAME}} orchestration prompt boss
./{{CLI_NAME}} orchestration prompt <node-id>
./{{CLI_NAME}} orchestration launch-spec <node-id>
```

These commands are read-only. They inspect local registry state and print bounded prompts or JSON launch contracts; they do not create tasks, update trackers, merge, deploy, schedule, or send messages.

When the opt-in Codex-native profile is relevant, inspect it with
`./{{CLI_NAME}} orchestration adapter-status`, preview presentation labels with
`./{{CLI_NAME}} orchestration taxonomy`, and read
`CODEX-NATIVE-FIRSTMATE.md`. Firstmate is a Codex-facing Boss profile, not a
fourth role. Installed profile assets do not activate orchestration or grant
task-creation authority.

## Client Adapter Handshake

The repository harness is agent-agnostic, so task creation belongs to a thin client adapter. The CLI remains read-only; the adapter performs the compare-and-set operations described by the launch spec.

The inactive scaffold may keep `clientAdapter` null. A configured adapter names
its client ID, profile, status, project-local `requiredSkill`, and task-creation
grant posture. Active schema-version-3 adapters must declare their required
skill explicitly; installation alone does not select or activate an adapter.

1. Run `orchestration validate`, then select a node from `orchestration next` and run `orchestration launch-spec <node-id>`. Its ordered `requiredSkills` must begin with `project-orchestration`, then the selected client adapter, then `goal-graph-loop` for nodes governed by `GOAL-GRAPH` or its deprecated `GOAL-CHAIN` alias, followed by node-specific skills. Missing project-local skills block materialization.
2. The active client verifies that the current user request or recorded scope grant authorizes task creation.
3. Configure a complete Boss node, including its intended delegation authority and budgets, before its first launch; the empty inactive scaffold is not a launchable placeholder. Before any external side effect, atomically compare the registry revision, expected registry status, target node state/task identity/trust/entire canonical authority envelope, immediate parent state/task ID/trust/entire canonical authority envelope, capacity preconditions, and the `workContract.hash` from `reservation`. Canonical authority arrays are stable sorted and deduplicated for reads, writes, external actions, approval gates, and stop conditions. The SHA-256 work-contract hash canonically covers the scope, project budgets, node title/objective/work reference and kind/governing protocols/ordered required skills/completion profile/dependencies/trust/authority, and the immediate parent task/trust/authority launch envelope. On a match, add the exact `launchReservation` key with its complete `validity` snapshot, advance the registry revision by one, and reserve capacity. For every Boss bootstrap, also set `status` to `active` in that transaction.
4. If the compare-and-set fails, do not create a task. Re-read the registry and generate a new launch spec; an old spec or duplicate reservation is never reusable.
5. Immediately before task creation, atomically compare the reserved registry against `preCreate`: its revision, status, target task identity/reservation key/trust/entire authority envelope including approval gates/work-contract hash, parent state/task ID/trust/entire authority envelope including approval gates, and project/parent capacity must still match. A changed status, target or parent trust/authority/approval gate, work contract, task identity, capacity, or revision invalidates the reservation before the side effect.
6. Create or adopt the task with the exact title, prompt, and immediate parent from the launch spec, using `externalTask.idempotencyKey` (the contract-derived `launchKey`) as the task API's durable idempotency key and `externalTask.reconciliationKey` for lookup. Read back and verify the exact title before bind; a title failure keeps the reservation quarantined for reconciliation and never permits another create.
7. Atomically bind the returned task ID only when the complete `bind` current-state contract still matches the reserved registry. Have the trusted external attestor sign the emitted `taskBinding` payload, then persist its Ed25519 attestation with the launch key, canonical work-contract hash, node/task identity, original parent node/task binding, post-bind revision, and UTC RFC3339 bind time. For a non-Boss child, also set immutable `parentTaskId` to the immediate parent task ID used at launch; then set `state` to `working`, add `nextAction`, clear the reservation, and advance the registry revision by one. Validation recomputes the canonical contract and parentage and verifies the external attestation for every task-backed node; a mismatch stays blocked until explicit supersession/replan. A failed bind must preserve the reservation and trigger reconciliation by `launchKey`, never a second create.
8. If the task was created but an unrelated valid registry mutation advanced the revision before bind, look up the task by `launchKey` and use `reconcile` to atomically rebind it. Prove the reservation key and base revision, re-read the latest revision, then re-run active-registry, dependency, target task-identity/trust/entire authority envelope including approval gates/work-contract hash, parent task/managing-state/T3 delegation, the full current parent-to-child authority inheritance predicate (trust, read/write/external-action subsets, inherited approval gates, and delegation budget), and capacity checks before binding the found task. A revoked target or parent authority, changed work contract, invalid prerequisite, identity mismatch, or exhausted capacity fails closed and keeps the reservation quarantined for explicit cancel or replan; reconciliation never creates a second task.
9. If create fails with a definitive proof that no task exists for `launchKey`, atomically clear only the matching reservation and advance the revision before generating a new spec. On a timeout, crash, ambiguous response, or failed bind, retain the reservation and reconcile the external task by `launchKey`; do not clear or retry creation until absence is proven.
10. The child reports to its immediate parent; the parent reconciles state and evidence in the registry.

`revision` is a non-negative monotonic integer. Every registry mutation advances it exactly once. A pending reservation exists only on a queued or eligible node without a task ID and counts against project and parent active-capacity budgets until it is bound or released.

This adapter boundary makes worker launch easy without hiding external writes inside the repo CLI or binding the protocol to Codex, Claude Code, Gemini CLI, Cursor, or another client.

## Guardrails

- Role and trust are orthogonal; never infer authority from a title.
- A child may not exceed its parent trust level, authority scope, or delegated budget.
- A child may not drop an approval gate required by its parent.
- Do not fan out overlapping write sets or unstable contracts.
- Do not create a task from a launch spec whose parent task is missing or whose dependencies are unsatisfied.
- Do not create a task when any ordered `requiredSkills` entry is missing from
  the repository-local skill installation.
- Never create a task before the launch spec's atomic reservation and immediate `preCreate` comparison succeed; a stale revision, changed status, parent authority or approval gate, task identity, occupied reservation, or exhausted reserved capacity is a pre-side-effect failure.
- Use `launchKey` as the durable external idempotency and reconciliation key. An indeterminate create or bind result keeps its reservation until lookup proves no external task exists.
- Create child tasks only while the parent is `working`, `waiting`, or `blocked`; a `ready-for-parent` node must not acquire new unfinished responsibility.
- Only a dependency with `state: terminal` and `terminalDisposition: completed` satisfies a prerequisite; cancelled or superseded work remains blocking until the registry is replanned to a completed replacement.
- Do not declare dependencies between an ancestor and descendant, and reject cycles that combine parent and dependency links.
- Do not let Managers silently become Workers.
- Do not let the Boss directly operate every goal graph or leave a graph without exactly one Manager owner.
- Do not let a Worker report around its parent except for material safety risk.
- Do not create a replacement Worker merely because an earlier task or thread is unavailable; first reconcile tracker movements with Git/PR and orchestration evidence and prove the outcome is incomplete and unowned.
- Do not leave a live task idle without a named reason and next control action.
- Do not activate external writes, deployments, schedules, destructive actions, or messages without their domain protocol and approval gate.
- Preserve unrelated user work and keep secrets out of repo, chat, logs, trackers, and artifacts.

## Verification

- `./{{CLI_NAME}} orchestration validate` reports no blockers.
- Exactly one Boss exists when the module is active.
- Every non-Boss node has a valid parent and no parent cycle exists.
- Titles match the registry-derived grammar.
- Live tasks have task IDs and state-specific control fields.
- Trust and authority never exceed parent or project policy; promoted nodes have auditable approval records.
- Active node count, active child count, and delegation depth stay within configured budgets.
- Registry revisions advance monotonically, pending launch reservations consume capacity until they are bound or definitively released, and each reservation's validity snapshot (including its canonical materialized-work-contract hash) matches the current registry before create and bind; a post-create unrelated revision advance may use the reconciliation CAS to bind the task already found by `launchKey`.
- Terminal nodes contain a disposition and evidence required by their completion profile; terminal parents have no non-terminal children.

## Update Rules

When this protocol changes, update `ops/orchestration.json`, `AGENTS-TOC.md`, `ops/HARNESS-CHECKLIST.md`, CLI help and tests, orchestration templates, and composing domain protocols such as `GOAL-GRAPH.md`.
