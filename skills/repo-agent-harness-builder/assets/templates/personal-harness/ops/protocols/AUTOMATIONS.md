---
protocol_id: AUTOMATIONS
title: Personal Harness Automations
status: inactive
version: 0.1.0
owner: local-user
last_reviewed: YYYY-MM-DD
summary: Defines safe scheduled checks and heartbeat-style follow-ups.
related_protocols:
  - CONSENT-GATES
---

# Automations

Recurring work must be read-only unless the user approves a specific write-capable workflow.

Good recurring checks:

- weekly read-only Downloads inventory
- monthly duplicate-candidate report
- reminder to review quarantine
- heartbeat to continue an active cleanup plan

Do not schedule file moves, deletes, uploads, or permanent cleanup as unattended work.

Every recurring workflow must define:

- owner
- purpose
- cadence
- folder scope
- authority docs
- command or prompt
- allowed reads
- allowed writes
- approval gates
- forbidden actions
- stop conditions
- output location
- run log location
- artifact retention
- escalation path
- pause/disable instructions

Every run should append a short entry to `reports/RUN-LOG.md`.
