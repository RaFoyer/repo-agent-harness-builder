# Design System Governance Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an inactive, read-only design-system governance runway to generated repo harnesses without scaffolding a full design-system source tree by default.

**Architecture:** The generated harness gains an inactive `DESIGN-SYSTEM` protocol, TOC/checklist routing, and one CLI family with `design status`. The command reports inactive or pointer-discovered state without validating design assets, credentials, or external authorities. Richer CounselCue-style governance remains documented as an activation path, not default scaffold.

**Tech Stack:** Markdown harness templates, Node.js ESM CLI skeleton, Node test runner, existing Python scaffold/verify scripts, existing `npm run check` verification.

---

## File Structure

- Create `skills/repo-agent-harness-builder/assets/templates/repo-harness/ops/protocols/DESIGN-SYSTEM.md`
  - Inactive protocol for UI, UX, component, token, brand, adaptive UI, generated UI, and design-authority routing.
- Modify `skills/repo-agent-harness-builder/assets/templates/repo-harness/AGENTS-TOC.md`
  - Route design-sensitive work to `DESIGN-SYSTEM.md` when present.
- Modify `skills/repo-agent-harness-builder/assets/templates/repo-harness/ops/HARNESS-CHECKLIST.md`
  - Keep `Design system` inactive and point to the new protocol and `design status`.
- Create `skills/repo-agent-harness-builder/assets/templates/cli-skeleton/apps/cli/src/design/index.mjs`
  - Read-only `runDesign()` dispatcher with `status` and help.
- Modify `skills/repo-agent-harness-builder/assets/templates/cli-skeleton/apps/cli/src/main.mjs`
  - Register the `design` command family.
- Modify `skills/repo-agent-harness-builder/assets/templates/cli-skeleton/apps/cli/src/help.mjs`
  - Add `design status`.
- Modify `skills/repo-agent-harness-builder/assets/templates/cli-skeleton/apps/cli/test/cli.test.mjs`
  - Add focused command tests.
- Modify `skills/repo-agent-harness-builder/references/harness-checklist.md`
  - Update optional design-system row to reflect the inactive protocol/CLI activation path.
- Modify `skills/repo-agent-harness-builder/references/cli-tooling.md`
  - Add `design` as an optional command family with a read-only status contract.
- Modify `skills/repo-agent-harness-builder/references/protocol-library.md`
  - Add TOC routing guidance for design-system work.

## Task 1: Failing CLI Tests

**Files:**
- Modify: `skills/repo-agent-harness-builder/assets/templates/cli-skeleton/apps/cli/test/cli.test.mjs`

- [ ] **Step 1: Add expectations for the new command**

Insert these tests near the existing help and unknown-command tests:

```js
test("help lists design status command", () => {
  const help = renderHelp();
  assert.match(help, /design status/);
});

test("design status reports inactive module without design-system source", async () => {
  const { io, out, err } = capture();
  const code = await main(["design", "status"], io);
  assert.equal(code, 0, err.join("\n"));
  const text = out.join("\n");
  assert.match(text, /design system: inactive/);
  assert.match(text, /ops\/protocols\/DESIGN-SYSTEM\.md/);
  assert.match(text, /source: not configured/);
  assert.match(text, /activation:/);
});

test("unknown design subcommands fail with help pointer", async () => {
  const { io, err } = capture();
  const code = await main(["design", "validate"], io);
  assert.equal(code, 2);
  assert.match(err.join("\n"), /design status/);
});
```

- [ ] **Step 2: Run the tests and confirm failure**

Run:

```bash
HARNESS_TMP="$(mktemp -d)"
python3 skills/repo-agent-harness-builder/scripts/scaffold_harness.py \
  --target "$HARNESS_TMP" \
  --project-name "Design Test" \
  --repo-slug example/design-test \
  --cli-name harness \
  --allow-non-git \
  --force
cd "$HARNESS_TMP"
node --test apps/cli/test/*.test.mjs
```

Expected: tests fail because `design status` is not in help and `main()` does not dispatch `design`.

## Task 2: Read-Only Design CLI

