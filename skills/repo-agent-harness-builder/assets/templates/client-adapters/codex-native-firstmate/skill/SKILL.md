---
name: codex-native-firstmate
description: Use after project-orchestration when operating or configuring the inactive Codex-native Firstmate adapter for a repository harness, mapping portable Boss/Manager/Worker launch contracts to Codex tasks, managed worktrees, subagents, hooks, Browser, automations, and retention controls.
---

# Codex-Native Firstmate

## Boundary

Load `$project-orchestration` first. Firstmate is the Codex-facing Boss profile,
not a new role, portable control plane, external repository, service, or
runtime dependency. Repositories may leave this adapter inactive or omit it.
The repository's
`ops/protocols/AGENT-ORCHESTRATION.md` and the selected named private
orchestration instance own roles, parentage, lifecycle, trust, authority,
budgets, reservations, task bindings, and completion. The tracked
`ops/orchestration.example.json` remains inactive and identity-free. Read the
protocol and selected instance before using this adapter. For ticket-backed
repository delivery, also load `$goal-graph-loop` and read
`ops/protocols/GOAL-GRAPH.md`; strict chains remain a linear topology inside
that Manager-owned `repository-merge` specialization.

Treat this repository as the default complete scope. A schema-v5 instance may
materialize a resident Firstmate/Boss first or let the owner start
logical-parent Manager feature tasks and add the Boss later. Repo-local
Managers and Workers remain backed by the selected private instance. Do not
require or infer a global project list or external FirstMate repository. Optional
cross-repository orchestration is a separately authorized composition above
independent repository Firstmates.

## Route The Work

- **Inspect the portable baseline:** run `./{{CLI_NAME}} orchestration
  adapter-status --example`, `orchestration taxonomy --example`, then
  `orchestration status --example` and `orchestration validate --example`.
  Read `ops/protocols/AGENT-ORCHESTRATION.md` for selector boundaries and
  private-instance inspection.
- **Configure the adapter:** start from
  `docs/templates/orchestration/codex-native-firstmate-adapter.example.json` and
  `.codex/config.firstmate.example.toml`. The namespaced `firstmate-boss`,
  `firstmate-manager`, and `firstmate-worker` profiles preserve generic local
  profiles. Merge settings deliberately; example files do not activate
  orchestration.
- **Operate as Firstmate/Boss:** combine the validated Boss launch prompt with
  `docs/templates/orchestration/codex-native-firstmate-prompt.txt`.
- **Select presentation:** use portable Boss/Manager/Worker, nautical
  Firstmate/Secondmate/Crewmate, or executive display labels only as configured
  presentation. Canonical roles and authority remain unchanged.
- **Launch durable work:** use persistent Codex tasks and managed worktrees for
  Managers and write-capable Workers. Bind task-parent relationships through
  the portable launch contract. A schema-v5 logical Manager may bind to the
  Boss node with no native parent task; Workers always need a task-backed
  immediate parent. Refuse materialization if ordered `requiredSkills` are
  missing locally.
- **Apply the pin lifecycle:** treat pinning as navigation, never authority or
  liveness. Keep the materialized resident Boss and every materialized
  nonterminal Manager pinned. Never pin Workers or transient helpers. After
  terminal completion and landed-work evidence plus parent reconciliation,
  unpin the Manager and apply the
  configured archive policy. Keep an ambiguous or quarantined Manager pinned
  until reconciliation prevents a duplicate.
- **Reconcile drift:** during each bounded parent control check, compare native
  task pin state with the configured policy and restore it when authorized.
  Pin correction is lifecycle maintenance, not progress evidence, and never
  resets liveness or retry budgets.
- **Use transient help:** use subagents only for bounded read-heavy help in the
  current worktree. Do not assume subagents have isolated filesystems.
- **Close or archive:** require the configured completion evidence and landed-
  work proof before archive or worktree removal.
- **Route direct owner conversation:** in hybrid mode, allow the configured project owner to enter a Manager or Worker task directly. Record contract-relevant instructions in `ownerDirectives`, preserve the node's parent and authority, bind acknowledgement and resolution to the live target node and task, bind reconciliation to the live immediate-parent node and task before terminal status, and block an active replan-required target at its current boundary.

