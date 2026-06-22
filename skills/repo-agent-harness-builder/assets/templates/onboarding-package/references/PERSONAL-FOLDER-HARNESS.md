# Personal Folder Harness

Use this for ordinary local folders such as Downloads, Desktop, Documents, research folders, client folders, writing archives, receipts, or screenshots.

## Safety Model

Default lifecycle:

```text
scan -> report -> plan -> approve -> apply -> receipt -> undo
```

The base harness implements read-only inventory. Write-capable cleanup commands should be added only after they have dry-run plans, tests, receipts, and undo behavior.

## Recommended Structure

```text
Home Harness/
  START-HERE.md
  AGENTS.md
  AGENTS-TOC.md
  homeh
  config/
    scopes.json
    taxonomy.json
    naming.json
  ops/protocols/
  state/
    inventories/
    plans/
    receipts/
    quarantine/
    undo/
  reports/
  scripts/
```

## Wizard Questions

Ask:

1. Which folders should be managed?
2. Which folders are off-limits and should be skipped through `excludedPaths`?
3. Should scans be metadata-only?
4. Should suggestions be conservative, balanced, or aggressive?
5. Is quarantine preferred over delete?
6. Should reminders run weekly, monthly, or only on demand?

## Good First Commands

```bash
./homeh help
./homeh context
./homeh preflight
```

Run `./homeh inventory scan` only after `config/scopes.json` contains the
human-approved managed folders and `./homeh preflight` passes.

## Cleanup Rules

- Do not delete directly; move to quarantine first.
- Do not rename files without a written mapping.
- Do not inspect file contents when metadata-only mode is requested.
- Do not scan credential folders, mail stores, backups, cloud internals, or photo libraries without explicit opt-in.
- Keep receipts for every write-capable action.

## Useful Extensions

- duplicate-candidate reports
- old-download review
- filename linting
- project archive suggestions
- monthly run summaries
- supervised apply/undo commands
