---
name: codex-native-firstmate
description: Use when operating or configuring the inactive Codex-native Firstmate adapter for a repository harness, mapping portable Boss/Manager/Worker orchestration to Codex tasks, managed worktrees, subagents, hooks, Browser, automations, and retention controls.
---

# Codex-Native Firstmate

## Boundary

Firstmate is the Codex-facing Boss profile, not a new role. The repository's
`ops/protocols/AGENT-ORCHESTRATION.md` and `ops/orchestration.json` own roles,
parentage, lifecycle, trust, authority, budgets, reservations, task bindings,
and completion. Read them before using this adapter. For ticket-backed
repository delivery, also read `ops/protocols/GOAL-CHAIN.md`; goal chains remain
a Manager-owned `repository-merge` specialization.

Treat this repository as the default complete scope: one resident
Firstmate/Boss task, repo-local Managers, and repo-local Workers backed by this
repository's registry. Do not require or infer a global project list. Optional
cross-repository orchestration is a separately authorized composition above
independent repository Firstmates.

## Route The Work

- **Inspect posture:** run `./{{CLI_NAME}} orchestration adapter-status`, then
  `orchestration status` and `orchestration validate`. These commands are
  read-only.
- **Configure the adapter:** start from
  `docs/templates/orchestration/codex-native-firstmate-adapter.example.json` and
  `.codex/config.firstmate.example.toml`. Merge settings deliberately; example
  files do not activate orchestration.
- **Operate as Firstmate/Boss:** combine the validated Boss launch prompt with
  `docs/templates/orchestration/codex-native-firstmate-prompt.txt`.
- **Launch durable work:** use persistent Codex tasks and managed worktrees for
  Managers and write-capable Workers. Bind every task to its immediate parent
  through the portable launch contract.
- **Use transient help:** use subagents only for bounded read-heavy help in the
  current worktree. Do not assume subagents have isolated filesystems.
- **Close or archive:** require the configured completion evidence and landed-
  work proof before archive or worktree removal.

## Native-First Rules

- Prefer native tasks, managed worktrees, task pin/archive/title/handoff,
  automations, Goal mode, hooks, Browser, and Git UI when available and
  authorized.
- Configure `agents.max_depth = 2` for genuine Boss -> Manager -> Worker
  nesting. Do not raise depth or child budgets beyond registry policy.
- Treat task creation and title assignment as one logical materialization.
- Codex does not supply the portable registry, authority ledger, idempotent
  task-create key, immutable parent task binding, or landed-work proof. Keep
  those controls in the harness.
- If creation, title assignment, or binding is ambiguous, retain the
  reservation, quarantine the result, reconcile observed task identity, and do
  not retry until absence is proven.
- Never silently replace a missing native capability with another browser,
  connector, CLI, or app-server bridge.

## Dependency Contract

Treehouse, tmux, `chrome-devtools-axi`, `lavish-axi`, `gh-axi`, and
`no-mistakes` are optional adapters, not required dependencies. No Mistakes may
be selected as a repository-merge completion gate after repository-local
initialization. Chrome, Lavish, a GitHub connector/CLI, or the app-server bridge
may be selected only when the native surface is insufficient and project policy
allows the fallback.

## Activation Gate

Do not activate from installed assets alone. A human must configure repo-local scope,
Boss/task identity, task-creation grant, trust, authority, budgets, completion
profiles, adapter selection, base/worktree policy, Browser/GitHub integration,
heartbeat, retention/archive policy, and binding/reconciliation assurance.
