---
protocol_id: DOCUMENT-LIFECYCLE
title: Document Lifecycle
status: active
version: 0.1.0
owner: repo-maintainers
last_reviewed: YYYY-MM-DD
summary: Classifies repository documents and defines creation, update, and retirement rules.
related_protocols:
  - DOCUMENT-QUALITY
  - PROTOCOL-TAXONOMY
---

# Document Lifecycle

## Purpose

Keep repository documentation discoverable, durable, and free of duplicate sources of truth.

## Document Classes

| Class | Use | Examples |
| --- | --- | --- |
| Root instruction | Always-on agent posture | `AGENTS.md` |
| Protocol | Durable recurring procedure | `ops/protocols/*.md` |
| Reference | Detailed supporting material | `docs/reference/*.md` |
| Human surface | Reader-friendly overview | `README.md` |
| Knowledge reference | Imported or external context | `docs/knowledge/*.md` |
| Temporal record | Dated status or handoff | `docs/status/*.md` |

## Creation Checklist

- Choose the document class before writing.
- Check for an existing source of truth.
- Add protocol front matter when creating an active protocol.
- Register new protocols in `AGENTS-TOC.md`.
- Link related protocols using stable protocol IDs.

## Retirement Checklist

- Mark replaced protocols as `deprecated` or `retired`.
- Point to the replacement.
- Remove stale TOC routes.
- Preserve temporal records only when they have audit value.

## Verification

Run `./{{CLI_NAME}} precommit --all` when documentation routing changes.
