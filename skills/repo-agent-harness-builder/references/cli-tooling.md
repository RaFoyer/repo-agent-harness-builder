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
| `ergonomics` | recommended | Audit agent-facing CLI output against AXI-shaped heuristics |
| `no-mistakes` | recommended | Check and initialize the branch-to-PR validation gate without raw tool output |
| `skills` | recommended | Sync repo-owned skills to local skill dirs |
| `self` | recommended | Check/update repo harness safely |
| `secrets` | optional | Value-safe secret inventory and command wrapper |
| `connections` | recommended | Validate permanent external-authority connection metadata, connector profiles, auth plans, and config-root guidance |
| `github` | recommended | Validate repository-scoped GitHub profiles and run capability-classified GitHub CLI operations—normally `gh-axi`—without ambient auth fallback |
| `qa` | optional | Inspect browser/Playwright/UI QA lanes and artifacts without live credentials |
| `loops` | optional | Validate and dry-run bounded loops, heartbeats, or scheduled work definitions |
| `orchestration` | recommended | Inspect project-wide hierarchy, lifecycle, autonomy, authority, budgets, eligibility, prompts, and adapter launch contracts |
| `goals` | recommended | Inspect ticket-backed goal graphs, strict-chain compatibility paths, local closeout evidence, and goal-thread prompts |
| `design` | optional | Report design-system governance status and, when activated, inspect safe design-system source pointers |
| `lavish` | optional | Check optional Lavish review-surface posture, update lavish-axi deliberately, run review sessions, and draft tracker captures |
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
apps/cli/src/util/agent-output.mjs
apps/cli/src/util/args.mjs
apps/cli/src/util/exec.mjs
apps/cli/src/util/secrets.mjs
apps/cli/src/commands/context.mjs
apps/cli/src/commands/checklist.mjs
apps/cli/src/commands/doctor.mjs
apps/cli/src/commands/protocols.mjs
apps/cli/src/commands/self.mjs
apps/cli/src/preflight/session.mjs
apps/cli/src/precommit/checklist.mjs
apps/cli/src/ergonomics/index.mjs
apps/cli/src/no-mistakes/index.mjs
apps/cli/src/skills/sync.mjs
apps/cli/src/secrets/index.mjs
apps/cli/src/connections/index.mjs
apps/cli/src/github/index.mjs
apps/cli/src/orchestration/index.mjs
apps/cli/src/goals/index.mjs
apps/cli/src/design/index.mjs
apps/cli/src/lavish/index.mjs
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

## AXI-Shaped Output Contract

Use `references/agent-cli-ergonomics.md` when changing any command output. The generated CLI should make the first agent invocation useful:

- no arguments print a compact content-first home view
- `help` prints the concise command catalog
- stdout carries structured data, usage errors, and next-step hints
- stderr is limited to debug/progress details
- usage mistakes exit `2` and explain the valid next command
- list/detail output favors TOON-shaped structures with minimal default fields
- empty states are explicit successes, not blank output

Do not make the CLI depend on one agent client. AXI-style behavior is a shell interface design pattern around the shared harness contract.

## Extension Contract

When adding a command:

1. Add the module under `apps/cli/src/...`.
2. Register it in `main.mjs`.
3. Add help text in `help.mjs`.
4. Add or update the relevant protocol.
5. Add tests in `apps/cli/test/`.
6. Run `./{{CLI_NAME}}`, `./{{CLI_NAME}} help`, `./{{CLI_NAME}} ergonomics audit --strict`, and the command's safe/default mode.

If any step is missing, the CLI and docs are out of sync.

## No-Mistakes Command Contract

Scaffold `no-mistakes` as a strongly recommended branch-to-PR quality gate for
repository harnesses. Minimum behavior:

- `no-mistakes status`: report whether no-mistakes is available, initialized,
  backed by `.no-mistakes.yaml` plus `scripts/setup-no-mistakes.sh`, and whether
  another branch/worktree already has an active no-mistakes run.
- `no-mistakes setup [--fork-url <url>] [--agent <agent>]`: after approval, run
  `no-mistakes init`, then fail closed unless a follow-up status check confirms
  initialization. `--agent` is an optional user-local pin; omit it to leave the
  collaborator's existing global no-mistakes agent config unchanged.
- `scripts/setup-no-mistakes.sh [--fork-url <url>] [--agent <agent>] [--check-only]`:
  provide the same setup path for direct shell use; `--check-only` verifies
  initialized status without changing no-mistakes or git state.
