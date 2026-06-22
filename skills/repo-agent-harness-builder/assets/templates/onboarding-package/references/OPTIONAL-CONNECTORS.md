# Optional Connectors

Use this when a harness may connect to external tools such as issue trackers, cloud drives, calendars, Slack, email, or MCP servers.

## Principle

External systems are auxiliary unless a local protocol explicitly makes them authoritative for a named scope. Use the repository for non-privileged internal documentation and external authorities for role-restricted documents, message history, or structured data.

## Setup Questions

Ask:

1. Which external system matters for this workflow?
2. Is read-only access enough?
3. What should the agent never write or publish?
4. Where should summaries or receipts be stored?
5. How can the human revoke access?
6. Which role or group should be able to see the underlying material?
7. What repo-safe pointer or summary may everyone see?

Safe answer examples:

- "Slack is useful for context, but do not send messages without approval."
- "The Drive folder is role-restricted; store only a pointer in the repo."
- "The token is already configured in the connector/keychain."
- "Summaries can go in the repo, raw mailbox contents cannot."

Never ask the human to paste connector tokens, passwords, cookies, private keys,
OAuth client secrets, or recovery codes into chat or repo files.

## Good Connector Uses

- read a tracker issue and map it to local protocols
- summarize a folder or document set
- create a draft message for review
- attach a run report after approval
- verify external status without changing it
- keep role-restricted document contents in Drive, SharePoint, or the governed source
- store connection metadata in a registry while keeping credentials outside the repository

## Boundaries

Do not:

- treat connector data as more authoritative than local protocols by default
- write comments, send messages, modify cloud files, or change tickets without approval
- expose private URLs in shareable packages
- store tokens in the harness
- copy privileged document or mailbox contents into repo docs just because a connector can read them
