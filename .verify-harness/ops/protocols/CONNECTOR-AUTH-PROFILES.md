---
protocol_id: CONNECTOR-AUTH-PROFILES
title: Connector Auth Profiles
status: inactive
version: 0.1.0
owner: repo-maintainers
last_reviewed: 2026-07-27
summary: Keeps browser-based and CLI connector authentication scoped to this repository by default.
related_protocols:
  - EXTERNAL-SYSTEMS
  - SECRETS
  - SESSION-PREFLIGHT
---

# Connector Auth Profiles

## Principle

Connector packages may be installed globally, but mutable authentication state belongs to an explicit repository profile by default. Do not let one repository silently activate, replace, log out, or reauthenticate another repository's CLI or connector session.

The repository harness should select the connector profile for every provider invocation through `./verify-harness` or another repo-owned wrapper. Avoid global shell exports in `.zshrc`, global "activate profile" commands, and ad hoc shared temporary files.

## Repository Profile Model

1. Resolve the repository identity before authentication. Prefer the remote `owner/repo` slug. When a local path is the only identity available, encode it through a collision-resistant registry entry rather than punctuation replacement alone.
2. Store credentials outside Git. Repository files may contain only provider names, profile ids, expected account labels, scope names, verification command names, and other value-safe metadata.
3. Compute provider config roots under a user-scoped connector home, such as:

   ```text
   ${XDG_CONFIG_HOME:-$HOME/.config}/agent-connectors/<repo-id>/<provider>/<profile-id>
   ```

4. Worktrees of the same canonical repository may share the same repository profile unless the project requires a narrower boundary.
5. Cross-repository profile use must be explicit. Before using another repository's profile, report value-safe metadata only: repository id, provider, profile id, expected account label presence, and intended operation.
6. Subagents must inherit the exact repository profile environment. They must not discover and silently switch profiles mid-task.

## Browser And Flow Rules

- Treat ambient browser state as context, not as a browser choice.
- A browser explicitly named by the user is binding when it has the required capability. Do not silently substitute another browser.
- Identify the flow type before starting: localhost callback, device code, copied authorization code, API key, or noninteractive workload identity.
- Inspect the installed provider CLI version and official command reference before choosing flags. Some flags that look like "do not open a browser" can change the authentication flow.
- Start one fresh authentication process and route its one-time URL or code through a private handoff. Keep the originating listener or prompt alive.
- Never print authorization URLs, callback state, device codes, copied codes, tokens, cookies, or browser storage in chat, logs, tickets, reports, or commits.
- Leave account selection, passwords, passkeys, MFA, CAPTCHA, and consent to the user unless the current request narrowly authorizes the action and platform policy permits it.
- Never reuse an authorization URL after the originating process exits. Restart stale flows from the beginning.
- Verify completion through the original process exit status and a read-only identity check for the expected repository profile.

## CLI Adapter Pattern

Each provider adapter should define how the repository wrapper isolates mutable state:

| Strategy | Example | Required metadata |
| --- | --- | --- |
| Environment config root | Google Cloud CLI with `CLOUDSDK_CONFIG` | env var name, provider subdirectory, identity check |
| Config directory flag | Neon CLI with `--config-dir` | flag name, executable name, provider subdirectory, identity check |
| Unsupported global session | CLIs with only one mutable global profile | limitation and stop rule |
| GitHub CLI profile | `gh`/`gh-axi` with `GH_CONFIG_DIR` and optional process-local `GH_TOKEN` | profile id, account-label ref, credential kind, capability ceiling, identity check |

For GitHub-specific execution and orchestration binding, also read
`GITHUB-AUTHORITY.md` and use the repository `github` facade. `gh-axi` inherits
upstream `gh` authentication; it does not isolate accounts itself.

Use:

```bash
./verify-harness connections auth-plan --profile <profile-id>
./verify-harness connections env --profile <profile-id>
```

These commands are read-only. They must not initiate login, open a browser, create credential directories, write provider config, or inspect token files.

## Activation Requirements

Before marking this protocol active:

1. Add a real profile to `ops/connections.json`.
2. Name the owner, expected account label, allowed operation scope, and revoke path.
3. Select the provider config-root strategy and read-only identity checks.
4. Add provider wrapper tests that prove the selected config root is used.
5. Verify that no auth URL, code, state value, token, cookie, credential path, or private account detail is printed.
6. Document the rollback path: remove provider grants and delete the external profile directory or secret-store entry.
