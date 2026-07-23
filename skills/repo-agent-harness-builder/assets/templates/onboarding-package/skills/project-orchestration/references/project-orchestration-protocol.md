# Project Orchestration

## Purpose

Use this reference when adding structured delegation and progressive autonomy to a repository, project folder, program, or personal-folder harness. The orchestration layer is a control plane for any work domain. Goal graphs, research, documentation, operations, design, QA, decisions, and artifact production plug into it through governing protocols and completion profiles.

## Design Boundary

Keep these control dimensions distinct. Coordination role intentionally carries its default work shape; the other dimensions do not follow from role:

| Dimension | Question | Examples |
| --- | --- | --- |
| Coordination | What responsibility scope and reporting layer does this node own? | Boss/portfolio, Manager/workstream, Worker/work unit |
| Work domain | What kind of project outcome is this? | engineering, research, documentation, operations, decision |
| Lifecycle | What control state is it in? | queued, eligible, working, waiting, blocked, ready-for-parent, terminal |
| Trust | How independently may it operate? | T0 through T5 |
| Authority | What named actions, gates, and budgets are actually granted? | reads, writes, external actions, delegation, stop conditions |
| Completion | What evidence ends responsibility? | repository merge, artifact, external operation, human decision, custom |

Do not infer permissions from role, completion from task visibility, or work domain from title. A Boss can be proposal-only. A Worker can have bounded integration authority. A terminal task can be completed, cancelled, or superseded.

Coordination roles own nested control loops:

- the Boss owns the portfolio loop over Managers, cross-workstream dependencies, exceptions, and fan-in
- each Manager owns one bounded workstream loop and its dependency graph
- each Worker owns one bounded execution loop and reports to its immediate parent

The Boss must not become the controller for every internal goal graph. The Manager is the normal graph controller. A strict chain is merely a linear graph topology. A Worker may delegate a smaller Worker loop only when its explicit authority envelope permits delegation.

## Scope Model

Git owns the portable control-plane contract: protocol, schema, inactive
`ops/orchestration.example.json`, CLI implementation, and tests. It must not
own developer task IDs, signatures, reservations, directives, or live state.
Repository-specific metadata may use `extensions.<lowercase.dotted.namespace>`
only as `{"kind":"tracked-policy","schemaVersion":1,"policy":{...}}`.
These entries are declarative discovery metadata, not an authority extension:
they must not contain runtime, identity, lifecycle, core-authority,
task/thread-reference, or binding fields and cannot change core eligibility,
authority, completion, reservation, or launch semantics.

Each named private orchestration instance governs one explicit scope. In a Git
repository it lives under the clone's Git common directory and is shared by
linked worktrees. The resolver ignores ambient Git topology and configuration
overrides, rejects symlinked Git metadata, and does not fall back to user state
when Git metadata is unreadable. If protected Git configuration already trusts
this exact repository through `safe.directory`, the resolver preserves only
that exact-root trust for its topology query; wildcard and parent-directory
trust are not promoted. The tracked example and every path component
leading to it must be regular repository entries, not symlinks. A non-Git
project folder uses a path-keyed private user-state store. Safe operator and
instance names select state. Raw path overrides are not part of the contract
because they could redirect live state into Git or split one clone across
competing registries. Record:

- a non-negative monotonic registry revision
- scope ID
- scope kind: repository, project, program, personal-folder, or custom
- stable root reference
- single-line objective

“One Boss” means one logical Boss per configured scope. It does not grant authority over other repositories, projects, tasks, accounts, or systems that happen to be visible.

Keep four graphs distinct:

- the tracker graph owns shared work, dependencies, and acceptance outcomes
- the private orchestration graph owns one operator's hierarchy, trust,
  authority, reservations, directives, and lifecycle
- the client task graph maps materialized nodes to Codex tasks or another
  client's native units
- the evidence graph owns PRs, commits, artifacts, decisions, deployments, and
  other completion proof

Cross-references connect these graphs; no graph silently replaces another.

Schema version 4 adds an explicit `coordinationMode`, a stable
`scope.ownerRef`, and governed `ownerDirectives`:

- `managed` keeps all durable coordination on the resident hierarchy.
- `hybrid` preserves that hierarchy while allowing the configured project owner
  to talk directly to Managers and Workers. Direct conversation does not
  reparent a node, replace its immediate-parent reporting duty, or expand its
  trust, authority, gates, budget, or completion contract.

