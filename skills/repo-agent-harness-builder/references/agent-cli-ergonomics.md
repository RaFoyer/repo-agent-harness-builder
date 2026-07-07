# Agent CLI Ergonomics

## Purpose

Use this reference when building or extending an agent-facing CLI in a generated harness. It adapts the AXI ideas from https://axi.md/ to repository harnesses: agents should get compact state, clear next actions, and deterministic errors through the shell without loading a large tool schema.

## When To Use

Read this before:

- changing `apps/cli/src/*` output
- adding a command family to the generated CLI skeleton
- wrapping an external service or MCP server behind a repo-local command
- adding hooks, skills, or session-start context that points agents at CLI commands

## Design Contract

The harness CLI remains agent-agnostic. AXI-style behavior is a command/output contract, not ownership by one client or one transport.

- `./{{CLI_NAME}}` with no arguments prints a compact home view, not a manual.
- `./{{CLI_NAME}} help` remains the concise command reference for humans and fallback discovery.
- stdout carries agent-consumed data, structured usage errors, and relevant next-step hints.
- stderr is for debug/progress details that agents do not need to parse.
- exit code `0` means success, including safe no-ops; `1` means the request could not be satisfied; `2` means usage error.
- unknown commands, unknown flags, and missing required flags fail before any dependency call.

## Output Shape

Prefer TOON-shaped output for lists and structured detail views. Keep internal logic in ordinary objects; convert at the output boundary.

Home view pattern:

```text
bin: "./{{CLI_NAME}}"
description: "Operate the {{PROJECT_NAME}} repository harness"
repo:
  name: "{{PROJECT_NAME}}"
  slug: "{{REPO_SLUG}}"
  default_branch: "{{DEFAULT_BRANCH}}"
  tracker: "{{TRACKER_NAME}}"
commands[9]{command,purpose}:
  "preflight","Run read-only session-start checks"
  "protocols","List routed protocol files"
  "checklist","Show harness module states"
  "doctor","Check local prerequisites"
  "ergonomics status","Audit agent-facing CLI ergonomics"
  "no-mistakes status","Check branch-to-PR validation gate setup"
  "lavish status","Check optional Lavish review-surface posture"
  "verify --dry-run","Preview the verification sequence"
  "help","Show the concise command reference"
help[3]:
  "Run ./{{CLI_NAME}} preflight before broad edits"
  "Run ./{{CLI_NAME}} protocols to choose a task protocol"
  "Run ./{{CLI_NAME}} help for all commands"
```

List view pattern:

```text
count: 3
protocols[3]{path,status}:
  "ops/protocols/CLI-INTERFACE.md","active"
  "ops/protocols/PRE-COMMIT.md","active"
  "ops/protocols/QA-BROWSER.md","inactive"
help[1]:
  "Run `./{{CLI_NAME}} protocols --help` for filtering options"
```

Error pattern:

```text
error:
  code: unknown-command
  command: "publsh"
  message: "Unknown command"
help[1]:
  "Run `./{{CLI_NAME}} help` for available commands"
```

## Build Sequence

1. Define the no-args home view before adding subcommands. Include the command label, one-sentence description, current repo/harness state, and a few concrete next steps.
2. Pick the smallest default schema that lets the agent decide the next move. Lists usually need an identifier/path, title/name, and status.
3. Put long text in detail views. Include a preview with a size hint and a `--full` escape hatch when content is truncated.
4. Include cheap aggregates that prevent follow-up calls, such as total counts, active/inactive totals, or pass/fail summaries.
5. Make empty states definitive. Say the scoped result is zero and keep exit code `0` when the command succeeded.
6. Validate flags and arguments before calling wrapped tools. Usage mistakes exit `2`.
7. Keep help contextual. Append only the next commands that follow from the output; keep the full command catalog behind `help`.
8. Add tests for stdout shape, exit codes, no-args home view, unknown commands, empty results, truncation hints, and secret redaction.

## Harness-Specific Guidance

- `preflight`, `doctor`, `verify`, and `precommit` may still print human-readable blockers, but new output should be structured enough for an agent to quote or route without rereading docs.
- `protocols`, `checklist`, `connections`, `goals`, and `design` are good candidates for tabular TOON lists because agents often filter or compare their output.
- `no-mistakes` wrappers should summarize availability, initialization, config state, and next steps without echoing raw wrapped-tool output.
- `lavish` wrappers should keep status checks local-only, make update checks explicit and non-mutating by default, and turn tracker captures into proposals rather than silent external writes.
- External-service wrappers should expose repo-local commands rather than asking the agent to discover a generic SDK, MCP tool catalog, or provider CLI from scratch.
- Session hooks and installable skills should point to the same CLI contract. A hook may provide live state; a skill should contain static guidance and noninteractive command examples.
- Never print secret values. Use names, scopes, booleans, counts, redacted fingerprints, or credential reference labels only.

## Verification

Run the generated CLI tests and these smoke commands after changing CLI behavior:

```bash
./{{CLI_NAME}}
./{{CLI_NAME}} help
./{{CLI_NAME}} ergonomics status
./{{CLI_NAME}} ergonomics audit --strict
./{{CLI_NAME}} no-mistakes status
./{{CLI_NAME}} lavish status
./{{CLI_NAME}} qa axi
./{{CLI_NAME}} preflight
./{{CLI_NAME}} protocols
node --test apps/cli/test/*.test.mjs
```

Use `ergonomics status` during ordinary verification. Mature generated harnesses should have `ergonomicsWarningBudget: 0`, so any warning is treated as drift. Use `ergonomics audit --strict` before changing command output or adding new command families.

For TOON encoders or validators, check the current TOON specification before implementation: https://toonformat.dev/reference/spec
