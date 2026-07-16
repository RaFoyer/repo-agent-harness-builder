# Orchestration Ledger

## Graph State

Integration branch:

Current integration commit:

Tracker:

Graph doc:

Last reconciled:

## Thread Policy

Durable Codex threads:

Subagents for transient work:

Model override policy:

Approval gates:

Status vocabulary:
- planned
- ready
- running
- blocked
- needs-review
- pr-open
- merged
- superseded
- validation
- complete

## Nodes

| Node | Goal | Status | Thread | Env | Base | Model/effort | Blocked by | Blocks | Branch | PR | Merge commit | Verification | Last read |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| G1 | <title> | planned | <thread id> | worktree | <branch@sha> | <recommendation> | none | G2, G3 | <branch> | <pr> | <sha> | <evidence> | <time> |

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
