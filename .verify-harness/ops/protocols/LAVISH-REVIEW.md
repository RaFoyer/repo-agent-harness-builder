---
protocol_id: LAVISH-REVIEW
title: Lavish Review Surface
status: inactive
version: 0.1.0
owner: repo-maintainers
last_reviewed: 2026-07-27
summary: Defines optional Lavish HTML artifact review, update checks, tracker decision capture, and no-mistakes handoff.
related_protocols:
  - AGENT-CLI-ERGONOMICS
  - CLI-INTERFACE
  - GOAL-GRAPH
  - NO-MISTAKES-GATE
  - QA-BROWSER
---

# Lavish Review Surface

## Purpose

Use Lavish as an optional rich review surface for complex agent outputs that are easier to inspect as a local HTML artifact than as prose. Typical fits include technical plans, audit reports, diagrams, tables, PR/adversarial review summaries, QA evidence packets, and structured decision reviews.

Lavish is not a required harness dependency. The harness exposes discovery, update, review, and tracker-capture commands so teams can use it deliberately while keeping the core repository workflow agent-agnostic.

## When To Use

Use this protocol when:

- a plan, comparison, audit, diagram, or review summary needs visual inspection
- user feedback should target specific parts of an artifact
- decisions from the review need to become tracker scope before implementation
- a ticket-backed goal should start from reviewed decisions rather than scratch chat context

Do not use Lavish when a short answer, normal code review comment, or existing issue body is enough.

## Source Of Truth

- Review artifact: repo-local HTML file, usually under `.lavish/`
- Review commands: `./verify-harness lavish ...`
- Durable decisions: canonical tracker issue or repo-owned decision document
- Implementation dependency graph: `ops/protocols/GOAL-GRAPH.md`
- PR validation: `ops/protocols/NO-MISTAKES-GATE.md`

## Required Sequence

1. Decide whether visual review materially improves the work.
2. Run `./verify-harness lavish status` to check local posture without installing or contacting npm.
3. When using Lavish, run `./verify-harness lavish update --check` first if the local Lavish state is stale or unknown.
4. Create the HTML artifact in `.lavish/` unless the user names another location.
5. Open the review with `./verify-harness lavish open <html-file>`.
6. Poll for feedback with `./verify-harness lavish poll <html-file>`.
7. Fix fresh error-severity layout warnings before asking the user to rely on the artifact.
8. After decisions are made, run `./verify-harness lavish tracker capture --issue <id> --artifact <html-file>` to draft the tracker update. Add `--decisions <file>` when decisions are recorded separately from the HTML artifact.
9. Ask the human to approve the tracker write or copy the proposal into the canonical tracker through the repo-approved project-management workflow.
10. Start or update the ticket-backed goal only after the tracker captures the reviewed decisions.
11. Implement the scoped goal, run local verification, then run no-mistakes when initialized before treating the PR as merge-ready.

## CLI Commands

```bash
./verify-harness lavish status
./verify-harness lavish doctor
./verify-harness lavish update --check
./verify-harness lavish update --apply
./verify-harness lavish open <html-file>
./verify-harness lavish poll <html-file>
./verify-harness lavish end <html-file>
./verify-harness lavish tracker capture --issue <id> --artifact <html-file> [--decisions <file>]
./verify-harness lavish tracker reconcile --issue <id> [--dry-run]
```

`status` and `doctor` are local and non-mutating. `update` defaults to `--check`; applying an update requires `--apply`. Tracker commands are dry-run and proposal-first in the generic harness. A repository may add tested tracker writes only when `PROJECT-TRACKING.md` grants that authority and the command keeps a dry-run mode.

`open` accepts `--no-open`, `--no-gate`, and `--reopen`. `poll` accepts
`--agent-reply <text>` and `--timeout-ms <ms>`. `end` accepts no extra flags.
`tracker capture` requires `--issue` and accepts `--artifact` and `--decisions`;
`tracker reconcile` requires `--issue` and accepts `--dry-run`.

## Tracker Capture

Capture decisions in the tracker before kicking off implementation. A good tracker update includes:

- decision summary
- rationale
- user feedback source, such as Lavish artifact or poll output
- implementation scope
- explicit non-goals
- verification expectation
- no-mistakes gate expectation

Do not silently write to Linear, Jira, GitHub Issues, or another tracker from a generated harness. The generic CLI should draft a proposal and require human approval or a repository-specific write protocol.

## Update Policy

Lavish evolves quickly. Treat its update path as explicit:

- `lavish update --check` is the safe default before review work.
- `lavish update --apply` is a local tool update and requires the user to intend mutation.
- For deterministic QA evidence, record the Lavish version or update-check result used for the review.
- Do not make `lavish-axi` a required package dependency unless the repository intentionally activates this protocol.

## Guardrails

- Keep artifacts value-safe before sharing or attaching them to tracker issues.
- Do not publish to third-party hosting by default.
- Do not attach screenshots, local HTML exports, or browser artifacts to external systems without redaction review.
- Do not let Lavish feedback replace canonical ticket acceptance criteria; capture the decision in the tracker first.
- Do not start the next implementation goal from unmerged code or uncaptured review decisions.

## Verification

When this protocol or the `lavish` command changes, run:

```bash
./verify-harness lavish status
./verify-harness lavish update --check
./verify-harness lavish tracker capture --issue <id> --artifact <html-file> --decisions <file>
./verify-harness verify --dry-run
node --test apps/cli/test/*.test.mjs
```

Use a fake runner in tests for `update`, `open`, `poll`, and `end` so verification does not depend on npm, browser state, or an active Lavish session.

## Update Rules

When this protocol changes, update `AGENTS-TOC.md`, `ops/HARNESS-CHECKLIST.md`, `ops/protocols/CLI-INTERFACE.md`, `ops/protocols/AGENT-CLI-ERGONOMICS.md`, CLI help, and CLI tests in the same change.
