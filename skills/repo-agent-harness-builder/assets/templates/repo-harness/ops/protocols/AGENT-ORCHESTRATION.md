---
protocol_id: AGENT-ORCHESTRATION
title: Agent Orchestration
status: inactive
version: 0.1.0
owner: repo-maintainers
last_reviewed: YYYY-MM-DD
summary: Defines project-wide Boss, Manager, and Worker coordination with explicit trust, authority, state, and evidence boundaries.
related_protocols:
  - AUTOMATIONS
  - CLI-INTERFACE
  - GOAL-CHAIN
  - PROJECT-TRACKING
---

# Agent Orchestration

## Purpose

Provide one agent-agnostic control plane for structured work across the whole project. The hierarchy applies to engineering, research, documentation, operations, planning, QA, and other work; ticket-backed goal chains are one execution profile, not the owner of the hierarchy.

## Source Of Truth

- `ops/orchestration.json` owns the configured scope, hierarchy, task parentage, trust levels, authority envelopes, dependencies, budgets, and current states.
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

Every node records:

- `workRef`: a stable project-local identifier; a tracker ticket is recommended when one exists, but is not required
- `workKind`: an extensible lowercase slug such as `engineering`, `research`, `documentation`, `design`, `qa`, `operations`, `planning`, `decision`, or `governance`
- `governingProtocols`: the orchestration protocol plus the domain rules that define permitted actions and acceptable evidence
- `completionProfile`: the evidence shape that makes the node terminal

This keeps the control plane universal without pretending that all work is software delivery.

## Role Taxonomy

Boss:

- one logical Boss per repository or project
- owns portfolio health, dependency graph, Manager boundaries, escalation, and fan-in order
- does not absorb implementation that belongs to a Manager or Worker

Manager:

- owns one bounded workstream and its child graph
- creates or activates Workers only when its trust level and authority envelope permit delegation
- reviews Worker evidence, manages fan-in, and escalates decisions, external blockers, scope collisions, and integration gates

Worker:

- owns one bounded, independently verifiable outcome
- reports to its immediate parent
- may create a child Worker only when delegation is authorized and contracts and write sets are safely independent

## Title Grammar

`<WORK-REF>` is a stable project reference such as `#123`, `INT-936`, `G2`, `DOCS-4`, or `OPS-7`. Ticket-backed projects should use the canonical ticket reference.

- `<PREFIX> - Boss`
- `<PREFIX> - Manager - <WORK-REF> <workstream or area>`
- `<PREFIX> - Worker for Boss - <WORK-REF> <bounded responsibility>`
- `<PREFIX> - Worker for Manager <PARENT-WORK-REF> - <WORK-REF> <bounded responsibility>`
- `<PREFIX> - Worker for Worker <PARENT-WORK-REF> - <WORK-REF> <bounded responsibility>`

Every task-backed node records its task ID and immediate parent task ID in `ops/orchestration.json`. Titles make the hierarchy visible; parent IDs make it durable.

## Trust Ladder

| Level | Name | Maximum default authority |
| --- | --- | --- |
| T0 | Observe | Read approved context and report; no writes or delegation |
| T1 | Propose | Produce plans, graphs, drafts, and prompts; no project-state mutation |
| T2 | Execute | Make bounded reversible local changes and run approved verification |
| T3 | Integrate | Use approved branches, PRs, tracker transitions, and child-task delegation under gates |
| T4 | Operate | Perform explicitly allowlisted external writes, deployments, or schedules with rollback and audit evidence |
| T5 | Govern | Run a bounded portfolio control loop, delegate within budgets, reconcile evidence, and escalate exceptions |

Trust only limits maximum authority. Each node also needs an authority envelope naming allowed reads, writes, external actions, approval gates, delegation permission, child budget, and stop conditions. Scope entries are named capability identifiers, not implicit filesystem prefix grants. Children may not exceed the parent trust level, named authority scope, or child budget. Project policy also caps total active nodes and delegation depth. Promotion above the default requires a structured `trustApproval` with approver, timestamp, and evidence; a free-form self-assertion is insufficient. Demotion or revocation may be immediate.

## Lifecycle Rules

- `queued`: graph node exists but is not yet dependency-eligible and has no live task.
- `eligible`: dependencies are satisfied and the parent may activate it.
- `working`: live task with a concrete `nextAction`.
- `waiting`: live task waiting on a named active child or internal dependency.
- `blocked`: live task needs a named decision, approval, authentication repair, external artifact, or system repair, plus an exact `unblockAction`.
- `ready-for-parent`: outcome is complete and evidence is ready for parent review or fan-in.
- `terminal`: the node has a recorded `completed`, `cancelled`, or `superseded` disposition, evidence is reconciled, and the node has no remaining responsibility.

Only `working`, `waiting`, `blocked`, `ready-for-parent`, and `terminal` are task-backed states. The first four are active. `queued` and `eligible` are graph states and must not pretend a task exists. Archive is metadata on a terminal node, not a substitute for disposition and evidence.

## Completion Profiles

Every non-Boss node declares one completion profile:

- `repository-merge`: merged change plus configured verification evidence
- `artifact`: approved document, analysis, design, media, or other durable artifact
- `external-operation`: verified external-system result plus rollback or reconciliation evidence
- `human-decision`: recorded human decision and downstream disposition
- `custom`: project-defined evidence named by the governing domain protocol

The profile determines terminal evidence. A PR is not a universal definition of done.

## Required Sequence

1. Configure the project prefix, trust policy, and inactive registry.
2. Define the Boss at an explicit trust level and authority envelope.
3. Map portfolios, workstreams, dependencies, completion profiles, and approval gates before creating live tasks.
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

## Client Adapter Handshake

The repository harness is agent-agnostic, so task creation belongs to a thin client adapter:

1. Run `orchestration validate`, then select a node from `orchestration next`.
2. Run `orchestration launch-spec <node-id>`.
3. The active client verifies that the current user request or recorded scope grant authorizes task creation.
4. The client creates the task with the exact title, prompt, and immediate parent from the launch spec.
5. Follow the callback contract: insert the configured Boss node when bootstrapping an empty registry, or update the existing node; record the returned task ID, set `state` to `working`, and add `nextAction` before implementation proceeds.
6. The child reports to its immediate parent; the parent reconciles state and evidence in the registry.

This adapter boundary makes worker launch easy without hiding external writes inside the repo CLI or binding the protocol to Codex, Claude Code, Gemini CLI, Cursor, or another client.

## Guardrails

- Role and trust are orthogonal; never infer authority from a title.
- A child may not exceed its parent trust level, authority scope, or delegated budget.
- Do not fan out overlapping write sets or unstable contracts.
- Do not create a task from a launch spec whose parent task is missing or whose dependencies are unsatisfied.
- Do not let Managers silently become Workers.
- Do not let a Worker report around its parent except for material safety risk.
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
- Terminal nodes contain a disposition and evidence required by their completion profile; terminal parents have no non-terminal children.

## Update Rules

When this protocol changes, update `ops/orchestration.json`, `AGENTS-TOC.md`, `ops/HARNESS-CHECKLIST.md`, CLI help and tests, orchestration templates, and composing domain protocols such as `GOAL-CHAIN.md`.
