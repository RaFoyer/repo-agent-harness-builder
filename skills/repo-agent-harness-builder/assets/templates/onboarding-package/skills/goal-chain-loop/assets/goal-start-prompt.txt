Goal <N>: <Title>

First action: read the repository instructions, run preflight if available, and inspect issue #<id>.

Repository: <path>
Base: <branch> at <merge commit or current HEAD>
Orchestration thread: <thread id or description>
Issues:
- #<id>: <title>

Objective:
<one sentence>

Initial protocol:
1. Read AGENTS.md and any repo instruction index.
2. Run the repo preflight command if one exists.
3. Inspect issue bodies, comments, and linked PRs.
4. Confirm the base includes the prior goal merge when applicable.

Work shape:
- Create a ticket-backed branch from current <base>.
- Implement only this goal.
- Do not broaden into <non-goals>.
- Do not depend on unmerged sibling PRs unless the orchestration graph explicitly permits speculative work.
- Keep secrets out of repo, chat, logs, tickets, commits, and CI.

Expected first deliverable:
- Concise implementation plan naming files, integration points, verification commands, risks, and PR exit criteria.

Verification expectations:
- <command>
- <command>
- <manual QA, if relevant>

Goal close:
- Complete only after PR is merged into <base>, linked issue/PR evidence exists, verification evidence is recorded, and the orchestration ledger or handoff note is updated from current <base>.
