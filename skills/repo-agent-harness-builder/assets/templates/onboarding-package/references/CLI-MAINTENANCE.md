# CLI Maintenance

The CLI is part of the harness contract.

Agent-facing output should be AXI-shaped:

- no arguments show compact live harness state, not a full manual
- `help` remains the concise command catalog
- stdout carries structured data, usage errors, and next-step hints
- stderr is for debug/progress details
- usage mistakes fail before dependency calls and exit `2`
- list/detail output favors minimal fields and definitive empty states
- `ergonomics status` audits this contract during ordinary verification and should report zero warnings
- `no-mistakes status` summarizes PR-gate setup without echoing raw tool output
- `qa axi` is an alias for teams looking for CLI-quality checks under QA

When changing commands:

1. Change command implementation.
2. Update `help`.
3. Update `CLI-INTERFACE.md` and `AGENT-CLI-ERGONOMICS.md` if behavior changes.
4. Add or update tests.
5. Run `./{{CLI_NAME}}`, `./{{CLI_NAME}} help`, `./{{CLI_NAME}} ergonomics audit --strict`, and the command's safe mode.

For no-mistakes tooling, keep `./{{CLI_NAME}} no-mistakes status`,
`./{{CLI_NAME}} no-mistakes setup`, `.no-mistakes.yaml`, and
`scripts/setup-no-mistakes.sh` in sync. Setup must run `no-mistakes init` and
then confirm initialized status before reporting success. Do not echo raw status
output, fork URLs, local paths, account identifiers, or secret-like values.
Setup is mutating and should keep `.no-mistakes/` out of commits through local
git exclude when a checkout exists.

Keep comments near decision points:

- dispatch boundaries
- read-only vs mutating operations
- redaction and value-safety
- extension points
- failure messages that require human approval

Avoid comments that simply repeat code syntax.

For loop or automation commands, require a validation command before any run
command:

- list configured loops
- validate owner, scope, stop condition, approval gates, and run-log path
- dry-run the exact prompt or command
- write a run-log entry after execution

Do not mark loop tooling active in the harness checklist until those commands
exist and have tests.

For ticket-backed implementation chains, keep `goals` commands read-only unless
the repository adds stronger tested authority. Minimum useful commands are
`goals status`, `goals verify <goal-id>`, and `goals start-prompt <goal-id>`.
`goals start-prompt` should keep the default prompt bounded, report
`objective_preview` when truncating long objectives, and support `--full` for
the complete objective.
`goals verify` should reject missing linked issue evidence, placeholders,
negated verification text, negated PR evidence, missing residual-risk evidence,
and merge or squash integration commits that either do not match the recorded PR
number or are not reachable from the configured local integration branch or its
configured local remote-tracking ref. Accept successor references as
`Goal N: Title` or issue links; accept the exact `Next goal: none` marker only
as an explicit final-goal marker. The command inspects local git evidence and
recorded text; it does not verify live PR state.

The generated `goals` verifier reads `integrationBranch`, `integrationRemote`,
`requiredGoalCloseoutFields`, and optional `trackerIssuePattern` from CLI config.
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
Invalid tracker issue patterns should be reported as configuration blockers, not
silently ignored.
