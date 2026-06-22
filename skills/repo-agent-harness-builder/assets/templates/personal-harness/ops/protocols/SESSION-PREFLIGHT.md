---
protocol_id: SESSION-PREFLIGHT
title: Personal Harness Session Preflight
status: active
version: 0.1.0
owner: local-user
last_reviewed: YYYY-MM-DD
summary: Defines read-only checks before personal folder work.
related_protocols:
  - CONSENT-GATES
---

# Session Preflight

Run `./{{CLI_NAME}} preflight` before work.

Preflight is read-only. It checks:

- harness folder exists
- config files exist
- state folders exist
- managed folder paths are readable
- quarantine and receipts folders are available

If a check suggests creating folders or changing permissions, ask first.