## Native-First Rules

- Prefer native tasks, managed worktrees, task pin/archive/title/handoff,
  automations, Goal mode, hooks, Browser, and Git UI when available and
  authorized.
- The materialization controller owns the initial pin state. The current
  lifecycle owner unpins a terminal Manager; the project owner performs both
  duties for an optional-root logical Manager until a materialized Boss assumes
  ownership. Direct conversation never changes pin state.
- Treat a legacy adapter with only `pinBoss` as incomplete. Replan its private
  retention policy without changing task IDs, bindings, parentage, or
  completion evidence; do not materialize another task first.
- Configure `agents.max_depth = 2` for genuine Boss -> Manager -> Worker
  nesting. Do not raise depth or child budgets beyond registry policy.
- Treat task creation and title assignment as one logical materialization.
- Codex does not supply the portable registry, authority ledger, idempotent
  task-create key, immutable parent task binding, or landed-work proof. Keep
  those controls in the harness.
- If creation, title assignment, or binding is ambiguous, retain the
  reservation, quarantine the result, reconcile observed task identity, and do
  not retry until absence is proven.
- Use the portable control-loop policy for liveness. A live task, heartbeat, or
  attached process is not progress without a parent-owned canonical,
  hash-linked evidence receipt appended through registry/prior-hash CAS. The
  project owner observes logical Managers until a Boss task is actively
  managing; Boss bind/reconcile atomically appends their ownership handoffs.
  The immediate parent then owns the bounded schedule/watchdog and blocks
  exhausted failure/precondition loops until the precondition changes and the
  retry counter resets. Shared-runtime recovery requires a fresh matching
  private active-set comparison and an action start inside its freshness
  window. First acquire the runtime-scoped claim and close admission through an
  authority outside project registries; every start path must consult it, and
  any unmanaged bypass blocks recovery. Never treat a local/XDG ledger,
  project registry, or same-user hash as that authority. Until a separate
  coordinator cryptographically authenticates claims, anchors monotonic
  history, and atomically gates every raw start path, destructive recovery is
  unavailable and every non-empty recovery mirror fails closed. Ordinary work
  without a recovery receipt remains available. Once the external adapter
  exists, mirror its generation and authenticated claim reference, then win the
  local registry-CAS `prepared` → `started` transition before the side effect.
  Seal
  the runtime scope, action, active-set fingerprint, and recovery-precondition
  fingerprint in a ledger-unique claim key and permit only one nonterminal
  project mirror. `started` has a portable owner and bounded immutable lease;
  reconcile
  an expired claim on the same receipt before another claim. Append only
  monotonic state changes to the hash-linked transition ledger and keep the
  snapshot equal to its tip. Never replay an unchanged terminal claim key under
  a new ID. Only the claimant may record `completed` or evidence-backed
  `failed`, then reopen admission through the runtime authority during terminal
  reconciliation. Never treat the project registry as the machine-wide lock.
- Never silently replace a missing native capability with another browser,
  connector, CLI, or app-server bridge.
- When GitHub CLI integration is selected, use the repository `github` facade;
  require the node's exact capability and `github.profile.<profile-id>` marker,
  and never inherit ambient global `gh` authentication.
- A direct task message is not an authority grant. Tactical instructions within the sealed contract may proceed; scope, dependency, authority, budget, or completion changes must stop for replan or supersession and be surfaced to the immediate parent.

## Dependency Contract

Treehouse, tmux, `chrome-devtools-axi`, `lavish-axi`, `gh-axi`, and
`no-mistakes` are optional adapters, not required dependencies. No Mistakes may
be selected as a repository-merge completion gate after repository-local
initialization. Chrome, Lavish, a GitHub connector/CLI, or the app-server bridge
may be selected only when the native surface is insufficient and project policy
allows the fallback.

## Activation Gate

Do not activate from installed assets alone. A human must configure repo-local scope,
root materialization, logical Boss identity and authority, task-creation grant,
trust, authority, budgets, completion
profiles, adapter selection, base/worktree policy, Browser/GitHub integration,
heartbeat, retention/archive policy, and binding/reconciliation assurance.
