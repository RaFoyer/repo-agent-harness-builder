# Goal Implementation Graph Protocol

Use this reference when a request needs more than a short starter prompt: creating a durable goal graph or chain, running a Manager-owned goal-graph loop, deciding parallelism, grouping tracker issues, repairing a handoff, or distinguishing foundation completion from product acceptance.

## Purpose

A goal implementation graph is a dependency-aware execution plan for agent implementation work. It is a `repository-merge` profile normally owned by one Manager node defined by the general orchestration registry. The Boss owns the outer portfolio loop over Managers; each Worker owns one bounded graph node. Each goal starts from an approved base, lands one coherent unit of work, records verification evidence, merges into the integration branch, and unlocks dependent nodes from current shared state.

A goal chain is the simplest graph: every node depends on the prior node. Prefer a graph whenever some goals can safely run in parallel.

Use the pattern when:

- work depends on earlier decisions or merged code
- multiple tickets are safer as a sequence than as stale parallel branches
- independent tickets can run in parallel with disjoint write sets or stable contracts
- done means merged PR, verification, and evidence rather than only a local patch
- agents need boundaries between feature threads
- a Manager should track Worker status, dependencies, model choices, merge order, and handoffs
- the team wants reproducible AI-assisted fan-out and fan-in

Avoid it when the task is a one-off change, exploratory work should not create durable tracker state, or the project has no integration branch, tracker, or verification gate.

## Core Objects

| Object | Role |
| --- | --- |
| Canonical tracker | Owns problem statement, scope, acceptance criteria, verification evidence, and linked PR/commit state. |
| Integration branch | The shared base for each goal, usually `dev`, `main`, or `trunk`. |
| Orchestration registry | When present, owns role, title, task parentage, lifecycle, trust, authority, and delegation budgets. |
| Goal-chain Manager | Owns one bounded workstream graph, applies this repository-merge profile, runs the recurring control loop, records delivery evidence, and sequences fan-in within its orchestration authority. |
| Goal | One coherent unit of ticket-backed work with objective, boundaries, exit criteria, and verification. |
| Subgoal thread | A dedicated work session for one graph node, usually isolated in its own worktree when it edits code. |
| Dependency edge | A prerequisite relation such as "needs merged API contract," "blocks UI wiring," or "must follow migration." |
| Fan-out set | Nodes that can run in parallel from the same base without hidden coupling. |
| Fan-in gate | The integration point where completed nodes are reviewed, merged, reconciled, and used to unlock dependents. |
| Handoff | The closing record that makes dependent goals safe to start. |

## Nested Control Loops

The Boss runs the portfolio loop over Managers: observe, reconcile cross-workstream dependencies and authority, select eligible Manager actions, control portfolio fan-in and exceptions, record, and repeat. It does not directly operate every Manager graph.

Each Manager runs the goal-graph loop below for one bounded workstream. Each Worker runs a bounded node loop: observe assigned inputs, plan, execute, verify, report or hand off to the immediate parent, and repeat until terminal.

## Manager Goal-Chain Loop

1. Start from the current integration branch and tracker state.
2. Read repo instructions and protocols.
3. Inspect canonical issue movements, Git history, existing PRs, branches, task summaries, and status docs.
4. For an inherited or restarted graph, classify every old node from corroborated evidence before retaining, replacing, or relaunching it.
5. Build or update the goal graph with dependencies and fan-out sets.
6. Identify prerequisite contract/design nodes before parallel work.
7. Choose execution mode for each node: Manager-only, parallel Worker thread, sequential Worker thread, or approval/manual gate.
8. Create or prepare Worker prompts with scoped write boundaries and expected first plans.
9. Read Worker status, steer blockers, and prevent scope drift.
10. Fan in completed PRs with evidence, review, and merge sequencing.
11. Confirm issue, PR, commit, and verification evidence.
12. Update the graph ledger and unlock dependent nodes from current integration branch state.
13. Repeat until every owned node is terminal or the Manager reaches a named blocked or approval-required state.

## Codex Thread Control

When the repository has `AGENT-ORCHESTRATION.md`, use its exact registry-derived titles, immediate-parent links, lifecycle, trust, authority, and launch contract. This reference does not create a second hierarchy or status taxonomy. The goal-graph ledger records only ticket, branch, PR, merge, verification, residual-risk, and downstream-unlock evidence.

Use actual Codex thread tools only when the user explicitly wants durable user-owned threads created or managed. For short-lived helper tasks inside the current request, use available subagent/delegation tools instead of creating persistent Codex threads.

When thread tools are available, the orchestrator can:

