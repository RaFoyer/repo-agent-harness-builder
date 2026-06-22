---
protocol_id: CLI-INTERFACE
title: CLI Interface
status: active
version: 0.1.0
owner: repo-maintainers
last_reviewed: YYYY-MM-DD
summary: Defines the repository CLI contract for agents and maintainers.
related_protocols:
  - SESSION-PREFLIGHT
  - PRE-COMMIT
---

# CLI Interface

## Purpose

Use `./{{CLI_NAME}}` as the deterministic interface for repeated repository operations.

## Required Commands

| Command | Contract |
| --- | --- |
| `help` | List commands, safety posture, and examples |
| `context` | Print repo facts and canonical docs |
| `checklist` | Print harness checklist location and module status model |
| `protocols` | List protocol files and routing |
| `doctor` | Check local prerequisites and access |
| `preflight` | Run read-only session-start checks |
| `precommit` | Run local content-aware commit gates |
| `precommit install-hook` | Install the harness-managed git pre-commit hook |
| `precommit hook-status` | Report whether the managed hook is installed |
| `skills` | Report or sync repo-owned skills when present |
| `secrets` | Provide value-safe secret posture commands |
| `connections` | Validate external-authority connection metadata and setup plans |
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
./{{CLI_NAME}} preflight
./{{CLI_NAME}} connections status
./{{CLI_NAME}} precommit --all
./{{CLI_NAME}} precommit hook-status
node --test apps/cli/test/*.test.mjs
```
