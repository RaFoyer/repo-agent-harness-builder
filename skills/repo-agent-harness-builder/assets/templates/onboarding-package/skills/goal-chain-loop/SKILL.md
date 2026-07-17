---
name: goal-chain-loop
description: Use when a user wants to orchestrate ticket-backed implementation goals, design a goal graph or goal chain, split work into parallel Codex threads, manage an orchestration thread, assign subgoal threads, enforce PR/merge/verification handoffs, or mentions goal chain, goal loop, goal graph, orchestration thread, subgoal thread, ticket-backed goals, implementation chain, or agent handoff.
---

# Goal Chain Loop

## Overview

Use this skill to turn product or engineering work into a bounded graph of ticket-backed goals. It defines the `repository-merge` execution and evidence profile: fan out only independent work, track base/branch/PR/verification state, fan results back in through verified merges, and start dependent work only from current shared state. When `AGENT-ORCHESTRATION.md` and `ops/orchestration.json` exist, they own Boss/Manager/Worker roles, titles, parentage, lifecycle, trust, authority, and delegation budgets.

## Route The Request

- **Create or repair a graph:** read the tracker, existing roadmap/status docs, and `references/goal-chain-protocol.md`; then produce or update the durable implementation graph.
- **Specialize a Boss task for goal-chain work:** start from the registry launch spec, then add `assets/orchestrator-thread-prompt.txt` for dependency graphing, repository state, fan-out/fan-in, and merge evidence.
- **Specialize a Manager task for goal-chain work:** start from the registry launch spec, then add `assets/manager-thread-prompt.txt` for one ticket-backed workstream and its Worker graph.
- **Plan orchestration:** use `assets/orchestration-ledger-template.md` to record graph nodes, dependencies, thread IDs, model/effort recommendations, bases, status, PRs, verification, and blockers.
- **Start a subgoal thread:** use `assets/subgoal-thread-prompt.txt`; fill it with repository path, base branch or merge commit, issue references, write boundaries, dependency contracts, verification commands, and the expected first plan.
- **Close or hand off a goal:** use `assets/handoff-template.md`; do not call the goal complete without merged PR/commit evidence, issue links, verification evidence, residual risks, and dependent-node unlocks.
- **Audit an existing graph:** check for stale bases, unsafe parallelism, missing issue evidence, missing acceptance criteria, weak verification, over-clustered or under-clustered goals, foundation work treated as product acceptance, or dependent threads queued before merge evidence exists.
- **Recommend skill vs plugin packaging:** default to a standalone skill for reusable workflow guidance and templates. Recommend a plugin only when the user needs marketplace packaging, companion MCP/app config, hooks, or share/install metadata.

## Graph Invariants

Preserve these rules unless the scoped project instructions explicitly say otherwise:

- The canonical tracker owns scope, acceptance criteria, and issue/PR evidence.
- When project orchestration is active, the registry owns roles and parentage; this skill adds ticket, branch, merge, and verification requirements without expanding authority.
- The goal-chain evidence ledger supplements rather than replaces `ops/orchestration.json`.
- Each subgoal has one objective, explicit ticket references, disjoint or named write boundaries, dependency inputs, verification expectations, and a named exit condition.
- Parallel nodes must have stable interfaces and low merge conflict risk. Shared contracts, migrations, design decisions, or overlapping files usually become a prerequisite node.
- A dependent node starts from the current integration branch only after its prerequisite PRs are merged and visible, unless the graph explicitly allows speculative work.
- A goal is not complete until the PR is merged into the integration branch, evidence is recorded, and dependent goals are either unlocked or intentionally blocked.
- Do not carry scratch assumptions between threads; durable decisions belong in docs, tracker comments, PRs, or the orchestration ledger.

## Design The Graph

When creating or repairing a graph:

1. Identify the integration branch, tracker, repo instructions, and verification gates.
2. Build a dependency graph before making a queue. Mark independent nodes, prerequisite nodes, fan-in gates, and explicitly sequential work.
3. Cluster tickets only when they share a system boundary or acceptance evidence; split work that can be reviewed, tested, or rolled back independently.
4. Define each goal with objective, issue links, write boundaries, non-goals, dependency inputs, exit criteria, verification, sequencing constraints, and handoff target.
5. Assign execution mode: orchestrator-only, parallel subgoal thread, sequential subgoal thread, or manual/approval gate.
6. Distinguish foundation completion from user acceptance for product work; add a reality-reset goal when QA proves the original graph was optimistic.
7. Use `assets/goal-graph-template.md` for the durable document shape.

## Orchestrate Threads

Use actual Codex thread tools only when the user explicitly wants durable Codex threads created or managed. Otherwise, produce the graph and copy-ready goal-chain prompt specializations. When a repo-local orchestration CLI exists, use its validated launch spec as the base prompt. For transient helper work inside one turn, prefer available subagent/delegation tools over user-owned Codex threads.

When thread tools are available, the orchestrator may create or fork worktree threads, send follow-up prompts, read thread summaries, rename/pin/archive threads, and hand off threads. Record any created thread IDs in the ledger. Keep orchestration on the strongest practical reasoning setting. Recommend model/effort by task risk, but only pass model overrides when the user explicitly requested or approved that policy.

Before each subgoal makes large edits, require a concise implementation plan naming target files, integration points, dependency assumptions, verification commands, risks, and PR exit criteria.

Use `assets/subgoal-thread-prompt.txt` for the starter prompt. Include:

- repository path
- base branch or merge commit
- issue references
- dependency inputs and blocked-by nodes
- write boundaries and non-goals
- expected first deliverable
- verification expectations
- close condition

## Close A Goal

Use `assets/handoff-template.md`. A closing note should be short and concrete: node/thread identity, merged PR, merge commit, closed or linked issues, verification commands and results, residual risks, unlocked or blocked dependent nodes, and the next orchestrator action.

## Common Repairs

- **Next goal started too early:** require merge commit evidence from the integration branch before queueing the next thread.
- **Unsafe parallelism:** insert a contract/design prerequisite, split overlapping files, or serialize the risky nodes.
- **Orchestrator lost state:** reconstruct the ledger from tracker issues, thread summaries, PRs, branches, and handoff notes before creating more work.
- **Foundation mistaken for product acceptance:** add successor validation goals with manual QA acceptance.
- **Too much thread context copied forward:** move durable decisions into docs or tracker comments, then start fresh from current shared state.
- **Over-clustered goal:** split unrelated UI, data, provider, packaging, and validation work into separately reviewable goals.
- **Under-clustered goal:** combine tickets that cannot be safely shipped or verified separately.

## Resources

- Read `references/goal-chain-protocol.md` when designing, auditing, or materially revising a graph.
- Copy from `assets/goal-graph-template.md` when creating a durable graph document.
- Copy from `assets/orchestrator-thread-prompt.txt` to specialize a Boss launch spec for repository-merge work.
- Copy from `assets/manager-thread-prompt.txt` to specialize a Manager launch spec for repository-merge work.
- Copy from `assets/orchestration-ledger-template.md` when running an orchestration thread.
- Copy from `assets/subgoal-thread-prompt.txt` when starting a new implementation thread.
- Copy from `assets/handoff-template.md` when closing a goal or queueing the next one.
