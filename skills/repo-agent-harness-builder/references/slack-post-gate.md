# Slack outbound post gate

Use this optional module when a repository sends automated, agent-authored
Slack messages through a bot or app. Do not scaffold it for repositories that
do not automate Slack posting.

The installable `slack-post-gate` skill in this distribution carries the full
design reference and inactive implementation templates. The portable onboarding
archive includes it under `skills/slack-post-gate/`.

## Required shape

Put every bot send behind one repository-owned command with three checks:

| Layer | Failure behavior | Override |
| --- | --- | --- |
| Channel content policy | Block | Never |
| Slack mrkdwn and Block Kit formatting | Block | Never |
| Mechanical style and channel-aware classifier | Block by default | Logged reason |

Classifier execution, timeout, unavailable-command, invalid-output, and schema
errors always block. A predefined, logged reason code may override a valid
classifier fail verdict or style finding. Content and formatting never allow an
override.

Attribution follows who wrote the words. Agent-written messages post as the
bot. A person's own words may post as that person. A person's decision written
up by an agent posts as the bot and names the decider in the body.

## Enforcement boundary

Match the capability, not a command string. Inject the bot credential only into
the sanctioned poster invocation. A raw HTTP client, alternate SDK, or general
agent shell must not receive it.

A client hook that blocks obvious raw send calls is useful feedback, but it is
only defense in depth. Document its client event, config path, input schema,
blocking behavior, timeout, failure mode, and disable path. Unsupported clients
use the same gated CLI without the hook.
Strip the bot credential from classifier and git audit subprocess environments.
Keep hard-rejected drafts out of the classifier. Configure implemented section
accessory types and value-safe override reason codes in the repository config;
interactive types require owner-reviewed interactivity. Review all agent-supplied
outbound accessory text. Future provider-generated options need their own gate.

## Activation

Keep the module inactive until a human approves:

- bot identity and allowlisted channel IDs
- audience, accepted genres, and excluded subjects per channel
- non-overridable content patterns
- classifier command and timeout
- audit location, retention, and owner
- the secret runner or profile that limits credential injection to the poster
- disable, revoke, and credential-rotation steps

Update `AGENTS-TOC.md` and the harness checklist when installing the protocol.
Do not store Slack credentials or classifier credentials in repository files.

## Verification

Test each deterministic rule in both directions, then run the supplied
falsification mode with one rule disabled. Preserve real engineering false
positives such as dunder paths, SQL continuation lines, shell comments, globs,
arrows, package names, URLs, and email addresses.

Run a known-good draft through every checker. A dead classifier that blocks all
messages is fail-closed but not functional. Before activation, prove that an
unsanctioned process cannot read the bot credential.

Have a person inspect new tables, charts, or other structural Block Kit output.
Slack's successful response proves delivery, not rendering or usability.
