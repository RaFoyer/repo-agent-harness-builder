---
protocol_id: CONSENT-GATES
title: Consent Gates
status: active
version: 0.1.0
owner: local-user
last_reviewed: YYYY-MM-DD
summary: Defines approval requirements for personal file operations.
related_protocols:
  - PRIVACY-AND-SECRETS
  - REVERSIBLE-OPERATIONS
---

# Consent Gates

Read-only work does not require extra approval after the user starts it.

Explicit approval is required before:

- reading file contents beyond metadata
- moving files
- renaming files
- quarantining files
- sending files to Trash
- uploading or sharing files
- touching hidden folders, app libraries, credentials, Photos libraries, mail stores, backups, cloud internals, or external drives

Approval should name the plan ID and summarize the number of files and total size affected.
