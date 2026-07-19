# Harness Checklist

Use this when deciding what to set up, what to leave switched off, and what to omit.

## Status Model

| State | Meaning |
| --- | --- |
| `active` | Ready and safe to use now |
| `inactive` | Present as a placeholder or protocol, but switched off until needed |
| `not-applicable` | Omitted because this setup will not use it |

Default recommendation: include plausible optional modules as `inactive`. Use `not-applicable` only when the context clearly rules a module out.

Example: a harness installed only to organize a Downloads folder does not need CI, branch promotion, deployment, or brand identity. Those can be `not-applicable`.

## Baseline For Everyone

Every harness should usually have:

- short root instructions
- task router or table of contents
- document lifecycle rules
- document quality rules
- protocol taxonomy or maintenance rules
- read-only preflight/check command
- consent gates for writes, deletes, sharing, credentials, and external actions
- package/archive safety if it will be shared
- maintenance metadata: owner, status, review date

## Repository Or Project-Folder Baseline

Repositories and durable project folders should usually have:

- CLI facade or deterministic helper commands
- content-first no-args CLI home view and structured usage errors
- CLI ergonomics audit command for checking agent-facing output quality
- CLI no-args home, help, ergonomics status, no-mistakes status, lavish status, context, checklist, protocols, doctor, preflight, verify
- precommit or local content checks
- strongly recommended no-mistakes PR validation flow, inactive until initialized
- optional Lavish review-surface flow, inactive until visual artifact review is useful
- source-of-truth model
- privileged document boundary
- external connection registry
- tests for core CLI behavior
- onboarding package if other people or agents will use it

## Personal-Folder Baseline

Personal file-steward setups should usually have:

- managed-folder scope
- off-limits folders
- metadata-only inventory
- taxonomy or classification rules
- safe cleanup plans
- receipts and undo/quarantine
- privacy and secrets rules
- optional read-only double-click helpers

## Optional Modules

Scaffold as inactive when plausible:

- secrets handling
- Drive/email/SharePoint/document/database connections
- automations and heartbeats
- project-wide orchestration with registry-backed roles, lifecycle, trust, authority, budgets, ordered required skills, prompts, and client launch contracts
- goal-graph workflows, including bundled `skills/goal-graph-loop/SKILL.md` for Manager-owned repository-merge DAGs and evidence; strict chains are linear graphs
- project tracker
- no-mistakes setup, if the repository cannot use the default generated flow
- CI, branch promotion, deploy readiness
- QA/browser checks
- design system
- brand identity
- evidence and provenance maps
- hooks and intent authority
- domain-specific multi-agent rules that compose with project orchestration
- data/database governance
- repo-agent handoff operations
- provider setup
- MCP/connectors with repo-owned connector profiles
- QA/release handoff

## Activation Rule

Before activating an inactive module:

1. Name the owner and scope.
2. Confirm permissions and credential storage.
3. Update the protocol and checklist state.
4. Update CLI/help/tests if commands are involved.
5. Run read-only preflight and focused verification.
6. Document how to disable, revoke, roll back, or quarantine the module.