**Files:**
- Create: `skills/repo-agent-harness-builder/assets/templates/cli-skeleton/apps/cli/src/design/index.mjs`
- Modify: `skills/repo-agent-harness-builder/assets/templates/cli-skeleton/apps/cli/src/main.mjs`
- Modify: `skills/repo-agent-harness-builder/assets/templates/cli-skeleton/apps/cli/src/help.mjs`

- [ ] **Step 1: Add the design command module**

Create `skills/repo-agent-harness-builder/assets/templates/cli-skeleton/apps/cli/src/design/index.mjs`:

```js
import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "../config.mjs";

const DESIGN_PROTOCOL = "ops/protocols/DESIGN-SYSTEM.md";
const HARNESS_CHECKLIST = "ops/HARNESS-CHECKLIST.md";
const DESIGN_MANIFEST = "design-system/manifest.json";

function repoPath(relPath) {
  return path.join(CONFIG.repoRoot, relPath);
}

function hasFile(relPath) {
  return fs.existsSync(repoPath(relPath));
}

function renderDesignHelp() {
  return `${CONFIG.projectName} design commands

Usage:
  ./${CONFIG.cliName} design <command>

Commands:
  status   Show inactive design-system governance status and activation route
`;
}

function runStatus(_argv, io) {
  const hasManifest = hasFile(DESIGN_MANIFEST);
  io.stdout(`design system: ${hasManifest ? "source-discovered" : "inactive"}`);
  io.stdout(`protocol: ${DESIGN_PROTOCOL}`);
  io.stdout(`checklist: ${HARNESS_CHECKLIST}`);
  io.stdout(`source: ${hasManifest ? DESIGN_MANIFEST : "not configured"}`);
  io.stdout("activation: name owner, scope, canonical design authority, verification, and rollback before marking active");
  return 0;
}

export async function runDesign(argv = [], io) {
  const [command = "status", ...rest] = argv;
  switch (command) {
    case "help":
    case "--help":
    case "-h":
      io.stdout(renderDesignHelp());
      return 0;
    case "status":
      return runStatus(rest, io);
    default:
      io.stderr(`Unknown design command: ${command}`);
      io.stderr(`Run ./${CONFIG.cliName} design status for inactive module status.`);
      return 2;
  }
}
```

- [ ] **Step 2: Register the command in `main.mjs`**

Add this import:

```js
import { runDesign } from "./design/index.mjs";
```

Add this switch case before `self`:

```js
    case "design":
      return runDesign(rest, io);
```

- [ ] **Step 3: Add help text**

Add this help row near other optional module commands:

```text
  design status        Show inactive design-system governance status
```

- [ ] **Step 4: Run generated CLI tests**

Run the same `HARNESS_TMP` scaffold command from Task 1, then:

```bash
cd "$HARNESS_TMP"
node --test apps/cli/test/*.test.mjs
```

Expected: the new design CLI tests pass.

## Task 3: Protocol And Routing Templates

**Files:**
- Create: `skills/repo-agent-harness-builder/assets/templates/repo-harness/ops/protocols/DESIGN-SYSTEM.md`
- Modify: `skills/repo-agent-harness-builder/assets/templates/repo-harness/AGENTS-TOC.md`
- Modify: `skills/repo-agent-harness-builder/assets/templates/repo-harness/ops/HARNESS-CHECKLIST.md`

- [ ] **Step 1: Add inactive protocol template**

Create `skills/repo-agent-harness-builder/assets/templates/repo-harness/ops/protocols/DESIGN-SYSTEM.md`:

```markdown
---
protocol_id: DESIGN-SYSTEM
title: Design System Governance
status: inactive
version: 0.1.0
owner: repo-maintainers
last_reviewed: YYYY-MM-DD
summary: Routes UI, UX, component, token, brand, adaptive UI, generated UI, and design-authority work.
related_protocols:
  - SOURCE-OF-TRUTH
  - DOCUMENT-QUALITY
  - CLI-INTERFACE
---

# Design System Governance

## Purpose

Use this protocol before changing product UI, UX, visual systems, brand surfaces, component libraries, tokens, adaptive UI, generated UI, or agent-composed interface behavior.

This module is inactive by default. While inactive, it provides routing and activation rules only. It does not create a design system, validate design assets, or authorize agents to invent product design authority.

## Source Of Truth

Repository docs may contain non-privileged design governance metadata, durable summaries, and pointer records. Role-restricted brand assets, private design files, customer-specific screenshots, or unreleased product material belong in the external authority that enforces access.

When the module is inactive, the repository has no canonical design-system source unless another protocol or approved pointer record names one.

## Required Sequence While Inactive

1. Check `ops/HARNESS-CHECKLIST.md` for the module state.
2. Run `./{{CLI_NAME}} design status`.
3. Identify whether the repo already names a canonical design authority.
4. Do not copy restricted design assets, raw screenshots, private transcripts, customer data, or credentials into the repository.
5. If UI or product-design work needs durable governance, propose an activation plan before implementation.

## Activation Requirements

Before marking this module active:

1. Name the owner and scope.
2. Name the canonical design authority or safe pointer record.
3. Define what may live in the repository and what must stay external.
4. Add or update design-system source records only after review.
5. Add CLI help and tests for any new command.
6. Define verification, rollback, and disable steps.

## Governance Levels

Use the smallest level that fits the repo:

| Level | Use When | Typical Artifacts |
| --- | --- | --- |
| Pointer-only | Design authority exists elsewhere | safe pointer records, source inventory |
| Source-backed | Repo owns non-sensitive tokens or component contracts | token files, component contracts, read-only validation |
| Review-backed | New components need approval before reuse | requests, candidates, review ledgers, proof manifests |
| CI-enforced | UI-sensitive changes must block on design governance | generated snapshots, CI checks, review evidence |

Do not skip directly to CI enforcement unless the source-backed and review-backed layers are already stable.

## Interface Mode Guidance

Choose the interaction mode by task fit:

- Keep fast, bounded, habitual, or spatial actions in direct UI.
- Use adaptive UI when a stable workflow changes by role, state, density, data, or progress.
- Use generated UI only when user intent and data shape justify a custom surface composed from approved parts.
- Use agentic or headless flows for delegated, repetitive, broad, or procedural work with review and recovery.

## Conflict Rule

When requested work conflicts with the design authority:

- use an existing approved component, token, pattern, or pointer
- update the design authority in the same change
- record an approved exception with review evidence

Do not silently invent a local UI pattern and treat it as canonical.

## Verification

While inactive:

```bash
./{{CLI_NAME}} design status
```

When activated, add focused validation commands and tests before relying on them for review or CI.
```

- [ ] **Step 2: Route design work from the TOC**

Add this row to the TOC table:

```markdown
| Changing UI, UX, product interface, design-system source, components, tokens, brand surfaces, adaptive UI, generated UI, or agent-composed interface behavior | `ops/protocols/DESIGN-SYSTEM.md` if present |
```

- [ ] **Step 3: Update checklist row**

Replace the design-system optional row with:

```markdown
| Design system | inactive | `ops/protocols/DESIGN-SYSTEM.md`, `./{{CLI_NAME}} design status`; activate when UI, UX, component, token, brand, adaptive UI, or generated UI work needs governance |
```

- [ ] **Step 4: Run scaffold verification**

Run:

```bash
HARNESS_TMP="$(mktemp -d)"
python3 skills/repo-agent-harness-builder/scripts/scaffold_harness.py \
  --target "$HARNESS_TMP" \
  --project-name "Design Test" \
  --repo-slug example/design-test \
  --cli-name harness \
  --allow-non-git \
  --force
python3 skills/repo-agent-harness-builder/scripts/verify_harness.py \
  --target "$HARNESS_TMP" \
  --cli-name harness \
  --run-tests
```

Expected: verification passes, including generated CLI tests.

## Task 4: Reference Documentation Updates

**Files:**
- Modify: `skills/repo-agent-harness-builder/references/harness-checklist.md`
- Modify: `skills/repo-agent-harness-builder/references/cli-tooling.md`
- Modify: `skills/repo-agent-harness-builder/references/protocol-library.md`

- [ ] **Step 1: Update optional module guidance**

In `harness-checklist.md`, update the `Design system` row to:

```markdown
| Design system governance | design-system protocol, design status command, source pointers, optional tokens/components, optional review/proof governance | UI, UX, component, token, brand, adaptive UI, or generated UI work may happen |
```

- [ ] **Step 2: Add optional CLI command family**

