# Codex-Native Firstmate

## Purpose

Use this reference when a project wants the portable project-orchestration
control plane to run primarily in the Codex app. `Firstmate` is the Codex-facing
name for the configured Boss profile. It does not add a role above Boss and does
not replace the Boss -> Manager -> Worker hierarchy.

This profile is dependency-light. It prefers Codex tasks, managed worktrees,
subagents, Goal mode, automations, hooks, Browser, and the app's Git surfaces.
Treehouse, tmux, `chrome-devtools-axi`, `lavish-axi`, `gh-axi`, and
`no-mistakes` are not prerequisites. They may remain optional capability or
completion adapters when the native surface does not cover a repository's
needs.

The default installation model is repository-local: each repository carries
its own registry, protocol, resident Firstmate capability, and one eventual
Firstmate/Boss task for that repository. Its Managers and Workers remain inside
that repository's scope. No global project list or external fleet registry is
required. A cross-repository portfolio may later compose several independent
repo-local Firstmates under separately authorized policy, but that is optional
and must not become a hidden prerequisite.

## Portable Core And Adapter Boundary

The portable core remains authoritative for:

- one explicit registry scope and one logical Boss
- Boss portfolio ownership, Manager workstream ownership, and bounded Worker
  execution
- trust ceilings, authority envelopes, approval gates, and budgets
- lifecycle, dependencies, reservations, immutable task bindings, and
  canonical materialized-work-contract hashes
- immediate-parent reporting and completion evidence
- landed-work safety and read-only repository CLI inspection

The Codex adapter translates a validated launch contract into native client
operations. It may supply task titles, prompt overlays, managed-worktree
choices, native feature checks, and callback instructions. It must not fork the
registry schema, weaken authority checks, invent a second lifecycle, or treat a
visible task as authorized work.

Goal chains remain the Manager-owned `repository-merge` specialization. They
add ticket, branch, PR, merge, verification, and handoff evidence without
creating another hierarchy.

## Presentation Taxonomy

Canonical registry roles remain `boss`, `manager`, and `worker`. A selected
presentation taxonomy changes only the display role and deterministic task
title; it never changes lifecycle, authority, trust, parentage, budgets, or
completion rules.

| Profile | Boss display | Manager display | Worker display |
| --- | --- | --- | --- |
| `portable` | Boss | Manager | Worker |
| `nautical` | Firstmate | Secondmate | Crewmate |
| `executive` | CEO | selected C-suite title | selected Director, Lead, or Contributor title |

For the executive profile, the human Board, Founder, or Principal remains
outside the agent tree. The adapter configuration supplies the permitted
Manager C-suite and Worker title catalogs, and each Manager or Worker records a
selected display role from its applicable catalog. A title is not an authority
grant.

The selected adapter derives every task title as
`<repository identity> - <display role> - <scope-or-workstream>/<node id>`.
Creation and adoption must set that exact title and read it back before binding
or activation. A rename or title-verification failure quarantines the existing
reservation and requires reconciliation; it never permits a second create.
New Firstmate bindings record the exact observed `externalTitle` and signed
`titleVerification` evidence. Before activating Firstmate around an otherwise
valid pre-Firstmate schema-v2 binding, explicitly inventory that binding in
`clientAdapter.legacyTaskBindings` with its node ID, task ID, and SHA-256
attestation-payload digest. This durable inventory is a migration record, not a
binding option: every binding not matched exactly by it must carry both title
proof fields, and any supplied `externalTitle` must match its registry-derived
title exactly.

## Native Mapping

| Portable role | Codex-native shape | Responsibility |
| --- | --- | --- |
| Boss (`Firstmate` profile) | one persistent task for this repository by default | recurring repo-local portfolio loop over Managers, budgets, exceptions, and fan-in |
| Manager | one persistent task per bounded workstream | one goal graph/control loop, Worker boundaries, evidence review, and Boss handoff |
| Worker | one persistent task and managed worktree for durable write work | one bounded execution loop and immediate-parent report |
| Helper | transient subagent inside the parent's current worktree | bounded read-heavy research, inspection, or review only |

Use persistent tasks for durable ownership, independent write work, resumable
state, or worktree isolation. Use transient subagents for bounded read-heavy
help whose evidence can be reconciled during the current parent turn. Native
subagents share the parent's filesystem/worktree unless the client explicitly
provides another isolation boundary, so do not fan out overlapping writes
through subagents.

For a genuine Boss -> Manager -> Worker subagent depth, merge the supplied
example setting `agents.max_depth = 2` into the project's Codex configuration.
The example file is deliberately not named `.codex/config.toml`, so scaffolding
cannot activate or override a user's Codex configuration.

## Native Capability Plan

Prefer these Codex surfaces when present and authorized:

