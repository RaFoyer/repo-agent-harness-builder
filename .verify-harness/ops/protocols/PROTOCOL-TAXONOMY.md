---
protocol_id: PROTOCOL-TAXONOMY
title: Protocol Taxonomy
status: active
version: 0.1.0
owner: repo-maintainers
last_reviewed: 2026-07-27
summary: Defines the structure and lifecycle for agent-facing protocols.
related_protocols:
  - DOCUMENT-LIFECYCLE
  - DOCUMENT-QUALITY
---

# Protocol Taxonomy

## Purpose

Define how durable agent protocols are created, named, reviewed, linked, and retired.

## Required Front Matter

```yaml
---
protocol_id: EXAMPLE-PROTOCOL
title: Example Protocol
status: active
version: 0.1.0
owner: repo-maintainers
last_reviewed: YYYY-MM-DD
summary: One sentence describing durable behavior.
related_protocols:
  - OTHER-PROTOCOL
---
```

## Protocol Body

Every protocol should include:

1. Purpose
2. When to use
3. Source of truth
4. Required sequence
5. Guardrails
6. Verification
7. Update rules

## Lifecycle States

| State | Meaning |
| --- | --- |
| `active` | Current source of truth |
| `draft` | Not authoritative yet |
| `deprecated` | Replaced but kept for reference |
| `retired` | No longer used |

## Guardrails

- Keep protocols durable and non-temporal.
- Put current work status in tracker comments, handoff notes, or status docs, not protocols.
- Use `related_protocols` for stable protocol IDs only.
- Update `AGENTS-TOC.md` whenever protocol routing changes.
