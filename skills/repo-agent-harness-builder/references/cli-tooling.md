# CLI Tooling

## Purpose

The repo CLI is the deterministic spine of the harness. It turns repeated agent tasks into named commands with consistent help, checks, redaction, dry-run behavior, and tests.

## Required Command Families

| Command | Required | Purpose |
| --- | --- | --- |
| `help` | yes | Discover commands and safety posture |
| `context` | yes | Print repo facts and canonical docs |
| `checklist` | yes | Print checklist location and module status model |
| `protocols` | yes | List protocol routes and files |
| `doctor` | yes | Check local prerequisites, auth, and repo access |
| `preflight` | yes | Read-only fresh-session checks |
| `precommit` | yes | Content-aware local commit gate |
| `verify` | recommended | Run the local harness verification sequence through existing safe checks |
| `skills` | recommended | Sync repo-owned skills to local skill dirs |
| `self` | recommended | Check/update repo harness safely |
| `secrets` | optional | Value-safe secret inventory and command wrapper |
| `connections` | recommended | Validate permanent external-authority connection metadata |
| `qa` | optional | Inspect browser/Playwright/UI QA lanes and artifacts without live credentials |
| `loops` | optional | Validate and dry-run bounded loops, heartbeats, or scheduled work definitions |
| `goals` | recommended | Inspect ticket-backed goal chains, local closeout evidence, and goal-thread prompts |
| `design` | optional | Report design-system governance status and, when activated, inspect safe design-system source pointers |
| `pm` | optional | Tracker lifecycle wrapper |
| `workspace` | optional | External workspace/MCP governance |
| `review-gate` | optional | High-risk PR or protected-branch guard |

Do not document or scaffold a command name unless it actually exists and is tested.

## Skeleton Layout

```text
{{CLI_NAME}}
apps/cli/bin/{{CLI_NAME}}.mjs
apps/cli/src/config.mjs
apps/cli/src/main.mjs
apps/cli/src/help.mjs
apps/cli/src/util/args.mjs
apps/cli/src/util/exec.mjs
apps/cli/src/commands/context.mjs
apps/cli/src/commands/checklist.mjs
apps/cli/src/commands/doctor.mjs
apps/cli/src/commands/protocols.mjs
apps/cli/src/commands/self.mjs
apps/cli/src/preflight/session.mjs
apps/cli/src/precommit/checklist.mjs
apps/cli/src/skills/sync.mjs
apps/cli/src/secrets/index.mjs
apps/cli/src/connections/index.mjs
apps/cli/src/goals/index.mjs
apps/cli/src/qa/index.mjs
apps/cli/src/verify/index.mjs
apps/cli/test/cli.test.mjs
```

## Code Style For Agent-Readable CLIs

- Keep command dispatch small and boring in `main.mjs`.
- Put one command family per module.
- Use comments for decisions, extension points, and safety gates; avoid comments that restate syntax.
- Failure messages should say what failed, why it matters, and what to run next.
- Use structured return objects internally: `{ ok, code, lines, warnings, blockers }`.
- Redact secret-like values at the boundary before output reaches chat, logs, or tickets.
- Prefer dry-run defaults for external writes.

## Extension Contract

When adding a command:

1. Add the module under `apps/cli/src/...`.
2. Register it in `main.mjs`.
3. Add help text in `help.mjs`.
4. Add or update the relevant protocol.
5. Add tests in `apps/cli/test/`.
6. Run `./{{CLI_NAME}} help` and the command's safe/default mode.

If any step is missing, the CLI and docs are out of sync.

## Loop Command Contract

Only add `loops` when the automations/loops module is active. Minimum behavior:

- `loops list`: show configured loops with status and owner.
- `loops validate`: block missing owners, missing stop conditions, missing
  approval gates for writes, missing log paths, and loops that have neither a
  user-supplied cap nor a deterministic no-progress/stagnation stop.
- `loops run --dry-run <id>`: print scope, prompt or command, allowed reads,
  allowed writes, artifacts, and stop condition without executing writes.
- `loops log <id>`: show the latest run-log entries.

Loop commands must be covered by tests before the checklist can mark the module
`active`.

## Goal Chain Command Contract

Scaffold `goals` as a read-only helper when the harness includes
`GOAL-CHAIN.md`, even while the goal-chain workflow itself remains inactive.
Minimum behavior:

