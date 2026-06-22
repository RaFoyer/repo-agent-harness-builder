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
| External system registry | inactive | `ops/connections.json`, `./{{CLI_NAME}} connections status` |

## Optional Modules

| Module | Default state | Evidence or activation path |
| --- | --- | --- |
| Secrets handling | inactive | `./{{CLI_NAME}} secrets help`; activate when secrets exist |
| External authority connections | inactive | `ops/protocols/EXTERNAL-SYSTEMS.md`; activate per provider |
| Automations/heartbeats | inactive | `ops/protocols/AUTOMATIONS.md`; activate with run log and cadence |
| Project tracker | inactive | Add `PROJECT-TRACKING.md` and CLI wrapper when tracker is canonical |
| CI/branch/deploy | inactive | Add CI and branch-promotion protocols when environments exist |
| Design system | inactive | Add protocol/assets pointer when UI or product design is relevant |
| Brand identity | inactive | Add protocol/assets pointer when external-facing work is relevant |
| Evidence/provenance | inactive | Add evidence map when artifacts or audits matter |
| Hooks/intent authority | inactive | Add hook protocol when lifecycle enforcement is needed |
| Multi-agent workflow | inactive | Add fanout/review protocol when parallel agents are expected |
| Data/database | inactive | Add schema/access protocol when SQLite/Postgres/app data is used |
| MCP/connectors | inactive | Add connector boundary protocol when integrations are configured |
| QA/release handoff | inactive | Add QA/release checklist when user-facing changes ship |

## Activation Requirements

Before changing a module from `inactive` to `active`:

1. Name the owner and scope.
2. Confirm permissions and credential storage.
3. Add or update the protocol.
4. Add or update CLI help and checks if a command is involved.
5. Run preflight and focused tests.
6. Document rollback, revoke, or disable steps.
