# Guardrails And DevOps

## Preflight

Preflight is the start-of-session truth check. It must be read-only and actionable.

Check:

- repo root and current branch
- worktree cleanliness
- default branch freshness
- CLI availability
- protocol presence
- local skill freshness
- required tools such as `git`, `node`, and `gh` when applicable

When preflight finds drift, print the command that would fix it and ask for approval before mutating anything.

## Precommit

Precommit is the before-shared-history gate.

Gate:

- secret-looking content
- plaintext credential files
- local absolute paths
- protocol metadata
- docs/TOC drift
- issue or ticket linkage
- CI coverage for changed runnable paths
- protected branch writes

Support both staged-file mode and `--all`.

## Secrets

Use value-safe output:

- secret names
- environment names
- booleans
- counts
- file paths

Never print raw values, tokens, refresh tokens, client secrets, private keys, or decrypted config. Accept values through stdin or provider-native flows, not through chat.

## CI Freshness

Every runnable or deployable path should have:

- an active workflow or explicit local verification command
- path filters where appropriate
- least-privilege permissions
- deterministic dependency install
- no secret values in logs
- a protocol or registry entry explaining ownership

Stale CI is technical debt. Either repair it or explicitly mark it disabled with rationale.

## Branch Promotion

A generic branch model:

```text
feature branch -> {{DEFAULT_BRANCH}} -> staging -> production
```

Use PR-only promotion for protected branches. Direct protected-branch writes require a separately approved emergency path and a follow-up repair ticket.

## Project Tracker

Keep tracker language abstract unless the repo opts into GitHub Issues, Linear, Jira, or another backend.

Minimum work item fields:

- title
- owner or assignee
- status
- definition of done
- verification evidence
- linked branch or PR when code changes

The CLI may wrap tracker writes, but it should expose dry-run modes for setup, reconcile, create, and sync commands.

## External MCP And Workspace

- Verify identity with low-risk metadata before reading content.
- Use repo-scoped server names and credential directories.
- Default to read-only.
- Treat external systems as auxiliary unless a protocol explicitly makes them authoritative for a named scope.
- Store connection metadata in a registry such as `ops/connections.json`; store credentials in the provider, keychain, vault, or environment outside the repository.
- Put role-restricted material in the external system that enforces the role boundary; commit only safe pointers and summaries.
- Write-capable scopes, domain-wide delegation, send actions, and service accounts require explicit approval.