- `no-mistakes help`: show concise usage.

The wrapper must not echo raw `no-mistakes status`, local paths, fork URLs,
raw run tables, account identifiers, or secrets. Print booleans, states, exit
codes, sanitized branch/run summaries, and next steps. Keep generated
`.no-mistakes.yaml` agent-agnostic with `agent: auto` unless the repo protocol
adopts a concrete agent. Treat setup as mutating local no-mistakes/git state,
and keep `.no-mistakes/` out of commits through local git exclude when a
checkout exists.

## Ergonomics Command Contract

Scaffold `ergonomics` as a read-only quality gate for every repo harness. Minimum behavior:

- `ergonomics status`: inspect the local CLI implementation, protocol, help text, tests, and verify sequence; print structured blockers, warnings, checks, and next steps.
- `ergonomics audit --strict`: run the same inspection and exit non-zero on warnings.
- `ergonomics help`: show concise command usage.
- `qa axi`: optional alias for teams that look for CLI-quality checks under the QA command family.

The generated steady state is zero warnings with `ergonomicsWarningBudget: 0`. The command should fail on hard drift such as missing `AGENT-CLI-ERGONOMICS.md`, missing no-args home view, missing structured top-level or subcommand usage errors, command handlers that silently ignore argv, missing truncation escape hatches, unsafe high-risk output paths, or missing tests. Keep it read-only and credential-free.

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

## Project Orchestration Command Contract

Scaffold `orchestration` as the project-wide structured-delegation helper even
while `AGENT-ORCHESTRATION.md` remains inactive. It must not assume tickets,
branches, pull requests, or software delivery. Minimum behavior:

- `orchestration status [--example]`: summarize the explicit registry scope,
  roles, states, source (tracked example or private instance), and validation
  findings; an inactive valid example exits successfully but cannot drive
  operational commands. `--example` explicitly inspects the tracked contract
  without resolving operator-private state.
- `orchestration instances`: list named private instances for the selected
  operator without printing an absolute local path.
- `orchestration init <name>`: explicitly create one inactive private `0600`
  instance from `ops/orchestration.example.json`; refuse overwrite.
- `orchestration migrate <name>`: copy a legacy tracked registry into a new
  private `0600` instance, preserve the tracked source for reviewed removal,
  and report validation findings.

Select instances with safe `--operator` and `--instance` names. Composing CLI
facades use `REPO_ORCHESTRATION_OPERATOR` and `REPO_ORCHESTRATION_INSTANCE` so
the same private authority state is resolved without accepting a raw path.
Portable verification uses `--example` with `status`, `validate`, `liveness`,
`adapter-status`, or `taxonomy`; that selector ignores ambient instance names,
cannot be combined with `--operator` or `--instance`, and is rejected by every
operational command.
Repository-specific tracked metadata uses only a lowercase dotted namespace
under `extensions`, with a versioned `tracked-policy` envelope. The core CLI
treats that policy as non-authoritative discovery metadata: it cannot shadow or
change hierarchy, lifecycle, trust, authority, evidence, reservations, or
launch contracts, and the verifier rejects runtime or identity fields within
it.
- `orchestration directives`: show schema-v4 governed owner directives, target
  nodes, contract impact, target acknowledgement and resolution evidence, and
  parent-reconciliation state without mutating tasks or treating task messages
  as authority.
- `orchestration adapter-status [--example]`: inspect the local Codex-native
  Firstmate adapter posture, installed assets, activation blockers, and
  optional native capability plan without contacting Codex or changing
  configuration. `--example` inspects the tracked inactive contract.
- `orchestration taxonomy [--example]`: preview portable, nautical, and
  executive display labels plus the configured title grammar without changing
  configuration or tasks. `--example` inspects the tracked inactive contract.
- `orchestration hierarchy`: explain portable portfolio/workstream/work-unit
  responsibility and parent links without implying authority; direct configured
  client title grammar to the selected adapter protocol.
- `orchestration trust`: show the T0-T5 autonomy ceiling and inheritance rules.
- `orchestration validate [--example]`: reject invalid parent/dependency graphs, duplicate
  Bosses, title drift, invalid lifecycle evidence, trust promotion without
  evidence, child authority or budget exceeding the parent, and active-node,
  active-child, or depth budget overruns. Validate schema-v5 optional root and
  logical Manager parent bindings without weakening task-parent requirements
  for Workers.
