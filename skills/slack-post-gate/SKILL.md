---
name: slack-post-gate
description: Design, install, audit, or repair a fail-closed gate for automated Slack bot posts. Use when a repository sends agent-authored Slack messages, needs mrkdwn and Block Kit validation, must enforce channel-specific content and audience rules, or must prevent bot credentials from bypassing the sanctioned sender. Do not use for ordinary human-authored Slack messages sent through a human connector.
---

# Slack post gate

Automated Slack sends can succeed while producing unusable messages. The API
confirms delivery, not correct rendering, readable prose, or whether the post
belongs in the room.

Build one sanctioned bot-post command with three checks:

1. Content policy. Block secrets and channel-forbidden data. Never override it.
2. Transport formatting. Validate Slack mrkdwn and Block Kit. Never override it.
3. Style and audience judgment. Run mechanical prose checks and a channel-aware
   classifier. Fail closed, but allow a reasoned override that reaches the
   audit log before sending.

Attribution follows who wrote the words. Agent-written text posts as the bot.
A person's own words may post as that person. A person's ruling written up by
an agent posts as the bot and names the decider in the message.

## Before changing a repository

Read [references/design.md](references/design.md). Inspect the repository's
current Slack transports, secret injection, channel ownership, hooks, and
protocol router before proposing files.

Keep the module inactive until a human approves:

- the bot identity and allowed channel IDs
- each channel's audience, accepted genres, and excluded subjects
- non-overridable content rules
- the classifier command and its credential boundary
- the audit location and retention owner
- the exact command that alone receives the bot credential

Do not treat a hook that matches command text as enforcement. The durable
control is capability-based: inject the bot credential only into the sanctioned
poster invocation. A client hook may block obvious mistakes as defense in depth.

## Install or adapt

The files under `assets/` form an inactive reference implementation:

- `ops/protocols/SLACK-POST-GATE.md`
- `ops/slack/post.py`
- `ops/slack/test_post_gate.py`
- `ops/slack/post-gate.example.json`
- `ops/slack/classifier-prompt.txt`
- `ops/slack/block-ungated-post.sh`

Copy them into the target repository with its existing naming and routing
conventions. Rename `post-gate.example.json` to the repository's chosen config
path, keep it inactive, and replace its sample channel contract. Update the
protocol TOC and harness checklist in the same change.

The reference poster accepts a classifier as an argv array. It sends the
channel contract and draft as JSON on stdin and requires strict JSON on stdout.
Keep the classifier adapter local to the repository so the portable gate does
not depend on one model vendor or agent client.

## Verification

Run the paired deterministic tests and the deliberate falsification pass:

```bash
python3 ops/slack/test_post_gate.py
python3 ops/slack/test_post_gate.py --falsify
```

Then run a known-good message through `--check-only`. Confirm every checker ran;
a blocked result caused by a dead classifier is not proof of a working gate.

Before activation, prove that a process outside the sanctioned invocation
cannot read the bot credential. Test an obvious raw-send path and the approved
path. For a new Block Kit table, chart, or other structural format, have a
person inspect the rendered Slack post. A successful API response is not visual
verification.

Do not send a live message during installation or testing unless the user has
authorized that exact external action.