- tasks: durable Boss, Manager, and Worker ownership
- managed worktrees: isolated durable write execution
- task title, pin, archive, and handoff: discoverability and retention
- Goal mode: a bounded objective loop inside one owning task
- subagents: transient bounded read-heavy assistance
- automations or heartbeats: wake a configured Boss for a read/reconcile loop
- hooks: pre-action authority checks and post-action evidence reminders
- Browser: app-local, public-web, and browser QA where its profile and
  capability limits fit
- Git UI or a repo-scoped GitHub integration: branch, review, and PR surfaces

Feature detection must be read-only and fail closed. Missing native features do
not authorize silent substitution. Record the selected fallback or ask the
human. The optional app-server bridge is a headless fallback; it is not a
requirement for an app-first installation.

## Gaps The Harness Must Retain

Codex does not natively provide the portable portfolio dependency graph,
authority ledger, atomic idempotent task-create key, immutable `parentTaskId`,
or landed-work proof. Native task creation may also assign the title in a
separate operation. Therefore:

1. Keep `ops/orchestration.json` and its launch contract authoritative.
2. Reserve before create and preserve the contract-derived `launchKey`.
3. Record the created task ID, immutable immediate-parent task ID, and binding
   evidence in the registry through the approved adapter callback.
4. Treat task creation plus title assignment as one logical materialization
   transaction. A failed title step does not make an unbound task usable.
5. On a timeout, crash, ambiguous create, title failure, or failed bind, retain
   the reservation and quarantine the result. Reconcile by launch key and
   observed task identity before any retry.
6. Never archive a task or remove its worktree until the completion profile's
   landed-work evidence is recorded. A restorable app snapshot is useful but is
   not proof that repository work landed.

If the native task API cannot accept an idempotency key or search by launch key,
the adapter must use the strongest available correlation metadata, keep the
reservation quarantined on ambiguity, and require explicit human reconciliation
instead of guessing or creating a duplicate.

## Optional Capability Adapters

- No Mistakes may implement a repository-merge completion gate after the
  repository initializes it. Its absence must not block the Codex profile's
  inactive scaffold, task inspection, or non-merge completion profiles.
- A GitHub connector or CLI may cover operations not exposed by the Git UI.
  Authentication remains repository-scoped unless policy explicitly says
  otherwise.
- Chrome may be selected when work requires the user's regular Chrome profile,
  file upload, or another capability unavailable in Browser.
- Lavish may be selected when a human explicitly wants a richer collaborative
  review surface. Markdown, diffs, Mermaid, and Browser remain the native
  baseline.
- Treehouse or tmux may be selected by a non-Codex client adapter, but they are
  outside this profile's required runtime.

## Inactive-By-Default Activation

The generated registry keeps `clientAdapter` null and orchestration inactive.
The example Codex config and adapter JSON are reference files only. Before
activation, a human must deliberately configure:

1. repo-local scope, stable root reference, objective, and one logical Firstmate/Boss task identity
2. a standing task-creation grant or an approval gate for every creation
3. trust policy, authority envelopes, delegation limits, and project budgets
4. completion profiles and any optional repository-merge gate; the adapter
   must cover every profile used by registry nodes with the exact required
   evidence identifiers
5. `codex-native-firstmate` as the client adapter
6. base-ref and managed-worktree policy, including overlapping-write rules
7. Browser and GitHub integration choices and authentication boundaries
8. heartbeat/automation cadence and who may mutate the registry
9. retention, pin, handoff, archive, and landed-work proof policy
10. binding attestation and reconciliation behavior required by the project's
    assurance level
11. one presentation taxonomy, repository identity, and any executive title
    catalogs and per-node display-role selections

Do not infer this activation from installed files, available tools, task
visibility, or a Boss/Firstmate title.

Cross-repository fleet orchestration is optional composition above independently
configured repo-local Firstmates. It requires its own explicit scope and
authority; a repository adapter must never discover or control other projects
through a hidden global registry.

## Generated Assets

The adapter template installs:

- `.agents/skills/codex-native-firstmate/SKILL.md`
- `.codex/config.firstmate.example.toml`
- `.codex/agents/firstmate-boss.toml`, `firstmate-manager.toml`, and
  `firstmate-worker.toml`; these names deliberately avoid generic profile
  names already owned by the repository
- `docs/templates/orchestration/codex-native-firstmate-prompt.txt`
- `docs/templates/orchestration/codex-native-firstmate-adapter.example.json`
- `ops/protocols/CODEX-NATIVE-FIRSTMATE.md`

Inspect posture with `./{{CLI_NAME}} orchestration adapter-status`. The command
is read-only; it does not edit Codex configuration, create tasks, launch
workers, update the registry, schedule a heartbeat, or archive anything.
Run `./{{CLI_NAME}} orchestration taxonomy` to preview the presentation
profiles and title grammar without changing configuration or tasks.
