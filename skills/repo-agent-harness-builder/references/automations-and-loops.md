# Automations And Loops

## Surface Map

Use current product surfaces rather than editing private app state by hand. Define the loop or automation in agent-neutral protocol fields first, then bind it to the client that will run it.

| Need | Prefer |
| --- | --- |
| Continue a current agent conversation later | The client's thread heartbeat, reminder, or scheduled follow-up |
| Run detached scheduled workspace work | The client's scheduler, cron, cloud task, or repository automation |
| Script repeatable local work | The client's noninteractive command in a controlled shell script |
| Keep working until a verifiable condition holds | The client's goal, loop, or bounded continuation mode |
| Run deterministic lifecycle checks | Client hooks, repo hooks, or CLI checks |
| Claude Code quick polling in an open session | `/loop` |
| Durable Claude scheduled work | Claude scheduled task/routine/desktop task |
| Codex-specific scheduled work | Codex thread automation, `codex exec`, hooks, or goal mode |
| Gemini/Kimi/Cursor-style work | Use the closest supported noninteractive, scheduled, or hook surface and keep the protocol fields unchanged |

## Agent Adapter Guidance

Do not make any one client the source of truth. The protocol should define purpose, scope, authority, allowed actions, verification, stop conditions, and logs. The adapter should only define how that protocol runs in a specific tool.

## Loop Library Reference

When a setup needs richer loop patterns, inspect the live Loop Library guide or
catalog first:

```text
https://signals.forwardfuture.ai/loop-library/agents/
```

Use published-loop claims only when they come from the live catalog or a
reviewed local copy. The `npx skills --list` command below proves skill source
discovery only; it does not prove catalog freshness or install the library.

```bash
npx -y skills@1.5.12 add Forward-Future/loop-library --skill loop-library --list
```

Use it as a reference catalog for bounded loop design, not as a replacement for
local harness authority. The local protocol must still record scope,
permissions, stop conditions, verification, logs, and owner.

Install it only after human approval and, where the installer supports it, pin
the source repository to a reviewed commit or tag.

## Codex Guidance

Official Codex docs describe thread automations as heartbeat-style recurring wakeups attached to the current thread, useful when the work should preserve thread context. Codex non-interactive mode uses `codex exec`; by default it runs read-only, and automation should use the least sandbox permission needed. Official Codex docs also describe `/goal` for long-running work with a clear objective, validation loop, and stopping condition.

Do not tell agents to hand-edit app-owned automation state such as `~/.codex/automations`. Use the product surface or documented CLI/API.

## Claude Code Guidance

Claude Code docs distinguish:

- hooks for deterministic lifecycle actions
- `/loop` for session-scoped repeated prompts or polling
- scheduled tasks for recurring prompts
- `/goal` for continuing until a condition is met
- non-interactive `claude -p` for scripts and batch work

Session-scoped loops are not durable automation. They depend on the session and tool availability.

## Other Agent Clients

For Gemini CLI, Kimi, Cursor, and similar coding agents, document the exact supported surface in the local harness after confirming it exists. If no durable scheduler exists, use the repository CLI plus system cron/launchd/cloud scheduler, and keep the agent prompt bounded by the same protocol fields.

## Scheduled Work Protocol Fields

Every recurring workflow should document:

- owner
- purpose
- cadence
- workspace or folder scope
- authority docs
- allowed reads
- allowed writes
- approval gates
- stop conditions
- run log location
- artifact retention
- escalation path

## Optional CLI Contract

If the harness activates a loop or automation command family, add a tested CLI
home such as:

```text
./{{CLI_NAME}} loops list
./{{CLI_NAME}} loops validate
./{{CLI_NAME}} loops run --dry-run <id>
./{{CLI_NAME}} loops log <id>
```

`validate` should block missing owners, missing stop conditions, missing
approval gates for writes, missing run-log paths, and loops that have neither a
user-supplied cap nor a deterministic no-progress/stagnation stop. `run
--dry-run` should print the command or prompt, scope, allowed actions, and
artifacts without executing write-capable work.

For ticket-backed implementation sequences, prefer the `GOAL-CHAIN.md`
protocol and `./{{CLI_NAME}} goals ...` commands. Goal chains are not generic
schedules: each step must start from the current integration branch, land a PR,
record verification, and queue the next goal from merged state.

## Run Log Pattern

Each run should record:

- timestamp
- run ID
- trigger
- summary
- files or systems inspected
- blockers
- artifacts
- verification
- next action

## Safety Rules

- Keep scheduled work bounded.
- Prefer read-only checks unless the workflow is explicitly approved to write.
- Never schedule cleanup or file moves without plan/receipt/undo.
- Do not schedule external sends, pushes, uploads, deletes, or purchases without explicit policy and approval gates.
- Use heartbeats for short follow-up loops in the current thread; use cron/workspace automations for detached recurring jobs.
