# Design System Governance Harness Design

**Date:** 2026-06-27
**Status:** Approved direction for implementation planning
**Repository:** repo-agent-harness-builder
**Branch:** RA/design-system-governance-harness

## Problem

The repo-agent harness already lists `Design system` and `Brand identity` as plausible optional modules, but generated harnesses do not yet give agents a durable route for UI, UX, product-interface, brand, or component-system work.

Recent product work in CounselCue proved a richer pattern: a design system can become a repo-backed governance loop with protocol routing, machine-readable source records, review ledgers, proof-library approval, deterministic snapshots, and read-only CLI gates. That pattern is useful, but copying it wholesale into every generated harness would make the default harness too heavy and too product-specific.

The builder needs a generic runway: enough structure for agents to discover design authority and activation requirements, without pretending every repo has a real component governance program on day one.

## Goals

- Add a generic inactive design-system governance module to generated repo harnesses.
- Keep the base harness agent-agnostic, lightweight, and safe for nontechnical recipients.
- Give UI and product-design work a clear protocol route before agents invent local visual patterns.
- Make the first CLI surface read-only and non-blocking while the module is inactive.
- Document how a repo can later activate richer governance levels such as tokens, components, requests, candidates, review ledgers, proof-library manifests, generated snapshots, and CI enforcement.
- Preserve the distinction between useful examples and authoritative project design source.

## Non-Goals

- Do not scaffold a full `design-system/` source tree in the default harness.
- Do not add component seed records, token seed records, request/candidate/review/proof records, generated snapshots, or schemas in the first implementation.
- Do not add `design validate`, `design generate`, `design ci-gate`, or product-code usage enforcement in the first implementation.
- Do not copy CounselCue-specific rules such as source-first cue hierarchy, live-call side-slice behavior, provider-readiness UI, or SwiftUI Studio implementation.
- Do not make design governance active by default.

## Research Inputs

This design draws from three sources:

- The future UI thesis from the supplied transcript: direct manipulation for fast bounded work, agentic/headless flows for delegated complexity, and generated/adaptive UI for the ambiguous middle.
- The local future-ui-system methodology: interface-mode mapping, component grammar, state/control contracts, trust controls, and readiness evaluation.
- CounselCue UX-007/UX-008: a concrete activated product implementation with `design-system/` source records, `./counselcue design` checks, review ledgers, proof-library manifests, a Studio app, and CI governance.

The generic builder should learn the governance shape from CounselCue while avoiding product-specific content and default footprint expansion.

## Recommended Approach

Ship a staged optional module.

### Stage 1: Inactive Runway

The first implementation adds:

- `ops/protocols/DESIGN-SYSTEM.md` template with inactive front matter.
- `AGENTS-TOC.md` routing for UI, UX, product interface, design-system, component, token, and brand-adjacent work.
- Checklist rows that keep `Design system` inactive while pointing to activation requirements.
- A read-only CLI command: `./{{CLI_NAME}} design status`.
- CLI help, dispatch, and tests for the new command.
- Documentation of activation levels and safety boundaries.

The command must succeed when no `design-system/` directory exists. It should report the module as inactive and print the activation path rather than failing.

### Stage 2: Source-Backed Design System

Later, when a target repo explicitly activates the module, it may add:

- `design-system/manifest` or a project-specific equivalent.
- Source inventory and pointer records.
- Token and component contract directories.
- Read-only validation for source files.

This stage requires owner, scope, canonical source decision, tests, and rollback/disable steps.

### Stage 3: Governance Loop

Mature product repos may opt into a CounselCue-style loop:

```text
request -> candidate -> review ledger -> proof-library manifest -> generated snapshot -> CI gate
```

The builder should document this as an optional advanced pattern. It should not scaffold the full loop by default.

## Protocol Contract

`DESIGN-SYSTEM.md` should define:

