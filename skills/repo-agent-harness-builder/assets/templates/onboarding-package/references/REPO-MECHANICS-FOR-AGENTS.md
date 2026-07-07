# Repo Mechanics For Agents

Use this when the human is not expected to understand git, GitHub, branches, commits, pull requests, labels, or CI.

## Principle

The agent handles mechanics and explains only the human decision. Do not make the human translate tooling concepts.

## Human-Friendly Flow

1. Confirm the project folder or repository access.
2. Download or open the working copy.
3. Run read-only checks.
4. Explain whether the harness is present, missing, or stale.
5. Ask before writing scaffold files.
6. Run generated helper commands and tests.
7. If feature PR validation is in scope, check `no-mistakes status` and ask before setup.
8. Report what changed in plain language.

## Agent-Owned Mechanics

The agent should handle:

- clone/fetch/status checks
- branch naming and branch creation
- staged vs unstaged changes
- CLI install and test commands
- pull request preparation
- no-mistakes status checks and approval-gated setup
- CI result interpretation
- tracker updates, if authorized

## Human Decisions

Ask the human for:

- which project or folder to use
- whether to install or replace a skill
- whether to scaffold missing files
- whether to push/share/open review
- whether to initialize or use the no-mistakes PR gate
- whether to connect external systems

## Stop Points

Pause before:

- overwriting existing harness files
- rewriting commit history
- force-pushing
- deleting branches
- exposing secrets, tokens, credentials, or private URLs
- changing production/deployment settings
