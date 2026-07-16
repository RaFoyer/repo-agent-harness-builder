# Implementation Goal Graph

## Purpose

This document defines the implementation graph, orchestration rules, goal boundaries, verification expectations, and handoff/fan-in policy.

## Orchestration Thread

Owner:

Thread:

Model/effort policy:

Allowed thread policy:

Integration branch:

Canonical tracker:

## Graph Rules

Each node finishes only after:

- PR is merged into <integration branch>
- linked issue/PR evidence exists
- local verification evidence is recorded
- graph ledger is updated
- dependent nodes are unlocked, blocked, or superseded from current <integration branch>

Parallel nodes must have:

- disjoint or intentionally coordinated write boundaries
- stable dependency contracts
- independent verification
- explicit fan-in order or no order dependency

## Dependency Graph

```mermaid
flowchart TD
  O["Orchestration thread"] --> G1["G1: <contract or prerequisite>"]
  G1 --> G2["G2: <parallel node>"]
  G1 --> G3["G3: <parallel node>"]
  G2 --> F["Fan-in reconciliation"]
  G3 --> F
  F --> G4["G4: <dependent validation>"]
```

## Node G1: <Title>

Objective:

Issues:

Execution mode:

Recommended model/effort:

Base:

Blocked by:

Blocks:

Write boundaries:

Dependency inputs:

Dependency outputs:

Scope:

Non-goals:

Exit criteria:

Verification:

Fan-in / handoff:

## Node G2: <Title>

Objective:

Issues:

Execution mode:

Recommended model/effort:

Base:

Blocked by:

Blocks:

Write boundaries:

Dependency inputs:

Dependency outputs:

Scope:

Non-goals:

Exit criteria:

Verification:

Fan-in / handoff:
