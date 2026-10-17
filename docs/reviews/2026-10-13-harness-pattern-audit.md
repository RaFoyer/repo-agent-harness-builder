# Harness and CLI pattern audit, 2026-10-13

This audit compares repository harness and CLI mechanisms with the current
`skills/repo-agent-harness-builder/` source. It recommends narrow additions,
not replacement harnesses. Source repositories were read-only; no credentials,
authentication, live provider calls, deployments, installs, or external writes
were needed. No harness behavior was changed.

## Source snapshots and confidence

The checked-out repositories were older and had existing local changes. Newer
locally cached default-branch trees were inspected with Git object reads,
without switching branches or fetching. "Landed" below means reachable in that
cached default history, not independently verified against today's server tip.

| Repository | Checkout | Cached default inspected | Evidence boundary |
| --- | --- | --- | --- |
| ACOS Labs | `6d8f18e0a1`, August 28 | `origin/dev@7b5c6c5fca`, October 13 | Default-tree source; existing dirty checkout kept separate |
| Sentur AI | `fe7507d13e`, August 13 | `origin/dev@e0a2a9f`, September 29 | 16 commits ahead of checkout; ref last refreshed October 1 |
| Scribal | `d5378facdb`, July 26 | `origin/development@c8e9679433`, September 30 | 72 commits ahead of checkout; two newer feature-only experiments identified |
| Flow | `d0c203cd71`, August 26 | `origin/dev@72e9907949`, October 12 | Ref refreshed October 12; dirty bot/hook additions excluded |

Builder baseline: `fa78f9b` plus the existing working changes, including the
optional Slack outbound post gate and skill-distribution work. These were
preserved and treated as already present.

All four repository audits used separate `gpt-6.1-sol` agents at
`high` effort, as requested, with no model fallback or nested delegation.
Agent elapsed time, token use, and cost were not instrumented. Test results
below describe the checks actually run, not complete repository verification.

## Adopt first: small additions to existing modules

| Priority | Pattern | Source | Increment over this builder |
| --- | --- | --- | --- |
| 1 | Strict typed CLI arguments | Sentur | One common parser for duplicates, flag types, missing values, and unknown input before executor calls |
| 2 | Shared entry-block sync | Flow | Client adapters share one small source block; staged-content checks catch committed instruction drift |
| 3 | Runtime activation ceiling | Scribal | Separate currently enabled capabilities from stable declared authority |
| 4 | Receipt-derived profile stage age | Scribal | Non-merge work gets its own stage and observed timestamps; missing observations remain unknown |
| 5 | Explicit internal JSON transport | Scribal | Keep public `gh-axi` output while internal collectors select an isolated upstream JSON executor |
| 6 | Supported-platform privacy seam | Sentur | Refuse private-state operations when ownership/permission guarantees cannot be established |

These belong in existing CLI, client-adapter, GitHub, and orchestration
templates. They do not need six new skills. Preserve backward compatibility
deliberately, and add negative tests proving malformed or inactive commands
never reach an executor.

### Strict argument parsing

Sentur's `apps/cli/src/util/strict-args.mjs:1` and
`apps/cli/src/pm/cli-input.mjs:11` declare boolean, single-value, and repeatable
flags. They reject blank/missing values, duplicate single flags, accidental
next-flag consumption, unknown flags, and prototype property names.
`apps/cli/test/strict-args.test.mjs:8` covers the input contract.

The builder already rejects some unexpected arguments, but
`assets/templates/cli-skeleton/apps/cli/src/util/args.mjs:5` still has a
permissive option reader. Copy the parser pattern, adapt its output to the
builder's structured error contract, and start with write-capable command
families. Preserve explicit `--` pass-through semantics.

### Shared entry blocks checked against the proposed commit

Flow's `tools/flow-cli/src/docs.mjs:20`, `:36`, and `:87` mirror one
marker-delimited operator block from `AGENTS.md` into selected client entry
files. Missing, malformed, and duplicate blocks fail distinctly. Precommit
checks the index at `tools/flow-cli/src/precommit.mjs:494` and `:695`, so a
working-tree repair cannot hide stale instructions in the proposed commit.
Tests at `tools/flow-cli/test/docs.test.mjs:22`, `:65`, and `:80` cover repair,
hidden staged drift, and deletion.

The builder already requires thin adapters and single-source instructions;
it lacks this executable cross-client consistency gate. Copy the small pattern
with generic markers, selected target files, a check-only default, and explicit
write mode. Validate every target before the first write: Flow's loop can
partially update earlier targets before refusing a later malformed one. Keep
client-specific invocation guidance outside the shared block.

### Runtime capability ceiling and machine-readable transport

Scribal's `apps/cli/src/github/index.mjs:252`, `:412`, and `:898` add
`runtimeCapabilities` as a nonempty subset of `allowedCapabilities`. This lets
an owner activate reads without changing stable authority metadata or sealed
work bindings. It is configured activation policy, not a measurement of actual
provider permissions. Effective authority must still intersect node scope,
credential grants, and approval gates; unrestricted raw tools remain outside
this wrapper's enforcement boundary.

The internal PR observer at `apps/cli/src/github/index.mjs:265` selects upstream
JSON transport through the same isolated profile, validates the executor,
and bounds time/output. A public `gh-axi` preference need not dictate the wire
format of an internal parser. Unknown or ambiguous profiles and missing
executors remain unavailable; there is no ambient-login fallback.

The builder already provides isolated auth and capability intersection. Its
`github/index.mjs:552` lacks the separate activation ceiling, and its internal
reader at `:176` selects the public preferred executor. Amend these existing
helpers rather than introducing another auth system.

### Honest profile-stage reporting

Scribal's `apps/cli/src/orchestration/report.mjs:119`, `:425`, and `:846` derive
non-repository profile entry time from the first positive receipt in a
validated append-only control history. Invalid or absent evidence leaves age
unknown. Reconciliation requires observed entry evidence before proposing a
timestamp, and distinguishes unavailable PR observation from observed
unmerged work. Tests at `apps/cli/test/cli.test.mjs:872`, `:988`, and `:999`
exercise those distinctions.

The builder already has completion profiles and receipt validation. Its
reporting `report.mjs:283` can fall back to a claimed plan timestamp and `:560`
can propose initialization without a timestamp gate. Port the reporting delta
and reuse a shared receipt validator. A valid receipt chain proves integrity
of recorded evidence, not the semantic quality of every referenced artifact.

### Platform privacy guarantees

Sentur's `apps/cli/src/util/posix-privacy.mjs:22` centralizes uid/mode checks and
explicitly refuses private-state enforcement on platforms where those checks
cannot establish the required guarantee. Ordinary credential-free discovery
stays available. The builder's private-state modules compare POSIX modes but
lack this explicit supported-platform seam. Copy the small helper and injected
tests; do not claim Windows ACL enforcement until it exists and is tested.

## Strong optional toolkit candidates

### QA evidence that cannot turn selective success into task acceptance

Flow's October QA fixes bind structured results to candidate SHA and target,
rank `FAIL` above `BLOCKED` above `PASS`, and refuse to let passing summaries
or selected passing batches hide applicable failures. Missing or NOTE-only
evidence stays blocked. Sources: `tools/flow-cli/src/qa/evidence.mjs:70`, `:93`,
`:155`, and `:174`; `tools/flow-cli/src/qa/ticket-comment.mjs:34`, `:53`, and
`:75`. Inspected regression tests at `tools/flow-cli/test/qa.test.mjs:1342`,
`:1456`, `:1539`, and `:1756` cover mixed outcomes and subset masking.

The builder has QA discovery, plans, artifacts, and no-masking checks, but
no structured result collector or acceptance-verdict gate. Adapt an inactive
QA-evidence protocol and read-only `qa evidence verify <manifest>` with a small
schema for check ID, outcome, revision, target, run/attempt identity, and proof
references. Declare applicable scope before execution. Explicit exclusions
remain visible and cannot erase FAIL; absent observations cannot become PASS.
Tracker posting and release promotion stay outside the initial module. Digests
bind bytes, not producer authenticity.

### Pinned authority lookup and protocol discovery

ACOS resolves governing documents through a registry, reads a pinned Git
revision when the worktree contains a draft or mismatched version, and returns
clauses with exact line/version/revision citations. Optional decision-time
hints are small and advisory. Sources:
`apps/cli/src/canon/corpus.mjs:29`, `:54`, and `:70`;
`apps/cli/src/canon/find.mjs:65`; `apps/cli/src/canon/hint.mjs:13`;
`ops/hooks/canon-hint.mjs:6`.

The builder already distinguishes indexes from authority in
`references/advanced-patterns.md:31`, but has no executable pinned-clause
lookup. Adapt an inactive canon protocol, a small authority registry, and a
read-only `canon find` example. Activate client hints separately. Ranking and
numeric-conflict guesses must never decide authority; an advisory fail-open
hook is not an admission gate. Product synonyms, thresholds, and conformance
phrases stay out of generic templates.

Flow adds the complementary discovery layer at
`tools/flow-cli/src/protocols.mjs:243`, `:406`, and `:503`: deterministic query
ranking across registry and TOCs, deduplication by path, and source-kind
attribution. The builder currently only lists protocols. Copy a small
`protocols find <query>` helper over existing metadata, including a fixture for
a legacy TOC-only document. Discovery finds potentially useful sources; pinned
canon lookup identifies a governing revision. Neither ranking grants authority,
and neither requires a second broad knowledge registry.

### External writes that preserve content and expose uncertainty

Sentur combines three mechanisms:

- Section-aware edits preserve unrelated text and refuse duplicates, open
  fences, injected headings, and replacement spans that consume another
  owned section: `apps/cli/src/pm/markdown-sections.mjs:304`, `:388`, and `:463`.
- Whole-body replacement requires the caller's observed version; section
  changes rebuild from fresh content and recheck the provider version before
  writing: `apps/cli/src/pm/clickup-tracker.mjs:301`, `:413`, and `:438`.
- Read-back verifies the exact intended payload and reports a possibly landed
  but unverified write without inviting a blind retry:
  `apps/cli/src/pm/body-verify.mjs:274` and `:299`.

The builder already has orchestration CAS and ambiguous task-materialization
handling, but not this general external-document contract. Adapt a
provider-neutral protocol and injected adapter with read/version/transform/
write/read-back phases. Prefer atomic conditional writes when supported;
Sentur's GET-before-PUT check narrows but does not eliminate the race.

Provider normalization rules are examples, not universal Markdown semantics.
Backups must use a configured private policy and value-safe output; the
source's backup behavior is not a safe generic default. Begin with a narrow
owned-section patcher, not a full Markdown framework.

### Review evidence bound to the code actually reviewed

ACOS's October review fixes reject unavailable or mismatched PR heads before
review, record base/merge-base/head/file coverage, recheck local state, and
read the PR head immediately before authorized publication. Sources:
`apps/cli/src/review/command.mjs:125`, `:168`, `:224`, and `:289`;
`apps/cli/src/review/runner.mjs:111` and `:127`. Reviewer adapters have bounded
runtimes and restricted tools without checkout-provided hooks/MCP settings.

Adapt a small optional receipt schema and pure validator first. Map existing
review gates into it; do not replace no-mistakes because ACOS chose a different
local policy. Start with exact reviewed-head equality. Exceptions for
descendant fixes or low-risk additions need their own policy and tests. Receipt
digests bind bytes, not trusted authorship, and head binding does not prove
that a reviewer tested the right invariant.

### Completion gates with evidence and deliberate waivers

ACOS's `apps/cli/src/pm/dod.mjs:18`, `:170`, `:393`, `:403`, and `:563` define
versioned work-type checklists, reject membership drift, require actor/date/
evidence or a waiver reason, and refuse close admission while items remain
open. This goes beyond prose reminders and the builder's existing goal
closeout checks.

Copy the parser/state pattern, not the product doctrine catalog. Start with a
few generic acceptance/evidence/unresolved-finding items and read-only
`completion validate <file>`. Catalog ownership and versioning are required;
tracker close enforcement is a separately activated adapter. Text evidence
remains a claim until a verifier resolves it. Waivers require reasons and must
not override non-waivable policy.

## Secondary references and experimental picks

