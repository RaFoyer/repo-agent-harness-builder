---
protocol_id: ENTRY-POINTS
title: Shared Client Entry Blocks
status: inactive
version: 0.1.0
owner: repo-maintainers
last_reviewed: YYYY-MM-DD
summary: Keeps selected client entry instructions aligned with one repository-owned operator block.
related_protocols:
  - CLI-INTERFACE
  - PRE-COMMIT
  - DOCUMENT-LIFECYCLE
---

# Shared client entry blocks

## Source and activation

`AGENTS.md` owns the block between `<!-- harness:operator:start -->` and
`<!-- harness:operator:end -->`. Client-specific hints belong outside it.

This module is inactive while `ops/entry-points.json` has an empty `targets`
list. To activate, select existing repo-relative Markdown entry files, add one
empty marker pair to each, and list them in `targets`. Name the owner in this
protocol and mark it active after tests pass. The tool does not create client
files, select clients, or change client settings.

## Commands

`./{{CLI_NAME}} docs entry-sync` checks selected files without writing.
`./{{CLI_NAME}} docs entry-sync --write` replaces only their marked blocks.
It validates every source and destination before its first write and preserves
text outside each block. Duplicate, malformed, or missing markers, missing
files, links, traversal, and non-Markdown targets block the operation.
Filesystem errors during writing can leave earlier targets changed. Inspect
the diff and rerun the check; this is not a filesystem transaction.

Precommit checks configuration, source, and destinations from the Git index
when inspecting staged changes. Repairing only a working-tree copy cannot
make a stale staged block pass. `precommit --all` checks working-tree content.
No command stages or commits files automatically.

## Verification and disable path

Test exact block propagation, preservation of client-specific text, refusal
before any write when a later target is malformed, staged drift hidden by
working-tree repairs, staged deletion, and link/path refusal. Include the
check in `verify` and the staged gate in precommit.

An owner can disable the module by reviewing a change to an empty target list.
The CLI checks consistency, not the provenance or authority of that decision.
Keep this protocol, the target list, CLI help, TOC, and tests in sync.
