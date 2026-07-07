# Goal Chain Loop

Use this when a repository needs sequential, ticket-backed implementation work
where each goal must land with merge evidence before the next goal starts.

## Fit Check

Use a goal chain when:

- work depends on prior merged code or decisions
- a tracker is canonical for scope and acceptance criteria
- the project has an integration branch
- verification evidence matters
- agents need fresh, bounded threads between implementation goals

Recommend a simpler one-shot workflow when the task is isolated, exploratory, or
lacks a tracker, integration branch, or verification gate.

## Design Steps

1. Confirm tracker, integration branch, first verification commands, PR gate
   expectations, and whether parallel work is allowed.
2. Cluster tickets by shared system boundary or acceptance evidence.
3. Create or update a goal-chain document from
   `assets/templates/goal-chain/IMPLEMENTATION-GOAL-CHAIN.md`.
4. Add or activate `ops/protocols/GOAL-CHAIN.md`.
5. Route `AGENTS-TOC.md` to the protocol and mark the checklist row active only
   after tracker, integration branch, and verification gates exist.
6. If review decisions were made in Lavish, capture them in the tracker or an
   approved decision record with `./{{CLI_NAME}} lavish tracker capture --issue
   <id>` before starting the implementation goal.
7. Use `./{{CLI_NAME}} goals status` to inspect the chain and
   `./{{CLI_NAME}} goals start-prompt <goal-id>` to create a bounded thread
   prompt. If the objective is truncated, rerun with `--full` only when the
   complete objective is needed.
8. Fetch or pull the integration branch if the PR was just merged remotely,
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

Completed goals should additionally include:

- merged PR
- merge or squash integration commit reachable from the integration branch and matching the recorded PR
- positive verification results, not placeholders or negated text
- closed or linked issues
- residual risks
- next goal as `Goal N: Title` or an issue link, or `Next goal: none` for the final goal

## Safety Rules

- Do not start the next goal from an unmerged feature branch unless the chain
  explicitly allows parallel work.
- Do not report a goal complete without merged PR, merge or squash integration
  commit reachable from the integration branch and matching the recorded PR,
  positive verification result, and next-goal evidence or explicit final-goal
  marker.
- When the repository has initialized no-mistakes, run that PR gate before
  treating the PR as merge-ready.
- Do not copy scratch context into the next thread. Put durable decisions in
  tracker comments or repository docs.
- Do not treat Lavish feedback as implementation scope until it has been
  captured in the canonical tracker or an approved decision record.
- Do not let the CLI merge, update trackers, or create threads unless the target
  repository adds an explicit tested protocol for that authority.