Do not record ordinary conversation merely because it was direct. Record an
owner directive when the instruction must survive task history or affects
durable execution. Each record binds the owner, target node and live target
task, immutable parent and live parent task, a typed task, task-message, or
tracker reference, registry revision, current work-contract hash, impact, and
reconciliation state. Acknowledgement and terminal resolution bind both the
target node and task IDs, timestamp, and
evidence reference; the target's immutable immediate parent must likewise have
a live task and record both parent node and task IDs, timestamp, and
reconciliation evidence reference. `within-contract`
instructions may proceed inside the existing envelope. An open `replan-required`
directive prevents scheduling its target and descendants, invalidates a stale
reservation before create, bind, or reconciliation, and requires an active
target to be `blocked` at its current boundary with `blockedByDirectiveIds`
naming every open replan directive until explicit replan or supersession.

Schema version 5 adds a root materialization policy. With `required`, the Boss
task is materialized first. With `optional`, the logical Boss contract exists
but the owner may start one or more Manager feature threads first. Such a
Manager uses `parentBindingMode: logical`, seals the Boss node identity and a
null parent task ID into its signed contract, and remains valid if the Boss
task is materialized later. A Manager may still choose task binding after the
Boss exists. Workers always require task-bound immediate parents.

New schema-v5 harnesses also configure `controlLoopPolicy`. Progress means a
material change to the node's Git, tracker, child, PR, check,
external-operation, or completion evidence—not a heartbeat, attached process,
log line, or repeated status message. The fingerprint is the SHA-256 of a
canonical ASCII-sorted set of typed evidence references; the liveness owner
appends each comparison to a private hash-linked observation receipt chain so
a Worker cannot self-declare progress by rotating an arbitrary digest. Each
active node records private `controlLoop` state:

- canonical evidence references, their SHA-256 `progressFingerprint`, and
  `lastProgressAt`
- an `unchangedChecks` counter
- a parent-owned append-only observation sequence with observer identity,
  observation time, prior receipt hash, prior fingerprint/counter state,
  resulting evidence/precondition state, and changed/unchanged result
- either a bounded scheduled `nextCheckAt` or a named `wakeEvent` with a
  bounded watchdog
- the last failure fingerprint, the precondition fingerprint recorded with
  that failure, the current precondition fingerprint, and the retry count for
  that exact pair; these fields are included in every observation receipt, so
  clearing a failure requires material progress and a known pair's historical
  retry high-water mark cannot be reset

The immediate parent owns Manager and Worker liveness; the project owner owns
Boss liveness and also owns a logical Manager until an actual Boss task is in
an active managing state. The Boss bind/reconcile transaction atomically
appends the ownership-handoff observation for every active logical Manager;
the latest receipt must name the current owner. A future timestamp outside the
clock-skew allowance, an overdue schedule or event watchdog, exhaustion of the
unchanged-progress budget, or exhaustion of the same
failure/precondition retry budget requires owner action.
Another identical retry, replacement task, review run, or authentication flow
is forbidden until a changed precondition is recorded and the retry counter is
reset.

Observation and active-set hashes use the harness portable canonical JSON
form: UTF-8 compact JSON, recursively ASCII-sorted object keys, no whitespace,
and ASCII-sorted/deduplicated reference arrays. Control references are
printable ASCII. Each observation `receiptHash` hashes every receipt field
except `receiptHash`; sequence starts at one and every later
`previousReceiptHash` equals the prior receipt hash. Adapters append through a
registry-revision and prior-receipt-hash compare-and-set. Deleting, truncating,
reinitializing, or replacing the chain is invalid even when a replacement
would be internally self-consistent; the hash chain detects broken
transitions, while the registry CAS enforces append-only history.
`maxUnchangedChecks` is limited to 100, `maxSameFailureRetries` to 20, and the
configured unchanged-check count multiplied by the control interval may span
at most 2,592,000 seconds. These are safety ceilings, not recommended defaults.

For a repository harness, default to the repository itself as the complete
scope: its own registry, one logical Boss capability, and repo-local Managers
and Workers. The builder does not require a global project list. A program may
optionally compose multiple independently governed repository Bosses, but that
cross-repository layer needs its own explicit scope and authority and must not
silently control repositories merely because they are visible.

## Node Contract

Every node should declare:

- stable node ID and work reference
- role and immediate parent node
- extensible `workKind` slug
- governing protocol IDs
- optional node-specific required skill slugs; the launch contract prepends the
  portable orchestration skill, selected client adapter, and applicable domain
  loop in deterministic order
- exact registry-derived title; a client presentation taxonomy may change only
  its display role and title grammar, never the canonical role or authority
