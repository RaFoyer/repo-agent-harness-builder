# Repository Harness Upgrade Request

Use `$repo-agent-harness-builder` to assess this repository's agent harness and prepare a preservation-aware path to the current harness architecture.

Start with a read-only audit. Do not install, replace, delete, move, regenerate, or rewrite anything until you have presented the findings and we have discussed the proposed migration.

## Objective

Bring this repository's harness, project-specific skills, and CLI facade into alignment with the current portable architecture while preserving repository-specific protocols, commands, tests, integrations, authority boundaries, and other intentional custom logic.

## Read-Only Audit

1. Read the repository's `AGENTS.md`, instruction index, harness checklist, active protocols, onboarding material, CLI help, generators, tests, and any repository-specific operating rules.
2. Inspect the worktree, current branch, recent relevant Git history, and generated/source relationships. Identify dirty or user-owned changes and preserve them.
3. Inventory every harness and skill location used by this repository, including repository-local `.agents/skills/` or client-adapter paths and relevant machine-level skill roots.
4. For each installed skill, determine whether it is a real directory, managed copy, or symlink. Resolve symlink provenance with read-only inspection and identify which repository or package currently owns the content. Do not follow a link into mutation or remove its target.
5. Identify top-level `*.backup-*` skill entries or other stale copies that a client may discover as duplicate skills. Recommend a recoverable archive outside every discoverable skill root; do not move them yet.
6. Inspect any repository `skills status`, `skills sync`, bootstrap, self-update, or onboarding command. Record its exact allowlist, targets, backup behavior, overwrite rules, copy/link mode, approval gates, and tests.
7. Compare the repository's CLI facade with the current builder contract. Preserve custom commands and behavior; identify which pieces are generated, forked, extended, or repository-owned before proposing regeneration.
8. Search for maintained project-restart surfaces, active goal-chain workflow instructions, stale orchestration taxonomy, duplicate Boss/Manager/Worker hierarchies, or launch contracts that do not seal required skills.
9. Inspect every tracked or ignored orchestration registry and any Git-common-directory prototype. Report whether it contains live task IDs, signatures, reservations, directives, lifecycle state, developer identity, or repository-specific extension fields. Determine whether portable verification explicitly selects the tracked inactive example or can be redirected by an operator's private instance or ambient Git topology variables. Preserve custom tracked metadata only through the versioned namespaced `tracked-policy` extension envelope; do not let extensions shadow core authority or runtime state. Do not delete or rewrite a tracked live registry before proposing a copy-verify-remove migration into a named private instance.
10. Inspect liveness and recovery behavior. Identify loops that count heartbeats, attached processes, log output, or repeated status as progress; accept arbitrary digests without canonical typed evidence references and an append-only, hash-linked current-owner observation history that also seals failure/retry state and is updated by registry/prior-hash CAS; allow unbounded configured check/retry duration; lack a bounded schedule or event watchdog; retry without a failure/precondition pair; create duplicate replacement Workers or validation runs; or recover a shared runtime without a fresh private receipt containing preserved and immediate pre-action active-set fingerprints. Require an authoritative runtime-scoped claim and closed-admission proof outside repository-private registries before preservation; every run-start path must consult that authority, and any unmanaged bypass blocks recovery. Treat local/XDG ledgers, project registries, and same-user hashes as non-authoritative. Until a separately implemented coordinator cryptographically authenticates claims, anchors monotonic history, and atomically gates every raw start path, destructive recovery must remain unavailable and every non-empty recovery mirror must fail closed; ordinary work with no recovery receipt remains available. A future private mirror must include the authenticated coordinator generation and claim reference, use a ledger-unique runtime-scope/action/active-set/precondition claim key, allow at most one nonterminal project claim, use a bounded immutable `started` lease, reconcile on the same receipt after expiry, protect terminal replay, and keep an append-only hash-linked transition ledger whose tip matches the current snapshot. Preserve custom monitoring logic, but propose how it can compose with the portable evidence-receipt, retry-budget, watchdog, and parent-owned recovery contract.
11. Inspect how the project owner communicates directly with Managers or Workers. Determine whether direct instructions are informal chat, durable governed directives, or accidental authority escalation; preserve intentional workflows and identify missing parent-reconciliation evidence.
12. Audit the Codex task pin lifecycle. Treat pins as navigation, not authority or progress. The materialized resident Boss and materialized nonterminal Managers should be pinned; Workers and transient helpers must never be pinned; terminal Managers should be unpinned only after terminal evidence and parent reconciliation. Preserve ambiguously bound or quarantined Managers as pinned until reconciliation prevents duplication. Report current drift and the exact lifecycle owner for each transition.
13. Audit GitHub and Git authentication before proposing migration: existing `gh`/`gh-axi` wrappers, `GH_CONFIG_DIR` and token handling, active accounts, remotes, SSH identities, credential helpers, GitHub Apps or PATs, custom PR/comment/review commands, CI bots, and repository-specific permission logic. Do not overwrite a working custom path with the generic facade.

