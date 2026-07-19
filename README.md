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
  `verify`, `checklist`, `qa`, `secrets`, connection checks, Lavish review
  posture, project-orchestration inspection, and goal-graph inspection
- strongly recommended no-mistakes setup and branch-aware status commands for
  branch-to-PR validation, with optional user-local agent pinning
- AXI-shaped CLI ergonomics: compact no-args home views, structured stdout,
  contextual next steps, and fail-loud usage errors
- optional Lavish review-surface commands for visual artifacts, explicit
  update checks, and tracker-decision capture before ticket-backed goals
- setup checklists with `active`, `inactive`, and `not-applicable` states
- value-safe secrets, external-authority, and connector boundaries
- repository-scoped connector authentication profiles for browser and CLI login flows
- optional loops, automations, heartbeats, and review workflows
- optional Boss/Manager/Worker project orchestration with explicit lifecycle,
  trust, authority, budgets, completion evidence, and nested portfolio,
  goal-graph, and bounded execution loops
- project-local `project-orchestration`, `goal-graph-loop`, and
  `codex-native-firstmate` skills with a deprecated `goal-chain-loop` alias
- an inactive-by-default Codex-native Firstmate adapter that gives each
  generated repository its own resident Boss capability, native task/worktree
  mapping, and project-local skill without requiring a global project registry
- portable onboarding material for nontechnical recipients

Codex, Claude Code, Gemini CLI, Kimi, Cursor, and future coding agents are
adapters around that shared contract. No one agent client owns the harness.
The launch contract composes skills in a fixed order: portable project
orchestration, the selected client adapter, an applicable domain loop such as
the goal graph, then node-specific skills. Missing required skills fail closed.

For Codex-heavy teams, the generated harness includes an opt-in
`codex-native-firstmate` profile. Firstmate is the client-facing Boss persona,
not a fourth role: one persistent Firstmate task owns the repository portfolio,
Managers own bounded workstreams, and Workers own bounded execution loops.
The capability is installed per repository but remains inactive until a human
configures its scope, authority, budgets, completion evidence, task creation,
worktree, integration, heartbeat, and retention policies. Cross-repository
fleet orchestration is optional composition above independent repo-local
Firstmates, never a prerequisite.

## First Successful Result

After setup, a human or agent should be able to run a local helper command and
see a read-only readiness result, such as:

```bash
./harness
./harness help
./harness ergonomics status
./harness no-mistakes status
./harness lavish status
./harness orchestration status
./harness orchestration adapter-status
./harness orchestration taxonomy
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
- `no-mistakes` only if you want the branch-to-PR validation gate; generated
  `no-mistakes status` reports when it is unavailable.
- `lavish-axi` only if you want optional HTML artifact review sessions;
  generated `lavish status` and `lavish update --check` keep this optional.

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
- CLI skeletons with no-args home views, ergonomics audits, preflight,
  precommit, verify, doctor, checklist, browser QA, secrets, connection
  commands, connector auth-profile planning, design status, optional Lavish
  review/tracker-capture commands, branch-aware no-mistakes status/setup with
  optional local agent pinning, skill/self checks, project orchestration
  validation/launch contracts, and goal-graph helpers
- project-wide Boss/Manager/Worker orchestration with independent lifecycle,
  trust, authority, budget, completion-profile, and loop-ownership controls
- goal graphs and recurring work definitions that compose with the general
  orchestration layer: Bosses manage Managers, Managers own goal-graph loops,
  and Workers own bounded node loops; a strict chain is a linear graph topology
- bundled orchestration and goal-graph assets for prompts, registries, ledgers,
  graph templates, and handoff records
- repo-local Codex-native Firstmate assets under `.codex/` and
  `.agents/skills/codex-native-firstmate/`, scaffolded as examples and inactive
  protocol support rather than an implicit runtime dependency; its custom-agent
  profiles are namespaced to preserve existing repository profiles
- repo-local portable skills under `.agents/skills/project-orchestration/` and
  `.agents/skills/goal-graph-loop/`, plus the one-release
  `.agents/skills/goal-chain-loop/` compatibility redirect

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
- generated no-mistakes setup/status contracts and harness verifier coverage
- protected personal-folder scope behavior

For feature PRs, prefer the no-mistakes gate after local checks when the
no-mistakes remote is initialized. This meta repository pins that gate to Codex;
generated harnesses remain agent-agnostic with `agent: auto`.

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
