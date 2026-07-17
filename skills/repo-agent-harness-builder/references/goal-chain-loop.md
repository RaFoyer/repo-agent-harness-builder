# Goal Chain Loop

Use this when a repository needs ticket-backed implementation work where each
goal must land with merge evidence before dependent work starts. The simplest
shape is a strict chain. When some work can safely run in parallel, use a
dependency-aware goal graph with an orchestration thread, subgoal threads, a
ledger, and fan-in gates.

## Fit Check

Use a goal chain when:

- work depends on prior merged code or decisions
- a tracker is canonical for scope and acceptance criteria
- the project has an integration branch
- verification evidence matters
- agents need fresh, bounded threads between implementation goals
- an orchestrator should track dependencies, subgoal threads, model/effort
  recommendations, PRs, merge order, and handoffs

Recommend a simpler one-shot workflow when the task is isolated, exploratory, or
lacks a tracker, integration branch, or verification gate.

## Design Steps

1. Confirm tracker, integration branch, first verification commands, PR gate
   expectations, and whether parallel work is allowed.
2. Cluster tickets by shared system boundary or acceptance evidence.
3. Create or update a goal-chain document from
   `assets/templates/goal-chain/IMPLEMENTATION-GOAL-CHAIN.md`, or a dependency
   graph from `assets/templates/goal-chain/IMPLEMENTATION-GOAL-GRAPH.md` when
   parallel work is safe. Generated harnesses also carry these under
   `docs/templates/goal-chain/` for repo-local use.
4. Add or activate `ops/protocols/GOAL-CHAIN.md`.
5. Route `AGENTS-TOC.md` to the protocol and mark the checklist row active only
   after tracker, integration branch, and verification gates exist.
6. If review decisions were made in Lavish, capture them in the tracker or an
   approved decision record with `./{{CLI_NAME}} lavish tracker capture --issue
   <id> --artifact <html-file>` before starting the implementation goal. Add
   `--decisions <file>` when decisions are in a separate file.
7. When project orchestration is active, define nodes in
   `ops/orchestration.json`, validate with `orchestration validate`, and use
   `orchestration launch-spec <node-id>` as the authority-bounded base prompt.
8. Add `assets/templates/goal-chain/ORCHESTRATOR-THREAD-PROMPT.txt`,
   `MANAGER-THREAD-PROMPT.txt`, or `SUBGOAL-THREAD-PROMPT.txt` only as the
   repository-merge specialization for that launch spec. Track goal-specific
   merge evidence with `assets/templates/goal-chain/ORCHESTRATION-LEDGER.md`.
   Require the first
   deliverable to be a concise implementation plan naming files, integration
   points, verification commands, risks, and PR exit criteria.
9. Use `./{{CLI_NAME}} goals status` to inspect the chain and
   `goals start-prompt <goal-id>` for a bounded goal-specific prompt. If the
   objective is truncated, rerun with `--full` only when the complete objective
   is needed.
10. Fetch or pull the integration branch if the PR was just merged remotely,
   then use `./{{CLI_NAME}} goals verify <goal-id>` before closing a goal.
   The generated verifier inspects local git evidence and recorded text; it does
   not verify live PR state. Fresh generated CLIs require `Issues:` and
   `Residual risks:` by default through `requiredGoalCloseoutFields`; older
   configs that omit that key enforce declared closeout fields only, and
   migrated chains can set the key to `[]` when they intentionally opt out of
   default closeout fields.

## Required Goal Fields

Each goal should include:

- title and objective
- linked issue numbers
- scope and out-of-scope boundaries
- exit criteria
- verification expectations
- sequencing constraints
- execution mode and parallelism if using a graph
- fan-in or handoff target if using a graph

Completed goals should additionally include:

- merged PR
- merge or squash integration commit reachable from the integration branch and matching the recorded PR
- positive verification results, not placeholders or negated text
- closed or linked issues
- residual risks
- next goal as `Goal N: Title` or an issue link, or `Next goal: none` for the final goal
- dependent-node unlocks, blockers, or superseded nodes when using a graph

## Safety Rules

- `AGENT-ORCHESTRATION.md` owns roles, title grammar, immediate-parent links,
  lifecycle, trust, authority, and delegation budgets. This workflow must not
  redefine or expand them.
- The goal-chain ledger supplements the orchestration registry with delivery
  evidence; it does not replace it.

- Do not start the next goal from an unmerged feature branch unless the chain
  explicitly allows parallel work.
- Do not start dependent graph nodes until prerequisite PRs are merged and
  visible from the integration branch unless the graph explicitly allows
  speculative work.
- Do not report a goal complete without merged PR, merge or squash integration
  commit reachable from the integration branch and matching the recorded PR,
  positive verification result, and next-goal evidence or explicit final-goal
  marker.
- For parallel nodes, use disjoint write boundaries, stable dependency
  contracts, independent verification, and explicit fan-in order.
- When the repository has initialized no-mistakes, run that PR gate before
  treating the PR as merge-ready.
- Do not copy scratch context into the next thread. Put durable decisions in
  tracker comments or repository docs.
- Do not treat Lavish feedback as implementation scope until it has been
  captured in the canonical tracker or an approved decision record.
- Do not let the CLI merge, update trackers, or create threads unless the target
  repository adds an explicit tested protocol for that authority.

## Bundled Skill

The portable onboarding package includes a `goal-chain-loop` skill copied from
the local standalone skill source. Use that skill when a human asks for graph
orchestration, durable Codex subgoal threads, orchestration ledgers, or
fan-out/fan-in planning. Use the generated repository `goals` CLI for read-only
local evidence checks and bounded start prompts.
