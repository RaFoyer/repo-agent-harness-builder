# Harness Checklist

Use this checklist to audit which harness modules are active, inactive, or not applicable for this project.

## Status Model

| State | Meaning |
| --- | --- |
| `active` | Implemented, configured, documented, and safe to use now |
| `inactive` | Scaffolded and documented, but switched off until needed |
| `not-applicable` | Omitted because the context clearly does not need it |

Default: keep plausible optional modules scaffolded as `inactive`. Mark `not-applicable` only when the context clearly rules the module out.

## Universal Baseline

| Module | State | Evidence |
| --- | --- | --- |
| Root instructions | active | `AGENTS.md` |
| Task router | active | `AGENTS-TOC.md` |
| Protocol taxonomy | active | `ops/protocols/PROTOCOL-TAXONOMY.md` |
| Document lifecycle | active | `ops/protocols/DOCUMENT-LIFECYCLE.md` |
| Document quality | active | `ops/protocols/DOCUMENT-QUALITY.md` |
| CLI interface | active | `ops/protocols/CLI-INTERFACE.md`, `./{{CLI_NAME}} help` |
| Agent CLI ergonomics | active | `ops/protocols/AGENT-CLI-ERGONOMICS.md`, `./{{CLI_NAME}}`, `./{{CLI_NAME}} ergonomics status` |
| Session preflight | active | `ops/protocols/SESSION-PREFLIGHT.md`, `./{{CLI_NAME}} preflight` |
| Maintenance metadata | active | protocol front matter and review dates |
| Consent gates | active | root safety defaults and task protocols |

## Repository/Project Baseline

| Module | State | Evidence |
| --- | --- | --- |
| Repo CLI facade | active | `./{{CLI_NAME}}`, `apps/cli/` |
| CLI tests | active | `apps/cli/test/` |
| Precommit checks | active | `ops/protocols/PRE-COMMIT.md`, `./{{CLI_NAME}} precommit` |
| Source-of-truth model | active | `ops/protocols/SOURCE-OF-TRUTH.md` |
| Privileged docs boundary | active | `ops/protocols/PRIVILEGED-DOCUMENTS.md` |
| No-mistakes PR gate | inactive | `ops/protocols/NO-MISTAKES-GATE.md`, `.no-mistakes.yaml`, `./{{CLI_NAME}} no-mistakes status`; strongly recommended before feature PRs |
| Lavish review surface | inactive | `ops/protocols/LAVISH-REVIEW.md`, `./{{CLI_NAME}} lavish status`; optional visual review and tracker-decision capture |
| External system registry | inactive | `ops/connections.json`, `./{{CLI_NAME}} connections status` |
| Connector auth profiles | inactive | `ops/protocols/CONNECTOR-AUTH-PROFILES.md`, `./{{CLI_NAME}} connections auth-plan --profile <profile-id>` |

## Optional Modules

| Module | Default state | Evidence or activation path |
| --- | --- | --- |
| Secrets handling | inactive | `./{{CLI_NAME}} secrets help`; activate when secrets exist |
| External authority connections | inactive | `ops/protocols/EXTERNAL-SYSTEMS.md`; activate per provider |
| Automations/heartbeats | inactive | `ops/protocols/AUTOMATIONS.md`; activate with run log and cadence |
| Goal-chain workflow | inactive | `ops/protocols/GOAL-CHAIN.md`, `docs/templates/goal-chain/`, `./{{CLI_NAME}} goals status`; activate when tracker, integration branch, and verification gates exist |
| Project tracker | inactive | Add `PROJECT-TRACKING.md` and CLI wrapper when tracker is canonical |
| CI/branch/deploy | inactive | Add CI and branch-promotion protocols when environments exist |
| QA/browser | inactive | `ops/protocols/QA-BROWSER.md`, `./{{CLI_NAME}} qa status`; activate for browser/UI apps |
| Visual artifact review | inactive | `./{{CLI_NAME}} lavish tracker capture --issue <id> --artifact <html-file>`; activate when visual decisions must become tracker scope |
| Repo-agent operations | inactive | Add repo-owned bootstrap/operator skills and skill drift checks for cross-machine handoff |
| Design system | inactive | `ops/protocols/DESIGN-SYSTEM.md`, `./{{CLI_NAME}} design status`; activate when UI, UX, component, token, brand, adaptive UI, or generated UI work needs governance |
| Brand identity | inactive | Add protocol/assets pointer when external-facing work is relevant |
| Evidence/provenance | inactive | Add evidence map when artifacts or audits matter |
| Hooks/intent authority | inactive | Add hook protocol when lifecycle enforcement is needed |
| Multi-agent workflow | inactive | Add fanout/review protocol when parallel agents are expected |
| Data/database | inactive | Add schema/access protocol when SQLite/Postgres/app data is used |
| Provider setup | inactive | Add dry-run-first setup protocol when cloud, database, or SaaS providers are configured |
| MCP/connectors | inactive | `./{{CLI_NAME}} connections plan`; inspect repo-owned connector profiles and auth isolation before generic install |
| QA/release handoff | inactive | Add QA/release checklist when user-facing changes ship |

## Activation Requirements

Before changing a module from `inactive` to `active`:

1. Name the owner and scope.
2. Confirm permissions and credential storage.
3. Add or update the protocol.
4. Add or update CLI help and checks if a command is involved.
5. Run preflight and focused tests.
6. Document rollback, revoke, or disable steps.
