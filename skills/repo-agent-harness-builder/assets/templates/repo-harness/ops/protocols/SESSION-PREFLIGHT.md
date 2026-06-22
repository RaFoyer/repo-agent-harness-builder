---
protocol_id: SESSION-PREFLIGHT
title: Session Preflight
status: active
version: 0.1.0
owner: repo-maintainers
last_reviewed: YYYY-MM-DD
summary: Defines read-only checks agents run at the start of a repository session.
related_protocols:
  - CLI-INTERFACE
---

# Session Preflight

## Purpose

Establish repository truth before acting.

## Required Sequence

1. Run `./{{CLI_NAME}} preflight`.
2. Read `AGENTS-TOC.md`.
3. Load task-specific protocols.
4. Report blockers before mutating files or external systems.

## Read-Only Checks

Preflight may inspect:

- current branch
- worktree cleanliness
- default branch freshness
- required local tools
- CLI skeleton consistency
- protocol presence
- skill freshness

## Approval Gate

If preflight recommends mutation, the agent must ask before running a fixing command.

## Verification

`./{{CLI_NAME}} preflight` exits non-zero when blockers require human attention.
