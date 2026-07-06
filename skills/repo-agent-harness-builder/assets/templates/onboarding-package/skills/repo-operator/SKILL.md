---
name: repo-harness-operator
description: Use when operating inside a repository that has AGENTS.md, AGENTS-TOC.md, ops/protocols, and a repo-local CLI facade.
---

# Repo Harness Operator

## Workflow

1. Read `AGENTS.md` and `AGENTS-TOC.md`.
2. Identify the repo-local CLI facade from `AGENTS.md`, `ops/HARNESS-CHECKLIST.md`, or `ops/protocols/CLI-INTERFACE.md`.
3. If the CLI name is unclear, stop and ask before guessing.
4. Run the discovered CLI's `preflight` command before broad work.
5. Use `AGENTS-TOC.md` to select task-specific protocols.
6. Before installing or requesting generic connectors, run the discovered CLI's `connections plan` command when that command exists.
7. Prefer the repo-local CLI for repeatable checks and repo operations.
8. Keep docs, CLI help, and tests in sync; run the CLI ergonomics audit when command output changes.

If the repo has no native harness yet, use `repo-agent-harness-builder` to scaffold one.
