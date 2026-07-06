---
protocol_id: AGENT-CLI-ERGONOMICS
title: Agent CLI Ergonomics
status: active
version: 0.1.0
owner: repo-maintainers
last_reviewed: YYYY-MM-DD
summary: Defines the content-first, structured-output contract for the repository CLI.
related_protocols:
  - CLI-INTERFACE
  - NO-MISTAKES-GATE
  - SESSION-PREFLIGHT
  - PRE-COMMIT
---

# Agent CLI Ergonomics

## Purpose

Make `./{{CLI_NAME}}` efficient for agents using shell execution. The CLI should expose compact state, deterministic next steps, and clear usage errors without forcing agents to inspect a large manual first.

## When To Use

Use this protocol when adding or changing CLI output, wrapping external tools, adding subcommands, or creating session hooks/skills that point agents at `./{{CLI_NAME}}`.

## Source Of Truth

- Command behavior: `apps/cli/src/`
- Command catalog: `apps/cli/src/help.mjs`
- Tests: `apps/cli/test/`
- General CLI contract: `ops/protocols/CLI-INTERFACE.md`

## Required Sequence

1. Keep `./{{CLI_NAME}}` with no arguments as the content-first home view.
2. Keep `./{{CLI_NAME}} help` as the concise command reference.
3. Before adding a command, define its default fields, empty state, usage errors, and contextual `help[]` hints.
4. Validate unknown flags and missing required values before calling dependencies.
5. Add or update tests for stdout shape and exit codes.
6. Run `./{{CLI_NAME}} ergonomics audit --strict`.
7. Update `CLI-INTERFACE.md`, this protocol, and help text in the same change.

## Output Contract

- stdout carries data, structured usage errors, and next-step hints.
- stderr is for debug/progress details only.
- Exit code `0` means success, including safe no-ops and definitive empty states.
- Exit code `1` means the request could not be satisfied.
- Exit code `2` means a usage error such as an unknown command, unknown flag, or missing required argument.
- Lists should use compact TOON-shaped rows with minimal default fields.
- Detail views may include longer text, but should truncate with a size hint and a `--full` escape hatch when needed.
- Empty states must say the scoped result is zero rather than returning blank output.

## Home View

The no-args command should print:

- `bin`: the command label, such as `./{{CLI_NAME}}`, not a local filesystem path
- `description`: one sentence describing this harness CLI
- `repo`: compact repository facts
- `commands[N]{command,purpose}`: a small set of high-value commands
- `help[N]`: concrete next-step command templates

## Guardrails

- Do not print secret values, OAuth tokens, private keys, or raw credential-bearing dependency output.
- Do not prompt interactively. Missing input should be a structured usage error.
- Do not silently ignore unknown flags.
- Do not make one agent client the owner of the CLI contract. Codex, Claude Code, Gemini CLI, Cursor, Kimi, and similar tools are adapters around the same shell interface.
- Keep contextual help relevant. Suggest the next useful command, not the entire manual.
- When wrapping no-mistakes or another external gate, summarize value-safe setup state instead of echoing raw tool output.

## Verification

Run:

```bash
./{{CLI_NAME}}
./{{CLI_NAME}} help
./{{CLI_NAME}} ergonomics audit --strict
./{{CLI_NAME}} no-mistakes status
./{{CLI_NAME}} qa axi
./{{CLI_NAME}} preflight
./{{CLI_NAME}} protocols
node --test apps/cli/test/*.test.mjs
```