- `orchestration liveness [--example]`: show the configured progress signal,
  unchanged-check and same-failure retry budgets, shared-runtime recovery
  posture, each active node's liveness owner, and its scheduled or event-driven
  next control, including overdue schedules and event watchdogs. Reject
  fingerprints not derived from canonical typed evidence references;
  non-contiguous, truncated, incorrectly hashed, or non-CAS observation
  histories; observations not owned by the current project owner/active
  immediate parent; future-dated or overlong control intervals; unpaired
  failure state; retry counters not reset after a changed precondition; dual
  or absent wake conditions; and exhausted budgets that have not stopped at a
  blocked parent-recovery boundary. Observation and active-set hashes use
  UTF-8 compact JSON with recursively ASCII-sorted object keys and
  sorted/deduplicated printable-ASCII references. Validate private
  shared-runtime recovery receipts so a future, stale, changed, or missing
  fresh `actionStartedAt` comparison cannot authorize a recovery. Require an
  authoritative runtime-scoped claim and closed-admission proof from outside
  the repository registry before the first snapshot. Block recovery if any
  start path can bypass that authority. The repository CLI must not treat a
  local/XDG ledger, project registry, or same-user-generated hash as that
  authority. Until a separately implemented coordinator cryptographically
  authenticates claims, anchors monotonic history, and atomically gates every
  raw start path, reject every non-empty recovery mirror. Ordinary
  orchestration without recovery receipts remains available. Validate the
  future private mirror's
  deterministic runtime-scope/action/active-set/precondition claim key,
  per-registry nonterminal exclusivity, bounded immutable lease, terminal
  replay protection, monotonic hash-linked transition history with a matching
  current snapshot, terminal admission reopening, and expired-claim owner
  action. Only that claimant may record `completed` or evidence-backed
  `failed`; the project mirror never claims machine-wide lock authority.
- `orchestration next`: list dependency-eligible graph nodes without creating
  tasks.
- `orchestration prompt <node-id>`: print the node's role, work kind, governing
  protocols, immediate parent, trust level, exact authority envelope,
  completion profile, objective, and first action.
- `orchestration launch-spec <node-id>`: print a JSON task-creation contract for
  a thin client adapter. Reject terminal or already materialized nodes,
  unsatisfied dependencies, disallowed inactive-instance launches, parents
  without T3 delegation authority, required parent task IDs, and exhausted
  child or project capacity. Schema-v5 optional-root mode may launch a logical
  Manager against the configured Boss node before that Boss has a task.
  The contract includes the monotonic registry revision, deterministic launch
  key, expected registry/node/parent states and task identities, parent trust
  and full authority envelope including approval gates, and capacity
  preconditions. An adapter must atomically reserve the node and advance the
  revision before task creation, then compare the complete reserved-state
  contract—including target and parent trust plus full authority envelopes—immediately before the external call and again when binding the
  returned task ID. A stale or duplicate reservation must fail before side
  effects. The launch key is the durable task-API idempotency and reconciliation
  key: after an ambiguous create, crash, timeout, or bind failure, keep the
  reservation and reconcile by that key rather than creating again. Its callback
  requires a configured logical Boss rather than inserting a placeholder,
  requires an externally attested immutable task binding, and activates the
  instance when the first permitted Boss or logical Manager is reserved.

`init` and `migrate` only create a new private `0600` instance and refuse
overwrite; every other orchestration command is read-only. A Codex, Claude
Code, Gemini CLI, Cursor, or other adapter may use a launch spec only when
current authority allows task creation, then must reserve the node by
compare-and-set, validate the current reservation contract immediately before
external task creation, use the launch key as the task API idempotency key, and
write the returned task ID and working state back only with the matching current
reservation contract.
This separates a portable repository contract from client-specific task APIs.

## GitHub Command Contract

Scaffold `github` as the repository-scoped GitHub facade. Minimum behavior:

- `github status`: validate profile shape without reading tokens or requiring
  inactive credentials.
- `github plan --profile <id>`: show value-safe repository, boundary, tier,
  credential kind, preferred CLI, and maximum capability metadata.
- `github run --profile <id> [--node <id>] [--approval-ref <ref>] [--dry-run] -- <GitHub CLI args>`:
  classify the command into one exact `github.*` capability, reject unknown or
  cross-repository targets, intersect profile and node authority, and execute
  with isolated `GH_CONFIG_DIR`, fixed `GH_REPO`, prompts disabled, and no
  ambient token fallback.

