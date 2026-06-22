---
protocol_id: PRE-COMMIT
title: Precommit Gate
status: active
version: 0.1.0
owner: repo-maintainers
last_reviewed: YYYY-MM-DD
summary: Defines local checks before changes enter shared history.
related_protocols:
  - CLI-INTERFACE
  - DOCUMENT-QUALITY
---

# Precommit Gate

## Purpose

Catch documentation drift, unsafe content, and missing verification before committing. Secret scanning is a best-effort local guard; keep `.gitignore`, provider-side secret storage, code review, and provider-native secret scanning as primary controls.

## Required Sequence

1. Review changed files.
2. Run `./{{CLI_NAME}} precommit`.
3. Run `./{{CLI_NAME}} precommit --all` when root docs, protocols, CLI code, CI, or security-sensitive files changed.
4. Run `./{{CLI_NAME}} precommit install-hook` once per clone when commit-time enforcement is required.
5. Fix blockers before committing.

## Gate Categories

| Category | Examples |
| --- | --- |
| Secrets | tokens, private keys, dotenv files |
| Local paths | home-directory absolute paths, machine-specific config |
| Protocol metadata | missing front matter or stale TOC |
| CLI drift | command changed without help/docs/tests |
| Tracker linkage | branch or PR lacks linked work item when required |
| CI coverage | runnable path lacks workflow or local check |

## Filename Exceptions

The scanner blocks high-risk credential filenames by default and warns on
ambiguous names such as public certificates. Use `ops/precommit-allow.txt` for
intentional repo-relative exceptions. Keep each exception exact, reviewed, and
documented in the change that introduces it.

## Verification

The command must print blockers and warnings clearly. Blockers require repair
or explicit human approval. `./{{CLI_NAME}} precommit hook-status` reports
whether the harness-managed git hook is installed.
