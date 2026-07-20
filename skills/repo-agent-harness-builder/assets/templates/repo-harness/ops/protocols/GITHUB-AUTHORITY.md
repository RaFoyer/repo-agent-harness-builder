---
protocol_id: GITHUB-AUTHORITY
title: GitHub Authentication And Authority
status: inactive
version: 0.1.0
owner: repo-maintainers
last_reviewed: YYYY-MM-DD
summary: Binds GitHub CLI execution to repository-scoped credentials and explicit orchestration capabilities.
related_protocols:
  - AGENT-ORCHESTRATION
  - CONNECTOR-AUTH-PROFILES
  - PRE-COMMIT
  - NO-MISTAKES-GATE
---

# GitHub Authentication And Authority

## Layer Boundary

- The repository facade selects the repository, credential profile, node authority, and approval rules.
- `gh-axi` is the preferred agent-facing executor for supported operations because it provides compact, structured output.
- Upstream `gh` performs authentication and GitHub API operations. `gh-axi` invokes it and inherits `GH_CONFIG_DIR`, `GH_TOKEN`, `GH_REPO`, and other process environment.
- The actual GitHub credential is the final server-side permission ceiling.

A globally installed `gh` or `gh-axi` binary is acceptable. A shared mutable login is not the Worker default. Never fall back to the default shared GitHub CLI config, an ambient process credential, or another repository's active account when a selected profile is missing or invalid.

## Profile Model

Register every usable GitHub identity in `ops/connections.json`. A profile records value-safe metadata only: account-label reference, authentication-source kind, authority tier, repository boundary, maximum capabilities, config-root strategy, process-local authentication environment name when applicable, verification commands, and revocation path.

Each profile receives a distinct root:

```text
${XDG_CONFIG_HOME:-$HOME/.config}/agent-connectors/<repo-id>/github/<profile-id>
```

Use `GH_CONFIG_DIR` for upstream `gh` state. Prefer a short-lived GitHub App installation token supplied as a process-local `GH_TOKEN` for Workers. A fine-grained PAT is an interim option. Broad OAuth or classic-PAT credentials belong only to an explicitly selected operator profile and must not be inherited by Workers.

Separate config roots permit different repositories and accounts to operate concurrently. Do not use `gh auth switch` on one shared config directory as a concurrency boundary.

## Capability Model

Roles describe responsibility; they do not grant GitHub access. Effective authority is the intersection of:

1. the orchestration node's `allowedExternalActions`;
2. the selected profile's `allowedCapabilities`;
3. the credential's actual GitHub permissions; and
4. every applicable approval gate.

Use stable capability identifiers such as:

```text
github.repo.read
github.issue.read
github.issue.create
github.issue.update
github.issue.comment
github.pr.read
github.pr.create
github.pr.update
github.pr.comment
github.pr.review
github.workflow.read
github.workflow.dispatch
github.pr.merge
github.secret.write
github.repo.admin
```

A write-capable node must also carry exactly one `github.profile.<profile-id>` marker in `allowedExternalActions`. Because external actions are sealed into the orchestration work contract, this binds the profile without deriving permission from the role name. Parent-to-child authority inheritance applies to both the capability and the profile marker.

Merge, workflow modification or dispatch, secrets, repository administration,
and destructive operations require explicit gates and should not appear in
ordinary Worker profiles. The provided facade rejects cross-repository targets;
perform such work only through the separately scoped repository harness and its
own authority profile and gates.

## Repository Facade

Use:

```bash
./{{CLI_NAME}} github status
./{{CLI_NAME}} github plan --profile <profile-id>
./{{CLI_NAME}} github run --profile <profile-id> --dry-run -- pr list
./{{CLI_NAME}} github run --profile <profile-id> --node <node-id> -- pr create ...
./{{CLI_NAME}} github run --profile <profile-id> --node <node-id> --approval-ref <approval-id> -- pr merge ...
```

The wrapper must:

- remove ambient `GH_TOKEN`, `GITHUB_TOKEN`, `GH_HOST`, `GH_ENTERPRISE_TOKEN`, and `GITHUB_ENTERPRISE_TOKEN` before selecting the profile;
- set `GH_CONFIG_DIR`, `GH_REPO`, `GH_PROMPT_DISABLED=1`, and a noninteractive pager;
- use only the selected process-local credential source when configured;
- classify the command into one exact `github.*` capability and reject unknown commands;
- reject positional repository references, `--repo`, `-R`, host or owner selectors, transfers, and other targets outside the configured repository;
- require an active orchestration node for writes and verify its capability and profile marker;
- redact subprocess output before returning it to an agent;
- refuse an inactive, missing, malformed, or uninitialized profile instead of using global auth.

For merge/revert, workflow dispatch/cancel/delete, repository administration,
and destructive issue/release/label actions, the wrapper also requires
the node's inherited gate and a value-safe `--approval-ref`. A gate is not
evidence by itself: the approval reference must identify the approval required
by the repository's governing protocol.

The wrapper is a policy boundary only when Workers are launched in an environment that prevents direct use of other GitHub or Git credentials. A human shell or unsandboxed process can bypass documentation by invoking `gh`, `curl`, or `git` directly.

## Git Transport Boundary

`GH_CONFIG_DIR` governs `gh`; it does not automatically isolate `git push`. SSH keys, credential helpers, remote URLs, and `gh auth setup-git` may be machine-global. Before granting `github.branch.push`, define and test a repository-specific Git transport path or explicitly record that branch pushes remain outside enforced Worker authority. Never claim end-to-end GitHub isolation when only `gh` commands are wrapped.

## Activation

Keep this protocol inactive until the repository has real profiles, tested wrappers, a Git transport decision, revocation procedures, and orchestration capability/profile bindings. Inactive examples must not require credentials or block baseline preflight.
