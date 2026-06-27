---
protocol_id: DESIGN-SYSTEM
title: Design System Governance
status: inactive
version: 0.1.0
owner: repo-maintainers
last_reviewed: YYYY-MM-DD
summary: Defines how this repository can adopt a canonical design-system source of truth without making design governance mandatory by default.
related_protocols:
  - CLI-INTERFACE
  - QA-BROWSER
  - SOURCE-OF-TRUTH
---

# Design System Governance

This module is inactive by default. Use it when work touches UI, UX, component systems, tokens, brand surfaces, adaptive interfaces, generated UI, or agent-composed interface behavior.

## Purpose

Provide a safe activation path for a repo-owned design system. The harness should make design authority discoverable before it attempts validation, generation, or enforcement.

## Source Of Truth

While inactive, the only source of truth is this protocol plus the harness checklist entry. A repository may later activate a canonical design source such as:

- `design-system/manifest.json`
- token or theme files
- component inventory
- design philosophy or UX principles
- review, proof, or exception records
- pointers to external design authorities

Do not create seed records, placeholder token catalogs, fake component inventories, or product-specific assumptions before the repository has named its actual design authority.

## Safe Default Behavior

The CLI is read-only while this module is inactive:

```bash
./{{CLI_NAME}} design status
```

The command may report protocol paths, checklist state, and whether a canonical source file is present. It must not scan product code, call external systems, generate UI, enforce CI gates, or mutate files.

## Activation Requirements

Before marking this module active:

1. Name the design owner and product surface scope.
2. Identify the canonical design authority and local source path.
3. Document token, component, asset, philosophy, review, and exception boundaries.
4. Define which checks are advisory and which can block merges.
5. Add focused tests for every CLI behavior beyond read-only `design status`.
6. Define rollback or disable steps for generated assets, CI gates, and external authorities.
7. Update `ops/HARNESS-CHECKLIST.md`, `AGENTS-TOC.md`, and `ops/protocols/CLI-INTERFACE.md`.

## Guardrails

- Keep design governance framework-agnostic unless the repository already has a framework-specific source of truth.
- Prefer explicit source pointers over generated placeholder catalogs.
- Keep brand, accessibility, tokens, components, and UX philosophy connected but separable.
- Treat generated UI as a proposal until reviewed against the canonical design authority.
- Do not let agent convenience override product, accessibility, security, or brand constraints.

## Verification

Inactive verification:

```bash
./{{CLI_NAME}} design status
./{{CLI_NAME}} help
```

Active verification should be repo-specific and documented here before use.
