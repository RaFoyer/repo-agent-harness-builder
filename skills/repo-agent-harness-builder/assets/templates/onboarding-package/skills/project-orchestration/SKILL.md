---
name: project-orchestration
description: Use when configuring, validating, operating, auditing, or repairing a repository or project hierarchy of Boss, Manager, and Worker tasks with explicit lifecycle, trust, authority, budgets, launch contracts, completion evidence, reconciliation, and nested control loops. Use before any client-specific orchestration adapter.
---

# Project Orchestration

## Boundary

This skill owns the portable control plane. The repository's
tracked `ops/orchestration.example.json` owns only inactive portable example
policy. The selected named private instance is authoritative for one operator's
scope, nodes, parentage, dependencies, lifecycle, trust, authority, budgets,
reservations, task bindings, and completion. Read
`ops/protocols/AGENT-ORCHESTRATION.md` and select the private operator/instance
before acting. Read `references/project-orchestration-protocol.md`
when the repository protocol is absent or the architecture itself is changing.

Client adapters such as `$codex-native-firstmate` materialize this contract on
their native task surfaces. Domain skills such as `$goal-graph-loop` specialize
the work and completion evidence. Neither may redefine the portable hierarchy
or broaden authority.

## Composition Order

Load the skills named by the validated launch contract in this order:

1. `$project-orchestration` for the universal control plane.
2. The selected client adapter, if active.
3. The domain control-loop skill, such as `$goal-graph-loop`.
4. Node-specific implementation or operations skills.

If a required skill is missing, ambiguous, or conflicts with the registry,
fail closed before task creation. Installed assets do not activate orchestration
or grant authority.

## Taxonomy

- **Boss:** owns one explicit scope and the recurring portfolio loop over
  Managers, including cross-workstream dependencies, exception handling, and
  fan-in.
- **Manager:** owns one bounded workstream and its recurring dependency/control
  loop. A Manager normally owns the domain graph rather than handing that loop
  upward to the Boss.
- **Worker:** owns one bounded execution loop and reports evidence to its
  immediate parent.

Roles describe responsibility, not permission. Lifecycle, work domain, trust,
authority, and completion are independent axes. A chain is a linear dependency
topology, not a role or a separate orchestration model.

## Coordination Modes

- **managed:** durable work follows the resident Boss/Manager/Worker reporting hierarchy.
- **hybrid:** the same hierarchy remains authoritative, while the configured project owner may talk directly to Managers or Workers. Direct messages do not reparent nodes or broaden trust, authority, gates, or budgets. Durable instructions are recorded as `ownerDirectives`; acknowledgement and resolution bind the live target node and task, immediate-parent reconciliation binds the live parent node and task, and open replan-required directives block active targets at their current boundary.

Ordinary conversation inside the existing contract does not require a registry
event. Scope, authority, dependency, completion, or budget changes require a
governed directive and explicit replan or supersession.

## Root Materialization

Schema-v5 `required` mode materializes the Boss first. `optional` mode keeps a
complete logical Boss contract while allowing the owner to start Manager
feature threads with `parentBindingMode: logical`. Those Managers retain the
Boss node as their immutable governance parent and a null native parent-task
binding; a Boss task can be added later without invalidating them. Workers
always require task-backed immediate parents.

## Operating Loop

1. Observe repository instructions, tracker state, Git/PR evidence, the
   selected private instance, client task bindings, and completion artifacts.
2. Validate scope, graph acyclicity, parent links, dependency eligibility,
   trust ceilings, authority inheritance, budgets, and evidence requirements.
3. Reconcile inherited or ambiguous nodes before replacing work. Classify each
   as retained, completed, cancelled, superseded, quarantined, or eligible.
4. Select only dependency-eligible work with a valid immediate parent and
   available capacity.
5. Generate a launch contract and confirm its ordered `requiredSkills` are
   locally installed.
6. Reserve with compare-and-set semantics before any external task creation.
7. Let the selected adapter create/adopt, title, verify, and bind the task as one
   logical materialization transaction.