- create a new project thread for a durable subgoal
- fork the current thread into a worktree for isolated code work
- send follow-up prompts to existing child threads
- read recent status and turn summaries without opening the thread
- list threads to reconnect lost IDs
- rename, pin, or archive threads for graph hygiene
- hand off a thread between its checkout and Codex worktree when needed

Prefer worktree-backed threads for parallel code edits. Same-directory forks are only appropriate for read-only analysis or non-overlapping file operations that the repo workflow explicitly allows.

Record every created or reused thread in the orchestration ledger:

- node ID
- thread ID and title
- repo path and base branch/commit
- execution environment
- model/effort recommendation and any approved override
- status
- blocked-by and blocks
- branch, PR, merge commit
- verification evidence
- last orchestrator read

## Model And Effort Allocation

Keep the Manager controller task on the strongest practical reasoning setting because it carries graph state, dependency risk, merge order, and cross-Worker consistency. Apply the same posture to the Boss when cross-Manager decisions are comparably risky.

For subgoals, recommend but do not silently enforce model overrides:

| Work type | Suggested model/effort posture |
| --- | --- |
| Architecture, cross-cutting contracts, migrations, security, or ambiguous product decisions | Strongest model, high reasoning, often orchestrator-reviewed before edits. |
| Normal implementation with clear tests and bounded files | Standard coding model/effort. |
| Mechanical edits, fixtures, docs, labels, or narrow test additions | Faster/lighter model if the user approved that policy. |
| Review, fan-in reconciliation, or conflict resolution | Strong model when multiple child outputs interact. |

Only pass a model override to thread tools when the user explicitly requested or approved model selection. Otherwise record the recommendation and use the environment default.

## Define The Graph

Create a durable reference such as `docs/reference/implementation-goal-graph.md`, `docs/reference/implementation-goal-chain.md`, `docs/engineering/goal-graph.md`, or a project epic description.

For each goal, define:

- goal number and title
- objective
- linked issue numbers
- scope and non-goals
- write boundaries
- dependency inputs and outputs
- exit criteria
- verification expectations
- sequencing constraints
- execution mode and parallelism
- thread/model recommendation
- fan-in and handoff target

## Decide Parallelism

Default to asking "what can run in parallel?" before writing a linear queue. Parallelism is allowed when all of these are true:

- nodes have disjoint or intentionally coordinated write sets
- contracts between nodes are stable enough to avoid hidden rewrites
- verification can run independently
- merge order is known or irrelevant
- failures in one node do not invalidate another node's implementation
- no node depends on unmerged behavior from a sibling PR

Serialize or add a prerequisite node when:

- multiple goals touch the same core files
- a schema, API, event contract, design system, or state model is unsettled
- one goal creates fixtures, mocks, or generated types needed by another
- the acceptance evidence is shared and cannot be cleanly divided
- UI and backend work would drift without a contract
- secrets, production changes, or external messages require approval

Use a fan-out/fan-in shape:

```text
Orchestrator
  -> Contract/design prerequisite
      -> Parallel node A
      -> Parallel node B
      -> Parallel node C
  -> Fan-in reconciliation
  -> Product validation
```

## Cluster Tickets

Group tickets when they share the same system boundary or acceptance evidence.

Good clusters include:

- app shell, runtime identity, and state ownership
- provider key setup, data acknowledgement, and provider readiness
- ingestion, retrieval, and citation contract
- overlay UI, source-open actions, and window behavior

Poor clusters include:

- a UI redesign plus an unrelated database migration
- multiple validation modes before the first mode works end to end
- packaging work mixed into broad product feature work

Use this test: if tickets would be unsafe or misleading when shipped separately, cluster them. If they can be reviewed, tested, and rolled back independently, split them.

## Boss Prompt Requirements

The Boss specialization should receive:

- repository path and integration branch
- tracker, epic, project, or issue list
- current graph document path if one exists
- allowed thread policy: create durable Codex threads, use subagents only, or prepare prompts only
- model/effort policy if the user wants overrides
- verification and merge rules
- approval boundaries
- desired first deliverable: Manager portfolio graph and orchestration ledger

The first Boss deliverable should not be implementation. It should identify Manager workstreams, cross-workstream dependencies, risky overlaps, authority boundaries, and the first Manager launch specs.

## Manager Prompt Requirements

The Manager specialization should receive its bounded workstream, canonical tickets, current integration base, graph and ledger paths, Worker policy, verification and merge rules, authority boundaries, and desired first Worker plans. It owns the detailed dependency graph and first Worker prompts.

## Subgoal Prompt Requirements

A goal-start prompt should include:

