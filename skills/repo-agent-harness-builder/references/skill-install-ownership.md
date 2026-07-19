# Skill Install Ownership

Use this when a repository installs or synchronizes agent skills into a client-wide directory such as `.codex/skills`, `.agents/skills`, or `.claude/skills`.

## Ownership Classes

| Class | Examples | Allowed global owner |
| --- | --- | --- |
| Shared fleet skill | `repo-agent-harness-builder`, `project-orchestration`, `goal-graph-loop`, `goal-chain-loop`, `codex-native-firstmate` | The skill's authoritative distribution or an explicitly pinned release |
| Project-owned skill | A repository-namespaced bootstrap or operator skill | That repository's approved sync command |
| Project-local skill | A skill under the target repository's `.agents/skills/` | The target repository harness |

`goal-chain-loop` remains reserved even though it is a deprecated compatibility alias. A downstream project must not claim the alias merely because it still supports legacy invocations.

## Global Sync Boundary

A downstream repository sync command must:

1. Declare an allowlist containing only project-owned skill names.
2. Exclude shared fleet and unrelated third-party skill names from status, preflight, copy, link, backup, and cleanup operations.
3. Refuse unmanaged paths unless the human explicitly approved replacement and the name is project-owned.
4. Treat symlinks as ownership-bearing installs, not harmless pointers. A global symlink makes its target repository the mutable source of truth for that skill name.
5. Keep recoverable copies outside discoverable skill roots. Use a sibling archive such as `.codex/skill-archives/<owner>/<timestamp>/`, not `skills/<name>.backup-*`.
6. Report exactly which owner, source, targets, archive location, and install mode were used.

Project-owned skills may use symlinks when the repository is deliberately authoritative and the client supports them. Shared fleet skills should use verified copies or installer-managed immutable sources so one downstream worktree cannot silently replace fleet behavior.

## Repair Procedure

When a shared skill is owned by the wrong repository:

1. Resolve the symlink without following or deleting its target.
2. Stage a complete copy from the authoritative source and verify its file manifest.
3. Move the old link or directory into a non-discoverable archive.
4. Atomically move the staged copy into the active skill name.
5. Move legacy `*.backup-*` entries outside every skills root.
6. Verify the active path is a real directory, its contents match the authoritative source, and no backup entry remains discoverable.
7. Fix the downstream sync allowlist and add a regression test before considering the repair complete.

## Verification

For each supported client root, verify:

- every expected active `SKILL.md` exists
- shared fleet paths are not symlinks into downstream repositories
- source and installed manifests match
- project sync status contains only project-owned names
- a sync dry run does not mention shared fleet names
- no top-level `*.backup-*` entry remains under a discoverable skills directory
