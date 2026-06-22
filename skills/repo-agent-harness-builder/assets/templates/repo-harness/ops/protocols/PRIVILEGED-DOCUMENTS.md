---
protocol_id: PRIVILEGED-DOCUMENTS
title: Privileged Documents
status: active
version: 0.1.0
owner: repo-maintainers
last_reviewed: YYYY-MM-DD
summary: Defines handling for documents that require role-based access or should not be copied into the repository.
related_protocols:
  - SOURCE-OF-TRUTH
  - EXTERNAL-SYSTEMS
  - DOCUMENT-LIFECYCLE
---

# Privileged Documents

## Classification

Before copying document content into the repository, classify it:

| Class | Repository behavior |
| --- | --- |
| public | May be copied if useful |
| internal-open | May live in repo if everyone with repo access may read it |
| role-restricted | Store externally; commit only a safe pointer |
| confidential | Store externally; summarize only with explicit approval |
| regulated/personal | Store externally; avoid content in repo and chat unless approved |

## External Authority

Use a system that can enforce the role boundary:

- Google Drive or Shared Drive groups
- Microsoft SharePoint, OneDrive, or Teams-backed files
- Box, Dropbox Business, Notion, Confluence, or another company document store
- a credentialed database or local encrypted store when no document system exists

## Agent Rules

- Do not copy restricted document text into repository docs.
- Do not paste mailbox or Drive contents into chat unless the user approves that exact use.
- Prefer metadata-safe summaries: title, owner, system, required role, and next action.
- Confirm access before claiming a document is available.
- If access is missing, report the required role or system owner instead of asking for credentials in chat.

## Pointer Template

```markdown
## <Document Title>

- authority: <Drive / SharePoint / database / other>
- location: <safe link or object id>
- required_role: <group or role>
- owner: <person/team>
- repo_safe_summary: <what everyone with repo access may know>
- last_verified: YYYY-MM-DD
```
