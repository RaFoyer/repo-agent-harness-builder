# Repo First Run

After the target repository is available locally:

The `{{CLI_NAME}}` placeholder is replaced in generated harnesses. If you still
see braces, ask the agent to scaffold or adapt the command before running it.

```bash
./{{CLI_NAME}} help
./{{CLI_NAME}} context
./{{CLI_NAME}} protocols
./{{CLI_NAME}} preflight
node --test apps/cli/test/*.test.mjs
```

Generated CLI tests should use temporary fixtures. If a test tries to rename the
target repo's `.git` directory, replace hooks, or delete real project folders,
stop and repair the test before continuing.

Then read:

- `AGENTS.md`
- `AGENTS-TOC.md`
- task-specific protocols in `ops/protocols/`

If preflight reports blockers, ask before mutating files, branches, credentials, or external systems.
