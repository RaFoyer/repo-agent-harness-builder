# Personal Harness Checklist

Use this checklist to audit which personal file-steward modules are active, inactive, or not applicable.

## Status Model

| State | Meaning |
| --- | --- |
| `active` | Ready and safe to use now |
| `inactive` | Present but switched off until needed |
| `not-applicable` | Omitted because this personal setup will not use it |

Default: keep plausible optional modules inactive. Mark modules not-applicable when they would add confusion or security surface without value.

## Universal Personal Baseline

| Module | State | Evidence |
| --- | --- | --- |
| Root instructions | active | `AGENTS.md` |
| Task router | active | `AGENTS-TOC.md` |
| Managed folder scope | active | `config/scopes.json` |
| Taxonomy | active | `config/taxonomy.json` |
| Naming preferences | active | `config/naming.json` |
| Session preflight | active | `ops/protocols/SESSION-PREFLIGHT.md`, `./{{CLI_NAME}} preflight` |
| Document inventory | active | `ops/protocols/DOCUMENT-INVENTORY.md`, `./{{CLI_NAME}} inventory scan` |
| Safe cleanup model | active | `ops/protocols/SAFE-CLEANUP.md` |
| Reversible operations | active | `ops/protocols/REVERSIBLE-OPERATIONS.md` |
| Privacy and secrets | active | `ops/protocols/PRIVACY-AND-SECRETS.md` |

## Optional Personal Modules

| Module | Default state | Evidence or activation path |
| --- | --- | --- |
| Automations/heartbeats | inactive | `ops/protocols/AUTOMATIONS.md`, `HEARTBEAT.md` |
| Content-aware document reading | inactive | Activate only after explicit scope approval |
| Duplicate detection | inactive | Add report-only command before any cleanup action |
| Rename planning | inactive | Add plan/receipt/undo workflow before applying |
| External Drive/email connections | inactive | Add external authority rules if cloud documents matter |
| Secrets handling | inactive | Activate if credential-like files are in managed scope |
| Project/repo mechanics | not-applicable | Use repository harness instead |
| CI/deploy/branch promotion | not-applicable | Use repository harness instead |
| Design system/brand identity | not-applicable | Use project or repo harness if relevant |

## Activation Requirements

Before activating an inactive module:

1. Define the managed scope.
2. Confirm what remains off-limits.
3. Keep first operation read-only.
4. Add plan, receipt, and undo behavior before mutation.
5. Document how to disable the module.
