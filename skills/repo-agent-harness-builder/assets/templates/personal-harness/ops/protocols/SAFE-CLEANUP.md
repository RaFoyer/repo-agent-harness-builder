---
protocol_id: SAFE-CLEANUP
title: Safe Cleanup
status: active
version: 0.1.0
owner: local-user
last_reviewed: YYYY-MM-DD
summary: Defines safe cleanup, archive, and quarantine behavior.
related_protocols:
  - CONSENT-GATES
  - REVERSIBLE-OPERATIONS
---

# Safe Cleanup

Cleanup starts with a plan. The plan lists:

- files affected
- proposed action
- reason
- total count and size
- risk notes

Default cleanup actions:

1. Leave alone
2. Move to archive
3. Move to quarantine
4. Move to Trash

Permanent deletion is outside the default workflow.
