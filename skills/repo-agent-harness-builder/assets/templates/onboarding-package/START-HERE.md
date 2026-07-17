# Start Here

Give this entire archive to an agent. You do not need to unpack it manually.

An agent means the AI assistant or coding helper you are using, such as Codex,
Claude Code, Gemini CLI, Cursor, Kimi, or another tool that can inspect files
and help set up a project.

Use this message:

```text
Please inspect this archive, read START-HERE.md and AGENT-HANDOFF.md, and help me set up the right kind of agent harness. Ask me simple questions first. Do not create files or folders, scaffold a harness, install or replace a skill, move, delete, upload, overwrite, share files, or schedule anything unless I approve a written plan.
```

The agent should first ask what you want:

1. A repository harness for a software project.
2. A non-GitHub project folder harness for a business, writing, research, or operations folder.
3. A personal file-steward harness for folders such as Downloads, Desktop, and Documents.
4. A portable reference package only, with no installation yet.

Plain decision aid:

- Choose repository harness if you already have a code project.
- Choose project folder if this is for documents, operations, research, or a business folder.
- Choose personal file steward if you want help organizing ordinary folders on your computer.
- Choose reference-only if you only want to read or share the pattern.

This package includes:

- an installable agent skill for Codex, Claude Code, Gemini CLI, Cursor, Kimi-style clients when supported by the local skill installer
- repository harness templates
- personal-folder harness templates
- CLI skeletons and scaffolding scripts
- optional no-mistakes PR-gate setup and status templates
- optional Lavish review-surface protocol and tracker-capture templates
- optional Boss/Manager/Worker orchestration registry, prompts, and ledger
- goal-chain templates for repository-merge work that composes with project orchestration
- plain-language setup references
- automation, heartbeat, and run-log templates

The generated command-line helpers assume macOS, Linux, or WSL/Git Bash with a
POSIX-style shell, Node.js 18 or newer, Python 3, and `git` for repository mode.
If you are on native Windows without WSL/Git Bash, ask the agent to use this as
a direct-read reference package first.

This package is built to exclude secrets, tokens, OAuth client secrets, private
keys, and local machine-specific paths. Ask the agent to verify `MANIFEST.json`
and run `scripts/verify-package.py` after extraction when Python is available;
the scanner is a safeguard, not a replacement for human review of anything you
plan to share.
If a checksum file was provided and checksum verification fails, ask the agent
to redownload or re-copy the zip and checksum once as a clean pair. If the
second verification fails, stop and ask the sender or maintainer for a fresh
package.
If Python 3 is not available, ask the agent to report `manifest unverified` and
use reference-only mode unless you explicitly accept the risk of installing or
scaffolding from an unverified archive.
If your assistant cannot inspect attachments or local files, do not treat a
pasted hash as verification. Use reference-only mode, a local terminal, or a
file-capable agent for verification.

Safe answers during setup:

- It is safe to name a system, such as "Google Drive" or "SharePoint".
- It is safe to say whether access is configured.
- Do not paste passwords, tokens, OAuth client secrets, private keys, cookies,
  or recovery codes into chat.
