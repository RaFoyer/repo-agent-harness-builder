---
protocol_id: SLACK-POST-GATE
title: Slack outbound post gate
status: inactive
version: 0.1.0
owner: repo-maintainers
last_reviewed: YYYY-MM-DD
summary: Gates automated Slack bot messages behind content, formatting, style, and audience checks.
related_protocols:
  - SECRETS
  - EXTERNAL-SYSTEMS
---

# Slack outbound post gate

## Purpose

Prevent automated Slack posts that leak forbidden data, render incorrectly,
read as filler, or do not belong in the destination room.

This protocol does not grant permission to post. Existing external-action and
recipient-approval rules still apply after the gate passes.

## Activation state

This module is inactive. Before activation, name the owner and configure:

- the bot identity and allowlisted channel IDs
- the audience, accepted genres, and excluded subjects for every channel
- non-overridable content patterns
- a classifier command that follows `ops/slack/classifier-prompt.txt`
- supported accessory types, owner-reviewed interactivity, and allowed override reason codes
- credential injection limited to `python3 ops/slack/post.py`
- audit retention and disable/revoke steps

Rename `ops/slack/post-gate.example.json` to the chosen live config path only
after review. Activation must not place a secret value in the repository.

## Identity

Attribution follows who wrote the words.

| Message | Identity |
| --- | --- |
| Agent-written status, reply, or announcement | bot |
| A person's own words relayed at their request | that person |
| A person's decision written up by an agent | bot, naming the decider in the body |

The hosted human connector and the bot transport are not interchangeable.

## Required sequence

1. Confirm authority to draft and send to the named channel.
2. Compose for the channel contract in the gate config.
3. Run the sanctioned poster. Use `--check-only` until a live send is approved.
4. Block on any content or formatting finding.
   Do not pass a hard-rejected draft to the classifier.
5. Block on classifier execution or output errors. Block on style, genre, or a
   valid classifier fail verdict unless an operator supplies a predefined
   judgment override reason code.
6. Write the pre-send audit event.
7. Send only through the bot credential injected for this command.
8. Record the delivery result without logging message text.

## Guardrails

- Content and formatting findings have no override.
- The classifier fails closed.
- Classifier errors cannot be overridden; only valid fail verdicts can.
- A judgment override must reach the audit log before sending.
- Child processes must not inherit the bot credential.
- Only configured channel IDs may send.
- The bot credential must be absent from ambient shells and general agent tools.
- Client hooks are defense in depth. They do not replace credential isolation.
- Interactive section accessories require an owner-reviewed handler and
  protocol; `interactivityReviewed` remains false in the example config.
- Only implemented accessory types may be enabled in `supportedAccessories`.
  Review agent-supplied outbound text, including nested options and dialogs;
  future provider-generated options are outside this gate's review.
- Do not claim a table, chart, or new block type works until a person inspects
  the rendered post.

## Verification

```bash
python3 ops/slack/test_post_gate.py
python3 ops/slack/test_post_gate.py --falsify
python3 ops/slack/post.py --config ops/slack/post-gate.json \
  --channel CHANNEL_ID --text-file draft.txt --check-only
```

The known-good check must pass every layer. A blocked result caused by an
unreachable classifier does not prove readiness.

Before activation, prove that a raw HTTP client or alternate SDK cannot access
the bot credential while the sanctioned command can.

## Disable and revoke

Set the config status to `inactive`, remove the command-scoped credential grant,
and disable any client hook adapter. Preserve the audit log under its retention
policy. Rotate the bot credential if another process could read it.

## Update rules

Update this protocol, the protocol TOC, the harness checklist, config schema,
and paired tests together. Add every real false positive as a regression test.
