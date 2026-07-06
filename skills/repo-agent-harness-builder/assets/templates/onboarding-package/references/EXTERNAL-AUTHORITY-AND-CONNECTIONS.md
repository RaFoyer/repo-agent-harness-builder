# External Authority And Connections

Use this when the setup needs a permanent connection to Drive, email, Microsoft 365, Slack, a document system, or a database.

## Meta Philosophy

The repository is the place for non-privileged internal documentation: durable protocols, runbooks, safe summaries, examples, CLI behavior, and links.

Role-restricted material belongs in the system that can enforce the role boundary:

- Google Drive or Shared Drive
- Microsoft SharePoint, OneDrive, Teams, or Outlook
- Box, Dropbox Business, Notion, Confluence, Airtable, or another company system
- SQLite/Postgres/app database when no document authority exists

The repository may store pointers to restricted material, but it should not copy restricted contents.

## Setup Questions

Ask:

1. Which system already controls access for this material?
2. Who should be able to read it?
3. Is read-only access enough?
4. Should the agent draft/write/send, or only read and summarize?
5. Where are credentials stored outside the repository?
6. How can access be revoked?
7. What repo-safe summary may everyone see?

Safe answer examples:

- "Google Drive is the authority for client documents."
- "Use read-only access first."
- "Credentials are in my OS keychain."
- "The repo may store a link label and document owner, but not document contents."

Unsafe answers to avoid:

- pasted OAuth client secrets
- pasted refresh tokens
- pasted passwords, cookies, or recovery codes
- screenshots of credential screens

## Value-Safe Registry

Store connection metadata, not secrets:

```json
{
  "id": "client-drive",
  "provider": "google-workspace",
  "authorityClass": "document-authority",
  "status": "configured",
  "accountRef": "client-docs-group@example.com",
  "allowedOperations": ["read"],
  "credentialRefs": ["keychain:client-drive-oauth"],
  "scopeRefs": ["drive.readonly"],
  "authoritativeFor": ["client-restricted documents"],
  "revocation": "Remove OAuth grant and Drive group permission."
}
```

Never store token values, passwords, cookies, private keys, or OAuth client secrets in the repository.

## Connector Discovery

When a target repo already has a harness, inspect the repo-owned connector
inventory before using plugin search, connector marketplaces, generic MCP setup,
or global client configuration:

```bash
./{{CLI_NAME}} connections plan
./{{CLI_NAME}} connections status
./{{CLI_NAME}} connections doctor --profile <profile-id> --mode remote
```

Use `connections doctor --account <email>` or `--email <email>` only when
checking an expected account-domain boundary. Use `--credential-root <path>` only
for local connector mode; the command should report path safety without printing
the path.

Use a generic connector only when the repo-owned profile is missing,
inaccessible, unsupported by the current client, or blocked by the linked work
item. Record the reason so the next agent can decide whether to add a durable
profile instead.

## Google Workspace Pattern

Use Drive or Shared Drive for role-scoped documents and Gmail for message context. Prefer groups and folder permissions over public links. Start read-only, then add write/send permissions only for a named workflow.

## Microsoft 365 Pattern

Use SharePoint, OneDrive, Teams files, and Outlook through Microsoft Graph or approved connectors. Prefer site/library/mailbox-scoped access and least-privilege permissions.

## Other Systems

For Box, Notion, Confluence, Dropbox Business, Airtable, or an internal tool, follow the same pattern:

- the external system enforces access
- the repo stores safe pointers
- the CLI or protocol records how to verify access
- write actions require approval

## SQLite Or Database Fallback

If no permissioning system exists:

- use SQLite for local single-user metadata
- use encrypted SQLite or a managed database for privileged data
- use filesystem permissions and OS keychain storage
- commit schema and redacted examples only
- keep the live database outside the repository unless it is non-sensitive

## Agent Rule

Before using any external content, verify both access and authority. Having a connector does not mean every action is approved.
