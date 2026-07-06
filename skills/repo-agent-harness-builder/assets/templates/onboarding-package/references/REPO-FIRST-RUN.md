# Repo First Run

After the target repository is available locally:

The `{{CLI_NAME}}` placeholder is replaced in generated harnesses. If you still
see braces, ask the agent to scaffold or adapt the command before running it.

```bash
./{{CLI_NAME}}
./{{CLI_NAME}} help
./{{CLI_NAME}} ergonomics status
./{{CLI_NAME}} no-mistakes status
./{{CLI_NAME}} context
./{{CLI_NAME}} protocols
./{{CLI_NAME}} preflight
./{{CLI_NAME}} verify --dry-run
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
If no-mistakes is available but not initialized, ask before running
`./{{CLI_NAME}} no-mistakes setup`. Use `--agent` only when the maintainer wants
to pin the user-local no-mistakes agent; otherwise leave existing local agent
config unchanged. If status reports an active no-mistakes run on another
branch/worktree, leave that run alone unless the current task is to manage it.
After local checks pass and a feature branch is committed, prefer the
no-mistakes gate before opening or merging a PR.
