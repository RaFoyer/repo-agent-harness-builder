# {{PROJECT_NAME}} Personal Harness Instructions

This folder is a safe operating base for helping manage ordinary files.

## Source Of Truth

- Read `AGENTS-TOC.md` before work.
- Use `./{{CLI_NAME}}` for repeatable checks and plans.
- Default to metadata-only inventory.
- Do not run inventory until `config/scopes.json` contains human-approved managed folders and `./{{CLI_NAME}} preflight` passes.
- Do not move, rename, delete, quarantine, upload, or content-scan files without an approved plan.

## Lifecycle

```text
scan -> report -> plan -> approve -> apply -> receipt -> undo
```

## Safety

- `preflight`, inventory, reports, and plan creation are read-only.
- Write-capable apply/undo commands must be added and tested for this environment before use.
- Every applied operation must start from an approved plan and write a receipt.
- Deletes mean quarantine or Trash by default.
- Permanent deletion is outside the default workflow.
