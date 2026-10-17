# Optional design-in-code kit

Use this when a project has a real component library and wants its design owner
to design, implement and verify UI in that codebase. Keep the module inactive
until source authority, owners, synthetic fixtures and verification are named.

The separately discoverable `design-in-code` skill in this distribution carries
the operating workflow and installation/visual-proof guides. The builder
scaffolds the dependency-free core and project-adapter helpers:

| Pattern | Reusable artifact | Project parameters |
| --- | --- | --- |
| Repository sources, rebuilt design-tool mirrors | `DESIGN-IN-CODE.md`, skill installation guide | package entry, provider, CSS, fonts, tool adapter, source revision |
| One token authority, CI projection check | `scripts/design/compare-tokens.mjs` | canonical parser, actual runtime/CSS projection, declared token mapping |
| View registry and derived tracker | `ops/design-workflow.json`, `design views`, `design tracker` | actual views, audiences, modules, source files, status/link metadata |
| Self-contained bounded session | `design session <id> [--json]` | design owner, scope, sources, local preview plan |
| Real-app synthetic preview | `design preview <id> [--json]` | reviewed argv, concrete fixture path, runtime, unique port, server lifecycle |
| Real-component static options | `scripts/design/render-previews.mjs` | trusted precompiled framework SSR module, full CSS, new output path |
| Today-first visual decisions | `design-in-code` skill, visual-proof guide | capture region, source width, byte budgets, recipient interface |
| Measured visual matrix and evidence | visual policy, `measure-layout.mjs`, `measure-matrix.mjs`, `design check` | widths, sidebar/states, fixture assertions, exceptions, manual checks, producer |
| One coordinator and bounded view/module owners | protocol and session milestone contract | owner, file boundaries, shared-library writer, approved task/worktree model |

There is no universal auth-off flag, browser installer, local disk path, ticket
prefix, cloud identity or design vendor. Preview plans do not launch anything.
Static rendering executes trusted repository code and is not a sandbox. The
framework compiler and real browser journey remain the project's responsibility.

`design check` uses the existing QA-EVIDENCE schema with the registered view ID
as target and a separate fixed design policy. It verifies complete declared
receipts, revision binding and local digests. It does not inspect pixels, prove
producer honesty or grant release authority. The project must wire the actual
matrix, accessibility, interaction and backend-contract checks before activation.

For installation order and adapter interfaces, read the distribution's
`skills/design-in-code/references/installation.md`. Follow the source-of-truth
and ownership rules in `skill-install-ownership.md`; do not sync shared skill
names from a downstream repository.
