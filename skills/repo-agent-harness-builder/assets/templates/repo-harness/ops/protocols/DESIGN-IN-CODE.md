---
protocol_id: DESIGN-IN-CODE
title: Design in the Codebase
status: inactive
version: 0.1.0
owner: repo-maintainers
last_reviewed: YYYY-MM-DD
summary: Grounds UI decisions in real components, app behavior and measured revision-bound evidence before implementation and publication.
related_protocols:
  - DESIGN-SYSTEM
  - QA-BROWSER
  - QA-EVIDENCE
  - AGENT-ORCHESTRATION
---

# Design in the codebase

## Activation and source of truth

Keep this module inactive until a design owner names the component library,
token authority, view scope, synthetic fixtures, approved local preview command,
visual policy, evidence producer and disable path. Set the workflow and visual
policies active only after testing them in this repository. The base harness
does not require a browser, React, a design vendor, or credentials.
Keep protocol front matter and checklist states aligned with that activation.
`design status` reports governance and workflow declarations separately, without
treating either as verification of authority or runtime readiness.

- `ops/design-workflow.json` owns the view registry and local source pointers.
- `ops/design-visual-policy.json` owns widths, states, measurement options and
  capture budgets. These are starting project policies, not accessibility certification.
- `ops/design-evidence.json` owns required visual check IDs independently of results.
- The generated tracker is a human view, never a runtime input or authority.
- Components, tokens and backend contracts stay in their existing canonical files.
- External canvases and exported design systems are rebuildable proposals or
  mirrors. Do not hand-edit a mirror and treat it as the next source version.

## Ownership and milestone 1

The design owner carries a view through grounding, decisions, implementation,
tests and review. One coordinator owns cross-view consistency and shared-library
changes, and may explicitly delegate a bounded package writer. One implementation
owner edits each file. Agree view/module boundaries before parallel work.
Follow the repository's branch and worktree policy; no fixed disk, worktree,
client, ticket prefix or integration branch is prescribed here.

`design session <id>` prints a client-neutral brief. It does not create or
message tasks. Existing project-orchestration authority still governs delegation.

Before implementation, deliver milestone 1:

1. Show Today from the running app or Storybook with synthetic data. If the
   state is unreachable, show the closest real state and record the blocker.
2. Map each field, action, backend operation and permission as `exists`,
   `available` or `gap`, with source evidence. A seeded preview proves none of
   the live backend, auth or permission claims.
3. Present the UI choices with the real components and tokens. Put Today first.
4. Stop for the design owner's explicit decision. Unanswered cards, registry
   states, generated briefs and successful renders do not authorize edits.

Use a data/action map with columns for element/action, data source, server
operation, permission, category, evidence and open decision. File backend gaps
only when the owner approves; never silently implement them as design work.

## Commands

```bash
./{{CLI_NAME}} design status
./{{CLI_NAME}} design views --json
./{{CLI_NAME}} design session <id> --json
./{{CLI_NAME}} design preview <id> --json
./{{CLI_NAME}} design tracker
./{{CLI_NAME}} design tracker --write
./{{CLI_NAME}} design check <manifest> --revision <full-sha> --view <id>
```

`status` stays credential-free and nonblocking while inactive. Workflow commands
require active configuration. `preview` returns an argv plan and loopback URL;
it never launches a server, installs a runtime, disables auth or chooses mock
data. Use explicit unique ports, check actual availability in the owning server
launcher, and never stop another session's process. Serve auth-bypassed fixtures
only through a reviewed isolated local lane with no live credentials or writes.

Edit registry statuses and links in the view's own PR. `merged` means integration,
and `released` needs the repository's release evidence. The CLI records metadata
and does not independently certify either. `tracker` renders to stdout by
default; `--write` alone regenerates its configured artifact path. Runtime never
reads that derived file. Put drift comparison in a test of the generated-output
contract, outside any policy-exempt runtime dependency path.

## Real-component previews

The project owns its compiler, SSR adapter, provider, fonts, CSS and fixture data.
`scripts/design/render-previews.mjs` consumes a trusted precompiled JavaScript
module exporting `renderPreviews()` and writes a new artifact directory. It
does not compile TSX, download packages, authenticate or sandbox repository code.
See the builder's design-in-code reference for its interface.

Preserve full styles by default. CSS pruning and converting viewport queries
to container queries can change the design; use them only through a tested
project adapter. Static SSR cannot prove hydration, portals, focus, interactions,
browser layout or live data. Inspect every option in a browser at its actual
width before using it in a decision. Missing CSS, fonts or assets blocks fidelity claims.

For visual choices, show Today before the alternatives. Keep previews outside
choice buttons so rendered controls are not nested inside controls. Prefer
screenshots or isolated frames over injecting unscoped application CSS into the
decision form. Label any fallback sketch. Policy and financial approvals can
stay text-only. Capture budgets in the visual policy are configurable, and
capture tooling must enforce actual byte counts without losing needed detail.

## Measured visual gate

Import `scripts/design/measure-matrix.mjs` from the repository's approved browser
journey. Its `prepare` callback must reach and assert each real synthetic state;
missing fixtures block the run. Measure actual content width with the configured
sidebar state at all policy widths. Use stress content, long labels, large
numbers, empty/loading/error states and any interaction states affected.

The collector measures scroll overflow, clipped-height overflow, unexpected
ellipsis and configured target bounds. Document narrow selector exceptions with
their reason and owner in the PR; avoid broad selectors that mask defects.
It does not inspect cross-origin frames, shadow DOM, occlusion, every inline-text
edge, contrast, accessible names or keyboard behavior. Add scoped tests for those
surfaces. A clean measurement report alone is not a complete visual pass.

Also prove contrast, keyboard/focus, actual 200% browser zoom, and interactions.
Do not substitute CSS `zoom` or device pixel ratio for browser zoom. The default
44 px target policy is inspired by [WCAG's enhanced target criterion](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html) and has
exceptions; it is not a claim of universal AA conformance. Contrast evaluation
must account for font size, weight, backgrounds and the relevant exceptions.

Record complete outcomes in the QA-EVIDENCE manifest format, with the view ID as
target, full tested revision and local proof digests. `design check` uses the
separate fixed `ops/design-evidence.json` policy. Missing required checks, changed
bytes or identities, FAIL and BLOCKED prevent PASS. The verifier checks local
receipt coherence, not authorship, omitted runs, useful assertions or release
readiness. Do not create PASS receipts to stand in for tests that did not run.

## Token checks and disable

Keep one token authority. Use the project's parser, compiled token exports or
computed CSS to build semantic projections, then use
`scripts/design/compare-tokens.mjs` to compare declared values in CI. Finding a
literal in TypeScript source does not prove the runtime exported or used it.

To disable, mark workflow, visual and evidence policies inactive, stop only
owned preview processes, and revoke any external mirror grant separately.
Preserve canonical components and review evidence. Installing this module never
installs or overwrites shared fleet skills in a client-wide directory.

## Verification

Test inactive defaults, malformed arguments/configuration, duplicate ports,
missing parameterized-route fixtures, milestone-1 output, no implicit launch,
read-only tracker output, explicit writes, path/link refusals, drift comparison,
token mismatches, known-bad layout and incomplete visual evidence. Disable one
gate in a disposable fixture and prove its negative test fails. Then run the
repository checks and publish through its normal approved workflow.
