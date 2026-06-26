Goal <N>: <Title>

First action: read the repository instructions, run preflight, and inspect issue #<id>.

Repository: <path>
Base: <integration branch> at <merge commit or current commit>
Issue: #<id>

Objective:
<one sentence>

Work shape:
- Create a branch from current <integration branch>.
- Implement only this goal.
- Do not broaden into <non-goals>.
- Keep secrets out of repo, chat, logs, tickets, commits, and CI.

Expected first deliverable:
- Concise implementation plan naming files, integration points, verification commands, and PR exit criteria.

Verification expectations:
- <command>
- <manual QA, if relevant>

Goal close:
- Complete only after PR is merged into <integration branch>, evidence is recorded, and the next goal is queued from current <integration branch>.
