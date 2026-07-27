---
protocol_id: DOCUMENT-QUALITY
title: Document Quality
status: active
version: 0.1.0
owner: repo-maintainers
last_reviewed: 2026-07-27
summary: Defines clarity, freshness, and audience-boundary rules for repository documentation.
related_protocols:
  - DOCUMENT-LIFECYCLE
---

# Document Quality

## Purpose

Make docs useful to agents and humans without leaking history, unrelated boundaries, or stale status.

## Durable Doc Rules

- Write the current intended rule or procedure, not a history of edits.
- Avoid "updated", "revised", "previously", and similar versioned language unless revision history is required.
- Do not include current priorities, meeting notes, temporary branch names, or implementation handoff clutter in durable docs.
- Do not name unrelated organizations, account families, or prior mistakes unless the reader needs them to act.
- Prefer one source of truth and links over repeated instructions.

## Root File Review

Before changing `AGENTS.md`, ask:

- Does this need to be always-on?
- Could it live in a protocol instead?
- Does it point to the right lazy-loaded detail?
- Does it keep the root file short?

## Protocol Review

Before changing a protocol, ask:

- Is this durable across future work?
- Are source of truth, guardrails, and verification explicit?
- Does `AGENTS-TOC.md` need an update?

## Verification

Run the repo documentation and precommit checks after changing root instructions or protocols.
