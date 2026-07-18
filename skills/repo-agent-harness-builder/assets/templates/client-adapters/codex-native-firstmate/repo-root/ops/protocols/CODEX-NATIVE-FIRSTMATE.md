---
protocol_id: CODEX-NATIVE-FIRSTMATE
title: Codex-Native Firstmate Adapter
status: inactive
version: 0.1.0
owner: repo-maintainers
last_reviewed: YYYY-MM-DD
summary: Maps portable Boss, Manager, and Worker orchestration to native Codex tasks, worktrees, and bounded subagents without adding a hierarchy.
related_protocols:
  - AGENT-ORCHESTRATION
  - AUTOMATIONS
  - GOAL-CHAIN
  - NO-MISTAKES-GATE
---

# Codex-Native Firstmate Adapter

## Boundary

This is an inactive client adapter for `AGENT-ORCHESTRATION`. Firstmate is the
Codex-facing Boss profile, not a new role or competing control plane.
`ops/orchestration.json` remains authoritative. Goal chains remain a
Manager-owned `repository-merge` specialization.

Each generated repository carries its own resident capability and registry.
The default active shape is one Firstmate/Boss task for this repository, with
Managers and Workers bounded to it. No external or global project registry is
required. Cross-repository fleet control is optional composition above multiple
repo-local Firstmates and needs separate explicit authority.

## Native Mapping

- Boss/Firstmate: one persistent task owns this repository's recurring portfolio loop.
- Manager: one persistent task owns one bounded workstream and its child graph.
- Worker: one persistent task and managed worktree owns one durable execution
  loop and reports to its immediate parent.
- Transient subagent: bounded read-heavy help in the parent's current worktree;
  it is not a durable registry node and does not imply filesystem isolation.

Merge `.codex/config.firstmate.example.toml` deliberately when genuine
Boss -> Manager -> Worker nesting is required. Its `agents.max_depth = 2`
setting is an example, not an activation side effect.

## Dependency Posture

The native profile does not require Treehouse, tmux, `chrome-devtools-axi`,
`lavish-axi`, `gh-axi`, or `no-mistakes`. No Mistakes is an optional
`repository-merge` completion adapter after local initialization. Chrome,
Lavish, a GitHub connector/CLI, and the app-server bridge are optional fallbacks
when native Browser, Markdown/diffs/Mermaid, Git UI, or task tools do not cover
the configured need.

## Materialization And Reconciliation

Codex does not supply the portable portfolio DAG, authority ledger, idempotent
task-create key, immutable `parentTaskId`, or landed-work proof. The adapter
must preserve the registry's reservation, canonical work-contract hash, launch
key, immediate-parent binding, and completion evidence.

Treat create, exact-title assignment, and registry bind as one logical task
materialization. A timeout, crash, ambiguous create, title failure, or failed
bind keeps the reservation quarantined. Reconcile the observed task identity
against the launch key before retry. If absence cannot be proven, require human
reconciliation rather than creating a duplicate.

Do not archive a task or remove its worktree until the completion profile's
landed-work evidence is recorded. A restorable app snapshot is not landed-work
proof.

## Native Capability Detection

Run:

```bash
./{{CLI_NAME}} orchestration adapter-status
```

The command checks only local registry configuration and installed template
files. It does not call Codex, edit `.codex/config.toml`, create or title tasks,
launch subagents, update the registry, schedule heartbeats, authenticate a
browser/GitHub integration, or archive work.

Missing capabilities fail closed. Do not silently substitute another browser,
connector, CLI, or app-server bridge.

## Activation Gate

Keep `ops/orchestration.json` inactive and `clientAdapter` null until a human
configures repo-local scope, one Firstmate/Boss task identity, task-creation grant, trust policy,
authority envelopes, budgets, completion profiles, adapter, base/worktree
policy, Browser/GitHub integration, heartbeat, retention/archive policy, and
binding/reconciliation assurance. Installed examples and a Firstmate title do
not grant activation or task authority.

## Update Rule

When this adapter changes, update the builder reference, adapter skill, example
Codex config, role profiles, orchestration prompt overlay, AGENTS-TOC, harness
checklist, CLI help/tests, verifier, and onboarding package routing together.
