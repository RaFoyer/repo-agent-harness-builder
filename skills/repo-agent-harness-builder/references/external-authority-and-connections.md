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

## Connector Discovery Pattern

Before using a plugin search flow, connector marketplace, generic MCP installer,
or global client configuration, inspect the repo-owned connector registry first:

```bash
./{{CLI_NAME}} connections plan
./{{CLI_NAME}} connections status
./{{CLI_NAME}} connections doctor --profile <profile-id> --mode remote
```

Connector profiles may record provider names, server names, remote endpoints,
scope names, expected account domains, storage classes, and verification
commands. They must not record tokens, OAuth client secrets, refresh tokens,
cookies, service-account private keys, local auth blobs, or private document
contents.

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
