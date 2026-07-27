---
protocol_id: AUTOMATIONS
title: Scheduled Work And Automations
status: inactive
version: 0.1.0
owner: repo-maintainers
last_reviewed: 2026-07-27
summary: Defines safe recurring work, heartbeat, and automation contracts.
related_protocols:
  - SESSION-PREFLIGHT
---

# Scheduled Work And Automations

## Purpose

Document recurring work without treating private app state as a source of truth.

## Required Fields

Every recurring workflow must define:

- owner
- purpose
- cadence
- workspace or folder scope
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

## Safety

- Default to read-only.
- Use least privilege for non-interactive agents.
- Keep run logs short and useful.
- Do not schedule external sends, pushes, uploads, deletes, or production changes without explicit approval policy.
- Use heartbeats for current-thread follow-up; use cron-style automations for detached recurring work.
