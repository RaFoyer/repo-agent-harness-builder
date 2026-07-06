---
protocol_id: GOAL-CHAIN
title: Goal Chain Workflow
status: inactive
version: 0.1.0
owner: repo-maintainers
last_reviewed: YYYY-MM-DD
summary: Defines ticket-backed implementation goal chains with merge, verification, and handoff evidence.
related_protocols:
  - AUTOMATIONS
  - CLI-INTERFACE
  - PRE-COMMIT
---

# Goal Chain Workflow

## Purpose

Run product and engineering work through ticket-backed goals that each start from the current integration branch, land one coherent unit of work, record evidence, merge, and queue the next goal from shared repository state.

## When To Use

Use a goal chain when work depends on prior decisions or merged code, multiple tickets are safer as a sequence, and done means merged PR plus recorded local evidence. Do not use this protocol for one-off changes, exploratory work without durable tracker state, or projects without an integration branch and verification gates.

## Source Of Truth

The canonical tracker owns problem statements, scope, acceptance criteria, and issue/PR links. The repository goal-chain document owns sequencing and handoff rules. Suggested locations:

- `docs/reference/implementation-goal-chain.md`
- `docs/engineering/goal-chain.md`
- `docs/reference/goal-chain.md`

## Required Sequence

1. Confirm the canonical tracker, integration branch, and verification commands.
2. Cluster related tickets only when they share a system boundary or acceptance evidence.
3. Start each goal from the current integration branch, not an old feature branch.
4. Create one ticket-backed branch for the goal.
5. Produce a concise implementation plan before large edits.
6. Implement only the scoped goal.
7. Run local verification and record commands/results.
8. Open a PR with evidence and resolve review.
9. Merge the PR into the integration branch.
10. Record merged PR, merge or squash integration commit, closed or linked issues, verification evidence, residual risks, and next goal.
11. Start the next goal only after the merge or squash integration commit is visible from the integration branch unless the goal chain explicitly allows parallel work.

## Guardrails

- Keep secrets out of repo, chat, logs, tickets, commits, and CI.
- Do not close foundation work as product acceptance unless the visible product path has been verified.
- Do not carry scratch context into the next goal. Put durable decisions in repo docs or tracker comments.
- Do not broaden a goal into unrelated tickets.
- Preserve unrelated user work and require approval for destructive, production, financial, privacy-sensitive, or external-message actions.

## CLI Support

Use the repo CLI when the goal-chain module is active:

```bash
./{{CLI_NAME}} goals status
./{{CLI_NAME}} goals verify <goal-id>
./{{CLI_NAME}} goals start-prompt <goal-id>
```

`goals status` is read-only and may run before activation. `goals verify` rejects missing linked issue evidence, unresolved placeholders, negated verification text, negated PR evidence, missing residual-risk evidence, and merge or squash integration commits that either do not match the recorded PR number or are not reachable from the configured local integration branch or its configured local remote-tracking ref. Generated CLI config defaults `integrationBranch` to the default branch, `integrationRemote` to `origin`, `requiredGoalCloseoutFields` to `Issues:` and `Residual risks:`, and `trackerIssuePattern` to an empty value with common GitHub/Jira/Linear/Azure-style issue references accepted by default, with or without a trailing colon; update those values when the repository uses a different integration branch, remote, tracker reference shape, or migrated goal-chain schema. Fetch or pull the integration branch first if the PR was just merged remotely. The command does not verify live PR state, merge, update trackers, or create the next thread. `goals start-prompt` prints a bounded prompt for a goal thread, truncates long objectives with an `objective_preview` size hint, and accepts `--full` when the complete objective is needed.

Fresh generated harnesses fail closed on `Issues:` and `Residual risks:` through `requiredGoalCloseoutFields`. Older configs that omit that key enforce only closeout fields declared in each goal; add the key to opt into the fresh strict default, or set it to `[]` as an explicit migration opt-out. Additional entries in `requiredGoalCloseoutFields` are enforced as required closeout fields with non-placeholder evidence. The CLI also accepts `Linked issues:` and `Closed issues:` as issue-evidence aliases. Verification lines must include an explicit passing result such as `passed`, `verified`, `succeeded`, or `completed`. Keep custom note fields outside the `Verification:` block, or separate them with a blank line. Non-bulleted runner or result lines inside `Verification:` are still evaluated for failure tokens; note-style labels such as `Notes:` end the verification block.

## Verification

A goal is complete only when:

- PR is merged into the integration branch
- merge or squash integration commit is recorded in `Merge commit`, reachable from the integration branch, and matches the recorded PR
- linked issue/PR evidence exists
- local verification evidence is recorded
- residual risks are named or explicitly absent
- next goal is queued from the current integration branch as `Goal N: Title` or an issue link, or the goal is explicitly marked as final with `Next goal: none`

## Update Rules

When this protocol changes, update `AGENTS-TOC.md`, `ops/HARNESS-CHECKLIST.md`, CLI help/tests, and any goal-chain templates in the same change.
