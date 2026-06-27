---
title: Agent Protocol Table Of Contents
status: active
last_reviewed: YYYY-MM-DD
summary: Task router for agent-facing repository protocols.
---

# Agent Protocol Table Of Contents

Use this file to decide which durable protocol to read. Load only the protocol needed for the task.

| Task | Read |
| --- | --- |
| Starting a session | `ops/protocols/SESSION-PREFLIGHT.md` |
| Auditing harness setup or module coverage | `ops/HARNESS-CHECKLIST.md` |
| Deciding where documentation belongs | `ops/protocols/SOURCE-OF-TRUTH.md`, `ops/protocols/PRIVILEGED-DOCUMENTS.md` |
| Understanding protocol structure | `ops/protocols/PROTOCOL-TAXONOMY.md` |
| Creating or changing docs | `ops/protocols/DOCUMENT-LIFECYCLE.md`, `ops/protocols/DOCUMENT-QUALITY.md` |
| Planning or activating Drive, email, document stores, or databases | `ops/protocols/EXTERNAL-SYSTEMS.md` |
| Running repo commands | `ops/protocols/CLI-INTERFACE.md` |
| Preparing a commit | `ops/protocols/PRE-COMMIT.md` |
| Running browser, Playwright, Storybook, or UI QA | `ops/protocols/QA-BROWSER.md` if present |
| Changing UI, UX, product interface, design-system source, components, tokens, brand surfaces, adaptive UI, generated UI, or agent-composed interface behavior | `ops/protocols/DESIGN-SYSTEM.md` if present |
| Handling tracker work | `ops/protocols/PROJECT-TRACKING.md` if present |
| Handling secrets or credentials | `ops/protocols/SECRETS.md` if present |
| Planning automations, loops, or heartbeats | `ops/protocols/AUTOMATIONS.md` |
| Planning ticket-backed goal chains | `ops/protocols/GOAL-CHAIN.md`, then `./{{CLI_NAME}} goals status` |
| Changing CI, deploy, or branches | `ops/protocols/CICD.md` or `ops/protocols/BRANCH-PROMOTION.md` if present |
| Using, discovering, or installing external connectors | `ops/protocols/EXTERNAL-SYSTEMS.md`, then `./{{CLI_NAME}} connections plan` |

## Naming Rules

- Agent-consumed protocols use uppercase kebab-case file names.
- Durable procedures belong in `ops/protocols/`.
- Human overviews belong in `README.md` or domain docs.
- Temporal handoffs and status notes must not be promoted into root instructions.

## Update Rule

When adding, renaming, or retiring a protocol, update this TOC in the same change.
