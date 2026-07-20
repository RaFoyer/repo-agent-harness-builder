# External Authority And Connections

## Purpose

Use this when a harness needs permanent access to Google Drive, Gmail, Microsoft 365, Outlook, SharePoint, Slack, databases, or another role-based external system.

## Authority Model

Default hierarchy:

1. **Repository**: non-privileged internal documentation, durable protocols, CLI behavior, safe pointers, and redacted examples.
2. **Role-based external authority**: privileged documents, restricted threads, client records, HR/legal/finance material, and any content that not everyone with repo access may read.
3. **Credentialed data authority**: structured privileged data in SQLite, Postgres, or an application database when no document system exists.
4. **Agent context**: temporary reasoning and summaries; never the source of truth.

## Permanent Connection Pattern

For every connection, collect:

- provider and account/tenant label
- authority class
- allowed operations
- required role or group
- credential storage location, by reference only
- OAuth/API scopes by name
- owner/admin contact
- revoke and rotation path
- repo-safe summary of what the connection is authoritative for

Store this in `ops/connections.json` or an equivalent registry. Do not store credential values.

## Repository-Scoped Auth Profiles

When a provider CLI or connector has browser login, device-code login,
copied-code login, named accounts, active projects, or mutable local sessions,
make the repository profile explicit before authentication.

Global CLI packages are acceptable. Global mutable auth state is not the
default. Put profile selection inside the repository CLI facade or wrapper, and
avoid exporting provider auth variables from shell startup files.

Good profile-isolation patterns:

- Google Cloud CLI: set a repository-specific `CLOUDSDK_CONFIG` for each
  invocation.
- Neon CLI: pass a repository-specific `--config-dir` for each invocation.
- GitHub CLI: set a repository-and-profile-specific `GH_CONFIG_DIR`, fix
  `GH_REPO`, clear ambient `GH_TOKEN`/`GITHUB_TOKEN`, and inject only the
  selected process-local credential when the profile uses one.
- Other provider CLIs: use the documented config-root environment variable,
  config-directory flag, or an explicit unsupported status when only one global
  mutable session exists.

Use dry-run-first commands before any real login:

```bash
./{{CLI_NAME}} connections auth-plan --profile <profile-id>
./{{CLI_NAME}} connections env --profile <profile-id>
```

These commands must not start auth, open a browser, create credential
directories, write provider config, or inspect token files. They may show
value-safe metadata: repo id, provider, profile id, config-root strategy, env
var or flag name, flow type names, expected account label presence, and identity
check presence.

Browser-flow rules:

- A browser explicitly named by the user is binding when it supports the flow.
- Do not silently fall back to another browser.
- Never print auth URLs, callback state, device codes, copied codes, tokens,
  cookies, or browser storage.
- Verify completion with the originating process exit status and read-only
  identity checks for the selected repository profile.

## GitHub CLI And AXI Boundary

Install `gh` and `gh-axi` globally if desired, but keep their responsibilities
separate. `gh-axi` is the preferred agent-facing executor for its supported
GitHub operations and compact structured output. It invokes upstream `gh` and
inherits the process environment; it is not an authentication store, profile
selector, or authority system.

The repository facade owns profile selection and must fail closed rather than
falling back to `~/.config/gh`. Give every profile its own root under
`agent-connectors/<repo-id>/github/<profile-id>`. Separate roots permit multiple
repositories and accounts to operate concurrently; `gh auth switch` in one
shared config directory does not.

For bounded Workers, prefer short-lived GitHub App installation tokens supplied
as process-local `GH_TOKEN` values by an approved secret broker or launch
environment. Fine-grained PATs are an interim option. Broad OAuth or classic
PAT credentials are explicit operator profiles, never ambient Worker defaults.
The registry stores only safe metadata and environment-variable names, never
credential values.

Treat `git` transport separately. `GH_CONFIG_DIR` does not isolate SSH keys,
credential helpers, remotes, or `git push`. A harness must define a tested
repository-specific Git transport path before claiming that branch pushes are
enforced by the GitHub profile. Direct `gh`, `curl`, or `git` invocation also
bypasses a facade unless the Worker launch environment or supervisor prevents
it.

## Connector Discovery Pattern

Before using a plugin search flow, connector marketplace, generic MCP installer,
or global client configuration, inspect the repo-owned connector registry first:

```bash
./{{CLI_NAME}} connections plan
./{{CLI_NAME}} connections status
./{{CLI_NAME}} connections doctor --profile <profile-id> --mode remote
./{{CLI_NAME}} connections auth-plan --profile <profile-id>
```

Connector profiles may record provider names, server names, scope names,
storage classes, verification commands, and whether endpoint or account-domain
boundaries are configured. Do not print tenant-specific endpoint hosts, account
domains, local credential paths, tokens, OAuth client secrets, refresh tokens,
cookies, service-account private keys, local auth blobs, or private document
contents unless a repo protocol explicitly marks that metadata shareable.

Use `connections doctor --account <email>` or `--email <email>` only when
checking an expected account-domain boundary. Use `--credential-root <path>` only
for local connector mode; the command should report whether storage is outside
the repository without printing the path.

Use a generic connector only when a repo-owned profile is missing, inaccessible,
unsupported by the current client, or explicitly blocked by the linked work
item. Record the reason so future agents can decide whether to add a repo-owned
profile instead of repeating one-off installs.

## Google Workspace

Use Drive/Shared Drive for role-scoped docs and Gmail for message context. Prefer read-only scopes first and use groups/folder permissions for durable role boundaries.

Good defaults:

- Drive: read-only until a write workflow is approved
- Gmail: read or modify only when the workflow requires labels/drafts/sending
- Shared Drives: use group permissions over individual ad hoc sharing where possible

## Microsoft 365

Use SharePoint/OneDrive/Teams files for role-scoped docs and Outlook for message context. Prefer Microsoft Graph least-privilege permissions and site/library/mailbox scopes over broad tenant-wide grants.

## Other Document Systems

The same model applies to Box, Dropbox Business, Notion, Confluence, Airtable, or a company intranet:

- keep the role boundary in that system
- commit only safe pointers and summaries
- verify access before claiming content is available
- write through an approved workflow only

## SQLite Or Database Fallback

When no role-based document system exists:

- use SQLite for simple single-user or local metadata
- use encrypted SQLite or a managed database for sensitive data
- use filesystem ACLs, OS keychain, and backups deliberately
- commit schema and redacted fixtures, not the privileged data file
- store connection strings outside the repository

## Agent Rules

- Never ask the user to paste tokens or passwords into chat.
- Never copy privileged content into repo docs without explicit approval.
- Prefer pointer records over content duplication.
- Verify tool access and permissions before relying on an external system.
- Treat external data as authoritative only for the scope named in protocol.
