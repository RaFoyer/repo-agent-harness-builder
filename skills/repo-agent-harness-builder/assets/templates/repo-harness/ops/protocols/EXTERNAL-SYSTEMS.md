---
protocol_id: EXTERNAL-SYSTEMS
title: External Systems And Connections
status: inactive
version: 0.1.0
owner: repo-maintainers
last_reviewed: YYYY-MM-DD
summary: Defines permanent connection setup for Drive, email, document stores, and credentialed data systems.
related_protocols:
  - SOURCE-OF-TRUTH
  - PRIVILEGED-DOCUMENTS
  - SECRETS
  - CONNECTOR-AUTH-PROFILES
---

# External Systems And Connections

## Principle

Permanent connections are capabilities, not blanket permission. Use least privilege, keep credentials outside the repository, and record only value-safe connection metadata in `ops/connections.json`.

## Before-Install Discovery

Before using plugin search, connector marketplace flows, generic MCP setup, or global client configuration for an external service, inspect repo-owned connector inventory first:

```bash
./{{CLI_NAME}} connections plan
./{{CLI_NAME}} connections status
./{{CLI_NAME}} connections doctor --profile <profile-id> --mode remote
./{{CLI_NAME}} connections auth-plan --profile <profile-id>
```

If a service-specific namespace exists, inspect that help before installing a generic connector:

```bash
./{{CLI_NAME}} <namespace> help
```

The repo-owned inventory defines approved profile ids, server names, scope bundles, credential storage classes, and verification commands. Request or install a generic external-service connector only when the repo-owned profile is missing, inaccessible, unsupported by the current client, or explicitly blocked by the linked work item. Record that reason before installation.

Connector profile plans must be value-safe. They may show provider names, server names, scope names, credential storage classes, verification commands, and whether endpoint or account-domain boundaries are configured. They must not show tenant-specific endpoint hosts, account domains, local credential paths, tokens, OAuth client secrets, refresh tokens, cookies, service-account private keys, local auth blobs, or private document contents unless a repo protocol explicitly marks that metadata shareable.

Use `connections doctor --account <email>` or `--email <email>` only to validate
an expected account-domain boundary. Use `--credential-root <path>` only for
local connector mode; doctor output should report path safety without printing
the local path.

For browser-based or CLI provider authentication, read
`CONNECTOR-AUTH-PROFILES.md` first. Connector packages may be global, but
credentials, active accounts, mutable profiles, provider config roots, and live
authorization attempts should be scoped to the active repository by default.
Use `connections auth-plan` and `connections env` before invoking provider
login commands. These commands are read-only and must not start real
authorization.

## Connection Classes

| Class | Examples | Typical use |
| --- | --- | --- |
| document-authority | Google Drive, Shared Drive, SharePoint, Box, Notion, Confluence | role-scoped files and governed docs |
| communication-authority | Gmail, Outlook, Slack, Teams | message/thread/calendar context |
| data-authority | Postgres, SQLite, application database | structured privileged records |
| automation-authority | Codex automation, cron, cloud scheduler | scheduled checks and reminders |

## Setup Workflow

1. Identify the system of record and required role boundary.
2. Choose read-only scopes unless write access is required for a named workflow.
3. Store tokens, OAuth refresh credentials, app passwords, service-account keys, and database passwords outside the repository.
4. Add a value-safe entry to `ops/connections.json`.
5. Run `./{{CLI_NAME}} connections status`.
6. If login or local CLI auth is needed, run `./{{CLI_NAME}} connections auth-plan --profile <profile-id>`.
7. Add or update protocol pointers so agents know which system is authoritative.
8. Document revoke/rotation instructions.

`scopeRefs` must be provably read-only to avoid write approval. Unknown scopes,
or scopes that can send, write, share, delete, administer, or mutate data, need
`writeApproval` metadata before a connection can be treated as configured.

## Google Workspace Pattern

Use delegated user OAuth for personal or small-team workflows. Use Shared Drives and Google Groups for role boundaries when available. Prefer file or folder permissions over public links.

Record:

- account or group name, not token values
- Drive folder/file ids or safe links
- Gmail/Drive scopes by name
- owner and revocation path

## Microsoft 365 Pattern

Use Microsoft Graph delegated or application permissions according to the organization policy. Prefer least-privilege, resource-scoped permissions, SharePoint/Teams groups, and site or library permissions over tenant-wide grants.

Record:

- tenant label
- site/library/mailbox scope
- permission names
- owner and admin contact

## Local Or Database Fallback

If no role-based document system exists, use the smallest adequate local authority:

- SQLite file with filesystem ACLs for simple local metadata
- encrypted SQLite or SQLCipher-style store for sensitive local data
- Postgres or managed database for multi-user access
- OS keychain or secret manager for credentials

Do not commit the database file if it contains privileged data. Commit schema, migration notes, and redacted fixtures only.

## Revocation

Every permanent connection needs a revoke path:

- OAuth app/account revocation
- group or permission removal
- key rotation
- database password rotation
- automation disable path
