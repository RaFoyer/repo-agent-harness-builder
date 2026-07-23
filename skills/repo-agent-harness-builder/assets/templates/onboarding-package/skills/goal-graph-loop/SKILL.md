---
name: goal-graph-loop
description: Use when a Manager must create, operate, audit, or repair a tracker-backed dependency graph of repository work with bounded Worker nodes, safe fan-out, explicit fan-in, PR and merge evidence, downstream unlocks, and a recurring control loop. A strict goal chain is supported as a linear graph topology.
---

# Goal Graph Loop

## Boundary

This is a domain control loop for ticket-backed `repository-merge` work. Load
`$project-orchestration` first whenever tasks are delegated. If the validated
launch contract selects Codex Native Firstmate, load `$codex-native-firstmate`
after the portable skill and before this skill.

`ops/protocols/AGENT-ORCHESTRATION.md` and the selected named private
orchestration instance own role, parentage, lifecycle, trust, authority,
budgets, reservations, and bindings. The tracked orchestration example does
not contain live graph state.
`ops/protocols/GOAL-GRAPH.md` owns dependency topology, delivery evidence, and
fan-in. Read `references/goal-graph-protocol.md` when the repo-local protocol is
absent or the workflow itself is changing.

## Fit

Use this loop when work has a canonical tracker, integration branch, explicit
verification, and dependencies between landed outcomes. Model a strict chain
only when every node genuinely depends on the previous one. Prefer a DAG when
disjoint nodes can run safely in parallel. Use a simpler one-shot workflow for
isolated or exploratory work without durable tracker and integration gates.

## Manager Control Loop

1. Observe tracker movements, integration history, PRs, orchestration state,
   Worker reports, and the delivery ledger.
2. Reconcile inherited nodes against current evidence before retaining,
   replacing, or relaunching them.
3. Build or revise the DAG, including dependency edges, write boundaries,
   verification, completion evidence, and fan-in gates.
4. Select dependency-eligible nodes. Launch only bounded Workers whose work can
   be independently verified and whose authority fits the parent envelope.
5. Monitor Workers through their immediate parent relationship. Review scope,
   verification, conflicts, PR status, and residual risks.
   Compare evidence fingerprints rather than treating heartbeats, attached
   processes, or repeated status as progress. Stop and block at the configured
   unchanged or same-failure budget; retry only after a precondition changes.
6. Fan in from the current integration branch. Record the merged PR, reachable
   merge or squash commit, issue disposition, positive verification, risks, and
   downstream unlocks.
7. Classify blocked or abandoned nodes explicitly as completed, cancelled, or
   superseded before the Manager becomes terminal.
8. Repeat until every owned node is terminal and the Manager handoff evidence
   is accepted by its parent.

The Boss owns the outer portfolio loop across Managers. Workers own bounded
node loops. Neither should absorb the Manager's graph-control responsibility.

## Graph Rules

- Every graph has exactly one Manager owner.
- Dependency and parent edges must be acyclic together.
- Start new implementation nodes from current integration state unless an
  explicit speculative-work contract says otherwise.
- Parallel nodes need disjoint writes or a stable shared contract, independent
  verification, and a declared fan-in order.
- A dependency is satisfied only by the configured terminal disposition and
  exact evidence; an open PR or agent assertion is insufficient.
- Missing task history is not evidence of missing work. Reconcile tracker and
  Git/PR state before creating a replacement Worker.
- No Mistakes is a repository-merge gate only when initialized and required by
  the repository; it does not replace local verification or merge evidence.

## Assets

- `assets/goal-graph-template.md`: primary DAG plan.
- `assets/goal-chain-template.md`: linear topology for genuinely sequential work.
- `assets/orchestration-ledger-template.md`: delivery evidence supplement.
- `assets/manager-thread-prompt.txt`: Manager loop overlay.
- `assets/subgoal-thread-prompt.txt`: bounded Worker overlay.
- `assets/orchestrator-thread-prompt.txt`: Boss portfolio handoff overlay.
- `assets/goal-start-prompt.txt` and `assets/handoff-template.md`: bounded start
  and downstream handoff material.

Use repository CLI `goals status`, `goals verify <id>`, and
`goals start-prompt <id>` for local evidence inspection. These commands do not
create tasks, merge, update trackers, or broaden authority.
