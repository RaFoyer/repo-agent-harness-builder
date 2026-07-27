---
protocol_id: qa-browser
title: Browser QA Protocol
status: inactive
version: 1
owner: repo-maintainers
last_reviewed: 2026-07-27
summary: Defines optional browser, Playwright, Storybook, and UI evidence lanes for app repositories.
related_protocols:
  - ops/protocols/CLI-INTERFACE.md
  - ops/protocols/EXTERNAL-SYSTEMS.md
  - ops/protocols/PRE-COMMIT.md
---
# Browser QA Protocol

Use this protocol when the repository has browser-rendered UI, Playwright tests, Storybook/component QA, visual evidence packs, or browser reconnaissance work.

This module is inactive by default. Activate it only after the repository names its browser test commands, artifact retention rules, and credential boundaries.

## QA Lanes

Keep these lanes separate:

| Lane | Purpose | Default authority |
| --- | --- | --- |
| Deterministic E2E | Acceptance tests that can run with mocked, seeded, or local data | Can block merge when active |
| Live E2E | Credential-gated checks against live or deployed systems | Approval-gated evidence |
| Storybook/component QA | Focused visual and interaction checks for isolated components | Advisory unless activated |
| Browser reconnaissance | Exploratory inspection, screenshots, console/network capture | Advisory evidence only |
| Load or route audit | Capture-only route, page, or shell readiness checks | Advisory unless activated |

Do not use advisory browser reconnaissance as acceptance evidence unless the protocol explicitly says the lane is active and defines repeatable checks.

## Playwright Setup

Before running browser tests, identify:

- Playwright config path
- dev-server command and port
- base URL
- whether existing servers may be reused
- mocked vs live test commands
- storage-state or auth setup
- browser dependencies required in CI

The repo CLI can inspect the common surface:

```bash
./verify-harness qa status
./verify-harness qa axi
./verify-harness qa plan
./verify-harness qa artifacts
./verify-harness qa no-masking
```

## No-Masking Rule

Deterministic E2E tests should not silently bypass product behavior with network interception unless the test is explicitly a mocked/advisory lane.

Before treating deterministic E2E as acceptance evidence, run:

```bash
./verify-harness qa no-masking
```

Review findings such as `page.route`, `context.route`, `route.fulfill`, `route.abort`, and HAR replay. Either remove the bypass, move the test into a mocked lane, or document why the bypass is part of the intended test contract.

## Artifact Policy

Treat browser artifacts as potentially sensitive:

- screenshots
- videos
- Playwright traces
- HARs
- console logs
- DOM snapshots
- downloaded files
- storage state and cookies
- local HTML captures

Before sharing artifacts outside the repo or attaching them to issues, inspect for credentials, private data, account identifiers, local paths, and privileged document contents.

Use run-scoped artifact directories with optional latest pointers. Latest pointers are convenience only; the run directory and manifest remain the evidence.

## CI Guidance

When this module is active, CI should run static harness checks first, then deterministic browser lanes. Live lanes should be separate, credential-gated, and allowed to report blocked/inconclusive when credentials are intentionally absent.

Upload only value-safe metadata and approved artifacts. Do not upload storage state, cookies, credentialed HARs, or private screenshots unless the repository has an explicit artifact-retention policy for that lane.

## Activation Checklist

Before marking this protocol active:

1. Name the owner and UI surface scope.
2. Record deterministic, mocked, live, and advisory commands.
3. Document dev-server and browser dependency setup.
4. Define artifact retention and redaction rules.
5. Add CI path or local verification commands.
6. Add or update `./verify-harness qa` tests if command behavior changes.
7. Add rollback or disable steps for credentialed live lanes.
