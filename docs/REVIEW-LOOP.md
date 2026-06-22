# Review Loop

Use this loop before publishing a meaningful change.

## Objective

Keep the skill repository installable, agent-agnostic, understandable to
nontechnical users, and safe for shareable packages.

## Review Perspectives

- Product owner: value, scope, naming, release readiness
- CTO: architecture, maintenance, test coverage, operational risk
- Security/privacy: secrets, credential references, package safety, destructive actions
- Nontechnical user: plain-language setup, confidence, no hidden assumptions
- User journey QA: install, first prompt, scaffold, verify, recover from blockers
- Agent adapter: Codex, Claude Code, Gemini CLI, Kimi, Cursor, and unsupported clients
- Loop/automation: bounded recurrence, verification gates, stop states, logs

## Severity

| Severity | Meaning | Required action |
| --- | --- | --- |
| `P0 no-ship` | Could leak secrets, corrupt user data, publish unsafe packages, or make installs fail | Fix before release |
| `P1 release blocker` | Breaks a primary journey, public install, scaffold, verification, or beginner safety | Fix before release |
| `P2 important` | Material confusion, maintenance risk, or missing guardrail with a workaround | Fix or explicitly defer |
| `P3 polish` | Wording, discoverability, or small ergonomics issue | Batch when convenient |

## Review Artifacts

Write each loop to:

```text
docs/reviews/YYYY-MM-DD-review-loop.md
```

Include:

- change summary
- reviewers or personas used
- commands run
- package or install evidence
- findings by severity
- fixes applied
- accepted risks, if any
- final terminal state

Use `accepted-risk` only when a human maintainer names the risk, explains why it
is acceptable, and records the follow-up trigger.

## Iteration Limit

Run at most three repair rounds without human input. If the same class of
material finding remains after three rounds, stop in
`exhausted-review-rounds` with evidence instead of continuing indefinitely.

## Terminal States

- `ready`: checks pass and no material review findings remain
- `repair-needed`: material findings exist and must be fixed
- `blocked`: required external information or permission is missing
- `exhausted-review-rounds`: the loop reached its repair-round cap without resolving a repeated material finding
- `accepted-risk`: a finding is real but explicitly accepted with rationale

## Required Checks

```bash
npm run check:offline
npm run check:ci
npm run check
```

After the repository is public, the release workflow verifies published release
assets, then runs mutable source discovery as a post-publish diagnostic.
Maintainers can run the same diagnostic manually. Confirmed source-discovery
misses should have a follow-up issue; transient npm/GitHub failures are warnings:

```bash
npm run check:public-install-only
```

## Persona Review Prompt

Use this shape for each persona:

```text
Review the repo-agent-harness-builder repository from the perspective of
<persona>. Find only actionable issues. Classify each as P0, P1, P2, or P3.
Focus on install, first-use journey, package safety, generated CLI behavior,
agent-agnostic compatibility, and nontechnical user comprehension.
```

## Claude Adversarial Review Prompt

```text
Perform a no-ship adversarial review of this repository. Look for security,
privacy, packaging, install, generated CLI, documentation, release, and
agent-agnostic compatibility failures. Prioritize concrete findings with file
paths and reproduction steps. Classify severity as P0/P1/P2/P3.
```

## Release Acceptance Gates

Public release requires:

- `npm run check` passing locally.
- `npm run check:offline` passing locally and in required CI.
- `npm run check:ci` passing locally and in required CI, proving local skill discovery.
- `npm run check` passing in required CI and in the release workflow, proving the generated release archive can install into a temporary project.
- GitHub Actions passing on `main`.
- A generated release package that passes `scripts/verify-package.py` with provenance.
- Published release assets are downloaded from GitHub, checksum-verified, and rechecked with `scripts/verify-package.py`.
- Public `npx -y skills@1.5.12 add OWNER/REPO --skill repo-agent-harness-builder --agent codex --list` discovery is treated as a post-publish mutable-ref diagnostic; confirmed discovery misses create a follow-up issue, while transient or unclassified npm/GitHub failures warn only.
- A first-use journey tested for repository mode and personal-folder mode.
- README install commands match the published repository owner/name.
- No P0/P1 findings remain.
- P2 findings are fixed or recorded as human-accepted risks.
