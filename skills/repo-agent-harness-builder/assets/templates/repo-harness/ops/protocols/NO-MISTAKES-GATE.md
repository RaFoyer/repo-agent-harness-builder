---
protocol_id: NO-MISTAKES-GATE
title: No-Mistakes Validation Gate
status: inactive
version: 0.1.0
owner: repo-maintainers
last_reviewed: YYYY-MM-DD
summary: Strongly recommends no-mistakes as the branch-to-PR validation gate for harness changes and feature work.
related_protocols:
  - CLI-INTERFACE
  - PRE-COMMIT
  - SESSION-PREFLIGHT
  - AGENT-CLI-ERGONOMICS
---

# No-Mistakes Validation Gate

## Purpose

Use no-mistakes as the strongly recommended final branch-to-PR validation loop
after local checks pass and before asking maintainers to merge a feature branch.

This protocol is scaffolded as `inactive` because no-mistakes needs repository
remote setup. Treat it as the default activation path for code-bearing repos
unless the maintainer explicitly chooses a different PR validation system.

## Source Of Truth

- Repo policy: `.no-mistakes.yaml`
- Local setup script: `scripts/setup-no-mistakes.sh`
- CLI wrappers: `./{{CLI_NAME}} no-mistakes status` and `./{{CLI_NAME}} no-mistakes setup`
- Local no-mistakes state: outside the repository, managed by the no-mistakes tool

## Standard Flow

1. Run `./{{CLI_NAME}} preflight`.
2. Run `./{{CLI_NAME}} no-mistakes status`.
3. If setup is not initialized, ask for approval, then run `./{{CLI_NAME}} no-mistakes setup`.
4. Create or continue work on a feature branch.
5. Run `./{{CLI_NAME}} verify` and any task-specific checks.
6. Commit the branch.
7. Push the committed branch through no-mistakes with `git push no-mistakes <branch-name>`.
8. Review any no-mistakes findings or auto-fixes before merging.

## Guardrails

- Do not print raw no-mistakes status output into chat, tickets, logs, or docs
  until it has been reviewed for local paths, account details, and secrets.
- Use `./{{CLI_NAME}} no-mistakes status` for value-safe summaries.
- Do not pass unattended approval flags to no-mistakes unless the user has
  explicitly approved unattended operation for that run.
- Treat `./{{CLI_NAME}} no-mistakes setup` as a mutating operation because it
  can change local no-mistakes and git remote state.
- Keep repo-local `.no-mistakes/` state out of commits. The generated setup
  flow adds `.no-mistakes/` to `.git/info/exclude` when a git checkout exists.
- Keep generated harnesses agent-agnostic. Use `agent: auto` unless the repo has
  chosen a concrete agent in protocol.
- Remember that no-mistakes reads trusted command and agent configuration from
  the default branch unless the repository intentionally opts into trusting
  branch-local commands.
- Prefer deterministic repo-local commands in `.no-mistakes.yaml`; do not put
  credentials, machine-local paths, or private service endpoints in that file.

## Verification

Run:

```bash
./{{CLI_NAME}} no-mistakes status
./{{CLI_NAME}} verify --dry-run
./{{CLI_NAME}} ergonomics audit --strict
```

When no-mistakes is installed and initialized, the final PR gate is:

```bash
git push no-mistakes <branch-name>
```

## Update Rules

- If `.no-mistakes.yaml` changes, update this protocol and CLI help when behavior
  changes.
- If no-mistakes setup changes, update both `scripts/setup-no-mistakes.sh` and
  `./{{CLI_NAME}} no-mistakes setup`.
- If this protocol becomes `active`, record the owner, default branch, and
  expected PR gate in the repository checklist.
