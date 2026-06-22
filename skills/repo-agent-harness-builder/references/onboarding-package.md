# Onboarding Package

## Purpose

A portable onboarding package is a bridge for a person who may not know how to clone, configure, organize files, or hand a project to an agent. It should be safe to drop into a chat window: the agent can inspect it, unpack it to a temporary location, install or use the included skill, and guide the human through repository, project-folder, or personal-folder setup.

## Required Package Contents

```text
START-HERE.md
AGENT-HANDOFF.md
SETUP-CHECKPOINTS.md
SOURCES.md
MANIFEST.json
references/
  HARNESS-CHECKLIST.md
  NONTECHNICAL-SETUP.md
  PERSONAL-FOLDER-HARNESS.md
  DOCUMENT-TAXONOMY-AND-LIFECYCLE.md
  AGENT-CLIENTS-AND-SKILL-INSTALL.md
  EXTERNAL-AUTHORITY-AND-CONNECTIONS.md
  AUTOMATIONS-AND-HEARTBEATS.md
  SECRETS-AND-PRIVACY.md
skills/bootstrap/SKILL.md
skills/repo-operator/SKILL.md
scripts/verify-bootstrap.sh
scripts/build-reference-package.sh
```

## Entry Points

- `START-HERE.md`: human-facing, short, says to give the archive to an agent and choose a mode.
- `AGENT-HANDOFF.md`: agent-facing, canonical workflow for inspecting the archive, checking tools, choosing mode, and transferring authority to local harness docs.
- `SETUP-CHECKPOINTS.md`: checklist that prevents skipping account, tooling, auth, clone, repo handoff, optional MCP, and first useful action.
- `SOURCES.md`: ledger of source materials and template lineage.

## Safety Rules

- Inspect archive file list before extraction.
- Extract to a temporary directory first.
- Reject absolute paths or `..` traversal in archive entries.
- Do not run scripts before reading them.
- Do not include `.env`, token stores, OAuth client secrets, credential directories, private Drive URLs, or local absolute paths.
- Keep project-specific identities in placeholders unless the package is intentionally repo-specific.
- For personal-folder mode, require plan-before-apply, receipts, undo, and quarantine.

## Skill Split

Keep installable skills agent-agnostic. Use the `skills/<skill-name>/SKILL.md` layout for GitHub distribution through `npx skills add`, and keep client-specific metadata in small adapter files such as `agents/openai.yaml`.

Use two included skills:

| Skill | Scope |
| --- | --- |
| `bootstrap` | Before the repo exists locally: tool setup, account checks, clone/access, first handoff |
| `repo-operator` | After clone: route to `AGENTS.md`, `AGENTS-TOC.md`, repo CLI, and protocols |

The bootstrap skill should not become a shadow copy of repo protocols. Its final move is to transfer authority to the repository.

## Package Manifest

Include a machine-readable manifest:

```json
{
  "packageName": "repo-agent-harness-reference",
  "entrypoint": "START-HERE.md",
  "agentEntrypoint": "AGENT-HANDOFF.md",
  "generatedAt": "YYYY-MM-DDTHH:MM:SSZ",
  "skillVersion": "0.1.0",
  "sourceRef": "main",
  "sourceCommit": "COMMIT_SHA_OR_NULL",
  "containsSecrets": false,
  "intendedUse": "Agent-assisted repository, project-folder, and personal-folder harness setup",
  "manifestSelfHash": "excluded",
  "files": []
}
```

## Handoff Summary

At the end of setup, the agent should report:

- what was installed or scaffolded
- where the repo lives
- which CLI commands passed
- which steps need human approval
- one useful next action