8. Monitor canonical evidence-reference fingerprints through an append-only,
   hash-linked receipt history written by the current liveness owner using
   registry-revision and prior-hash CAS. The project owner owns the Boss and
   any logical Manager whose Boss task is not actively managing; Boss
   bind/reconcile atomically appends the handoff to the immediate parent. A
   heartbeat, attached process, or repeated status message is activity, not
   proof of progress. Increment the unchanged-check counter when the
   fingerprint is unchanged; an overdue schedule/watchdog or exhausted budget
   requires owner action. Every receipt seals failure/precondition evidence and
   the pair's retry high-water mark; configured check/retry budgets must remain
   inside the protocol's safety ceilings.
9. Key each retry to the failure fingerprint and the precondition recorded
   with that failure.
   Never repeat an identical failed action after its retry budget is exhausted;
   resume only after a changed precondition is recorded. Reconcile crashes or
   ambiguous creates by launch key when the external API provides authoritative
   idempotency or absence proof. Otherwise follow the selected adapter's
   at-most-once broker; a zero-result search never authorizes another create.
10. Mark responsibility terminal only after owned children are terminal and the
   completion profile's exact evidence is recorded.
11. In hybrid mode, reconcile open owner directives without turning the Boss into a communication gatekeeper.

## Fail-Closed Rules

- Visibility does not grant scope or authority.
- Role, trust, title, task existence, and installed skills do not grant actions.
- Queued graph nodes are not durable tasks.
- A child may not exceed parent trust, capabilities, approval gates, budget, or
  delegation depth.
- Do not silently substitute a client, browser, connector, worktree mode, or
  task API when a required capability is unavailable.
- Keep an ambiguous reservation quarantined and reconcile by idempotency key.
- Quietness alone never authorizes recovery. The active immediate parent owns
  liveness escalation for task-parented children; the project owner owns Boss
  liveness and logical Managers until the Boss is actively managing.
- Before recovering a shared runtime, snapshot the exact active set and
  preservation evidence, compare that set again immediately before the action,
  and record both canonical fingerprints in a fresh private recovery receipt.
  Before preservation, close admission and acquire the runtime-scoped claim
  from an authority outside all repository-private registries. Require every
  run-start path to consult it; if an unmanaged path can bypass admission,
  block recovery. Begin the action inside the comparison freshness window.
  Abort/replan if the set changed, the comparison is future/stale, or the action
  start is delayed. Never treat a local/XDG ledger, project registry, or
  same-user hash as the runtime authority. Until a separate coordinator
  cryptographically authenticates claims, anchors monotonic history, and
  atomically gates every raw start path, destructive recovery is unavailable
  and every non-empty recovery mirror fails closed. Ordinary orchestration
  without recovery receipts remains available. Once that external adapter
  exists, mirror its coordinator generation and authenticated claim reference,
  then win the local registry-CAS
  `prepared` → `started` transition before the side effect. Seal the runtime
  scope, action, active-set fingerprint, and recovery-precondition fingerprint
  in a ledger-unique claim key; allow only one nonterminal project mirror.
  Give `started` a portable owner and bounded immutable lease. Reconcile an
  expired claim on that same receipt before a new claim. Append only monotonic
  state changes to its hash-linked transition ledger and keep the snapshot
  equal to the ledger tip; never replay an unchanged terminal claim key under
  a new ID. Only the claimant may record `completed` or evidence-backed
  `failed`, and reopen admission through the runtime authority during terminal
  reconciliation. The project registry is not the machine-wide lock. Treat
  unknown shutdown or admission semantics as non-preserving.
- Do not start another identical retry, replacement Worker, review run, or auth
  flow after the configured unchanged-progress or same-failure budget is
  exhausted.
- Do not archive tasks or remove worktrees until landed-work proof exists.
- Cross-repository control requires a separately registered scope and explicit
  authority.

## Assets

Use `assets/boss-prompt.txt`, `assets/manager-prompt.txt`, and
`assets/worker-prompt.txt` only as role overlays on a validated launch contract.
They do not create authority or replace the registry.
