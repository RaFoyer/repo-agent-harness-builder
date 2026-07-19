---
protocol_id: GOAL-GRAPH
title: Goal Graph Loop
status: inactive
version: 0.2.0
owner: repo-maintainers
last_reviewed: YYYY-MM-DD
summary: Defines a Manager-owned dependency graph loop for ticket-backed repository work with merge, verification, fan-in, and downstream evidence.
related_protocols:
  - AGENT-ORCHESTRATION
  - AUTOMATIONS
  - CLI-INTERFACE
  - LAVISH-REVIEW
  - NO-MISTAKES-GATE
  - PRE-COMMIT
---

# Goal Graph Loop

## Purpose

Run product and engineering work through a dependency graph of ticket-backed
goals. Each node starts from an approved integration state, lands one coherent
unit of work, records evidence, and unlocks dependents from shared repository
state. A strict goal chain is the special case where the DAG has one linear
path.

This protocol defines a `repository-merge` completion profile. When work uses delegated tasks, compose it with `AGENT-ORCHESTRATION.md`; that protocol owns role, title, parentage, lifecycle, trust, authority, and delegation budgets. The Boss owns the portfolio loop over Managers, each Manager owns one bounded goal graph loop, and each Worker owns one bounded node execution loop.

## When To Use

Use a goal graph when work depends on prior decisions or landed code and done
means merged PR plus recorded evidence. Keep the graph linear when every node
depends on its predecessor; allow parallel nodes only with disjoint write
boundaries, stable dependency contracts, independent verification, and an
explicit fan-in order. Do not use this protocol for one-off changes,
exploratory work without durable tracker state, or projects without an
integration branch and verification gates.

## Source Of Truth

The canonical tracker owns problem statements, scope, acceptance criteria, and issue/PR links. The repository goal-graph document owns sequencing and handoff rules. Suggested locations:

- `docs/reference/implementation-goal-chain.md`
- `docs/reference/implementation-goal-graph.md`
- `docs/engineering/goal-graph.md`
- `docs/engineering/goal-chain.md`
- `docs/reference/goal-chain.md`

## Required Sequence

1. Confirm the canonical tracker, integration branch, and verification commands.
2. When inheriting or re-auditing a graph, cross-reference ticket movements with Git/PR and orchestration evidence. Classify every existing node before retaining, replacing, or relaunching it.
3. Assign exactly one Manager owner to each bounded goal graph.
4. Build a dependency graph before creating a linear queue. Cluster related tickets only when they share a system boundary or acceptance evidence.
5. Start each goal from the current integration branch, not an old feature branch.
6. If decisions were made in a Lavish artifact, capture them in the tracker with `./{{CLI_NAME}} lavish tracker capture --issue <id> --artifact <html-file>` before implementation starts. Add `--decisions <file>` when decisions are recorded separately.
7. Create one ticket-backed branch for the goal.
8. Produce a concise implementation plan before large edits.
9. Implement only the scoped goal.
10. Run local verification and record commands/results.
11. Open a PR with evidence and resolve review.
12. When no-mistakes is initialized for the repository, run the PR gate before merge.
13. Merge the PR into the integration branch.
14. Record merged PR, merge or squash integration commit, closed or linked issues, verification evidence, residual risks, and next goal.
15. Start dependent work only after prerequisite merge or squash integration commits are visible from the integration branch unless the goal graph explicitly allows speculative work.

## Graph And Orchestration Templates

Use the bundled goal-graph assets for DAG planning and delivery evidence:

- `docs/templates/goal-graph/implementation-goal-graph.md`: durable graph shape with dependencies and fan-in.
- `docs/templates/goal-graph/orchestration-ledger-template.md`: goal-specific branch, PR, merge, and verification evidence that supplements `ops/orchestration.json`.
- `docs/templates/goal-graph/orchestrator-thread-prompt.txt`: repository-merge specialization for a Boss prompt.
- `docs/templates/goal-graph/manager-thread-prompt.txt`: repository-merge specialization for a Manager workstream.
- `docs/templates/goal-graph/subgoal-thread-prompt.txt`: repository-merge specialization for one Worker node.

The portable onboarding package also includes `skills/goal-graph-loop/SKILL.md` for graph creation, subgoal orchestration, and fan-out/fan-in planning.

## Orchestration Composition

For delegated goal graphs, declare goal nodes in `ops/orchestration.json` with:

