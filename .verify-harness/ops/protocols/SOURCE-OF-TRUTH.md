---
protocol_id: SOURCE-OF-TRUTH
title: Source Of Truth
status: active
version: 0.1.0
owner: repo-maintainers
last_reviewed: 2026-07-27
summary: Defines what belongs in the repository and what belongs in role-scoped external authorities.
related_protocols:
  - DOCUMENT-LIFECYCLE
  - PRIVILEGED-DOCUMENTS
  - EXTERNAL-SYSTEMS
---

# Source Of Truth

## Principle

The repository is the source of truth for non-privileged internal documentation, reusable operating instructions, protocol definitions, CLI behavior, and links to externally governed material.

Role-restricted or privileged material belongs in the system that can enforce the relevant permissions.

## Authority Layers

| Layer | Use for | Examples |
| --- | --- | --- |
| Repository | Company/project-visible internal docs | protocols, runbooks, non-sensitive schemas, public architecture notes |
| External document authority | Role-scoped docs | Google Drive, Shared Drive, SharePoint, OneDrive, Box, Notion, Confluence |
| External communication authority | Mail/chat/calendar records | Gmail, Outlook, Slack, Teams |
| Credentialed data authority | Structured privileged data | Postgres, SQLite with file ACLs, vault-backed services, app databases |
| Ephemeral agent context | Temporary reasoning | chat summaries, local scratch, generated intermediate notes |

## Repository Rules

Repository docs may contain:

- durable procedures
- non-sensitive architecture and operating context
- pointer records to privileged docs
- sanitized examples
- CLI behavior and validation rules

Repository docs must not contain:

- credential values
- private keys or tokens
- raw personal data
- confidential client records
- private mailbox contents
- restricted Drive/SharePoint document contents

## Pointer Records

When privileged material is needed, store a pointer instead of copying content:

```text
title:
authority:
system:
location:
required_role:
owner:
last_verified:
summary_safe_for_repo:
```

The summary must be safe for everyone who can read the repository.
