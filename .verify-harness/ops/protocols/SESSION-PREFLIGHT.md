---
protocol_id: SESSION-PREFLIGHT
title: Session Preflight
status: active
version: 0.1.0
owner: repo-maintainers
last_reviewed: 2026-07-27
summary: Defines read-only checks agents run at the start of a repository session.
related_protocols:
  - CLI-INTERFACE
---

# Session Preflight

## Purpose

Establish repository truth before acting.

## Required Sequence

1. Run `./verify-harness preflight`.
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

`./verify-harness preflight` exits non-zero when blockers require human attention.
