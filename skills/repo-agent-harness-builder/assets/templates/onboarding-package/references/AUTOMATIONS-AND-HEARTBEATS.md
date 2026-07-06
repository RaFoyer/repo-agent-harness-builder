# Automations And Heartbeats

Use this when a harness should remind, poll, continue, verify, or summarize on a schedule.

## Surfaces

| Surface | Best use |
| --- | --- |
| Agent-client heartbeat/reminder | Recurring wake-up in the current conversation, preserving context when the client supports it |
| Agent-client noninteractive command | Scripted run with explicit sandbox, permission, and output settings |
| Agent-client goal/loop mode | Bounded continuation until a verifiable condition holds |
| Agent-client hooks | Deterministic checks at lifecycle points |
| Codex thread automation | Recurring wake-up in the current thread, preserving context |
| Codex `exec` | Scripted noninteractive run with explicit sandbox and approval settings |
| Codex `/goal` | Durable objective with a verifiable stopping condition |
| Codex hooks | Deterministic checks at lifecycle points |
| Claude `/loop` | Session-scoped repeated check-in |
| Claude scheduled task | Cloud or desktop scheduled prompt |
| Gemini/Kimi/Cursor equivalent | Closest supported scheduler, loop, noninteractive command, or hook surface |
| System cron/launchd | Local shell command on a schedule |

## Safe Defaults

Recurring work should be read-only unless the human has approved a specific write-capable workflow.

Good automations:

- weekly metadata-only Downloads inventory
- monthly duplicate-candidate report
- reminder to review quarantine
- long-running command check-in
- test or CI polling
- documentation drift report

Avoid unattended:

- file deletion
- automatic moves or renames
- uploads or sharing
- credential writes
- deployment or production changes

## Optional Loop Library

For richer loop examples, inspect the live Loop Library guide or catalog first:

```text
https://signals.forwardfuture.ai/loop-library/agents/
```

Use published-loop claims only when they come from the live catalog or a
reviewed local copy. The `npx skills --list` command below proves skill source
discovery only; it does not prove catalog freshness or install the library.

```bash
npx -y skills@1.5.12 add Forward-Future/loop-library --skill loop-library --list
```

Treat it as a pattern catalog. The local harness still needs its own owner,
scope, stop conditions, approval gates, run log, and verification.
Install it only after human approval and, where the installer supports it, pin
the source repository to a reviewed commit or tag.

## Automation Protocol

Every scheduled workflow should define:

- owner
- purpose
- cadence
- workspace or folder scope
- authority docs
- command or prompt
- allowed reads
- allowed writes
- approval gates
- forbidden actions
- stop conditions
- output location
- run log location
- artifact retention
- escalation path
- pause/disable instructions

## Example Read-Only Noninteractive Run

```bash
codex exec --sandbox read-only "Run the harness preflight and summarize blockers only."
```

Adapt the command to the selected client, such as Claude Code, Gemini CLI, Kimi, or Cursor, only after confirming that client's documented noninteractive surface. For write-capable work, require the human to approve the exact command, sandbox, and output path.

## Run Log

Append a short entry after each scheduled run:

```text
timestamp:
run ID:
workflow:
trigger:
scope:
files or systems inspected:
result:
blockers:
artifacts:
verification:
next action:
```

## Loop Guidance

Use loops for bounded, inspectable cycles:

1. Define the objective.
2. Define proof of progress.
3. Define when to stop.
4. Define a user-supplied cap, time budget, or deterministic no-progress/stagnation stop.
5. Keep each iteration read-only unless approved.
6. Write results to a report or run log.

For ongoing goals, prefer a goal/checkpoint pattern over an infinite loop.

For ticket-backed implementation sequences, prefer a goal-chain protocol over a
generic scheduled loop. Each goal should start from the current integration
branch, land one PR, record verification, and queue the next goal from merged
state. Useful read-only commands are `./<cli> goals status`,
`./<cli> goals verify <goal-id>`, and `./<cli> goals start-prompt <goal-id>`.
The start-prompt command should stay bounded by default and expose `--full` only
when the complete objective is needed.

If loops become an active module, add deterministic local commands such as
`./<cli> loops list`, `./<cli> loops validate`, and
`./<cli> loops run --dry-run <id>`. Do not activate loop commands until they
exist, are documented, and have focused tests.
