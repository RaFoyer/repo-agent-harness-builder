# Repo Agent Harness Builder

Give any repository or folder an **agent operating layer**: a short root
instruction file, lazy-loaded protocol docs, and a deterministic local CLI that
make agent work repeatable, safe, and verifiable.

"Agent" means any AI coding assistant that can read files and follow local
instructions — Codex, Claude Code, Gemini CLI, Cursor, Kimi, and others. The
harness lives in ordinary committed files, so no single agent client owns it;
each client is just an adapter around the same contract.

## What a generated harness gives you

**Core (every harness)**

- `AGENTS.md` plus a table of contents, so agents load context progressively
  instead of reading everything up front
- a local CLI (`./harness` or your repo's name) with deterministic commands:
  `help`, `context`, `preflight`, `precommit`, `doctor`, `verify`, `checklist`,
  `qa`, `secrets`, and connection checks — compact no-args home views,
  structured output, fail-loud errors
- setup checklists with `active` / `inactive` / `not-applicable` states
- value-safe boundaries for secrets, external authority, and connectors,
  including repository-scoped GitHub and connector-authentication profiles

**Optional layers (installed inactive; a human activates each one)**

- **Validation gate** — `no-mistakes` branch-to-PR validation with
  branch-aware status commands
- **Project orchestration** — Boss / Manager / Worker roles with explicit
  lifecycle, trust, authority, budgets, and completion evidence. Bosses manage
  Managers, Managers own goal-graph loops, Workers own bounded execution loops.
- **Codex-native Firstmate adapter** — maps orchestration onto native Codex
  tasks. Because Codex task creation accepts no idempotency key, every task is
  created through a repository-private **at-most-once broker**: issuance is
  sealed durably before the single create call, ambiguous outcomes are
  quarantined instead of retried, and bindings are externally attested. See
  the [project-orchestration reference](skills/repo-agent-harness-builder/references/project-orchestration.md)
  and [codex-native-firstmate reference](skills/repo-agent-harness-builder/references/codex-native-firstmate.md).
- **Review surfaces** — optional Lavish HTML-artifact review and
  tracker-decision capture
- **Automation** — loops, heartbeats, and review workflows

Harnesses work for software repositories, non-GitHub project folders, and
personal file-steward folders (Downloads, Documents), and can be exported as a
portable onboarding package for nontechnical recipients.

## Quick start

Install the skill (see below), then ask your agent:

```text
Use repo-agent-harness-builder to set up a harness for this repository or folder.
Ask simple setup questions first. Do not move, delete, upload, overwrite, or
schedule anything until I approve a written plan. Do not create files or folders,
scaffold a harness, install or replace a skill, or share files until the plan
shows the target path, file count, and exact commands.
```

After setup, prove readiness with read-only commands:

```bash
./harness
./harness context
./harness preflight
./harness orchestration status --example
./harness github status
```

`--example` inspects the tracked inactive contract without touching private
instance state.

## Prerequisites

- macOS, Linux, or WSL/Git Bash (native Windows is a direct-read path for now)
- Node.js 18+ and `npx`; Python 3; `git` for repository mode
- Optional, only if you activate the matching layer: `gh`/`gh-axi`,
  `no-mistakes`, `lavish-axi`

## Installing the skill

**Maintainers and technical collaborators** — install from the public repo:

```bash
npx -y skills@1.5.12 add RaFoyer/repo-agent-harness-builder --skill repo-agent-harness-builder -g
```

Add `--agent codex`, `--agent claude-code`, `--agent gemini-cli`, or
`--agent '*'` to target specific clients. Treat these as convenience installs,
not an integrity mechanism.

**Nontechnical recipients** — use the GitHub release archive instead. It ships
with a `.sha256` checksum, a signed manifest (`sourceRef`, `sourceCommit`, file
hashes), and a local verifier the agent must run before installing anything:

1. Get `repo-agent-harness-reference.zip` and its `.sha256` from the latest
   release (or from whoever sent it to you).
2. Attach both files to your AI assistant and paste the prompt from
   `START-HERE.md`.
3. The agent verifies checksum and manifest before setup. If verification
   fails twice on a fresh download, stop and ask the sender for a new package.
   If the agent cannot inspect local files, stay in reference-only mode — a
   pasted hash is not verification.

Do not use the mutable repo install command as a recipient trust path unless
the installer pins an immutable reviewed tag and that exact form was tested.

Build the package yourself with:

```bash
python3 skills/repo-agent-harness-builder/scripts/build_reference_package.py --out-dir outputs
```

## Agent support status

| Client | Status |
| --- | --- |
| Codex | Installer path and generated harness checks are tested in this repo |
| Claude Code, Gemini CLI | Install commands are examples; verify a real destination install before promising support |
| Kimi, Cursor, others | Direct-read adapters: point them at `SKILL.md` and `AGENT-HANDOFF.md` |

## Fleet-owned skills

The shared skills `repo-agent-harness-builder`, `project-orchestration`,
`goal-graph-loop`, `goal-chain-loop` (deprecated alias), and
`codex-native-firstmate` have one fleet-level owner. Generated repositories may
carry read-only reference snapshots under `.agents/skills/`, but downstream
sync commands must never replace, link, copy, or back up the fleet-owned copies
in a global client skill directory. Keep recoverable copies in a
non-discoverable archive (e.g. `.codex/skill-archives/<owner>/<timestamp>/`),
and use the
[upgrade prompt](skills/repo-agent-harness-builder/assets/templates/REPOSITORY-HARNESS-UPGRADE-PROMPT.md)
for customization-aware migration audits.

## Verifying this repository

```bash
npm run check
```

This validates skill discovery, script syntax, package build + manifest safety,
the generated CLI's full test suite, no-mistakes contracts, and
personal-folder scope guards. After the repo is public,
`npm run check:public-install-only` additionally proves public install
discovery. Feature PRs should go through the no-mistakes gate after local
checks pass; this meta repository pins that gate to Codex, while generated
harnesses stay agent-agnostic.

## Repository layout

```text
skills/repo-agent-harness-builder/  installable skill, scripts, refs, templates
examples/                           usage notes and generated package guidance
docs/                               review loop and publishing notes
scripts/check.sh                    local and CI verification
```

## License

MIT
