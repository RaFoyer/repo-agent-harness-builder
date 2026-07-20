# {{PROJECT_NAME}} Agent Instructions

This repository uses an agent harness. Keep this root file short and treat it as the always-on entry point.

## Source Of Truth

- Read `AGENTS-TOC.md` to find task-specific protocols.
- Follow `ops/protocols/*.md` for durable recurring work.
- Use `./{{CLI_NAME}}` for repeatable repository operations instead of ad hoc command sequences.
- Treat this repository as the home for non-privileged internal documentation that the company/project team may read.
- Put role-restricted or privileged documentation in the external authority named by protocol, such as Drive, SharePoint, email, a document system, or a credentialed database.
- Treat external tools and generated artifacts as useful context unless `ops/protocols/SOURCE-OF-TRUTH.md` or `ops/protocols/EXTERNAL-SYSTEMS.md` explicitly makes them authoritative.

## Fresh Session Start

1. Run `./{{CLI_NAME}} preflight` if the CLI is available.
2. Read `AGENTS-TOC.md`.
3. Load only the protocol files relevant to the task.
4. Prefer the repo CLI for checks, tracker operations, secrets posture, and skill sync.
5. Before opening or merging feature PRs, prefer the no-mistakes gate when it is initialized for this repo.

## Safety Defaults

- Do not expose secrets or credential values in chat, logs, tickets, or commits.
- Before browser-based or connector authentication, read `ops/protocols/CONNECTOR-AUTH-PROFILES.md` when present and use repo-scoped profiles rather than global mutable auth state.
- Route GitHub CLI operations through the repository facade and `GITHUB-AUTHORITY.md` when active; never let a Worker fall back to ambient global `gh` authentication.
- Ask before mutating shared branches, production systems, credentials, or external workspaces.
- Keep durable docs free of current status, meeting notes, and one-off handoff clutter.
- When changing protocols, update `AGENTS-TOC.md` and related CLI help in the same change.

## Communication

Write final intended messages for recipient-facing communication. Avoid edit-history language unless the recipient needs revision history to act.
