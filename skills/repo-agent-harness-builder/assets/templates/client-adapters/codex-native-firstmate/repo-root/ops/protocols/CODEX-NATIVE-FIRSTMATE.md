---
protocol_id: CODEX-NATIVE-FIRSTMATE
title: Codex-Native Firstmate Adapter
status: inactive
version: 0.3.0
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

## Task Pin Lifecycle

Pinning is a native navigation state, not authority, progress, parentage, or
lifecycle evidence. The materialization controller applies the initial pin
state during create/title/bind reconciliation:

- pin the materialized resident Boss while it owns the repository portfolio;
- pin every materialized nonterminal Manager, including optional-root logical
  Managers;
- never pin Workers or transient helpers.

The project owner owns a logical Manager's pin until a materialized Boss
assumes its lifecycle. The current lifecycle owner unpins a Manager only after
terminal completion and landed-work evidence plus parent reconciliation are
recorded, then applies the configured archive policy. Keep an ambiguously bound or quarantined Manager
pinned until reconciliation proves whether it is retained, cancelled, or
superseded; do not hide it and create a duplicate. Direct owner conversation
does not alter pin state.

During each bounded parent control check, compare the visible native pin state
with the configured policy and reconcile drift when authorized. Pin correction
is lifecycle maintenance, not progress evidence, and never resets unchanged or
same-failure budgets. If native pin state cannot be inspected or changed,
report the exact capability gap rather than assuming conformance.

An existing active adapter that records only the legacy `pinBoss` boolean is
not activation-ready under this version, and new task materialization stays
blocked. Deliberately replan its private retention policy without changing task
IDs, bindings, parentage, or completion evidence; never infer missing Manager
or Worker posture from the current UI.

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
task-create key, binding-mode-aware parent identity, or landed-work proof. Its
native task-create surface does not accept the contract-derived `launchKey`.
The adapter must preserve the registry reservation, canonical work-contract
hash, launch key, immediate-parent binding, and completion evidence through the
repository-private materialization broker.

Treat create, exact-title assignment, binding, inert activation, and pin
readback as one crash-reconcilable logical materialization. The broker provides
durable **at-most-one issuance**, not native exactly-once creation:

1. Keep its operator/instance attempt ledger under the selected repository's
   Git-common private state, with 0700 directories and 0600 regular files.
   Validate contiguous sequence numbers, the full hash-linked receipt chain,
   and its durable tip anchor before every mutation. Ledger loss, truncation,
   rollback, corruption, unexpected files, or a conflicting live lock fails
   closed.
2. Acquire the instance-wide broker lock with a unique owner token. A contender
   never removes another owner's lock. Stale ownership requires an exact lock
   hash, an external dead-owner decision, and a final compare-and-set; preserve
   the released lock and recovery receipt. Age or PID absence alone does not
   authorize deletion.
3. Reserve the configured node, revalidate dependencies, capacity, trust,
   authority, required skills, parent identity, work-contract hash, repository,
   exact base commit, and worktree policy immediately before create. Seal the
   issuance marker in the live registry reservation, then persist the matching
   `create-issued` receipt before the sole native create call. Registry and
   ledger state must agree; rollback of either side never restores eligibility.
4. Create an inert task with no execution authority. New work may start only
   after exact task ID, title, repository, repository root, worktree base,
   signed parent contract, launch envelope, and role-derived pin state read
   back successfully.
5. A timeout, crash, or ambiguous create never becomes create-eligible again.
   Zero discovery matches do not prove absence and never authorize another
   create. One exact self-authenticating launch-envelope match may resume
   readback, attestation, and bind. Multiple, mixed, title-derived, or otherwise
   mismatched candidates remain quarantined for explicit reconciliation.
6. Persist the external Ed25519 attestation request before invoking the
   controller. Accept only a 0600 response matching the request ID, payload
   digest, configured key ID, and public trust anchor. Seal the attempt-ledger
   tip and exact source/task readback hashes into the signed binding; private
   signing material never enters the task, registry, request, receipt, or log.
7. Bind the task while it remains inert and represent that state honestly as
   blocked. Persist `activation-issued` before the one activation call. Require
   positive active-state and pin readback before marking the node working.
   Ambiguous activation is reconciled by readback and is never blindly
   reissued.

The public repository CLI remains inspection-only; it must not expose a raw
task-create command. The registered Codex controller imports the broker and
injects native create/read/activate plus external-attestor capabilities.
Creating an unregistered node still requires a prior governed private replan;
the broker never invents work or authority. Direct native `create_thread`
bypasses are prohibited for an active Firstmate instance.

