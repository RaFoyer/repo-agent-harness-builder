# Project Orchestration

## Purpose

Use this reference when adding structured delegation and progressive autonomy to a repository, project folder, program, or personal-folder harness. The orchestration layer is a control plane for any work domain. Goal chains, research, documentation, operations, design, QA, decisions, and artifact production plug into it through governing protocols and completion profiles.

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

## Scope Model

One `ops/orchestration.json` governs one explicit scope. Record:

- scope ID
- scope kind: repository, project, program, personal-folder, or custom
- stable root reference
- single-line objective

“One Boss” means one logical Boss per configured scope. It does not grant authority over other repositories, projects, tasks, accounts, or systems that happen to be visible.

## Node Contract

Every node should declare:

- stable node ID and work reference
- role and immediate parent node
- extensible `workKind` slug
- governing protocol IDs
- exact registry-derived title
- dependency node IDs
- lifecycle state and its required control fields
- trust level and promotion evidence when above the default
- authority envelope
- completion profile and required evidence
- task ID only after the client materializes the graph node as a task

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

Project policy also caps active nodes and delegation depth. Child trust, named scopes, and child budgets must be subsets of the parent envelope. Use stable capability IDs; do not treat a broad path prefix or role label as an implicit grant.

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

1. Validate the registry.
2. List dependency-eligible nodes.
3. Generate a prompt for inspection or a JSON launch spec for task creation.
4. Let the active client verify current authority and call its native task API.
5. Follow the callback mode: insert the configured Boss when bootstrapping an empty registry, or update the existing node; record the returned task ID, working state, and next action.
6. Require the child to report to its immediate parent and the parent to reconcile evidence.

Adapters may translate the launch contract into Codex tasks, Claude Code agents, Gemini CLI workers, another client, or copy-ready prompts. Adapter code may contain invocation details; it must not fork the shared role, trust, lifecycle, or authority model.

## Adversarial Failure Modes

Reject designs that:

- put the universal hierarchy inside a software-only goal-chain protocol
- use a Boss title as implicit permission to create tasks, write files, message people, deploy, or cross project boundaries
- count queued graph nodes as live tasks
- allow task creation before dependencies or parent task identity exist
- treat cancelled or superseded prerequisites as completed work instead of replanning them to a completed replacement
- allow dependencies between an ancestor and descendant or cycles composed from parent and dependency links
- allow children to exceed parent trust, capability scope, child budget, or depth budget
- let a terminal parent retain non-terminal children
- treat an open PR, draft artifact, or agent assertion as universal completion
- create a second lifecycle vocabulary in each domain protocol
- hide task creation or external writes behind a status, validation, prompt, or help command
- bind durable project semantics to one agent vendor's task API
- promote trust globally from narrow evidence
- let Managers silently absorb Worker implementation or Workers bypass their immediate parent for routine updates

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
- duplicate task launch prevention