| Pattern | Recommendation and caveat | Source evidence |
| --- | --- | --- |
| Non-vacuous audit coverage | Shared report shape: requested scope, inspected counts, pagination completeness, and missing targets. A valid empty inventory is different from an unperformed readiness audit. | Sentur `apps/cli/src/pm/clickup-tracker.mjs:697`, `:792`, `:808` |
| Local proof, live proof, and execution authority | Adapt a small evidence-validator example. A green local contract must name remaining live gates and must not grant mutation authority. | Sentur `apps/cli/src/infra/verification-execution-pre-mutation.mjs:30`; `verification-execution-live-gates.mjs:24`, `:86` |
| Governed documents before semantic classifiers | Optional registry/version/ratification checker first; recorded calibration fixtures and live semantic review later. Keep model routing external. | ACOS `apps/cli/src/prd/check.mjs:43`, `:191`, `:225`; `prd/review.mjs:74`, `:265`; `apps/cli/test/prd.test.mjs:136` |
| Bounded database reads | Adopt explicit scope, limit, truncation, and aggregate-refusal output. Keep PostgreSQL/RLS analysis as an inactive example requiring a real read-only role. | ACOS `apps/cli/src/data/db.mjs:69`, `:95`, `:128`, `:143`; `data/rls.mjs:125` |
| Evidence-preserving QA retention | Optional plan-only module that preserves small receipts and run markers. Add apply only with exact plan binding and tested recoverable disposal. | Scribal cached default `apps/cli/src/qa/retention.mjs:30`, `:135`, `:160`, `:207` |
| Repository-event tracker planner | Pure event-to-transition example for active trackers; merge stops at QA readiness, not completion. Test duplicate/out-of-order events. | Sentur `apps/cli/src/pm/lifecycle-sync.mjs:21`, `:37`, `:62` |
| Source-specific environment receipts | Distinguish manual assertions from pipeline observations; bind revision and target, then independently verify producer and served revision. | Flow `tools/flow-cli/src/pm/env-stamp.mjs:44`, `:104`, `:365`, `:393` |
| Bounded retries for declared reads | Use an explicit read boundary, total deadline, cancellation, and fake clock. Definite auth/client errors fail immediately; uncertain writes reconcile instead of replaying. Do not copy a 65-minute interactive wait budget. | Flow `tools/flow-cli/src/util/github-read-retry.mjs:3`, `:23`, `:59` |
| Approved scope changes that preserve failure | Advanced inactive reference: original FAIL/BLOCKED stays visible as SPLIT, with a follow-up and independently verified approval. Never changes candidate-wide acceptance. | Flow `tools/flow-cli/src/qa/split.mjs:113`, `:155`, `:193`; `qa/ticket-comment.mjs:34` |
| Exact-blob large-file approvals | Experimental: lift only a size cap for an exact blob, never content scanning. Independent approval is not proven by a checked-in allowlist. | Scribal feature ME-160 at `127f59a90`, `apps/cli/src/precommit/checklist.mjs:210`, `:786`, `:919` |
| Background UI and zero-test admission | Experimental: explicit foreground permission at execution boundaries, offscreen routine rendering, and positive executed-test count. Native supervision remains an app example. | Scribal feature ME-161 at `401265d0d`, `scripts/lib/foreground_ui.sh:18`; `scripts/run_full_regression_suite.sh:69` |

The two Scribal experiments are not ancestors of the inspected cached default.
Do not present them as released baseline features.

## Checks actually run

- ACOS: exact default-tree modules loaded in memory with injected runners;
  canon citations/conflicts, completion evidence/waivers, SQL admission,
  read-only setup/truncation/profile refusal, and PRD prompt/head binding
  passed. Twenty-three original build-graph unit functions passed; the real
  ledger case was excluded. No paid review or live database ran.
- Sentur: 15 checked-out taxonomy/lifecycle/event-planner tests passed.
  In-memory assertions on newer default-tree strict parsing, section
  preservation/refusal, and platform privacy passed. Read-back module syntax
  passed; the full external-write replay suite was inspected, not run.
- Scribal: 12 selected offline reporting and executor/redaction tests passed.
  Retention, runtime-ceiling-specific, feature-branch, and native tests were
  inspected but not executed.
- Flow: seven assertions against the exact cached read-retry module passed
  with fake readers/sleep in 47 ms and no network/filesystem writes. Entry-sync,
  QA evidence, protocol discovery, environment-receipt, and scope-split tests
  were inspected, not executed.

Source statuses were rechecked by the auditors and unchanged. Test presence
and source review are not live-provider correctness or production-readiness
proof. This audit does not substitute for implementation review, full local
checks, or the repository's publication gate.

## Recommended adoption sequence

Start with three bounded changes: strict CLI parsing, staged entry-block sync,
and optional QA evidence verification. They have clear refusal cases, existing
test examples, and small portable implementations. Fold the Scribal reporting/GitHub
parity fixes into their existing modules as independent changes.

Then add pinned authority lookup and the external-write contract as optional
protocols. Review receipts and completion checklists can reuse those evidence
and adapter contracts. Governed-document classifiers, database policy analysis,
retention apply, environment promotion, and scope-change automation remain
later opt-in work, not prerequisites for a useful baseline harness.

Each adopted validator should have a falsification check: disable its admission
rule and prove the relevant negative fixture fails. Preserve real engineering
messages and legitimate empty states so a gate does not become a source of
routine false positives. This extends the lesson already captured by the
optional Slack outbound post gate.

## Keep the library's existing boundaries

Short root routing, protocol taxonomy, document lifecycle, private runtime
instances, orchestration graphs, scoped connectors, goal closeout, QA lanes,
CLI ergonomics, and optional review gates already have substantial coverage.
Synchronize them rather than importing duplicate architectures.

Do not copy account profiles, credential locations, model prices/pins,
application schemas, cloud provisioning, ambient-auth workflow dispatch, or
global policy installers. Portable additions are small schemas, pure
validators, evidence/output contracts, and separately activated adapters.
