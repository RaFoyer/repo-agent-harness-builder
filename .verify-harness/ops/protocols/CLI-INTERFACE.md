---
protocol_id: CLI-INTERFACE
title: CLI Interface
status: active
version: 0.1.0
owner: repo-maintainers
last_reviewed: 2026-07-27
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

Use `./verify-harness` as the deterministic interface for repeated repository operations.

## Agent-Ergonomic Defaults

- `./verify-harness` prints a compact content-first home view.
- `./verify-harness help` prints the concise command catalog.
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
./verify-harness help
./verify-harness context
./verify-harness checklist
./verify-harness protocols
./verify-harness ergonomics status
./verify-harness preflight
./verify-harness verify --dry-run
./verify-harness qa status
./verify-harness connections status
./verify-harness connections plan
./verify-harness connections auth-plan --profile example-gcloud
./verify-harness connections env --profile example-gcloud
./verify-harness github status
./verify-harness github plan --profile example-github-worker
./verify-harness github run --profile example-github-worker --dry-run -- pr list
./verify-harness orchestration status --example
./verify-harness orchestration adapter-status --example
./verify-harness orchestration taxonomy --example
./verify-harness orchestration validate --example
./verify-harness orchestration liveness --example
./verify-harness orchestration report --example
./verify-harness orchestration reconcile --example
./verify-harness goals status
./verify-harness design status
./verify-harness lavish status
./verify-harness no-mistakes status
./verify-harness precommit --all
./verify-harness precommit hook-status
node --test apps/cli/test/*.test.mjs
```

After configuring an eligible node and the required binding attestor, inspect
its client-adapter contract with:

```bash
./verify-harness orchestration launch-spec <node-id>
```