- dependency node IDs
- lifecycle state and its required control fields
- trust level and promotion evidence when above the default
- authority envelope
- completion profile and required evidence
- task ID only after the client materializes the graph node as a task, plus Ed25519-attested immutable `taskBinding` metadata (launch key, canonical contract hash, node/task/parent identity, and bind revision/time); task-bound non-Boss nodes record an immutable `parentTaskId`, while schema-v5 logical Managers record their Boss node identity and a null `parentTaskId`; Boss nodes have null binding parent metadata

Schema version 3 includes the ordered required-skill composition in new work-
contract hashes. Schema version 4 additionally seals coordination mode and
owner identity into new contracts and validates owner directives without
making chat messages a permission source. Versions 2 through 4 remain readable
for existing externally attested bindings; migrate deliberately rather than
silently rewriting their hashes.

Queued and eligible nodes are graph state, not fake tasks. Working, waiting, blocked, ready-for-parent, and terminal nodes are task-backed. Terminal nodes record a disposition and every exact evidence identifier required by their completion profile.

## Progressive Autonomy

Treat trust as an autonomy ceiling, not a reputation score:

| Level | Default posture |
| --- | --- |
| T0 Observe | approved reads and reporting only |
| T1 Propose | plans, graphs, drafts, prompts, and recommendations |
| T2 Execute | bounded reversible local changes and approved verification |
| T3 Integrate | allowlisted integration actions and child delegation under gates |
| T4 Operate | allowlisted external operations with rollback and reconciliation evidence |
| T5 Govern | bounded portfolio control loops within explicit budgets and exception rules |

Promotion requires a structured `trustApproval` containing the human approver, timestamp, and evidence. A free-form evidence string or agent assertion is insufficient. Promotion is scope-specific: success editing documentation does not imply deployment, messaging, financial, destructive, or cross-repository authority. Demotion and revocation should be immediate when evidence, scope, or conditions change.

## Authority Envelope

Each node needs explicit:

- allowed read capability IDs
- allowed write capability IDs
- allowed external action IDs
- approval gates
- delegation permission
- maximum active children
- stop conditions

Project policy also caps active nodes and delegation depth. Child trust, named scopes, approval gates, and child budgets must be subsets of the parent envelope. Every parent approval gate remains mandatory for a child. Use stable capability IDs; do not treat a broad path prefix or role label as an implicit grant.

### GitHub Capability And Profile Binding

GitHub authority uses stable external-action identifiers such as
`github.repo.read`, `github.issue.comment`, `github.pr.create`,
`github.pr.review`, `github.workflow.dispatch`, `github.pr.merge`,
`github.secret.write`, and `github.repo.admin`. A role name never supplies one
of these implicitly.

Every write-capable GitHub node also carries exactly one
`github.profile.<profile-id>` external-action marker. The marker is sealed into
the existing authority envelope and materialized-work-contract hash, inherited
through the parent subset rule, and matched by the repository GitHub facade.
Effective permission is the intersection of node capability, selected profile
ceiling, actual credential permission, and approval gates. Merge, workflow
modification or dispatch, secrets, administration, destructive actions, and
cross-repository operations require explicit gates. A broad operator profile
is outside ordinary Worker inheritance.

## Completion Profiles

Completion belongs to the governing domain protocol:

- `repository-merge`: merged repository change and verification evidence
- `artifact`: approved durable document, analysis, design, media, or other output
- `external-operation`: verified external result plus rollback or reconciliation evidence
- `human-decision`: recorded decision plus downstream disposition
- `custom`: project-defined evidence from a named protocol

This avoids forcing pull requests onto research, operations, planning, or personal projects.

## Client Adapter Contract

The repo CLI remains agent-agnostic. `init` and `migrate` only create a private
`0600` instance and refuse overwrite; inspection, prompt, and launch-spec
commands remain read-only:

The inactive scaffold may keep `clientAdapter` null. A configured adapter
record names its client ID, profile, status, required skill, and whether a standing task-
creation grant exists; client-specific policy may add base/worktree,
integration, heartbeat, retention, and reconciliation fields. Installing an
adapter capability does not select or activate it. Active schema-version-3-or-newer
adapters must declare their required skill explicitly.

1. Validate the registry.
2. List dependency-eligible nodes.
3. Generate a prompt for inspection or a JSON launch spec for task creation.
   The contract lists ordered `requiredSkills`: `project-orchestration`, the
   active adapter skill, `goal-graph-loop` when the node is governed by the
   goal graph protocol, then node-specific skills. Refuse materialization when
   any required project-local skill is missing; resolve fleet-managed skills
   through their authoritative distribution without requiring repository copies.