In `cli-tooling.md`, add this command row:

```markdown
| `design` | optional | Report inactive design-system governance status and, when activated, inspect safe design-system source pointers |
```

Add this short contract section near other optional command contracts:

```markdown
## Design Command Contract

Only add `design` when the design-system governance module is scaffolded. Minimum inactive behavior:

- `design status`: report module state, protocol path, checklist path, source discovery, and activation requirements.
- The command must be read-only, require no credentials, and exit 0 while inactive.
- Do not add validation, generation, CI gates, external-system inspection, or product-code scanning until the module is active and covered by tests.
```

- [ ] **Step 3: Add protocol routing guidance**

In `protocol-library.md`, add a TOC routing row:

```markdown
| Changing UI, UX, design systems, components, tokens, brand surfaces, adaptive UI, or generated UI | `DESIGN-SYSTEM.md` if present |
```

- [ ] **Step 4: Search for drift**

Run:

```bash
rg -n "Design system|design status|DESIGN-SYSTEM|design-system governance" skills/repo-agent-harness-builder README.md docs
```

Expected: references agree that the module is inactive by default and the first command is read-only.

## Task 5: Full Verification And Commit

**Files:**
- All files changed in Tasks 1-4

- [ ] **Step 1: Run formatting and local check**

Run:

```bash
git diff --check
npm run check
```

Expected: both commands pass.

- [ ] **Step 2: Inspect generated harness command output**

Run:

```bash
HARNESS_TMP="$(mktemp -d)"
python3 skills/repo-agent-harness-builder/scripts/scaffold_harness.py \
  --target "$HARNESS_TMP" \
  --project-name "Design Test" \
  --repo-slug example/design-test \
  --cli-name harness \
  --allow-non-git
"${HARNESS_TMP}/harness" design status
```

Expected output includes:

```text
design system: inactive
protocol: ops/protocols/DESIGN-SYSTEM.md
source: not configured
activation:
```

- [ ] **Step 3: Commit implementation**

Run:

```bash
git add skills/repo-agent-harness-builder
git commit -m "Add inactive design governance harness module"
```

Expected: commit succeeds with only implementation files staged.

## Task 6: Adversarial Review, PR, And Merge

**Files:**
- Branch history and PR metadata

- [ ] **Step 1: Run adversarial review**

Run:

```bash
node <claude-adversarial-review-skill>/scripts/claude-adversarial-review.mjs adversarial-review --scope branch --base main design governance harness module safety
```

Expected: review returns no no-ship findings. If it returns findings, classify them using the table below before opening a PR.

When the review returns findings, classify each one before continuing:

```text
P0 no-ship: fix before PR, rerun npm run check, rerun adversarial review
P1 material risk: fix before PR or record a specific reason it is not applicable to this inactive-module scope
P2 follow-up: include in PR residual risks only if it does not affect safety, correctness, or merge readiness
```

Do not open the PR while any P0 finding remains.

- [ ] **Step 2: Push branch**

Run:

```bash
git push -u origin RA/design-system-governance-harness
```

- [ ] **Step 3: Open pull request**

Run:

```bash
gh pr create \
  --base main \
  --head RA/design-system-governance-harness \
  --title "Add inactive design governance harness module" \
  --body-file "$PR_BODY"
```

Before running, create `PR_BODY="$(mktemp)"` and write that file with this structure:

```markdown
## Summary

- adds an inactive design-system governance protocol to generated repo harnesses
- adds read-only `./<cli> design status` routing for inactive design governance
- documents activation boundaries for source-backed and review-backed design systems

## Safety

- no default `design-system/` source tree
- no seed token/component/request/candidate/review/proof records
- no design validation, generation, CI gate, external-system access, or product-code scanning

## Verification

- `git diff --check`
- `npm run check`
- generated harness `./harness design status`
- Claude adversarial review: no P0 findings remaining
```

- [ ] **Step 4: Merge pull request**

After checks pass, run:

```bash
gh pr merge --squash --delete-branch
```

Expected: PR merges to `main` and remote branch is deleted.

- [ ] **Step 5: Verify main**

Run:

```bash
git checkout main
git pull --ff-only
npm run check
git branch --contains HEAD
```

Expected: `main` is current with the merged work and checks pass.
