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
| Starting browser-based login, device-code login, copied-code login, or CLI connector authentication | `ops/protocols/CONNECTOR-AUTH-PROFILES.md`, then `./{{CLI_NAME}} connections auth-plan --profile <profile-id>` |
| Authenticating GitHub, selecting a GitHub account, or using `gh`, `gh-axi`, issues, comments, reviews, PRs, checks, or merges | `ops/protocols/GITHUB-AUTHORITY.md`, `ops/protocols/CONNECTOR-AUTH-PROFILES.md`, then `./{{CLI_NAME}} github plan --profile <profile-id>` |
| Running repo commands | `ops/protocols/CLI-INTERFACE.md` |
| Changing or auditing agent-facing CLI output, command discovery, stdout/stderr behavior, or usage errors | `ops/protocols/AGENT-CLI-ERGONOMICS.md`, `ops/protocols/CLI-INTERFACE.md`, then `./{{CLI_NAME}} ergonomics status` |
| Preparing a commit | `ops/protocols/PRE-COMMIT.md` |
| Preparing a PR or validating a branch through no-mistakes | `ops/protocols/NO-MISTAKES-GATE.md`, then `./{{CLI_NAME}} no-mistakes status` |
| Reviewing complex plans, diagrams, audit reports, QA packets, or PR/adversarial summaries as HTML artifacts | `ops/protocols/LAVISH-REVIEW.md`, then `./{{CLI_NAME}} lavish status` |
| Running browser, Playwright, Storybook, or UI QA | `ops/protocols/QA-BROWSER.md` if present |
| Changing UI, UX, product interface, design-system source, components, tokens, brand surfaces, adaptive UI, generated UI, or agent-composed interface behavior | `ops/protocols/DESIGN-SYSTEM.md` if present |
| Handling tracker work | `ops/protocols/PROJECT-TRACKING.md` if present |
| Handling secrets or credentials | `ops/protocols/SECRETS.md` if present |
| Planning automations, loops, or heartbeats | `ops/protocols/AUTOMATIONS.md` |
| Structuring any project work as Boss/Manager/Worker delegation | `ops/protocols/AGENT-ORCHESTRATION.md`, then `./{{CLI_NAME}} orchestration status --example` and `orchestration liveness --example` for portable-contract inspection |
| Computing a Manager/Boss/fleet heartbeat or reconciling registry claims with current evidence | `ops/protocols/ORCHESTRATION-REPORTING.md`, `ops/protocols/AGENT-ORCHESTRATION.md`, then `./{{CLI_NAME}} orchestration report` and `orchestration reconcile` |
| Handling a direct project-owner instruction in hybrid orchestration | `ops/protocols/AGENT-ORCHESTRATION.md`, then `./{{CLI_NAME}} orchestration directives` |
| Configuring or operating the opt-in Codex-native Firstmate Boss profile, including at-most-once task materialization, exact readback/attestation/activation, and Boss/Manager pin and terminal-unpin lifecycle | `ops/protocols/AGENT-ORCHESTRATION.md`, `ops/protocols/CODEX-NATIVE-FIRSTMATE.md`, then `./{{CLI_NAME}} orchestration adapter-status --example` and `orchestration taxonomy --example` for portable-contract inspection |
| Planning ticket-backed implementation dependency graphs or strict linear chains | `ops/protocols/GOAL-GRAPH.md`, `ops/protocols/AGENT-ORCHESTRATION.md`, then `./{{CLI_NAME}} goals status` |
| Capturing Lavish review decisions before implementation | `ops/protocols/LAVISH-REVIEW.md`, tracker protocol if active, then `./{{CLI_NAME}} lavish tracker capture --issue <id> --artifact <html-file>` |
| Changing CI, deploy, or branches | `ops/protocols/CICD.md` or `ops/protocols/BRANCH-PROMOTION.md` if present |
| Using, discovering, installing, or authenticating external connectors | `ops/protocols/EXTERNAL-SYSTEMS.md`, `ops/protocols/CONNECTOR-AUTH-PROFILES.md`, then `./{{CLI_NAME}} connections plan` |

## Naming Rules

- Agent-consumed protocols use uppercase kebab-case file names.
- Durable procedures belong in `ops/protocols/`.
- Human overviews belong in `README.md` or domain docs.
- Temporal handoffs and status notes must not be promoted into root instructions.

## Update Rule

When adding, renaming, or retiring a protocol, update this TOC in the same change.