4. Let the active client verify current authority, then atomically reserve the node before calling its native task API. The reservation compares the launch spec's revision and status, target node task identity/trust/full authority including approval gates, parent state/task ID/trust/full authority including approval gates, capacity preconditions, and the canonical SHA-256 materialized-work-contract hash. That hash covers scope, budgets, title, objective, work reference and kind, governing protocols, ordered required skills, completion profile, dependencies, trust, authority, and the immediate-parent launch envelope; the contract-derived launch key is the durable idempotency key. On success the reservation records the key and hash and advances the revision.
5. If reservation fails, do not call the task API; re-read the registry and generate a new spec. Pending reservations consume capacity and make duplicate launches fail before side effects.
6. Configure a complete logical Boss, including its eventual delegation authority and budgets, before any materialization; the empty inactive scaffold is intentionally not launchable. Materialize the Boss first when root materialization is required. With schema-v5 optional root materialization, a logical Manager may activate the instance first without pretending a Boss task exists. Immediately before create and again at bind, compare the current instance to the reservation's complete validity contract. Canonical authority envelopes stable-sort and deduplicate reads, writes, external actions, approval gates, and stop conditions before hashing or snapshot comparison. Any changed revision, status, materialized work contract, target or parent trust/authority/gate, capacity, or applicable task identity invalidates it. Use the `launchKey` as the external task API idempotency and reconciliation key, then bind only with the still-matching reservation. A configured external Ed25519 attestor must sign the binding payload; keep its public-key trust anchor outside the selected named private orchestration instance and provide it at validation time. Record the signed `taskBinding` metadata (launch key, canonical contract hash, node/task/parent identity, and bind revision/time). Task-bound children record the immutable parent task ID; logical Managers record null. When an optional Boss becomes an active managing task, the same bind/reconcile CAS appends an ownership-handoff observation to every active logical Manager. Set working state and next action, clear the reservation, and advance the revision. Validation recomputes every bound contract and parentage and verifies the attestation; change it only through explicit supersession/replan.
7. If an unrelated valid registry update advances the revision after create but before bind, reconcile the external task by `launchKey` and atomically rebind it against the latest revision. The rebind must prove the reservation identity and re-check active status, dependencies, the open replan-directive boundary, materialized-work-contract hash, target task identity/trust/full authority including approval gates, and the complete current parent-to-child authority inheritance predicate: parent task/managing-state/delegation, trust ceiling, read/write/external-action subsets, inherited approval gates, delegated budget, and capacity. It never creates another task. Any revoked target or parent authority, open replan boundary, changed contract, invalid prerequisite, or identity mismatch keeps the reservation quarantined for explicit cancel or replan.
8. On a timeout, crash, ambiguous create, or failed bind, keep the reservation and reconcile the external task by `launchKey`; release and retry only after proving no task exists for that key.
9. On every control check, compare the node's evidence fingerprint. Increment
   unchanged or same-failure counters when evidence and preconditions have not
   changed; never reset them merely because a process is still attached. Bind
   each failure to the precondition fingerprint observed with it. A changed
   current precondition permits a materially different attempt only after the
   same-failure counter is reset. Append the complete observation receipt with
   a registry-revision and prior-receipt-hash CAS; never replace or truncate
   the existing receipt chain.
10. At budget exhaustion, block and return control to the immediate parent.
    Resume only after the parent records the changed precondition that makes a
    new attempt materially different.
11. Before recovering a shared runtime, preserve per-run evidence and create a
    private recovery receipt containing the canonical active run/head set,
    preservation evidence, and its fingerprint. Record a second canonical
    snapshot immediately before the action. A matching comparison authorizes
    action only after an adapter atomically changes the persisted receipt from
    `prepared` to the exclusive `started` claim with `actionStartedAt` no
    earlier than that comparison and inside the configured freshness window.
    Derive the immutable claim key from the action, pre-action active-set
    fingerprint, and canonical recovery-precondition fingerprint. Claim keys
    are ledger-unique, and the ledger may contain only one `prepared` or
    `started` claim at a time. A second starter must lose the registry CAS and
    perform no side effect. `started` records a portable claim owner and an
    immutable bounded lease. Append every state change to the receipt's
    hash-linked transition ledger; only `prepared` → `started` →
    `completed|failed` or `prepared` → `aborted` is valid, and the latest
    snapshot must match the ledger tip. An expired claim is an
    owner-action requirement:
    reconcile that same receipt to `completed` or evidence-backed `failed`
    before creating another claim. Only the actor holding `started` may record
    those terminal states. A failed claim key cannot be retried under a new
    receipt ID; a new attempt requires a changed active set or canonical
    recovery precondition. A future, stale, or changed comparison records
    `abort-and-replan`; it cannot be relabeled completed after the freshness
    window.
    Adapters and repository facades fail closed without that receipt. Treat
    unknown shutdown or resume behavior as non-preserving.
