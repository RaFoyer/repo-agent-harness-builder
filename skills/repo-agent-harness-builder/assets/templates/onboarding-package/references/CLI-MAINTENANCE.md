# CLI Maintenance

The CLI is part of the harness contract.

When changing commands:

1. Change command implementation.
2. Update `help`.
3. Update `CLI-INTERFACE.md`.
4. Add or update tests.
5. Run `./{{CLI_NAME}} help` and the command's safe mode.

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