Write-capable execution requires an active orchestration node that allows both
the capability and exactly one matching `github.profile.<profile-id>` marker.
High-risk classified capabilities also require their inherited approval gate and
a value-safe `--approval-ref` that resolves in `ops/github-approvals.json` to
an approved record bound to the repository, node, capability, gate, and current
orchestration revision. Prefer `gh-axi` for supported operational
commands. Use upstream `gh` inside the same isolated profile only for
authentication or a deliberately supported surface. Keep Git transport
authority explicit because `git push` can bypass the GitHub CLI environment.

## Goal Graph Command Contract

Scaffold `goals` as a read-only helper when the harness includes
`GOAL-GRAPH.md`, even while the goal-graph workflow itself remains inactive.
Pair the read-only CLI with the bundled `goal-graph-loop` skill and the assets
under `assets/templates/goal-graph/`. `GOAL-CHAIN.md` and `goal-chain-loop`
remain deprecated compatibility aliases during migration.
Minimum behavior:

- `goals status`: show configured goals from the goal-graph document, including
  legacy chain paths, or report that no goal graph is configured without
  failing baseline verification.
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
  integration branch, remote, tracker shape, or migrated goal schema
  should update `integrationBranch`, `integrationRemote`, `trackerIssuePattern`,
  or `requiredGoalCloseoutFields`. Invalid tracker patterns should be reported
  as configuration blockers, not silently ignored.
- `goals start-prompt <goal-id>`: print a bounded goal-thread prompt using the
  repo path, integration branch, issue reference, objective, and verification
  expectations. Long objectives should be truncated with an `objective_preview`
  size hint and a `--full` escape hatch for the complete objective.

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

## Lavish Command Contract

Scaffold `lavish` as an optional visual review-surface helper when the harness
includes `LAVISH-REVIEW.md`, even while the module remains inactive. Minimum
behavior:

- `lavish status` / `lavish doctor`: report local protocol posture,
  project-skill presence, and whether `npx` is available without installing,
  contacting npm, opening a browser, or writing tracker state.
- `lavish update`: default to the same behavior as `lavish update --check`.
  `--apply` must be explicit for local tool mutation. Do not silently update
  `lavish-axi` from status, doctor, verify, or preflight.
- `lavish open <html-file>`, `lavish poll <html-file>`, and
  `lavish end <html-file>`: wrap `npx -y lavish-axi` with structured,
  value-safe summaries rather than raw dependency output. Validate the known
  pass-through flags instead of accepting arbitrary arguments.
- `lavish tracker capture --issue <id> [--artifact <html-file>] [--decisions <file>]`:
  draft a tracker update proposal from Lavish decisions and never write to
  Linear, Jira, GitHub Issues, or another tracker unless a repository-specific
  protocol adds tested write authority.
- `lavish tracker reconcile --issue <id> [--dry-run]`: preview the review
  artifact -> tracker capture -> ticket-backed goal -> local verification ->
  no-mistakes sequence.

Keep Lavish optional. Do not add `lavish-axi` as a required project dependency
unless a repository intentionally activates this protocol. Use fake command
runners in tests for update/open/poll/end.

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
./{{CLI_NAME}}
./{{CLI_NAME}} help
./{{CLI_NAME}} context
./{{CLI_NAME}} checklist
./{{CLI_NAME}} protocols
./{{CLI_NAME}} doctor
./{{CLI_NAME}} preflight
./{{CLI_NAME}} verify --dry-run
./{{CLI_NAME}} precommit --all
./{{CLI_NAME}} ergonomics audit --strict
./{{CLI_NAME}} no-mistakes status
./{{CLI_NAME}} lavish status
./{{CLI_NAME}} qa status
./{{CLI_NAME}} secrets help
./{{CLI_NAME}} connections status
./{{CLI_NAME}} connections auth-plan --profile example-gcloud
./{{CLI_NAME}} connections env --profile example-gcloud
./{{CLI_NAME}} orchestration status --example
./{{CLI_NAME}} orchestration validate --example
./{{CLI_NAME}} goals status
./{{CLI_NAME}} self check
```

Tests should use temporary directories and fake command runners for git/gh where possible. Test secret redaction explicitly.

## Maintenance Rules

- `help.mjs` is a contract, not decoration.
- `CLI-INTERFACE.md` must match command behavior.
- `AGENT-CLI-ERGONOMICS.md` must match the stdout, stderr, exit-code, and no-args behavior.
- `ergonomics status` must stay in the `verify` sequence so command-quality drift is visible.
- `preflight` and `precommit` must stay fast enough for routine use.
- Generated CLI syntax matrices or latest pointers are useful but must not become canonical truth.
