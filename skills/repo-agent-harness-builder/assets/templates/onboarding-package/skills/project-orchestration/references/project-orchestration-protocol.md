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

One `ops/orchestration.json` governs one explicit scope. Record:

- a non-negative monotonic registry revision
- scope ID
- scope kind: repository, project, program, personal-folder, or custom
- stable root reference
- single-line objective

“One Boss” means one logical Boss per configured scope. It does not grant authority over other repositories, projects, tasks, accounts, or systems that happen to be visible.

Schema version 4 adds an explicit `coordinationMode`, a stable
`scope.ownerRef`, and governed `ownerDirectives`:

- `managed` keeps all durable coordination on the resident hierarchy.
- `hybrid` preserves that hierarchy while allowing the configured project owner
  to talk directly to Managers and Workers. Direct conversation does not
  reparent a node, replace its immediate-parent reporting duty, or expand its
  trust, authority, gates, budget, or completion contract.

Do not record ordinary conversation merely because it was direct. Record an
owner directive when the instruction must survive task history or affects
durable execution. Each record binds the owner, target node, immutable parent,
task/tracker reference, registry revision, current work-contract hash, impact,
and reconciliation state. `within-contract` instructions may proceed inside the
existing envelope. `replan-required` instructions stop at the current boundary
until explicit replan or supersession. A terminal directive requires resolution
evidence and immediate-parent observation, except when the Boss itself is the
target.

For a repository harness, default to the repository itself as the complete
scope: its own registry, one resident Boss capability, and repo-local Managers
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
- task ID only after the client materializes the graph node as a task, plus Ed25519-attested immutable `taskBinding` metadata (launch key, canonical contract hash, node/task/parent identity, and bind revision/time) and an immutable `parentTaskId` for every task-backed non-Boss node; Boss nodes have no bound `parentTaskId` and null binding parent metadata

Schema version 3 includes the ordered required-skill composition in new work-
contract hashes. Schema version 4 additionally seals coordination mode and
owner identity into new contracts and validates owner directives without
making chat messages a permission source. Versions 2 and 3 remain readable for
existing externally attested bindings; migrate deliberately rather than
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

The repo CLI remains read-only and agent-agnostic:

The inactive scaffold may keep `clientAdapter` null. A configured adapter
record names its client ID, profile, status, project-local required skill, and whether a standing task-
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
   any required project-local skill is missing.
4. Let the active client verify current authority, then atomically reserve the node before calling its native task API. The reservation compares the launch spec's revision and status, target node task identity/trust/full authority including approval gates, parent state/task ID/trust/full authority including approval gates, capacity preconditions, and the canonical SHA-256 materialized-work-contract hash. That hash covers scope, budgets, title, objective, work reference and kind, governing protocols, ordered required skills, completion profile, dependencies, trust, authority, and the immediate-parent launch envelope; the contract-derived launch key is the durable idempotency key. On success the reservation records the key and hash and advances the revision.
5. If reservation fails, do not call the task API; re-read the registry and generate a new spec. Pending reservations consume capacity and make duplicate launches fail before side effects.
6. Configure a complete Boss, including its eventual delegation authority and budgets, before bootstrapping it; the empty inactive scaffold is intentionally not launchable. Immediately before create and again at bind, compare the current registry to the reservation's complete validity contract. Canonical authority envelopes stable-sort and deduplicate reads, writes, external actions, approval gates, and stop conditions before hashing or snapshot comparison. Any changed revision, status, materialized work contract, target or parent trust/authority/gate, capacity, or task identity invalidates it. Use the `launchKey` as the external task API idempotency and reconciliation key, then bind only with the still-matching reservation. A configured external Ed25519 attestor must sign the binding payload; keep its public-key trust anchor outside `ops/orchestration.json` and provide it at validation time. Record the signed `taskBinding` metadata (launch key, canonical contract hash, node/task/parent identity, and bind revision/time) and the immutable parent task ID for a non-Boss child, set working state and next action, clear the reservation, and advance the revision. Validation recomputes every bound contract and parentage and verifies the attestation; change it only through explicit supersession/replan. Boss bootstrap reservation also activates the registry.
7. If an unrelated valid registry update advances the revision after create but before bind, reconcile the external task by `launchKey` and atomically rebind it against the latest revision. The rebind must prove the reservation identity and re-check active status, dependencies, materialized-work-contract hash, target task identity/trust/full authority including approval gates, and the complete current parent-to-child authority inheritance predicate: parent task/managing-state/delegation, trust ceiling, read/write/external-action subsets, inherited approval gates, delegated budget, and capacity. It never creates another task. Any revoked target or parent authority, changed contract, invalid prerequisite, or identity mismatch keeps the reservation quarantined for explicit cancel or replan.
8. On a timeout, crash, ambiguous create, or failed bind, keep the reservation and reconcile the external task by `launchKey`; release and retry only after proving no task exists for that key.
9. Require the child to report to its immediate parent and the parent to reconcile evidence.
10. In hybrid mode, surface open owner directives in the target prompt and require the immediate parent to reconcile contract-relevant outcomes. The Boss observes the portfolio; it does not become a mandatory relay for owner conversation.

Adapters may translate the launch contract into Codex tasks, Claude Code agents, Gemini CLI workers, another client, or copy-ready prompts. Adapter code may contain invocation details; it must not fork the shared role, trust, lifecycle, or authority model.

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
- allow task creation before dependencies or parent task identity exist
- treat cancelled or superseded prerequisites as completed work instead of replanning them to a completed replacement
- allow dependencies between an ancestor and descendant or cycles composed from parent and dependency links
- allow children to exceed parent trust, capability scope, child budget, or depth budget
- let a child drop an inherited approval gate
- bind a task without immutable task-binding metadata, bind a child without its immutable immediate `parentTaskId`, mutate a bound contract in place, or replace a parent task while bound children still reference it
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