Codex task activity is not portable progress evidence. The current liveness
owner records a canonical evidence-reference fingerprint and observation
receipt on each bounded control check by appending to its hash-linked history
through a registry-revision and prior-receipt-hash CAS; a heartbeat, attached
task, or repeated commentary does not reset the unchanged or same-failure
budget. The project owner owns a logical Manager until the Boss task is in an
active managing state. The Boss bind/reconcile transaction atomically appends
the ownership handoff before the task-backed immediate parent owns its next
observation. Before recovering a shared daemon or runtime, preserve every
active run and record the initial and immediate pre-action active sets in a
fresh private recovery receipt. Before preservation, close admission and
acquire the runtime-scoped claim from an authority outside all project
registries; every start path must consult it. Abort/replan if the comparison is
future, stale, changed, delayed, or an unmanaged start can bypass admission.
Never treat a local/XDG ledger, project registry, or same-user hash as the
runtime authority. Until a separate coordinator cryptographically authenticates
claims, anchors monotonic history, and atomically gates every raw start path,
destructive recovery is unavailable and every non-empty mirror fails closed.
Ordinary work without a recovery receipt remains available. Once the external
adapter exists, mirror its generation and authenticated claim reference, then
win the registry-CAS `prepared` → `started` transition before the side effect;
only that claimant records
`completed` or evidence-backed `failed`. Derive the ledger-unique claim key
from the runtime
scope, action, active-set fingerprint, and recovery-precondition fingerprint,
and allow only one nonterminal mirror in the project registry. `started`
records a portable owner and bounded immutable lease. Reconcile an expired
claim on the same receipt before any new claim. Append only monotonic state
changes to the hash-linked transition ledger and keep the snapshot equal to its
tip; never replay an unchanged terminal claim key under a new receipt ID.
Terminal reconciliation reopens admission through the runtime authority. The
project registry is not the machine-wide lock.

Before materialization, require every project-local entry in the launch
contract's ordered `requiredSkills` to be installed under the repository. The
fleet-managed entries—`$project-orchestration`, this adapter, and any domain
loop such as `$goal-graph-loop`—must be resolved through their authoritative
distribution, never copied or synchronized by the downstream repository.

Do not unpin a terminal Manager, archive a task, or remove its worktree until
the completion profile's landed-work evidence and parent reconciliation are
recorded. A restorable app snapshot is not landed-work proof. Workers and
transient helpers remain unpinned throughout their lifecycle.

## Native Capability Detection

Run:

```bash
./{{CLI_NAME}} orchestration adapter-status --example
```

The command checks only local registry configuration and installed template
files. It does not call Codex, edit `.codex/config.toml`, create or title tasks,
launch subagents, update the registry, schedule heartbeats, authenticate a
browser/GitHub integration, or archive work.

See `AGENT-ORCHESTRATION.md` for portable-selector boundaries and private
instance inspection.

Missing capabilities fail closed. Do not silently substitute another browser,
connector, CLI, or app-server bridge.

## Activation Gate

Keep each private orchestration instance inactive and `clientAdapter` null until a human
configures repo-local scope, root materialization, logical Boss contract, task-creation grant, trust policy,
authority envelopes, budgets, completion profiles, adapter, base/worktree
policy, Browser/GitHub integration, heartbeat, the exact Boss/Manager/Worker
pin lifecycle, retention/archive policy, and binding/reconciliation assurance.
Installed examples and a Firstmate title do not grant activation or task
authority.

For an active adapter, record the matching Boss task ID when materialized (or
null for an optional unmaterialized root), a base ref, managed
disjoint-worktree policy, deliberate Browser and GitHub choices, heartbeat
mode/cadence/registry mutator, resident-Boss/materialized-Manager-only pin
policy, retention handoff/archive policy, and a reconciliation policy. Also
record completion profiles with their required evidence and the
repository-scoped authentication boundary for each selected integration.
Without a standing creation grant, record the per-task human approval gate. A
trusted external Ed25519 binding attestor and its repo-selected public-key
trust anchor must also be available.

`completionProfiles` must exactly cover every completion profile used by the
registry, including every required evidence identifier. Configure a presentation
taxonomy and repository identity; for `executive`, configure the allowed
Manager and Worker title catalogs and choose each non-Boss node's display role
from the relevant catalog.

## Update Rule

When this adapter changes, update the builder reference, adapter skill, example
Codex config, role profiles, orchestration prompt overlay, AGENTS-TOC, harness
checklist, CLI help/tests, verifier, and onboarding package routing together.
