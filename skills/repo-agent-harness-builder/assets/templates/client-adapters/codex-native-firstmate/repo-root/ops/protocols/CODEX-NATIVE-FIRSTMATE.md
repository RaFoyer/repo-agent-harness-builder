---
protocol_id: CODEX-NATIVE-FIRSTMATE
title: Codex-Native Firstmate Adapter
status: inactive
version: 0.2.0
owner: repo-maintainers
last_reviewed: YYYY-MM-DD
summary: Maps portable Boss, Manager, and Worker orchestration to native Codex tasks, worktrees, and bounded subagents without adding a hierarchy.
related_protocols:
  - AGENT-ORCHESTRATION
  - AUTOMATIONS
  - GOAL-GRAPH
  - NO-MISTAKES-GATE
---

# Codex-Native Firstmate Adapter

## Boundary

This is an inactive client adapter for `AGENT-ORCHESTRATION`. Firstmate is the
Codex-facing Boss profile, not a new role or competing control plane.
The selected named private orchestration instance remains authoritative;
`ops/orchestration.example.json` stays inactive and identity-free. Load `$project-orchestration`
before this adapter. Goal graphs remain a Manager-owned `repository-merge`
specialization implemented through `$goal-graph-loop`; strict chains are a
linear graph topology.

## Presentation Taxonomy

The canonical registry roles remain `boss`, `manager`, and `worker`. Select
`portable` to display Boss/Manager/Worker, `nautical` to display
Firstmate/Secondmate/Crewmate, or `executive` to display CEO plus configured
Manager C-suite and Worker Director/Lead/Contributor titles. The human Board,
Founder, or Principal remains outside the agent tree. Display labels do not
grant authority, alter parentage, or change lifecycle state.

For a selected profile, title grammar is
`<repository identity> - <display role> - <scope-or-workstream>/<node id>`.
The adapter must set or adopt, rename, and verify that exact external task title
before binding. A title failure keeps the reservation quarantined for
reconciliation; it never authorizes another create.
New Firstmate bindings record the exact observed `externalTitle` and signed
`titleVerification` evidence. Before activating Firstmate around an otherwise
valid pre-Firstmate schema-v2 binding, explicitly inventory that binding in
`clientAdapter.legacyTaskBindings` with its node ID, task ID, and SHA-256
attestation-payload digest. This durable inventory is a migration record, not a
binding option: every binding not matched exactly by it must carry both title
proof fields, and any supplied `externalTitle` must match its registry-derived
title exactly.

Each generated repository carries its own resident capability, tracked
protocol/example, and private-instance resolver.
This optional adapter does not depend on an external FirstMate repository,
service, fleet registry, or runtime; the portable harness remains usable when
the adapter is inactive or absent.
The active shape may materialize one Firstmate/Boss task first, or schema-v5
optional-root mode may let the owner start logical-parent Manager tasks and add
the Boss later. Managers and Workers remain bounded to the logical repository
scope. No external FirstMate repository or global project registry is required.
Cross-repository fleet control is optional composition above multiple repo-local
instances and needs separate explicit authority.

## Hybrid Owner Conversation

When schema-v4 `coordinationMode` is `hybrid`, the configured project owner may
enter Manager and Worker tasks directly. Firstmate must not become a
conversation relay or infer authority from a message. Tactical instructions
inside the sealed work contract may proceed. Instructions that must survive
task history or affect scope, dependencies, authority, budget, or completion
are recorded as governed `ownerDirectives`; acknowledgement and resolution
evidence must bind the live target node and task, and reconciliation must bind
the live immediate-parent node and task before terminal status. An open
`replan-required` directive blocks the active target
at its current boundary until replan or supersession. Direct conversation never
changes task parentage.

## Native Mapping

- Boss/Firstmate: an optional persistent task owns this repository's recurring portfolio loop once materialized.
- Manager: one persistent task owns one bounded workstream and its child graph.
- Worker: one persistent task and managed worktree owns one durable execution
  loop and reports to its immediate parent.
- Transient subagent: bounded read-heavy help in the parent's current worktree;
  it is not a durable registry node and does not imply filesystem isolation.

Merge `.codex/config.firstmate.example.toml` deliberately when genuine
Boss -> Manager -> Worker nesting is required. Its `agents.max_depth = 2`
setting is an example, not an activation side effect.
The example references `firstmate-boss`, `firstmate-manager`, and
`firstmate-worker` profiles so generic repository profiles remain untouched.

## Dependency Posture

The native profile does not require Treehouse, tmux, `chrome-devtools-axi`,
`lavish-axi`, `gh-axi`, or `no-mistakes`. When selected, `gh-axi` runs behind
the repository `github` facade with one node-bound profile and exact
capabilities; it never supplies authority or ambient authentication. No Mistakes is an optional
`repository-merge` completion adapter after local initialization. Chrome,
Lavish, a GitHub connector/CLI, and the app-server bridge are optional fallbacks
when native Browser, Markdown/diffs/Mermaid, Git UI, or task tools do not cover
the configured need.

## Materialization And Reconciliation

Codex does not supply the portable portfolio DAG, authority ledger, idempotent
task-create key, binding-mode-aware parent identity, or landed-work proof. The adapter
must preserve the registry's reservation, canonical work-contract hash, launch
key, immediate-parent binding, and completion evidence.

Treat create, exact-title assignment, and registry bind as one logical task
materialization. A timeout, crash, ambiguous create, title failure, or failed
bind keeps the reservation quarantined. Reconcile the observed task identity
against the launch key before retry. If absence cannot be proven, require human
reconciliation rather than creating a duplicate.

Before materialization, require the launch contract's ordered `requiredSkills`
to be installed locally: `$project-orchestration`, then this adapter, then any
domain loop such as `$goal-graph-loop`, followed by node-specific skills.

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

Keep each private orchestration instance inactive and `clientAdapter` null until a human
configures repo-local scope, root materialization, logical Boss contract, task-creation grant, trust policy,
authority envelopes, budgets, completion profiles, adapter, base/worktree
policy, Browser/GitHub integration, heartbeat, retention/archive policy, and
binding/reconciliation assurance. Installed examples and a Firstmate title do
not grant activation or task authority.

For an active adapter, record the matching Boss task ID when materialized (or
null for an optional unmaterialized root), a base ref, managed
disjoint-worktree policy, deliberate Browser and GitHub choices, heartbeat
mode/cadence/registry mutator, retention handoff/archive policy, and a
reconciliation policy. Also record completion profiles with their required
evidence and the repository-scoped authentication boundary for each selected
integration. Without a standing creation grant, record the per-task human
approval gate. A trusted external Ed25519 binding attestor and its repo-selected
public-key trust anchor must also be available.

`completionProfiles` must exactly cover every completion profile used by the
registry, including every required evidence identifier. Configure a presentation
taxonomy and repository identity; for `executive`, configure the allowed
Manager and Worker title catalogs and choose each non-Boss node's display role
from the relevant catalog.

## Update Rule

When this adapter changes, update the builder reference, adapter skill, example
Codex config, role profiles, orchestration prompt overlay, AGENTS-TOC, harness
checklist, CLI help/tests, verifier, and onboarding package routing together.