- a canonical issue as `workRef`
- `workKind: engineering` or another accurate domain slug
- `governingProtocols` containing `AGENT-ORCHESTRATION` and `GOAL-GRAPH`
- `completionProfile.type: repository-merge`
- required evidence covering the merged PR, reachable integration commit, verification, issue disposition, residual risks, and downstream unlocks

Use `./{{CLI_NAME}} orchestration next`, `orchestration prompt`, and `orchestration launch-spec` for hierarchy and task launch. Use `goals status`, `goals verify`, and `goals start-prompt` for goal-graph-specific local evidence. Do not maintain a second role or lifecycle taxonomy in this protocol.

The Manager repeatedly observes tracker, integration, Worker, PR, and ledger state; audits or rewrites its graph; selects dependency-eligible Workers; monitors and reviews; controls fan-in; reconciles evidence and downstream unlocks; and repeats until every owned node is terminal. The Boss handles dependencies and fan-in across Managers, not the Manager's internal loop.

## Guardrails

- Keep secrets out of repo, chat, logs, tickets, commits, and CI.
- Do not close foundation work as product acceptance unless the visible product path has been verified.
- Do not carry scratch context into the next goal. Put durable decisions in repo docs or tracker comments.
- Do not treat Lavish feedback as implementation scope until the decision has been captured in the canonical tracker or an approved repository decision record.
- Do not broaden a goal into unrelated tickets.
- Do not create a replacement Worker solely because an earlier thread is unavailable; first prove from tracker and Git/PR evidence that the outcome is incomplete and unowned.
- Preserve unrelated user work and require approval for destructive, production, financial, privacy-sensitive, or external-message actions.

## CLI Support

Use the repo CLI when the goal-graph module is active:

```bash
./{{CLI_NAME}} goals status
./{{CLI_NAME}} goals verify <goal-id>
./{{CLI_NAME}} goals start-prompt <goal-id>
./{{CLI_NAME}} orchestration next
./{{CLI_NAME}} orchestration launch-spec <node-id>
./{{CLI_NAME}} lavish tracker reconcile --issue <id> [--dry-run]
```

`goals status` is read-only and may run before activation. `goals verify` rejects missing linked issue evidence, unresolved placeholders, negated verification text, negated PR evidence, missing residual-risk evidence, and merge or squash integration commits that either do not match the recorded PR number or are not reachable from the configured local integration branch or its configured local remote-tracking ref. Generated CLI config defaults `integrationBranch` to the default branch, `integrationRemote` to `origin`, `requiredGoalCloseoutFields` to `Issues:` and `Residual risks:`, and `trackerIssuePattern` to an empty value with common GitHub/Jira/Linear/Azure-style issue references accepted by default, with or without a trailing colon; update those values when the repository uses a different integration branch, remote, tracker reference shape, or migrated goal schema. Fetch or pull the integration branch first if the PR was just merged remotely. The command does not verify live PR state, merge, update trackers, or create the next thread. `goals start-prompt` prints a bounded goal prompt, truncates long objectives with an `objective_preview` size hint, and accepts `--full` when the complete objective is needed.

Fresh generated harnesses fail closed on `Issues:` and `Residual risks:` through `requiredGoalCloseoutFields`. Older configs that omit that key enforce only closeout fields declared in each goal; add the key to opt into the fresh strict default, or set it to `[]` as an explicit migration opt-out. Additional entries in `requiredGoalCloseoutFields` are enforced as required closeout fields with non-placeholder evidence. The CLI also accepts `Linked issues:` and `Closed issues:` as issue-evidence aliases. Verification lines must include an explicit passing result such as `passed`, `verified`, `succeeded`, or `completed`. Keep custom note fields outside the `Verification:` block, or separate them with a blank line. Non-bulleted runner or result lines inside `Verification:` are still evaluated for failure tokens; note-style labels such as `Notes:` end the verification block.

## Verification

A goal is complete only when:

- PR is merged into the integration branch
- merge or squash integration commit is recorded in `Merge commit`, reachable from the integration branch, and matches the recorded PR
- linked issue/PR evidence exists
- local verification evidence is recorded
- residual risks are named or explicitly absent
- dependent nodes are unlocked, blocked, or superseded from current integration branch state
- next goal is queued from the current integration branch as `Goal N: Title` or an issue link, or the goal is explicitly marked as final with `Next goal: none`

## Update Rules

When this protocol changes, update `AGENTS-TOC.md`, `ops/HARNESS-CHECKLIST.md`, CLI help/tests, and any goal-graph templates in the same change. Changes to roles, lifecycle, trust, authority, titles, or launch contracts belong in `AGENT-ORCHESTRATION.md` and `ops/orchestration.json` first.
