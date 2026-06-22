# Nontechnical And Personal Harnesses

## Purpose

Use this when the recipient may not know GitHub, terminal commands, branches, or package layout. The agent should handle mechanics, explain outcomes plainly, and stop before risky operations.

## Installation Decision Tree

Ask:

1. Are we setting this up for a software repository, a normal folder of files, or are you not sure?
2. Where may I create files? Recommended personal default: `~/Documents/Home Harness`.
3. Which exact folders may I help organize? Ask the human to choose them explicitly; Desktop, Downloads, and Documents are examples, not defaults. Cloud drives, hidden folders, app libraries, Photos, mail stores, external drives, and backups are explicit opt-ins.
4. Should the first scan use metadata only? Default: yes.
5. What are your goals: clean Downloads, tame Desktop, inventory documents, find duplicates, standardize names, prepare tax records, preserve family records, or keep a project folder updated?
6. What is off-limits?
7. What cleanup style is acceptable: suggest only, quarantine first, move to Trash, or allow permanent deletion after a retention period?
8. Do you want recurring read-only check-ins? If yes, choose manual, thread heartbeat, cron automation, or external scheduler.

If the answer is a normal folder, do not use the repository scaffold. Use the personal harness.

Use the harness checklist to mark modules:

- `active` when ready to use now
- `inactive` when plausible later but switched off now
- `not-applicable` when the context clearly rules it out

For a personal Downloads/Desktop/Documents steward, repo mechanics, CI, deployment, branch promotion, and brand/design modules are usually `not-applicable`.

## Plain-Language Concepts

| Term | Explain as |
| --- | --- |
| Inventory | A list of files and basic details, usually without reading contents |
| Taxonomy | The folder categories the user wants |
| Plan | A proposed list of moves, renames, or cleanup actions |
| Apply | Performing an approved plan |
| Receipt | A local record of what changed and how to undo it |
| Quarantine | A holding folder for files that might be deleted later |
| Undo | A best-effort reversal using a receipt |

## Personal Harness Lifecycle

```text
scan -> report -> plan -> approve -> apply -> receipt -> undo
```

- `scan`, `report`, `taxonomy suggest`, duplicate detection, and preflight are read-only.
- Write-capable apply/undo commands are project-specific extensions and must be tested before use.
- Every applied operation starts from an approved plan and writes a receipt.
- Deletes become quarantine or Trash by default.
- Permanent deletion requires an explicit retention policy and a separate confirmation.

## Starter Folder Taxonomy

Use only as a starting point:

- `00_Inbox`
- `10_Finance`
- `20_Identity_and_Legal`
- `30_Health`
- `40_Home`
- `50_Work`
- `60_Projects`
- `70_Personal`
- `80_Reference`
- `90_Archive`

Prefer creating an organized harness folder over reorganizing the user's whole home folder.

## Safety Gates

Stop before:

- moving, renaming, deleting, or quarantining files
- reading sensitive document contents
- changing cloud-synced folders
- touching hidden folders, application libraries, credentials, Photos, mail stores, backups, or external disks
- applying bulk operations over the configured threshold

Never print private document contents, credential values, or long sensitive excerpts into chat.

## Double-Click Wrappers

For non-technical users, provide `.command` wrappers that run read-only checks or create plans. Do not provide a double-click permanent-delete action.