- `goals status`: show configured goals from the goal-chain document, or report
  that no goal chain is configured without failing baseline verification.
- `goals verify <goal-id>`: block missing linked issue evidence, merged PR,
  merge/squash integration commit, verification result, residual-risk evidence,
  or next-goal evidence; reject placeholders, negated verification, negated PR
  evidence, and integration commits that either do not match the recorded PR
  number or are not reachable from the configured local integration branch or
  configured local remote-tracking ref. Accept successor references as
  `Goal N: Title` or issue links; accept the exact `Next goal: none` marker only
  as an explicit final-goal marker. The default generated config uses the
  default branch and `origin`, requires `Issues:` and `Residual risks:` through
  `requiredGoalCloseoutFields`, and accepts common GitHub/Jira/Linear/Azure-style
  issue references with or without a trailing colon. Repos with a different
  integration branch, remote, tracker shape, or migrated goal-chain schema
  should update `integrationBranch`, `integrationRemote`, `trackerIssuePattern`,
  or `requiredGoalCloseoutFields`. Invalid tracker patterns should be reported
  as configuration blockers, not silently ignored.
- `goals start-prompt <goal-id>`: print a bounded goal-thread prompt using the
  repo path, integration branch, issue reference, objective, and verification
  expectations.

Goal commands must not merge PRs, update trackers, create new threads, or run
write-capable work. Treat them as read-only inspection and prompt-generation
helpers unless a repo-specific protocol adds stronger tested behavior. They
inspect local git evidence and recorded text; they do not verify live PR state.
Fresh generated harnesses fail closed on `Issues:` and `Residual risks:` through
`requiredGoalCloseoutFields`. Older configs that omit that key enforce only
closeout fields declared in each goal; add the key to opt into the fresh strict
default, or set it to `[]` as an explicit migration opt-out. Additional entries
in `requiredGoalCloseoutFields` are enforced as required closeout fields with
non-placeholder evidence. The CLI also accepts `Linked issues:` and
`Closed issues:` as issue-evidence aliases. Verification lines must include an
explicit passing result such as `passed`, `verified`, `succeeded`, or
`completed`. Keep custom note fields outside the `Verification:` block, or
separate them with a blank line. Non-bulleted runner or result lines inside
`Verification:` are still evaluated for failure tokens; note-style labels such
as `Notes:` end the verification block.

## Design Command Contract

Scaffold `design` as a read-only helper when the harness includes
`DESIGN-SYSTEM.md`, even while the design-system governance module remains
inactive. Minimum inactive behavior:

- `design status`: report module state, protocol path, checklist path, source
  discovery, and activation requirements.
- The command must be read-only, require no credentials, and exit 0 while
  inactive.
- Do not add validation, generation, CI gates, external-system inspection, or
  product-code scanning until the module is active and covered by tests.

## Preflight Contract

`preflight` must be read-only. It may check:

- current branch
- worktree cleanliness
- origin/default freshness
- required local tools
- generated or linked skills
- protocol presence
- connection registry presence
- CLI self-consistency

If it recommends mutation, it must say exactly what approval is needed and what command would perform it.

## Precommit Contract

`precommit` should inspect staged files by default and support `--all` for full-repo checks. It should gate:

- secret-looking content
- machine-local absolute paths
- protocol front matter
- doc drift when root/protocol files change
- branch/ticket linkage when a tracker is required
- CI coverage when runnable paths change
- dangerous deleted files

## Testing Strategy

Minimum:

```bash
node --test apps/cli/test/*.test.mjs
./{{CLI_NAME}} help
./{{CLI_NAME}} context
./{{CLI_NAME}} checklist
./{{CLI_NAME}} protocols
./{{CLI_NAME}} doctor
./{{CLI_NAME}} preflight
./{{CLI_NAME}} verify --dry-run
./{{CLI_NAME}} precommit --all
./{{CLI_NAME}} qa status
./{{CLI_NAME}} secrets help
./{{CLI_NAME}} connections status
./{{CLI_NAME}} goals status
./{{CLI_NAME}} self check
```

Tests should use temporary directories and fake command runners for git/gh where possible. Test secret redaction explicitly.

## Maintenance Rules

- `help.mjs` is a contract, not decoration.
- `CLI-INTERFACE.md` must match command behavior.
- `preflight` and `precommit` must stay fast enough for routine use.
- Generated CLI syntax matrices or latest pointers are useful but must not become canonical truth.
