---
protocol_id: DOCUMENT-INVENTORY
title: Document Inventory
status: active
version: 0.1.0
owner: local-user
last_reviewed: YYYY-MM-DD
summary: Defines safe metadata-first file inventory.
related_protocols:
  - CONSENT-GATES
---

# Document Inventory

Default to metadata-only inventory:

- path
- file name
- extension
- size
- created/modified timestamps

Do not read document bodies unless the user approves content scanning for a named scope.

Inventory outputs belong in `state/inventories/` or `reports/`.
