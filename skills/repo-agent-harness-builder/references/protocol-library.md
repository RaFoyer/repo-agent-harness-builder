# Protocol Library

## Protocol Front Matter

Every active protocol should begin with:

```yaml
---
protocol_id: PROTOCOL-ID
title: Human Title
status: active
version: 0.1.0
owner: repo-maintainers
last_reviewed: YYYY-MM-DD
summary: One sentence describing the durable behavior.
related_protocols:
  - OTHER-PROTOCOL
---
```

Use stable protocol IDs and `related_protocols` to build a durable graph. Do not put ticket IDs, temporary branches, current priorities, or meeting notes in `related_protocols`.

## Protocol Body Pattern

1. Purpose
2. When to use
3. Source of truth
4. Required sequence
5. Guardrails
6. Verification
7. Update rules

Keep protocols durable. A protocol answers "how work of this kind is done here," not "what happened today."

## Core Protocol Families

| Family | Examples |
| --- | --- |
| Agent workflow | `AGENT-WORKFLOW.md`, `SESSION-PREFLIGHT.md` |
| Documentation | `DOCUMENT-LIFECYCLE.md`, `DOCUMENT-QUALITY.md`, `REPO-NAVIGATION.md` |
| CLI | `CLI-INTERFACE.md`, `AGENT-CLI-ERGONOMICS.md`, `PRE-COMMIT.md`, `NO-MISTAKES-GATE.md` |
| Tracker | `PROJECT-TRACKING.md` |
| Security | `SECRETS.md`, `EXTERNAL-MCP.md` |
| DevOps | `CICD.md`, `BRANCH-PROMOTION.md`, `DEVOPS-SECURITY.md` |
| Optional evidence | `EVIDENCE-MAP.md`, `ARTIFACT-CONVENTIONS.md` |

## TOC Routing Rules

`AGENTS-TOC.md` should route by task:

| If the task is about... | Read |
| --- | --- |
| Starting a session | `SESSION-PREFLIGHT.md` |
| Adding or changing docs | `DOCUMENT-LIFECYCLE.md`, `DOCUMENT-QUALITY.md` |
| Running repo commands | `CLI-INTERFACE.md` |
| Changing agent-facing CLI output | `CLI-INTERFACE.md`, `AGENT-CLI-ERGONOMICS.md` |
| Preparing a commit | `PRE-COMMIT.md` |
| Preparing a PR or validating a branch through no-mistakes | `NO-MISTAKES-GATE.md` |
| Changing UI, UX, design systems, components, tokens, brand surfaces, adaptive UI, or generated UI | `DESIGN-SYSTEM.md` if present |
| Working with tickets | `PROJECT-TRACKING.md` |
| Handling credentials | `SECRETS.md` |
| Touching CI or deploy | `CICD.md`, `BRANCH-PROMOTION.md` |

## Document Classes

| Class | Purpose | Examples |
| --- | --- | --- |
| Root instruction | Always-on agent posture | `AGENTS.md` |
| Protocol | Durable recurring procedure | `ops/protocols/*.md` |
| Reference | Detailed supporting knowledge | `docs/reference/*.md` |
| Human surface | Human-facing overview | `README.md` |
| Knowledge reference | External or imported context | `docs/knowledge/*.md` |
| Temporal record | Current status or dated handoff | `docs/status/*.md` |

## Quality Rules

- Do not duplicate source-of-truth instructions across root files, protocols, and references.
- Do not include "current priorities" in durable docs.
- Do not mention unrelated organizations, account families, historical mistakes, or private boundaries unless the reader needs them to act.
- When revising recipient-facing text, write the final intended message rather than edit-history prose.
- If a protocol changes, update `AGENTS-TOC.md` in the same change.
