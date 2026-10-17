---
name: design-in-code
description: Run a codebase-grounded UI design workflow using the repository's real components, tokens, synthetic app previews and measured evidence. Use for view or module redesigns, real-component decision options and design-owner implementation through review. Do not use for a standalone illustration, brand exploration without a component library, or permission to change backend behavior.
---

# Design in code

The repository owns the product. A design canvas is a proposal or a rebuilt
mirror, never a second component source. The design owner carries the work
through implementation and verification with the same real components.

Read the target's `AGENTS.md`, protocol router and design authority first.
Use its existing CLI and browser tools. The optional builder module provides
`design views`, `session`, `preview`, `tracker` and `check`; do not assume these
exist in another repository. If absent, follow
[references/installation.md](references/installation.md) to plan the adaptation
before copying files or adding dependencies.

## First milestone

1. Confirm the design owner, view/module scope, shared-library owner and file
   ownership. Follow the repository's branch/worktree and task-creation rules.
2. Capture Today from the running app or Storybook with synthetic data. Record
   the revision, target, width, sidebar state and fixture. If unreachable,
   retain the Today slot with the blocker and nearest real state.
3. Map each field and action to its data, backend operation and permission.
   Mark `exists`, `available` or `gap` and cite source evidence. A mock screen
   is not backend or permission proof.
4. Show the real-component options and the decisions needed. Show Today first;
   put preview images or isolated frames outside the selection controls.
5. Stop for the design owner's explicit approval before implementation.
   Successful renders and unanswered decisions are not consent.

## After approval

Build with the canonical components and tokens. Route shared changes to the
coordinator or an explicitly delegated package writer; reuse shared patterns.
Preserve data loading, money, permissions and server operations unless those
changes are separately in scope. File backend gaps only with approval.

Read [references/visual-proof.md](references/visual-proof.md) before presenting
UI cards or claiming visual readiness. Measure the actual app at the agreed
widths and states, then inspect it. Static server rendering cannot prove
interactions, hydration, focus or responsive browser behavior.

Keep registry/status changes in the view's PR and regenerate the tracker only
with an explicit write. CI tests compare derived output; runtime code does not
read policy-exempt generated documentation. Follow the repository's normal
tests, PR, CI and release rules. A merged PR is not a production release.

External design tools are optional adapters. Rebuild their component copies
from reviewed repository inputs, record source revision and adapter version,
and verify the imported result. Never assume a vendor-specific login,
migration button or lifecycle date is portable.

Install this shared skill from its authoritative distribution. A downstream
repository may maintain its own namespaced adapter, but must not replace shared
`design-in-code` or `make-decisions` installations in global client folders.
