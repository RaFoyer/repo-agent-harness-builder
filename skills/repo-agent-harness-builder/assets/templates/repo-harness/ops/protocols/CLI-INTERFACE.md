---
protocol_id: CLI-INTERFACE
title: CLI Interface
status: active
version: 0.1.0
owner: repo-maintainers
last_reviewed: YYYY-MM-DD
summary: Defines the repository CLI contract for agents and maintainers.
related_protocols:
  - AGENT-CLI-ERGONOMICS
  - AGENT-ORCHESTRATION
  - LAVISH-REVIEW
  - NO-MISTAKES-GATE
  - SESSION-PREFLIGHT
  - PRE-COMMIT
---

# CLI Interface

## Purpose

Use `./{{CLI_NAME}}` as the deterministic interface for repeated repository operations.

## Agent-Ergonomic Defaults

- `./{{CLI_NAME}}` prints a compact content-first home view.
- `./{{CLI_NAME}} help` prints the concise command catalog.
- Usage errors are structured, actionable, and exit `2`.
- Agent-consumed data and usage errors go to stdout; debug/progress details go to stderr.
- List and detail output should follow `AGENT-CLI-ERGONOMICS.md`.

## Required Commands

| Command | Contract |
| --- | --- |
| `help` | List commands, safety posture, and examples |
| `context` | Print repo facts and canonical docs |
| `checklist` | Print harness checklist location and module status model |
| `protocols` | List protocol files and routing |
| `doctor` | Check local prerequisites and access |
| `preflight` | Run read-only session-start checks |
| `verify` | Run the harness verification sequence or preview it with `--dry-run` |
| `precommit` | Run local content-aware commit gates |
| `precommit install-hook` | Install the harness-managed git pre-commit hook |
| `precommit hook-status` | Report whether the managed hook is installed |
| `qa` | Inspect browser/Playwright/UI QA readiness and artifacts without live credentials |
| `skills` | Report or sync repo-owned skills when present |
| `secrets` | Provide value-safe secret posture commands |
| `connections` | Validate external-authority connection metadata, connector profiles, and setup plans |
| `connections doctor` | Check a named connector profile without printing secret values |
| `connections auth-plan` | Print a read-only browser/CLI authentication isolation plan for a profile |
| `connections env` | Print value-safe provider config-root environment or flag guidance |
| `github status` | Validate repository-scoped GitHub profile contracts without live auth |
| `github plan --profile <id>` | Show one value-safe GitHub profile and authority plan |
| `github run --profile <id> [--node <id>] [--approval-ref <ref>] [--dry-run] -- <args>` | Run a classified GitHub CLI command—normally `gh-axi`—through isolated repository auth |
| `orchestration` | Inspect project hierarchy, lifecycle, trust, authority, eligibility, prompts, and adapter launch contracts |
| `goals` | Inspect ticket-backed goal graphs, strict-chain compatibility paths, local closeout evidence, and goal-thread prompts |
| `design` | Report design-system governance status and activation route |
| `lavish` | Check optional Lavish posture, run Lavish review lifecycle commands, check/apply Lavish updates, and draft tracker captures |
| `ergonomics` | Audit agent-facing CLI output against `AGENT-CLI-ERGONOMICS.md` |
| `no-mistakes` | Check and initialize the strongly recommended branch-to-PR validation gate |
| `self` | Check or update the harness safely |

## Extension Rules

When adding a command:

1. Add implementation under `apps/cli/src/`.
2. Register dispatch in `apps/cli/src/main.mjs`.
3. Update `apps/cli/src/help.mjs`.
4. Update this protocol if behavior changes.
5. Add tests in `apps/cli/test/`.

## Verification

Run:

```bash
./{{CLI_NAME}} help
./{{CLI_NAME}} context
./{{CLI_NAME}} checklist
./{{CLI_NAME}} protocols
./{{CLI_NAME}} ergonomics status
./{{CLI_NAME}} preflight
./{{CLI_NAME}} verify --dry-run
./{{CLI_NAME}} qa status
./{{CLI_NAME}} connections status
./{{CLI_NAME}} connections plan
./{{CLI_NAME}} connections auth-plan --profile example-gcloud
./{{CLI_NAME}} connections env --profile example-gcloud
./{{CLI_NAME}} github status
./{{CLI_NAME}} github plan --profile example-github-worker
./{{CLI_NAME}} github run --profile example-github-worker --dry-run -- pr list
./{{CLI_NAME}} orchestration status
./{{CLI_NAME}} orchestration directives
./{{CLI_NAME}} orchestration adapter-status
./{{CLI_NAME}} orchestration taxonomy
./{{CLI_NAME}} orchestration validate
./{{CLI_NAME}} goals status
./{{CLI_NAME}} design status
./{{CLI_NAME}} lavish status
./{{CLI_NAME}} no-mistakes status
./{{CLI_NAME}} precommit --all
./{{CLI_NAME}} precommit hook-status
node --test apps/cli/test/*.test.mjs
```

After configuring an eligible node and the required binding attestor, inspect
its client-adapter contract with:

```bash
./{{CLI_NAME}} orchestration launch-spec <node-id>
```
