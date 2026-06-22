---
protocol_id: REVERSIBLE-OPERATIONS
title: Reversible Operations
status: active
version: 0.1.0
owner: local-user
last_reviewed: YYYY-MM-DD
summary: Requires receipts and undo support for file operations.
related_protocols:
  - SAFE-CLEANUP
---

# Reversible Operations

Every applied plan writes a receipt in `state/receipts/`.

Each receipt should include:

- operation
- old path
- new path
- timestamp
- file size
- fingerprint when practical
- undo command or explanation

Undo is best-effort. If a file was edited after the operation, stop and ask before reversing it.
