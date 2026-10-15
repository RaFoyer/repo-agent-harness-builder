# Slack post gate design

## What the gate decides

The gate checks usability before delivery. Keep authorization separate. A draft
that passes every check still needs whatever approval the repository requires
for external communication.

Use one outbound bot command and keep its checks ordered by authority.

| Layer | Decides | Failure behavior | Override |
| --- | --- | --- | --- |
| Content policy | Whether the room may receive the data | Block | Never |
| Transport formatting | Whether Slack can render and operate the payload as intended | Block | Never |
| Style and audience | Whether the message reads well and belongs in the room | Block by default | Logged reason |

The classifier must fail closed. Execution, timeout, unavailable-command,
invalid-output, and schema errors always block. A valid classifier fail verdict
can be overridden with a logged reason. The override never applies to content
or formatting findings.

## Identity and transport

Slack transports do not share an author or markup contract.

| Source text | Sender | Markup |
| --- | --- | --- |
| Agent-written message | Bot or app | Slack mrkdwn |
| A person's own words relayed at their request | That person's authenticated connector | The connector's documented markdown contract |
| A person's decision written up by an agent | Bot or app, with the decider named in the body | Slack mrkdwn |

Editing cannot change a message's sender after delivery. Choose the identity
before composing.

## Content policy

Scan the raw payload, including decoded Unicode and code. A credential pasted
inside a code fence is still a credential. Start with specific patterns for known
credential forms, then add rules for the target channel:

- internal run or job identifiers
- commit identifiers if the audience should not receive them
- cloud account identifiers and resource paths
- embargoed figures
- personal or customer data

Avoid a generic high-entropy detector unless the repository has measured its
false-positive rate against real messages. Content rules have no override, so a
noisy rule can make the gate unusable.

## Formatting

Bot API text uses mrkdwn. Common markdown constructs render literally or behave
differently:

- `**bold**`, `__italic__`, and `~~strike~~`
- `[label](url)` links
- dash bullets and markdown headings
- pipe tables
- language tags on fenced code
- plaintext `@name` mentions
- bare `&` and `<` outside Slack tokens

Strip fenced and inline code before prose and markup heuristics. Engineering
messages contain SQL, shell comments, dunder paths, globs, comparison operators,
package names, URLs, and email addresses. Preserve regression tests for each
false positive found in real use.

Review visible text in supported sections, fields, headers, context, rich text,
tables, charts, and images. Respect each text type: plain text does not need
mrkdwn entity escaping, and code is exempt from prose formatting checks.
Refuse unsupported blocks. Refuse Block Kit buttons unless the repository proves
a live interactivity endpoint and adds a separate interaction protocol. A button that looks active
but does nothing is worse than plain instructions. Validate block counts,
section lengths, table dimensions, and any fields used by a new block type.

## Style and audience judgment

Mechanical checks can catch curly quotes, disallowed dash positions, known
filler phrases, and house-style vocabulary. Keep channel-specific exceptions in
configuration. For example, if a room uses an em dash in a title line, allow a
full-line pattern rather than disabling the rule everywhere.

The classifier input must include:

- the least technical expected reader
- accepted message genres
- subjects that belong elsewhere
- the draft

Ask whether the least technical reader would understand and care, and whether
the post changes what somebody does. A message that only changes one person's
action may belong in a direct message. A message that changes no action and
contains no decision or news should not post.

Tell the classifier not to reject short, blunt, technical, or bad-news messages.
Otherwise it will reward padding.

The reference command contract is:

- stdin: one JSON object with `audience`, `allowedGenres`, `excludedSubjects`,
  and `draft`
- stdout: `{"verdict":"pass"|"fail","reasons":["short reason"]}`
- nonzero exit, timeout, invalid JSON, or another verdict: classifier error and
  a blocked decision

Invoke the command as an argv array without a shell. Remove the bot credential
from the classifier and git audit subprocess environments.

## Capability boundary

The bot credential must not exist in an ambient shell, global connector profile,
or general agent environment. Bind secret injection to the exact gated poster
command. A raw HTTP client or alternate SDK then lacks the capability to send.

A command-text hook can still help an agent recover from an obvious mistake,
but it is not the security boundary. String checks can be bypassed by aliases,
encoding, variables, alternate SDKs, or comments. Document client hooks as
adapters and provide a CLI-only fallback for unsupported clients.

## Audit behavior

Write the decision before sending. Store metadata, not the message body:

- timestamp and channel
- decision and finding identifiers
- draft byte count and digest
- a predefined override reason code, if used; never free-form reason text

Use append mode. Do not read a log and rewrite it in place. If the pre-send
audit write fails, block. If the delivery succeeds but the follow-up audit write
fails, report that the send occurred and warn against retrying.

## Test proof

Test every deterministic rule in both directions. Add realistic messages, not
only minimal strings. Include known-good checks for the classifier path so a
broken invocation cannot masquerade as safe failure.

Run a falsification mode that disables one rule and verifies the ordinary suite
detects the change. A suite that has only ever passed has not demonstrated that
its assertions can catch a broken gate.

Before activation, verify:

1. content and formatting findings ignore the judgment override
2. classifier failures block without an override
3. judgment overrides require and record a reason
4. only allowlisted channels can send
5. the bot credential is absent outside the sanctioned invocation
6. a person inspects every structurally new Block Kit format
