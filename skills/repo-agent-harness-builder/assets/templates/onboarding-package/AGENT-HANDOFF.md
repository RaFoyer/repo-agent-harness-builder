# Agent Handoff

## Mission

Use this package to help a human install or scaffold the right harness for a repository, project folder, or personal-folder stewardship workflow.

## Authority Model

1. Package files explain how to bootstrap.
2. The included skill explains how to build or audit a harness.
3. After a target repo or folder harness exists, its local `AGENTS.md`, `AGENTS-TOC.md`, protocol docs, and CLI become authoritative.

## Safe Archive Handling

1. List archive entries before extraction.
2. Reject absolute paths and `..` traversal.
3. Extract to a temporary directory.
4. Verify `MANIFEST.json` with `python3 scripts/verify-package.py --root .` from the extracted package root when Python is available.
5. If Python 3 is unavailable, report `manifest unverified`; use reference-only mode unless the human explicitly accepts the risk of installing or scaffolding from an unverified archive.
6. Read scripts before running them.
7. Never ask the human to paste secret values into chat.

## Workflow

1. Read `SETUP-CHECKPOINTS.md`.
2. Ask the human which mode they want: repository, project folder, personal file steward, or reference-only.
3. For a non-technical human, read `references/NONTECHNICAL-SETUP.md` and explain only the decision that affects them now.
4. Confirm local tools needed for the chosen mode. Repository mode usually needs git, node, and Python for scaffolding. Personal-folder mode needs node, Python for scaffolding, and archive tools.
   Use `scripts/verify-bootstrap.sh --mode reference-only` for archive inspection that will not run a generated CLI.
5. If installing the skill, read `scripts/install-skill.sh` and `references/AGENT-CLIENTS-AND-SKILL-INSTALL.md` first. Default install is dry-run; use `--yes` only after the human approves.
6. For repository scaffolding, collect project name, repo slug, CLI name, default branch, and tracker. Read `references/REPO-MECHANICS-FOR-AGENTS.md` before asking the human to handle GitHub mechanics.
7. For personal-folder scaffolding, collect install folder, managed folders, off-limits folders, scan depth, cleanup style, naming style, and automation preferences. Read `references/PERSONAL-FOLDER-HARNESS.md`.
8. Before scaffolding or installing, show the target path, expected file count, exact command, and whether existing files will be merged or overwritten. Wait for an explicit yes.
9. Run the appropriate scaffold script.
10. Run generated CLI help, ergonomics status, no-mistakes status for repositories, lavish status, orchestration status, preflight, and safe first checks. For Codex-targeted repositories, also run `orchestration adapter-status` and `orchestration taxonomy`; the resident Firstmate capability remains inactive until deliberately configured.
11. If connector setup or login is in scope, run the repo-local `connections plan` and `connections auth-plan --profile <profile-id>` before requesting any generic plugin, MCP install, or provider authentication.
12. Report results and one useful next action.

## Scaffold Commands

These are examples for the agent to adapt. Do not ask a nontechnical human to
copy them exactly with placeholder values still present.

Repository or project-folder harness:

```bash
python3 skill/repo-agent-harness-builder/scripts/scaffold_harness.py \
  --target "/path/to/project" \
  --project-name "Project Name" \
  --repo-slug "owner/repo-or-project-id" \
  --cli-name harness \
  --allow-non-git
```

Personal file-steward harness:

```bash
python3 skill/repo-agent-harness-builder/scripts/scaffold_personal_harness.py \
  --target "$HOME/Documents/Home Harness" \
  --project-name "Home Harness" \
  --cli-name homeh \
  --managed-folder downloads="$HOME/Downloads"
```

First repository checks:

```bash
cd "/path/to/project"
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
./harness verify --dry-run
node --test apps/cli/test/*.test.mjs
```

First personal-folder checks:

```bash
cd "$HOME/Documents/Home Harness"
./homeh help
./homeh preflight
# Run inventory scan only after the displayed managed folders match the human's approval.
```

## Reference Routing

- Plain-language installation and questions: `references/NONTECHNICAL-SETUP.md`
- Baseline and optional setup checklist: `references/HARNESS-CHECKLIST.md`
- GitHub and repository mechanics for non-technical users: `references/REPO-MECHANICS-FOR-AGENTS.md`
- GitHub account and tool setup: `references/GITHUB-ACCOUNT-AND-TOOLS.md`
- Personal folder stewardship: `references/PERSONAL-FOLDER-HARNESS.md`
- Document taxonomy and lifecycle: `references/DOCUMENT-TAXONOMY-AND-LIFECYCLE.md`
- External authority, permanent Google/Microsoft/email/document/database connections, repo-scoped auth profiles, and role boundaries: `references/EXTERNAL-AUTHORITY-AND-CONNECTIONS.md`
- Agent clients and skill installation: `references/AGENT-CLIENTS-AND-SKILL-INSTALL.md`
- Automations, heartbeats, goals, loops, noninteractive runs, and scheduled tasks across agent clients: `references/AUTOMATIONS-AND-HEARTBEATS.md`
- Project-wide hierarchy and progressive autonomy: `skills/project-orchestration/SKILL.md` and `skill/repo-agent-harness-builder/references/project-orchestration.md`; after scaffolding, use the repo-local `AGENT-ORCHESTRATION.md`, `ops/orchestration.json`, and `orchestration` CLI
- Codex-native repo-local Firstmate profile: `skills/codex-native-firstmate/SKILL.md` and `skill/repo-agent-harness-builder/references/codex-native-firstmate.md`; load it after `project-orchestration`, and do not require a global project registry
- Bundled Manager-owned repository-merge DAG skill: `skills/goal-graph-loop/SKILL.md`; `skills/goal-chain-loop/SKILL.md` is a deprecated compatibility redirect
- CLI extension and maintenance: `references/CLI-MAINTENANCE.md`
- Archive safety: `references/ARCHIVE-INSPECTION.md`
- Secrets and privacy boundaries: `references/SECRETS-AND-PRIVACY.md`
- Optional connectors and MCP boundaries: `references/OPTIONAL-CONNECTORS.md`

## Final Summary

End with:

- installed/scaffolded files
- commands run
- blockers or approvals needed
- next action
