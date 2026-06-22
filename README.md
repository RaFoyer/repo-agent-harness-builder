# Repo Agent Harness Builder

Create an agent-friendly operating layer for a repository, project folder, or
personal folder. An agent means an AI coding assistant or file-capable helper
such as Codex, Claude Code, Gemini CLI, Cursor, Kimi, or another tool that can
inspect files and follow local instructions. The result is a short root
instruction file, lazy-loaded protocol docs, and a deterministic CLI that makes
repeatable agent work safer and easier to verify.

The durable contract lives in ordinary files in the target repo or folder:

- `AGENTS.md` and a table of contents for progressive disclosure
- lifecycle and maintenance docs for protocols
- a local CLI with `help`, `context`, `preflight`, `precommit`, `doctor`,
  `checklist`, `secrets`, and connection checks
- setup checklists with `active`, `inactive`, and `not-applicable` states
- value-safe secrets, external-authority, and connector boundaries
- optional loops, automations, heartbeats, and review workflows
- portable onboarding material for nontechnical recipients

Codex, Claude Code, Gemini CLI, Kimi, Cursor, and future coding agents are
adapters around that shared contract. No one agent client owns the harness.

## First Successful Result

After setup, a human or agent should be able to run a local helper command and
see a read-only readiness result, such as:

```bash
./harness help
./harness context
./harness preflight
```

For a personal-folder setup, the first useful result is normally a
metadata-only inventory report and a written plan before any file changes.

## Prerequisites

- macOS, Linux, or WSL/Git Bash with a POSIX-style shell for the generated CLI facade.
- Node.js 18 or newer and `npx` for skill installation and generated CLI tests.
- Python 3 for scaffold and packaging scripts.
- `git` for repository mode.
- `gh` only if you want the agent to create or publish GitHub repositories.

Native Windows without WSL/Git Bash is a direct-read/reference path until a
Windows adapter is added. Give the package to the agent and ask it to read
`START-HERE.md`, `AGENT-HANDOFF.md`, and `SKILL.md` directly.

Nontechnical recipients can give the zip package to an agent and ask it to walk
them through setup. They do not need to know GitHub before the first
conversation.

Beginner path:

1. Use the `repo-agent-harness-reference.zip` and
   `repo-agent-harness-reference.zip.sha256` files someone sent you, or ask a
   technical friend/agent to retrieve them from the latest GitHub release.
2. Attach or upload both files to the AI coding assistant your friend recommended.
3. Paste the prompt from `START-HERE.md`.
4. Ask the agent to verify the checksum for download corruption/asset mismatch
   and the manifest for extracted file integrity before installing anything.
   If the checksum fails, redownload both files once as a clean pair and verify
   again. If it still fails, stop and ask the sender or maintainer for a fresh
   package.
   If Python 3 is unavailable, the agent must say `manifest unverified`; use
   reference-only mode or explicitly accept that risk before installing or
   scaffolding from the archive.
5. If the assistant cannot inspect attachments or local files, do not treat a
   pasted hash as verification. Switch to a file-capable/local agent, use a
   local terminal verification path, or stay in reference-only mode.

## Agent Support Status

| Client | Status |
| --- | --- |
| Codex | Local installer path and generated harness checks are tested in this repo |
| Claude Code | Adapter install command is an example; verify a real destination install before promising support |
| Gemini CLI | Adapter install command is an example; verify a real destination install before promising support |
| Kimi, Cursor, other clients | Treat as direct-read adapters unless the local installer reports support |
| Unsupported clients | Ask the agent to read `SKILL.md`, `AGENT-HANDOFF.md`, and reference docs directly |

## Recipient Install

For nontechnical recipients, use the GitHub release archive plus `.sha256` and
manifest verification. That path gives the agent a fixed package manifest with
`sourceRef`, `sourceCommit`, file hashes, and a local verifier before anything
is installed or scaffolded.

Do not use the mutable `RaFoyer/repo-agent-harness-builder` install command as
the recipient trust path unless the installer supports an immutable reviewed tag
or commit ref and that exact form has been tested.

## Maintainer Install Smoke

These commands are for maintainers and technical collaborators after the GitHub
repository is public. They prove source discovery for the public repo ref that
the installer resolves; treat them as development/convenience installs, not as a
recipient integrity mechanism.

Detect supported agent clients:

```bash
npx -y skills@1.5.12 add RaFoyer/repo-agent-harness-builder --skill repo-agent-harness-builder -g
```

Example install commands for specific clients. These verify source discovery
unless the local installer also proves the destination adapter was installed:

```bash
npx -y skills@1.5.12 add RaFoyer/repo-agent-harness-builder --skill repo-agent-harness-builder --agent codex -g -y
npx -y skills@1.5.12 add RaFoyer/repo-agent-harness-builder --skill repo-agent-harness-builder --agent claude-code -g -y
npx -y skills@1.5.12 add RaFoyer/repo-agent-harness-builder --skill repo-agent-harness-builder --agent gemini-cli -g -y
```

Every client supported by your local `skills` installer:

```bash
npx -y skills@1.5.12 add RaFoyer/repo-agent-harness-builder --skill repo-agent-harness-builder --agent '*' -g -y
```

If a client is not supported by `npx skills`, give it this repository or the
generated reference archive and ask it to read `SKILL.md`, `AGENT-HANDOFF.md`,
and the reference docs directly.

## Use

After installation, ask your agent:

```text
Use repo-agent-harness-builder to set up a harness for this repository or folder.
Ask simple setup questions first. Do not move, delete, upload, overwrite, or
schedule anything until I approve a written plan. Do not create files or folders,
scaffold a harness, install or replace a skill, or share files until the plan
shows the target path, file count, and exact commands.
```

The skill can help with:

- software repository harnesses
- non-GitHub project-folder harnesses
- personal file-steward harnesses for folders such as Downloads and Documents
- portable onboarding packages
- CLI skeletons with preflight, precommit, doctor, checklist, secrets, and
  connection commands
- loops and recurring work definitions with bounded verification and stop rules

## Build The Portable Package

```bash
python3 skills/repo-agent-harness-builder/scripts/build_reference_package.py --out-dir outputs
```

The package is designed to be inspectable before a nontechnical person uses it
or drops it into an agent chat. The agent should inspect it, verify the
manifest, run the safety verifier, and guide the recipient through setup.

## Verify

```bash
npm run check
```

The check script validates:

- local skill discovery through a non-global `npx -y skills@1.5.12 add --list` dry run
- Python script syntax
- package build, manifest safety, package verification, and unsafe zip-name refusal
- generated repo harness CLI tests
- protected personal-folder scope behavior

After the GitHub repo is public, verify public install discovery with:

```bash
npm run check:public-install-only
```

## Repository Layout

```text
skills/repo-agent-harness-builder/  installable skill, scripts, refs, templates
examples/                           usage notes and generated package guidance
docs/                               review loop and publishing notes
scripts/check.sh                    local and CI verification
```

## License

MIT
