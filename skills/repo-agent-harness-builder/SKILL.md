---
name: repo-agent-harness-builder
description: Use when creating, auditing, extending, packaging, or explaining a repository or personal-folder agent harness with AGENTS.md, protocol documentation, deterministic CLI commands, onboarding packages, safe file stewardship, goal chains, automations, heartbeats, preflight/precommit checks, skills, or portable agent handoff archives.
---

# Repo Agent Harness Builder

## Overview

Build repository and personal-folder harnesses that give coding agents one durable source of truth, lazy-loaded protocols, and deterministic CLI commands for repeatable work. Keep the harness agent-agnostic: repo docs, protocols, and CLI behavior are the portable core; Codex, Claude Code, Gemini CLI, Kimi, Cursor, and similar clients are adapters.

## Core Workflow

1. Identify the target mode: repository, non-GitHub project folder, or personal-folder steward.
2. For repositories, collect project name, repo slug, CLI facade name, default branch, tracker, environments, sensitive systems, and target agent clients/adapters.
3. For personal folders, collect install folder, managed folders, off-limits folders, scan depth, cleanup style, taxonomy, naming preferences, and automation preferences.
4. Inspect existing root instructions, docs, scripts, CI, and package files before adding a harness.
5. Use `references/harness-checklist.md` to classify modules as `active`, `inactive`, or `not-applicable`.
6. Choose the smallest viable active layer, while scaffolding plausible optional modules as inactive:
   - Base: `AGENTS.md`, `AGENTS-TOC.md`, protocol library, and repo CLI.
   - Onboarding: portable handoff package, bootstrap skill, repo-operator skill, and verification script.
   - Guardrails: preflight, precommit, no-mistakes PR validation, secrets, tracker, CI, branch promotion, and external-system boundaries.
   - Personal steward: read-only inventory, folder taxonomy, safe cleanup plans, receipts, undo, and quarantine.
   - Advanced: hooks, intent routing, artifact pointers, evidence maps, and multi-agent enforcement.
7. Read only the relevant reference files below, then copy or adapt templates from `assets/templates/`.
8. Validate the result with `scripts/verify_harness.py` or the generated personal-harness preflight; run generated CLI tests when a CLI skeleton is created.
9. When building a shareable archive, include `START-HERE.md`, `AGENT-HANDOFF.md`, templates, references, install/scaffold scripts, and a manifest. Never include secrets, tokens, live credentials, private account details, or local absolute paths.

## Reference Routing

- Harness shape and source-of-truth model: read `references/harness-architecture.md`.
- Baseline and optional setup checklist, including inactive/not-applicable module states: read `references/harness-checklist.md`.
- Protocol front matter, TOC routing, and documentation governance: read `references/protocol-library.md`.
- CLI structure, extension, comments, tests, and maintenance: read `references/cli-tooling.md`.
- Agent-ergonomic CLI output, AXI-style discovery, and TOON-shaped stdout contracts: read `references/agent-cli-ergonomics.md`.
- Portable zip/handoff package design: read `references/onboarding-package.md`.
- Preflight, precommit, no-mistakes PR validation, CI, branch, secrets, tracker, and MCP guardrails: read `references/guardrails-and-devops.md`.
- Non-technical installation, personal folders, and safe file stewardship: read `references/nontechnical-and-personal-harness.md`.
- External authority, permanent Drive/email/document/database connections, and role-based permission boundaries: read `references/external-authority-and-connections.md`.
- Repository-scoped CLI and connector authentication profiles, browser login boundaries, and config-root isolation: read `references/external-authority-and-connections.md`.
- Agent-agnostic distribution, `npx skills add`, and client adapters: read `references/agent-agnostic-distribution.md`.
- Automations, heartbeats, hooks, goal/loop modes, noninteractive runs, and scheduled work across agent clients: read `references/automations-and-loops.md`.
- Project-wide Boss/Manager/Worker delegation, progressive autonomy, authority envelopes, budgets, lifecycle, completion profiles, and client launch contracts: read `references/project-orchestration.md`.
- Ticket-backed implementation goal chains with merge, verification, and handoff evidence: read `references/goal-chain-loop.md`.
- Hooks, intent authority, generated artifacts, and evidence/provenance maps: read `references/advanced-patterns.md`.

