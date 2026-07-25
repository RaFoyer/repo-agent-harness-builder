---
protocol_id: ORCHESTRATION-REPORTING
title: Orchestration Reporting
status: inactive
version: 0.1.0
owner: repo-maintainers
last_reviewed: YYYY-MM-DD
summary: Defines derived, read-only lane reporting and reconciliation across Manager, Boss, and fleet altitudes.
related_protocols:
  - AGENT-ORCHESTRATION
  - AUTOMATIONS
  - CLI-INTERFACE
  - GOAL-GRAPH
  - NO-MISTAKES-GATE
---

# Orchestration Reporting

## Purpose

Remove narration decay from orchestration facts. Every beat computes its roster
and measurable evidence from the selected private registry joined with current
Git, GitHub, and No-Mistakes observations. Reports may add judgment after the
computed table, but they must not copy facts from a previous beat, infer state
from thread or file mtimes, or cache world state in the registry.

Phase 1 is observation-only:

- `./{{CLI_NAME}} orchestration report` computes the current lane table.
- `./{{CLI_NAME}} orchestration reconcile` diffs registry claims from current
  observations and prints proposed governed transitions.
- Normal `report` and `reconcile` require a selected private live registry and
  fail closed when it is absent. `--example` is the explicit offline inspection
  path for the tracked contract.
- Neither command writes the registry, tracker, GitHub, task state, a cache, or
  any other system. They carry no apply flag and grant no authority.
- No daemon or polling writer belongs to this reporting layer.

## Three Reporting Altitudes

Manager to Boss:

- mission and work reference
- one lifecycle stage: `plan` → `implement` → `validate` → `pr` → `merged` →
  `post-merge-stable`
- objective gates passed, total, and remaining; never an invented percentage
- only changed positive evidence, its age, and Git-author attribution
- exact blocker or resume condition when the registry records one
- `Needs:` naming the lowest layer that can act

Boss to fleet/owner:

- critical path and portfolio WIP counts first
- one row per nonterminal Manager lane, derived from current registry ownership
- computed stage, stage-entry time, stage age, last positive evidence,
  attribution, next objective gate, and attention reason
- recently completed lanes for one configured visibility window
- owner actions only when a human is genuinely the lowest actor

Fleet commander to owner:

- the human queue first
- ship/lane table with every ship or lane linked down one level
- only re-verified current asks and one-line deltas

Every durable task row links to its immediate child task or work record when the
selected client exposes a stable link. Missing link observations stay unknown;
they do not become evidence of progress or failure.

## Registry Schema

`reportingPolicy` is an additive optional root object. Older schema-v2 through
schema-v5 private instances remain readable when it is absent.

- `quietAfterSeconds`: age after which no recent positive evidence renders
  `quiet, cause unknown`
- `postMergeStabilitySeconds`: cooldown after merge before the stable stage can
  be observed
- `terminalVisibilitySeconds`: bounded one-cycle window for recently completed
  Manager rows
- `stageBudgetsSeconds`: objective per-stage age ceilings
- `wipLimits.maxConcurrentLanes` and `maxOpenPullRequests`: reporting signals;
  breach flags attention and does not hard-block work
- `agentAuthors.names` and `agentAuthors.emails`: exact Git author identities
  counted as agent-authored; unmatched Git identities count as human-authored

`stageTracking` is an additive optional live-node object:

- `stage` and UTC RFC3339 `enteredAt` are registry claims
- `gitBaseRef` and `gitHeadRef` bound commit attribution to the lane
- `pullRequestNumber` binds GitHub observations to one PR
- `validationRunId` binds No-Mistakes observations to one validation lineage

Tracked examples keep `stageTracking` absent or null because stage, timestamps,
PRs, branches, runs, and identities are private runtime state. A live node may
omit it for backward compatibility; `reconcile` then proposes initialization
without writing.

## Positive-Evidence Semantics

Stage observations are monotonic facts, not task activity guesses:

- `plan`: the registry contains the lane
- `implement`: the configured Git ref range contains attributable commits
- `validate`: the configured No-Mistakes lineage passed or the bound PR has
  green checks
- `pr`: the bound PR exists
- `merged`: the bound PR has a positive merge timestamp
- `post-merge-stable`: the PR is merged, checks are green, the registry node is
  closed with completed disposition, and the configured cooldown elapsed

Those canonical lifecycle labels are reserved for repository-merge profiles.
Artifact, human-decision, external-operation, and custom profiles use their
own required-evidence and closed-node objective gates; completed profile work
is shown through lane state and gates, never as merged or post-merge-stable.

The lane-state vocabulary is deliberately small:

- `changing evidence`: recent positive evidence exists
- `completion evidence satisfied`: merge, green checks, node closure, and
  cooldown all positively match
- `quiet, cause unknown`: positive evidence is absent or old

Quiet is never promoted to green or guessed into blocked. A configured registry
blocker, failed check, exhausted measurable budget, stage-age breach, or WIP
breach appears in the attention list while the evidence-derived lane state
remains honest.

Git attribution uses exact, case-sensitive commit author name and email
matches. Report agent and human counts separately. Do not assign a cause to
unattributed GitHub events, and do not use aggregate activity to claim that an
agent lane advanced.

## Reconciliation Rules

Reconciliation compares each stage claim and timestamp with the observed stage,
then emits deterministic discrepancy records and proposed compare-and-set
transitions for coordinator review. Phase 1 never applies a transition.

`registry claims terminal without merge evidence` is a hard error for a
`repository-merge` completion profile. It is never treated as a safe terminal
transition. Merged and green work whose node is still open proposes completion-
profile reconciliation; it does not close itself.

Unavailable GitHub, Git, task, No-Mistakes, quota, or author observations remain
explicitly unmeasurable. Unknown evidence cannot satisfy a gate.

## Budgets, Quotas, And WIP

Always report configured active-node use and remaining capacity. Report provider
quota only when a supported read-only status surface exposes it; otherwise emit
`not-exposed` or `unavailable`. Quota exhaustion is a named attention state, not
silence. Do not throttle cadence merely to conserve quota.

Concurrent-lane and open-PR limits are policy signals. A breach is visible in
the report and reconciliation proposal but does not mutate, cancel, merge,
close, or pause anything.

## Validation Tier

Use a full No-Mistakes lineage for substantive feature or behavior changes,
including implementation of these report commands. Documentation, README,
configuration, and other simple diffs use lightweight adversarial review plus
CI. Match the gate to the risk; do not default every change to the heaviest
pipeline.

## Update Rule

When this protocol changes, update `AGENT-ORCHESTRATION.md`,
`ops/orchestration.example.json`, `AGENTS-TOC.md`, `ops/HARNESS-CHECKLIST.md`,
CLI help and tests, generated-CLI verification, and harness verifier coverage.