- Purpose: route UI, UX, component, token, brand, adaptive UI, and generated UI work.
- Status: inactive by default.
- Source of truth: repo docs can hold non-privileged pointers and governance metadata; privileged brand/design assets belong in external authorities.
- Required sequence while inactive:
  1. Check `ops/HARNESS-CHECKLIST.md`.
  2. Run `./{{CLI_NAME}} design status`.
  3. Identify whether the repo has a canonical design authority.
  4. Do not invent new design authority or copy restricted assets into the repo.
  5. If product UI work is needed, propose an activation plan before implementation.
- Activation requirements:
  - owner and scope
  - design authority or pointer record
  - allowed repo-visible material
  - CLI/help/tests if commands are added
  - verification and rollback/disable path
- Future governance levels:
  - pointer-only
  - source-backed tokens/components
  - request/candidate/review/proof loop
  - CI or review-gate enforcement

## CLI Contract

Add one command family with one subcommand:

```bash
./{{CLI_NAME}} design status
```

Expected inactive output:

```text
design system: inactive
protocol: ops/protocols/DESIGN-SYSTEM.md
checklist: ops/HARNESS-CHECKLIST.md
source: not configured
activation: name owner, scope, canonical design authority, verification, and rollback before marking active
```

If a target repo later adds `design-system/manifest.json`, `design status` may report it as discovered, but Stage 1 does not validate it deeply.

The command must:

- be read-only
- not require credentials
- not inspect external systems
- not fail just because the module is inactive
- avoid printing secret values or privileged design contents
- stay covered by focused Node tests

## File Changes

Stage 1 should touch only the generated harness templates and relevant builder references:

- Add `skills/repo-agent-harness-builder/assets/templates/repo-harness/ops/protocols/DESIGN-SYSTEM.md`.
- Update `skills/repo-agent-harness-builder/assets/templates/repo-harness/AGENTS-TOC.md`.
- Update `skills/repo-agent-harness-builder/assets/templates/repo-harness/ops/HARNESS-CHECKLIST.md`.
- Add `skills/repo-agent-harness-builder/assets/templates/cli-skeleton/apps/cli/src/design/index.mjs`.
- Update CLI skeleton dispatch, help, and tests.
- Update `skills/repo-agent-harness-builder/references/harness-checklist.md`.
- Update `skills/repo-agent-harness-builder/references/cli-tooling.md` if `design status` becomes part of the optional command list.
- Update package or verification scripts only if needed to keep scaffolded harness checks coherent.

## Adversarial Review Findings

The review challenged the larger original plan and identified these risks:

- Rich seed records can become fake authority for nontechnical recipients.
- JSON seeds with hashes, token-like names, or high-entropy identifiers can trip scanner rules or weaken scanner policy through allowlists.
- `design ci-gate` would imply fail-closed behavior for an inactive module.
- `design generate --check` would imply a generation pipeline before a repo has opted in.
- Full request/candidate/review/proof governance is not universal and should not be default scaffold.
- Brand and design material can be privileged; the generic protocol must prefer pointers over payloads.
- A large command surface would increase CLI/help/protocol/test drift.

The Stage 1 scope intentionally avoids those failure modes.

## Testing Strategy

Focused tests should cover:

- `help` lists `design status`.
- Unknown design subcommands fail with a help pointer.
- `design status` reports inactive state when no `design-system/` source exists.
- `design status` remains read-only and does not require git, credentials, or external systems.
- Generated harness CLI tests pass.
- Scaffold verification passes.

Before implementation completion, run:

```bash
npm run check
```

If the implementation changes scaffolded harness shape, also inspect the generated harness output and run its CLI tests through the existing check script path.

## Open Decisions

Resolved for Stage 1:

- Do not include seed records.
- Do not include full governance directories.
- Do not add validation, generation, or CI enforcement commands.
- Do include one read-only `design status` command.
- Do include a generic inactive protocol and activation guidance.

Deferred:

- Whether to add generic schemas for activated design-system source.
- Whether to add a `design validate` command.
- Whether to add governance-loop templates.
- Whether to provide an optional Studio adapter template for specific stacks.

## Approval Gate

This spec should be reviewed before implementation planning. After approval, the implementation plan should break work into small template, CLI, docs, and verification tasks.
