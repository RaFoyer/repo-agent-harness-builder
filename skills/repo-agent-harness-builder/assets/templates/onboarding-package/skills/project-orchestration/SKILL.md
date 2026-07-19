---
name: project-orchestration
description: Use when configuring, validating, operating, auditing, or repairing a repository or project hierarchy of Boss, Manager, and Worker tasks with explicit lifecycle, trust, authority, budgets, launch contracts, completion evidence, reconciliation, and nested control loops. Use before any client-specific orchestration adapter.
---

# Project Orchestration

## Boundary

This skill owns the portable control plane. The repository's
`ops/orchestration.json` is authoritative for scope, nodes, parentage,
dependencies, lifecycle, trust, authority, budgets, reservations, task
bindings, and completion. Read `ops/protocols/AGENT-ORCHESTRATION.md` and the
registry before acting. Read `references/project-orchestration-protocol.md`
when the repository protocol is absent or the architecture itself is changing.

Client adapters such as `$codex-native-firstmate` materialize this contract on
their native task surfaces. Domain skills such as `$goal-graph-loop` specialize
the work and completion evidence. Neither may redefine the portable hierarchy
or broaden authority.

## Composition Order

Load the skills named by the validated launch contract in this order:

1. `$project-orchestration` for the universal control plane.
2. The selected client adapter, if active.
3. The domain control-loop skill, such as `$goal-graph-loop`.
4. Node-specific implementation or operations skills.

If a required skill is missing, ambiguous, or conflicts with the registry,
fail closed before task creation. Installed assets do not activate orchestration
or grant authority.

## Taxonomy

- **Boss:** owns one explicit scope and the recurring portfolio loop over
  Managers, including cross-workstream dependencies, exception handling, and
  fan-in.
- **Manager:** owns one bounded workstream and its recurring dependency/control
  loop. A Manager normally owns the domain graph rather than handing that loop
  upward to the Boss.
- **Worker:** owns one bounded execution loop and reports evidence to its
  immediate parent.

Roles describe responsibility, not permission. Lifecycle, work domain, trust,
authority, and completion are independent axes. A chain is a linear dependency
topology, not a role or a separate orchestration model.

## Operating Loop

1. Observe repository instructions, tracker state, Git/PR evidence, the
   registry, task bindings, and completion artifacts.
2. Validate scope, graph acyclicity, parent links, dependency eligibility,
   trust ceilings, authority inheritance, budgets, and evidence requirements.
3. Reconcile inherited or ambiguous nodes before replacing work. Classify each
   as retained, completed, cancelled, superseded, quarantined, or eligible.
4. Select only dependency-eligible work with a valid immediate parent and
   available capacity.
5. Generate a launch contract and confirm its ordered `requiredSkills` are
   locally installed.
6. Reserve with compare-and-set semantics before any external task creation.
7. Let the selected adapter create/adopt, title, verify, and bind the task as one
   logical materialization transaction.
8. Monitor heartbeats and evidence through the immediate parent. Reconcile
   crashes or ambiguous creates by launch key; never retry until absence is
   proven.
9. Mark responsibility terminal only after owned children are terminal and the
   completion profile's exact evidence is recorded.

## Fail-Closed Rules

- Visibility does not grant scope or authority.
- Role, trust, title, task existence, and installed skills do not grant actions.
- Queued graph nodes are not durable tasks.
- A child may not exceed parent trust, capabilities, approval gates, budget, or
  delegation depth.
- Do not silently substitute a client, browser, connector, worktree mode, or
  task API when a required capability is unavailable.
- Keep an ambiguous reservation quarantined and reconcile by idempotency key.
- Do not archive tasks or remove worktrees until landed-work proof exists.
- Cross-repository control requires a separately registered scope and explicit
  authority.

## Assets

Use `assets/boss-prompt.txt`, `assets/manager-prompt.txt`, and
`assets/worker-prompt.txt` only as role overlays on a validated launch contract.
They do not create authority or replace the registry.