- goal number and title
- one-sentence objective
- repository path
- base branch or commit
- issue references
- blocked-by nodes and sibling nodes
- write boundaries
- dependency contract
- initial protocol
- work boundaries and non-goals
- expected first deliverable
- verification expectations
- close condition

The expected first deliverable for substantial goals is a concise implementation plan naming files, integration points, verification commands, risks, and PR exit criteria.

## Branch Rules

- Start from the current integration branch.
- Name the branch after the ticket or goal when the repo has no stricter convention.
- Do not start from an old feature branch unless the graph explicitly says so.
- Do not mix unrelated tickets.
- Do not rewrite or revert user work unless explicitly asked.
- For parallel nodes, use separate worktrees or equivalent isolation.
- Before fan-in, rebase or refresh against current integration branch only when the repo workflow allows it.

## Verification Evidence

Select commands from the project, but keep the categories stable:

- preflight or environment check
- tracker reconciliation when available
- unit tests for touched code
- build or compile check
- lint, format, or precommit
- focused manual QA for UI or behavior changes

If a command cannot run locally, record why and name the fallback evidence.

## PR Evidence

A useful PR body records:

- what changed and why
- branch and issue links
- type of change
- test commands and results
- data, security, migration, and deployment notes when relevant
- known residual risk

Do not only say tests pass; include enough evidence for a reviewer to understand the confidence level.

## Fan-In And Merge Order

Default rule: a node is complete when its PR is merged into the integration branch and the merge commit is visible from current shared state.

Dependent nodes should not begin from an open PR unless the graph explicitly permits speculative work. This prevents a new agent from building on assumptions that are not yet part of the shared branch.

The Manager handles workstream fan-in; the Boss handles fan-in across Managers:

- read child thread status and PR evidence
- check sibling overlap and merge conflicts
- choose merge order
- request fixes or rebase/refresh when needed
- update the ledger after each merge
- start dependent nodes from the new integration branch state

## Product Readiness

For product work, distinguish foundation completion from user acceptance.

Foundation completion means services, models, tests, fixtures, or packaging mechanics exist.

User acceptance means the visible product path works, a user can complete the workflow without hidden tools, manual QA proves realistic behavior, degraded states are understandable, and docs/tracker state match reality.

Do not close validation goals merely because supporting pieces exist.

## Reality Reset

When QA proves the original graph was too optimistic, add a reality-reset goal:

- preserve historical truth about what landed
- add successor issues for product acceptance
- update roadmap and chain docs
- link old issues to successors
- keep the next thread from starting on false assumptions

In a parallel graph, a reality reset may invalidate multiple queued nodes. The Manager should mark affected nodes blocked or superseded instead of letting Workers continue from false assumptions, and escalate cross-workstream effects to the Boss.

## Ticket Design

A strong ticket has:

- problem statement
- scope
- acceptance criteria
- out-of-scope section
- dependencies
- verification expectations
- security/privacy notes when relevant

Avoid tickets that only say "implement feature," "make UI better," "wire things up," or "improve quality" without observable acceptance criteria.

## Support Protocols

Goal graphs work best when agents can quickly find protocols for:

- branch workflow
- project tracking
- precommit and local checks
- secrets handling
- document lifecycle
- branch promotion

Useful repo-local CLI commands include:

```bash
./project preflight
./project tracker inventory
./project tracker reconcile --dry-run
./project precommit
./project goals status
./project goals next
./project goals verify <goal-id>
```

## Failure Modes

| Failure | Repair |
| --- | --- |
| Next goal starts from an unmerged feature branch | Require merge commit evidence before queueing the next thread. |
| Manager creates a linear queue without checking parallelism | Rebuild as a graph with dependency edges, fan-out sets, and fan-in gates. |
| Parallel threads touch the same files or unstable contract | Add a prerequisite contract node or serialize those goals. |
| Manager loses Worker state | Reconstruct the ledger from ticket movements, Git/PR history, thread summaries, branches, and handoff notes before creating replacements. |
| Boss directly operates every goal graph | Assign one bounded graph to each Manager and keep the Boss on the outer portfolio loop. |
| Child thread runs on an unapproved lighter model for risky work | Escalate to stronger review or rerun the critical design/review step. |
| Foundation work is closed as product validation | Add successor validation goals with manual QA acceptance. |
| Scratch context leaks between threads | Move durable decisions into docs or tracker comments, then start fresh from shared state. |
| One goal spans unrelated UI, data, provider, packaging, and validation work | Split into smaller reviewable goals. |
| Related tickets land separately and cause repeated rewrites | Cluster tickets that share the same surface or acceptance evidence. |
| UI-heavy goals lack a design baseline | Create a canonical design or UX reference before implementation goals. |