12. Require the child to report to its immediate parent and the parent to reconcile evidence.
13. In hybrid mode, surface open owner directives in the target prompt and require the immediate parent to reconcile contract-relevant outcomes. The Boss observes the portfolio; it does not become a mandatory relay for owner conversation.

Adapters may translate the launch contract into Codex tasks, Claude Code agents, Gemini CLI workers, another client, or copy-ready prompts. Adapter code may contain invocation details; it must not fork the shared role, trust, lifecycle, or authority model.

Launch callbacks carry the safe operator/instance selector used to resolve the
writable private state. A display label is not a filesystem path. Adapters must
resolve the selector through the same CLI storage contract and must not invent
a tracked fallback when Git topology or local metadata is damaged.

For a dependency-light Codex app implementation, read
`references/codex-native-firstmate.md`. It maps the Boss to a persistent
Firstmate-profile task, Managers to persistent workstream tasks, durable Workers
to managed-worktree tasks, and bounded read-heavy helpers to transient
subagents. The mapping does not add a role or weaken the reservation, binding,
immediate-parent, completion, or landed-work contracts above.

## Adversarial Failure Modes

Reject designs that:

- put the universal hierarchy inside a software-only goal-graph protocol
- use a Boss title as implicit permission to create tasks, write files, message people, deploy, or cross project boundaries
- count queued graph nodes as live tasks
- allow task creation before dependencies or the binding mode's required parent identity exists
- treat cancelled or superseded prerequisites as completed work instead of replanning them to a completed replacement
- allow dependencies between an ancestor and descendant or cycles composed from parent and dependency links
- allow children to exceed parent trust, capability scope, child budget, or depth budget
- let a child drop an inherited approval gate
- bind a task without immutable task-binding metadata, bind a task-bound child without its immutable immediate `parentTaskId`, give a logical Manager a native parent-task claim, mutate a bound contract in place, or replace a parent task while task-bound children still reference it
- permit task-backed nodes while the registry is inactive
- let a ready-for-parent or terminal parent retain non-terminal children
- create a task before a matching compare-and-set reservation succeeds
- create a task without an immediate current-state reservation check or retry an indeterminate task creation without reconciling its launch key
- treat an open PR, draft artifact, or agent assertion as universal completion
- create a second lifecycle vocabulary in each domain protocol
- hide task creation or external writes behind a status, validation, prompt, or help command
- bind durable project semantics to one agent vendor's task API
- promote trust globally from narrow evidence
- let Managers silently absorb Worker implementation or Workers bypass their immediate parent for routine updates
- treat a direct owner message as implicit authority, omit a contract-relevant owner directive from the registry, or mark one terminal without resolution and parent-observation evidence
- let a Boss directly operate every goal graph, leave a graph without exactly one Manager owner, or create replacement Workers merely because previous task context is unavailable
- count quiet process activity, heartbeats, repeated log lines, or unchanged
  status output as progress
- repeat the same failed action after its retry budget is exhausted without a
  changed precondition
- force-recover a shared runtime without preserving each active run and
  comparing the exact active set immediately before the action
- generate a launch contract without ordered required skills or materialize it
  while a required project-local skill is missing

## Activation And Tests

Keep the module inactive with a valid empty registry by default. Activate it only after scope, owner, Boss, trust policy, authority envelopes, budgets, completion profiles, and client adapter behavior are configured.

Focused tests should cover:

- valid inactive scaffold
- non-ticket work kinds and non-PR completion profiles
- exact titles and parent links
- dependency eligibility
- completed-only dependency resolution and exact completion-evidence matching
- prompt and JSON launch contract output
- duplicate Boss, parent cycles, dependency cycles, and parent/dependency cycles
- lifecycle-specific missing evidence
- trust promotion without evidence
- malformed or self-asserted trust approval
- role-based authority escalation attempts
- child scope and budget escalation
- active-node, active-child, and delegation-depth overruns
- terminal disposition and terminal-parent reconciliation
- inherited approval-gate enforcement, inactive task rejection, and ready-parent reconciliation
- deterministic stale-spec, authority-revocation, reservation, duplicate-launch, crash-reconciliation, and reserved-capacity behavior
- configured progress observations, unchanged-check exhaustion, same-failure
  retry exhaustion, event-vs-scheduled wakeups, and shared-runtime recovery
  compare requirements
