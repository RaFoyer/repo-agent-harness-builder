# Harness Checklist

## Purpose

Use this when creating, auditing, extending, or packaging a harness. It is the canonical checklist for what to install, what to configure, and what to explicitly leave inactive.

## Status Model

Use one of these states for every module:

| State | Meaning |
| --- | --- |
| `active` | Implemented, configured, documented, and safe to use now |
| `inactive` | Scaffolded and documented, but intentionally switched off until needed |
| `not-applicable` | Omitted because the context makes it irrelevant or impossible |

Default recommendation: scaffold plausible optional modules as `inactive` rather than omitting them. Omit only when context clearly rules the module out, such as a personal Downloads-folder harness that will never use CI, deployment, repository branches, or brand identity.

Activation requires an owner, scope, permissions, CLI/help updates if applicable, tests or verification, and a rollback or revoke path.

## Universal Baseline

These apply to almost every harness, including repositories, project folders, and personal-folder stewards:

| Area | Required artifacts |
| --- | --- |
| Root routing | `AGENTS.md` kept short, source-of-truth posture, safety defaults |
| Progressive disclosure | `AGENTS-TOC.md` or equivalent task router |
| Documentation lifecycle | durable doc lifecycle, review dates, owners, status fields |
| Documentation quality | style, evidence, recipient-ready writing, stale-doc rules |
| Protocol taxonomy | what belongs in protocols vs references vs temporal handoffs |
| CLI or deterministic helpers | discoverable help, context, preflight/readiness check |
| Session preflight | read-only checks before broad work |
| Archive/package safety | no secrets, local paths, or traversal; manifest/checksum when packaged |
| Maintenance metadata | how to review, retire, and update docs and modules |
| Consent gates | explicit approval before writes, sharing, deletes, credentials, or external actions |

## Repository Or Project-Folder Baseline

Use for software repositories and durable team/project folders:

| Area | Required artifacts |
| --- | --- |
| Repo CLI | `help`, `context`, `protocols`, `doctor`, `preflight`, `precommit` |
| CLI tests | focused tests for help, dispatch, redaction, and key safety checks |
| Source of truth | repo-visible docs vs role-restricted external authority |
| Connection registry | `ops/connections.json` with value-safe metadata |
| Precommit gates | secrets, local paths, protocol front matter, doc drift |
| Skills/onboarding | bootstrap and operator skills when cross-machine handoff matters |

## Personal-Folder Baseline

Use for Downloads/Desktop/Documents or similar local stewardship:

| Area | Required artifacts |
| --- | --- |
| Scope config | managed folders and explicit opt-in exclusions |
| Metadata inventory | read-only scan and report |
| Taxonomy | folder/document categories |
| Safe cleanup | plan-before-apply, quarantine, receipts, undo |
| Privacy/secrets | metadata-only default, sensitive folders opt-in |
| Double-click helpers | optional read-only wrappers for nontechnical users |

## Optional Modules To Scaffold Inactive When Plausible

Scaffold these as `inactive` if they might plausibly be needed later:

| Module | Typical artifacts | Activate when |
| --- | --- | --- |
| Secrets handling | `SECRETS.md`, `secrets` CLI, redaction tests | credentials or secret-backed systems exist |
| External authority | `EXTERNAL-SYSTEMS.md`, `PRIVILEGED-DOCUMENTS.md`, `ops/connections.json` | Drive/email/SharePoint/database context matters |
| Automations/heartbeats | `AUTOMATIONS.md`, run log, scheduler notes | recurring checks or reminders are useful |
| Project tracker | tracker protocol and CLI wrapper | GitHub Issues, Linear, Jira, or similar is canonical |
| CI/branch/deploy | CI protocol, branch promotion rules, deploy readiness | repo has tests, releases, environments, or deployments |
| Design system | design-system protocol, tokens/assets pointer, brand governance | product/brand/interface work may happen |
| Brand identity | brand protocol, approved assets pointer, usage rules | external-facing comms or visual identity matters |
| Evidence/provenance | evidence map, artifact pointers, provenance rules | audits, reports, or generated artifacts matter |
| Hooks/intent authority | hook protocol, allowed hook list, failure behavior | agent lifecycle enforcement is useful |
| Multi-agent workflows | task fanout protocol, review handoff rules | parallel work or specialist agents are expected |
| Data/database | schema pointer, access protocol, migration rules | structured data or SQLite/Postgres is used |
| QA/browser | browser QA protocol, `qa` CLI, artifact/no-masking checks | browser, Playwright, Storybook, or UI evidence matters |
| Repo-agent operations | bootstrap/operator skills, skill drift checks, handoff archive | cross-machine or cross-agent handoff matters |
| Provider setup | provider setup protocol and dry-run setup checks | cloud, database, SaaS, or model providers are configured |
| MCP/connectors | external connector protocol, connector profiles, identity checks | tool integrations are available |
| QA/release handoff | QA protocol, release notes, acceptance checklist | user-facing changes ship regularly |

## Not-Applicable Rule

Mark a module `not-applicable` and omit heavy scaffolding when:

- it would confuse the user more than help
- the context cannot use it
- the module creates a security surface with no plausible value
- the user explicitly wants a minimal harness

Examples:

- Personal Downloads cleanup: CI, deployment, branch promotion, design system, tracker are usually `not-applicable`.
- Public documentation-only repo: secrets handling may be `inactive`, not active.
- Brand/site repo: design system and brand identity should usually be scaffolded `inactive` or `active`.

## Audit Questions

Ask:

1. Which baseline applies: repository, project folder, or personal-folder steward?
2. Which optional modules are plausible later?
3. Which optional modules are truly not applicable?
4. Are inactive modules clearly marked and non-blocking?
5. Does activation require tests, permissions, owner, and rollback/revoke path?
6. Does preflight distinguish blockers from inactive future modules?
