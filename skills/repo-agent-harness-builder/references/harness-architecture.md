# Harness Architecture

## Purpose

A repo-agent harness gives future agents a reliable operating environment inside any repository. It combines a short root instruction file, lazy-loaded protocol routing, deterministic CLI commands, and optional onboarding and guardrail modules.

## Layered Model

| Layer | Files | Role |
| --- | --- | --- |
| Root router | `AGENTS.md` | Short safety rules and source-of-truth posture |
| Protocol router | `AGENTS-TOC.md` | Task-to-protocol routing table |
| Harness checklist | `ops/HARNESS-CHECKLIST.md` | Baseline/optional module coverage and active/inactive/not-applicable states |
| Protocol library | `ops/protocols/*.md` | Durable recurring procedures |
| CLI facade | `./{{CLI_NAME}}`, `apps/cli/*` | Deterministic repeatable tasks |
| Agent CLI ergonomics | `AGENT-CLI-ERGONOMICS.md` | Content-first, token-aware CLI output contract |
| Connection registry | `ops/connections.json` | Value-safe metadata for external authorities |
| Onboarding package | `START-HERE.md`, `AGENT-HANDOFF.md`, `skills/*` | Pre-clone and first-use bridge |
| Guardrails | preflight, precommit, no-mistakes, CI, secrets, tracker | Safety and consistency checks |
| Advanced modules | hooks, intent authority, evidence maps | Scale patterns for complex repos |

## Base Harness Checklist

- `AGENTS.md` fits on one screen and tells agents where truth lives.
- `AGENTS-TOC.md` routes by task type, not by team lore.
- `ops/HARNESS-CHECKLIST.md` marks baseline and optional modules as active, inactive, or not-applicable.
- Protocols have stable IDs, review dates, related protocols, and verification sections.
- The CLI has a content-first no-args home view, structured usage errors, and `help`, `context`, `protocols`, `doctor`, `preflight`, `verify`, `ergonomics`, `no-mistakes`, optional `lavish`, and `precommit` before domain-specific commands.
- Repos with external authorities have `SOURCE-OF-TRUTH.md`, `EXTERNAL-SYSTEMS.md`, `PRIVILEGED-DOCUMENTS.md`, and `ops/connections.json`.
- Every CLI command has a documented contract and a focused test.
- New docs are classified as root instruction, protocol, reference, human surface, knowledge reference, or temporal record.

## Copy, Adapt, Example

Use this classification while importing inspiration from existing harnesses:

| Label | Meaning |
| --- | --- |
| Copy-as-template | Generic structure is portable after placeholder replacement |
| Adapt-as-reference | Pattern is strong but contains project, account, tracker, or infrastructure assumptions |
| Example-only | Useful for understanding scale or maturity; do not scaffold by default |
| Avoid | Contains private identity, secrets, local machine assumptions, live account details, or product-specific rules |

## Design Principles

- Make the harness boring to operate: predictable commands, explicit gates, and no hidden write paths.
- Prefer one durable source of truth to mirrored prose.
- Treat generated artifacts as derived evidence, not authority.
- Keep "useful" and "authoritative" separate. Search indexes, local summaries, and latest pointers help; canonical docs and schemas decide.
- Keep non-privileged internal docs in the repository and role-restricted material in an external authority that can enforce access.
- Keep identity and account boundaries explicit but sanitized in templates.

## Minimal Install Sequence

1. Scaffold `AGENTS.md`, `AGENTS-TOC.md`, and core protocols.
2. Scaffold the CLI facade and tests.
3. Run `./{{CLI_NAME}}`, `./{{CLI_NAME}} help`, `./{{CLI_NAME}} ergonomics status`, `./{{CLI_NAME}} no-mistakes status`, `./{{CLI_NAME}} lavish status`, `./{{CLI_NAME}} context`, `./{{CLI_NAME}} protocols`, `./{{CLI_NAME}} preflight`, and `./{{CLI_NAME}} verify --dry-run`.
4. Register any new protocols in `AGENTS-TOC.md`.
5. Add onboarding package only after the repo-native harness is coherent.
