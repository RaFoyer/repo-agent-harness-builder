# Nontechnical Setup

Use this when the human may not know GitHub, terminal commands, branches, packages, or automation terms.

## First Conversation

Start by explaining that the agent can inspect files and prepare setup steps,
but the human stays in control of installs, writes, deletes, sharing, and
scheduled work.

Ask simple intent questions before naming tools:

1. What should this help manage?
2. Is this for a software repository, an ordinary project folder, or personal folders?
3. What should be off-limits?
4. Should the first pass be read-only?
5. Would reminders or scheduled checks be useful?
6. Are there private or role-restricted documents that should stay in Drive, email, SharePoint, or another governed system instead of the project folder?

Then classify setup modules as active, inactive, or not-applicable using `references/HARNESS-CHECKLIST.md`.

Do not require the human to have GitHub. If a repository is not available, use
project-folder or personal-folder mode first and leave GitHub setup as an
inactive optional module.

For generated command-line helpers, confirm macOS, Linux, or WSL/Git Bash with
a POSIX-style shell, Node.js 18 or newer, Python 3, and `git` for repository
mode. On native Windows without WSL/Git Bash, use direct-read/reference mode
until a Windows adapter is available.

## Plain-Language Meanings

| Term | Say this instead |
| --- | --- |
| repository | project folder with history |
| clone | download a working copy |
| branch | separate work lane |
| commit | saved checkpoint |
| pull request | review request |
| CLI | local helper command |
| protocol | durable instruction page |
| preflight | safe readiness check |
| automation | scheduled reminder or check |

## Consent Rules

Never treat setup as permission to mutate. Ask before:

- installing or replacing a global skill
- moving, renaming, deleting, uploading, or sharing files
- changing scheduled tasks
- writing secrets or credentials
- pushing code or opening pull requests

## Installation Wizard

Ask one question at a time. Prefer concrete choices over jargon. Repeat back the
chosen mode and safety boundaries before running scaffold or install commands.

For repository mode, collect:

- project name
- repo location or access path
- CLI helper name
- default branch
- tracker, if any
- external document/email systems and role boundaries, if any

For project-folder mode, collect:

- folder location
- desired CLI helper name
- whether the folder should become a git repo
- document/protocol categories
- off-limits subfolders
- private document locations that should be referenced, not copied

For personal-folder mode, collect:

- harness install folder
- managed folders
- off-limits folders to add to `excludedPaths` so inventory skips them
- metadata-only or content-aware scan
- cleanup style: suggest-only, prepare plans, or supervised apply
- reminder cadence, if any

## First Useful Output

End the first session with one small result:

- repository mode: no-args home, `help`, `ergonomics status`, `no-mistakes status`, `context`, and `preflight` ran
- project-folder mode: root instructions and TOC exist
- personal mode: metadata-only inventory exists
- reference-only mode: explain the package map and no installation performed
