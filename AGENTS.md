# Repo Agent Harness Builder Instructions

This repository publishes an agent-agnostic skill for building repository,
project-folder, and personal-folder harnesses.

## Source Of Truth

- Installable skill: `skills/repo-agent-harness-builder/SKILL.md`
- Skill references, scripts, and templates live under `skills/repo-agent-harness-builder/`
- Public install and usage docs live in `README.md`
- Review and release process docs live under `docs/`

## Working Rules

- Keep the harness agent-agnostic. Codex, Claude Code, Gemini CLI, Kimi, Cursor,
  and similar clients are adapters around the shared `AGENTS.md`, protocol, and
  CLI contract.
- Do not put secrets, tokens, OAuth client secrets, private keys, local machine
  paths, or private account details in this repo.
- Run `npm run check` before publishing changes.
- Use no-mistakes only when the user explicitly asks for it. Otherwise run the
  repository checks and use the normal GitHub PR, CI, and merge workflow.
- This meta repository's `.no-mistakes.yaml` intentionally uses Codex for its
  own PR gate; generated harness templates must remain agent-agnostic.
- If generated artifacts drift, update the source templates or scripts first,
  then regenerate.
- Keep client-specific adapter files small. They may contain display names,
  invocation hints, or default prompts; they must not fork the core skill.
