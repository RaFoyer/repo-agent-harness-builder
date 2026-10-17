# Design-in-code adoption

## Scope and evidence

This review generalizes the supplied Flow design-workflow handoff into an
optional, agent-agnostic kit. Flow was inspected read-only. No Flow branch,
worktree, process, pull request, live data or installed skill was changed.
Private design pages, account/project identifiers, machine paths and product
fixtures are not copied into the kit.

The available local Flow checkout predates the named commits. Inspection used
read-only GitHub source reads at the handoff's known refs:

- [Merged foundation, PR 3337](https://github.com/Intellio-Labs/flow/pull/3337),
  merge `a61b0aa438`: registry, design CLI/tests, static renderer, token validator,
  sync notes/conventions and Today-first decision guidance.
- [Tracker dependency fix, PR 3368](https://github.com/Intellio-Labs/flow/pull/3368),
  source `955324c087`: runtime no longer reads the policy-exempt tracker. This
  PR had already merged when checked, despite being open in the handoff.
- PRs 3363, 3356 and 3357 remained open drafts when checked. Their fixture and
  product changes are not represented as merged prerequisites or copied code.
- Unpublished shared-record, visual-quality and redesign work was not inspected.
  The handoff's claims about that work remain reported context, not verified
  implementation evidence.

This is a source-pattern audit and toolkit implementation, not a Flow UI,
deployment or production-readiness certification.

## The kit

The artifact/parameter inventory is maintained in the builder's
`references/design-in-code.md`. The nine patterns map to these reusable pieces:

| Pattern | Included implementation |
| --- | --- |
| Repository source and rebuilt external copies | Inactive protocol, source pointers, project-owned sync adapter contract |
| One token authority | Semantic token-projection comparator, paired tests and disabled-rule falsification |
| View registry and generated tracker | Config validation, view list/filter, pure tracker renderer, explicit write |
| Bounded session brief | Client-neutral JSON/Markdown brief with read-only milestone and explicit approval stop |
| Running app with synthetic data | Public argv/loopback preview plan, explicit unique port and project-owned launch/fixture lifecycle |
| Real-component options | Trusted framework SSR module interface, validated fresh artifact directory, complete CSS retained |
| Today-first choices | Skill and visual-proof guide, configurable capture budgets and isolated preview presentation |
| Measured visual quality | Viewport/state matrix, overflow/truncation/target collector, separate manual checks and revision-bound evidence verification |
| Coordinator plus view/module owners | Shared-library ownership and bounded delegation rules that compose with existing orchestration |

The kit does not supply a fictional component catalog or sample product routes.
It does not install a UI framework, browser, server or design vendor. Core
workflow policies are inactive and baseline `design status` remains nonblocking.

## What remains project-specific

| Flow detail | Why it stays in Flow or an adapter |
| --- | --- |
| Component package, provider, fonts, token mappings and presentation laws | These are product design authority, not universal defaults |
| The ninety school/parent/platform routes and their source files | Another application's views and permission boundaries must be discovered locally |
| Seeded domain runtime, auth-off environment variable and ledger fixtures | A generic kit cannot safely disable auth or infer a real backend/data boundary |
| Shared record components, domain money formatting and product refusal behavior | Reuse concepts after their owning project validates them; do not copy domain behavior into a harness |
| Node/pnpm version, terminal launch, external disk and worktree layout | Runtime and workspace policy belong to the target repository/client |
| Ticket prefix, integration branch, exact-head approval and stack landing rules | These are repository-specific delivery authority |
| External design project, migration/login operations and lifecycle dates | These are provider/account adapters requiring fresh verification and separate authorization |
| Global copies of shared decision skills | Downstream sync cannot take ownership of distribution-managed fleet skill names |

## Gaps addressed before copying

1. **Stable port is not unique port.** Executing the source hash over the 90
   registry IDs produced 12 collision groups, including two groups of three.
   The source tests prove stability/range, not uniqueness. The kit requires
   explicit unique ports and leaves the actual availability/ownership check
   with the launch adapter. It never stops an unrelated preview.
2. **Default tracker writes.** The merged dependency fix correctly removes the
   runtime doc read, but its `tracker` command still rewrites without `--write`.
   The kit defaults to stdout and writes only when requested. CI compares the
   generated-output contract; the runtime does not read derived documentation.
3. **Parameterized views need real fixtures.** Eleven registry routes in the
   inspected foundation lacked a concrete preview path. Falling back to a list
   is navigation help, not proof that a requested detail state works. The kit
   records an unavailable preview rather than inventing a record, and matrix
   preparation must assert the exact intended synthetic state.
4. **Static CSS transformations change the subject.** The inspected renderer
   uses a handwritten CSS block splitter/class filter and converts simple width
   media queries into container queries. Those transformations are not generally
   equivalent to the app's CSS. The kit keeps complete styles and viewport
   semantics by default; optimized adapters need their own fidelity tests.
5. **SSR is not browser or interaction proof.** The kit validates all preview
   names/widths before writing and refuses an existing output directory. It labels
   the result static-only. Providers, styles, fonts, assets, hydration, portals,
   focus and actions still need the owning app/browser tests.
6. **Milestone intent must be explicit.** The inspected foundation brief permits
   immediate small code changes; it does not encode the handoff's later
   milestone-1 stop. The kit's emitted contract and skill require the owner to
   decide after Today, data/action/permission mapping and options, before edits.
   This instruction is not represented as a technical enforcement boundary.
7. **A literal in source is weak token proof.** Flow's validator compares a
   declared CSS projection but checks TypeScript with substring presence. The
   kit comparator consumes semantic/runtime projections instead. The target
   project must implement the parser/export adapter and define its full scope.
8. **Measured quality is incomplete without the other checks.** The supplied
   collector is explicitly diagnostic and does not claim contrast, keyboard,
   actual browser zoom, all inline/shadow/iframe behavior or release readiness.
   The separate evidence policy can require those real checks and blocks missing
   receipts. Digests bind bytes, not trustworthy authorship or good assertions.
9. **Global skill copies need an owner.** The kit supports project-namespaced
   adapters and authoritative shared distribution. It does not instruct a
   downstream repository to overwrite global `make-decisions` or `design-in-code`.

These are findings for the requester. They do not authorize repairs in Flow.
No message was sent to its active design/tooling sessions.

## Installation and verification

Follow `skills/design-in-code/references/installation.md` in order: inspect and
agree the diff, adapt the existing CLI, configure actual source/view pointers,
prove the isolated synthetic preview, wire project renderer/token/browser
adapters, then activate the policies and test positive/negative cases. Reuse
existing tooling rather than installing a second framework or browser stack.

Targeted generated-harness tests cover configuration, inactive/usage boundaries,
milestone output, non-executing preview, explicit tracker writes, links/paths,
separate evidence policy, token mismatch, measured four-pixel overflow, narrow
exceptions, missing fixtures and static-render outputs. Repository-wide checks,
package installation and independent skill trials are separate from those unit
tests.

## Builder validation

On 2026-10-17, `npm run check:offline`, `npm run check:ci` and `npm run check`
each passed. These cover generated-harness tests, portable archive verification,
installer boundaries, skill discovery where enabled, and six disabled-rule
falsifications. The generated CLI suite contains 322 tests. After the final
activation-reporting assertions, all 13 design-workflow tests and all six
falsifications also passed in a fresh scaffold.

A local Chromium fixture detected deliberate overflow, then passed after the
fixture's layout was fixed. This proves the collector runs in a browser; it is
not evidence about any Flow view. No browser or framework was installed.

An independent GPT-6.1 Sol trial used a generated harness with a small, real
component/backend fixture. It identified read and archive permissions,
distinguished an available single-record operation from a missing bulk workflow,
reported the absent preview, and stopped before implementation. It made no
files or product changes. The trial led to separate reporting for workflow and
governance declarations, with activation alignment called out in installation.
It is a same-family skill-behavior trial, not a cross-model code review or
production validation.
