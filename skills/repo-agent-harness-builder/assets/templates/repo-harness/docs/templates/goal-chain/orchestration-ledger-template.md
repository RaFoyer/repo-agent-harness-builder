# Goal Chain Evidence Ledger

`ops/orchestration.json` is authoritative for role, task parentage, lifecycle, trust, authority, dependencies, and delegation budgets. This ledger supplements it with repository-merge evidence.

## Graph State

Integration branch:

Current integration commit:

Tracker:

Graph doc:

Orchestration registry:

Last reconciled:

## Thread Policy

Durable Codex threads:

Subagents for transient work:

Model override policy:

Approval gates:

Delivery status vocabulary:
- planned
- branch-active
- pr-open
- merged
- verified
- reconciled
- superseded

Lifecycle state remains in `ops/orchestration.json`; do not infer it from delivery status.

## Nodes

| Goal | Orchestration node | Delivery status | Task | Env | Base | Model/effort | Blocked by | Blocks | Branch | PR | Merge commit | Verification | Last read |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| G1 | <node id> | planned | <task id> | worktree | <branch@sha> | <recommendation> | none | G2, G3 | <branch> | <pr> | <sha> | <evidence> | <time> |

## Fan-Out Sets

| Set | Nodes | Shared prerequisite | Parallelism reason | Fan-in gate |
| --- | --- | --- | --- | --- |
| F1 | G2, G3 | G1 | disjoint write boundaries | G4 |

## Decisions

- <date/time>: <decision, evidence, and affected nodes>

## Blockers

- <node>: <blocker, owner, next check>

## Fan-In Queue

1. <node / PR / required verification before merge>

## Next Orchestrator Actions

1. <action>
2. <action>