## Current Architecture To Compare Against

- `repo-agent-harness-builder` installs, migrates, and verifies the harness; it is not the runtime controller.
- `project-orchestration` is the portable Boss/Manager/Worker control plane.
- Schema-v4 hybrid coordination lets the configured project owner talk directly to Managers and Workers without reparenting or granting authority; durable instructions use governed owner directives and immediate-parent reconciliation.
- Schema-v5 separates the logical Boss root from Boss-task materialization. Optional-root instances may start Manager feature tasks with immutable logical parent bindings and add a Boss later; Workers still require task-backed immediate parents.
- Git tracks protocol, schema, inactive `ops/orchestration.example.json`, CLI, and tests. Live task IDs, signatures, reservations, directives, and lifecycle belong to named private operator instances under the Git common directory, or path-keyed private user state for a non-Git folder. Raw state-path overrides are not part of the contract.
- New harnesses distinguish activity from progress through evidence
  fingerprints, append-only hash-linked observations, bounded unchanged checks
  and same-failure retries, active-parent liveness ownership with atomic
  logical-Manager handoff, and fresh compare-before-action receipts for shared
  runtime recovery.
- A selected client adapter, such as `codex-native-firstmate`, maps the portable protocol to client-native tasks and worktrees. It is optional and repository-local; do not introduce a dependency on an external FirstMate repository, service, fleet registry, or runtime. Preserve another client mapping when the repository already has one.
- For the Codex adapter, pinning is a two-level navigation lifecycle: keep the materialized resident Boss and materialized nonterminal Managers pinned, never pin Workers or transient helpers, and unpin Managers only after terminal evidence and parent reconciliation. Pin state never grants authority or counts as progress.
- `goal-graph-loop` is the Manager-owned ticket-backed dependency graph loop. A strict chain is only a linear graph topology.
- `goal-chain-loop` is a deprecated compatibility alias, not a workflow for new launch contracts.
- Project restart is not a maintained primary skill or protocol surface.
- Schema-v3 launch contracts emit and hash-seal ordered `requiredSkills`; schema-v4 adds sealed coordination mode, project-owner identity, and governed owner directives; schema-v5 seals root materialization and parent binding mode. Explicit schema-v2/v3/v4 compatibility remains bounded to existing attestations until deliberate migration.
- Shared fleet skills are globally owned by their authoritative distribution. A downstream repository may sync only its own project-specific skill names and must keep recoverable backups outside discoverable skill roots.
- Project-specific repository-local skills remain project-owned and may be installed under the repository's `.agents/skills/` contract. Fleet-managed snapshots there remain distribution-owned.
- GitHub binaries may be global, but mutable account state and Worker credentials should be repository/profile scoped. `gh-axi` is the ergonomic executor, not the authentication or authority owner; Git transport needs its own explicit boundary.

## Findings To Present Before Changes

Return:

1. A concise architecture summary of the current harness.
2. A table of relevant files, skills, CLI commands, provenance, customization, drift, and proposed disposition: preserve, adapt, regenerate, migrate, archive, or remove.
3. The current skill-ownership map, including every global symlink or duplicate discoverable backup that could affect this repository.
4. A CLI migration map showing existing custom behavior and the current builder capability it would compose with.
   Include the proposed GitHub profile/capability mapping and identify any Git or direct-API path that could bypass the facade.
5. Risks, compatibility constraints, dirty-worktree collisions, and decisions that require human input.
6. A phased implementation and verification plan with exact intended files and commands.

Do not describe this as a blind replacement. Explain what is already valuable, what is stale, what must remain repository-specific, and where source templates or generators must change before generated artifacts.

Wait for approval after presenting the audit and migration proposal.

## Implementation Rules After Approval

- Work from the repository's required ticket and branch workflow.
- Preserve unrelated and user-owned changes.
- Update authoritative templates or generators before generated files.
- Keep the harness agent-agnostic and client adapters thin.
- Install the current project-specific skill composition without allowing repository sync commands to seize shared fleet names; resolve fleet-managed skills through their authoritative distribution.
- For a legacy tracked live registry, first create a named private instance with the repository CLI's migration command, verify permissions and semantic equivalence, then remove the tracked runtime file and replace it with an inactive identity-free example in a reviewed change. Never combine failed import with source deletion. Make portable verification explicitly inspect that example; do not let a developer's selected instance determine whether a distributable harness passes.
- Move displaced local copies into a named, non-discoverable archive instead of deleting them.
- Add regression coverage for customized CLI behavior, skill ownership, symlink handling, archive location, launch-contract composition, and fail-closed missing-skill behavior.
- Reconcile existing Codex pins to the Boss/Manager-only lifecycle without renaming, reparenting, replacing, or otherwise mutating task authority.
- Run the repository's complete validation and review gates before delivery.
- Report the final source commit, installed-skill provenance, verification evidence, archive location, and any intentionally retained compatibility surface.