## Bundled Assets

- `assets/templates/repo-harness/`: generic `AGENTS.md`, `AGENTS-TOC.md`, protocol templates, no-mistakes repo policy, and setup script.
- `assets/templates/cli-skeleton/`: commented Node CLI facade with `help`, `context`, `checklist`, `protocols`, `doctor`, `preflight`, `precommit`, `verify`, `ergonomics`, `qa`, `skills`, `secrets`, `connections`, `orchestration`, `goals`, `design`, `lavish`, `no-mistakes`, and `self` commands.
- `assets/templates/personal-harness/`: safe local-folder steward with read-only inventory, plans, receipts, quarantine, and personal protocols.
- `assets/templates/automation/`: scheduled-work protocol and run-log templates.
- `assets/templates/orchestration/`: project-wide registry, ledger, and Boss/Manager/Worker prompts with explicit trust and authority envelopes.
- `assets/templates/goal-chain/`: ticket-backed implementation goal-chain/graph, repository-merge handoff prompts, and evidence templates that compose with project orchestration.
- `assets/templates/onboarding-package/`: portable handoff archive skeleton with bootstrap, repo-operator, and goal-chain-loop skill templates plus agent-client install guidance.

Use placeholders consistently:

| Placeholder | Meaning |
| --- | --- |
| `{{PROJECT_NAME}}` | Human project or organization name |
| `{{REPO_SLUG}}` | Repository slug, such as `org/repo` |
| `{{CLI_NAME}}` | Root CLI facade, without `./` |
| `{{DEFAULT_BRANCH}}` | Default integration branch |
| `{{TRACKER_NAME}}` | Work tracker label, such as GitHub Issues or Linear |

## Scripts

- `scripts/scaffold_harness.py`: copy templates into a target repo and replace placeholders.
- `scripts/scaffold_personal_harness.py`: create a safe personal-folder harness in a project folder, not directly in `Documents`, `Downloads`, `Desktop`, or home.
- `scripts/build_reference_package.py`: assemble the shareable zip from a clean staging directory, inject the skill, generate a manifest, and write a checksum.
- `scripts/verify_harness.py`: check that a generated harness has the expected docs, protocol front matter, CLI files, executable facade, smoke commands, replaced placeholders, and optional tests.

Prefer the scripts for repeatable scaffold/package work. If editing templates manually, keep command help, protocol docs, tests, and root routing in sync in the same change.

## Non-Negotiables

- Root instructions stay short; route task-specific detail through the TOC and protocols.
- Protocols describe durable recurring behavior, not current status, meeting notes, or one-off handoffs.
- CLI commands must be real, discoverable through `./{{CLI_NAME}} help`, and covered by focused tests.
- Agent-facing CLI output should follow the AXI-shaped contract: content-first home views, compact structured stdout, definitive empty states, contextual next-step hints, and fail-loud usage errors.
- Preflight must be read-only unless the human explicitly approves mutation.
- No-mistakes setup/status should be available as a strongly recommended PR
  validation flow for repository harnesses, while remaining inactive until the
  repo remote is initialized.
- Scaffold plausible optional modules as `inactive` rather than omitting them; use `not-applicable` only when context clearly rules them out.
- Inactive modules must not block preflight, require credentials, or imply permission to use external systems.
- Personal-folder harnesses must use plan-before-apply, receipts, and undo/quarantine by default.
- Secret handling must be value-safe: names, paths, booleans, and counts only.
- Repositories hold non-privileged internal documentation; role-restricted material belongs in an external authority with explicit permission boundaries.
- External systems are auxiliary unless a protocol explicitly makes them authoritative for a named scope.
- Connector packages may be global, but mutable authentication profiles must be repo-scoped by default unless a protocol explicitly marks a different boundary.
- Never make Codex, Claude, Gemini, Kimi, Cursor, or any single client the conceptual owner of the harness. Client-specific files and commands are adapters around the shared protocol/CLI contract.
- Advanced Flow-style hooks and artifact hubs are optional modules; do not make them the base harness.
