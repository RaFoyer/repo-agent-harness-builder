# Agent-Agnostic Distribution

Use this when publishing, installing, or explaining the harness skill across coding agents.

## Core Principle

The harness belongs to the repository or folder, not to one agent client. Keep the durable contract in portable files:

- `AGENTS.md`
- `AGENTS-TOC.md`
- `ops/protocols/`
- `ops/HARNESS-CHECKLIST.md`
- the project CLI facade
- value-safe setup and connection registries

Treat Codex, Claude Code, Gemini CLI, Kimi, Cursor, and similar tools as adapters that read the same source of truth.

## GitHub Skill Repository Shape

Use the standard skill repository layout:

```text
repo-agent-harness-builder/
  README.md
  LICENSE
  AGENTS.md
  skills/
    repo-agent-harness-builder/
      SKILL.md
      agents/
        openai.yaml
      references/
      scripts/
      assets/
  examples/
  .github/workflows/check.yml
```

The `skills/<skill-name>/SKILL.md` path lets `npx skills add` discover the skill. Agent-specific metadata, such as `agents/openai.yaml`, improves one client without making that client authoritative.

## Install Commands

For nontechnical recipients, prefer a release archive with manifest and checksum
verification. Mutable `OWNER/REPO` installs are maintainer/developer convenience
paths unless the installer supports an immutable reviewed tag or commit ref and
that exact form is tested.

Use a client-neutral mutable-ref smoke command when the human wants the installer
to detect supported agents:

```bash
npx -y skills@1.5.12 add OWNER/REPO --skill repo-agent-harness-builder -g
```

Example commands for known clients:

```bash
npx -y skills@1.5.12 add OWNER/REPO --skill repo-agent-harness-builder --agent codex -g -y
npx -y skills@1.5.12 add OWNER/REPO --skill repo-agent-harness-builder --agent claude-code -g -y
npx -y skills@1.5.12 add OWNER/REPO --skill repo-agent-harness-builder --agent gemini-cli -g -y
```

For all clients supported by the local `skills` installer, use:

```bash
npx -y skills@1.5.12 add OWNER/REPO --skill repo-agent-harness-builder --agent '*' -g -y
```

If a requested client is unsupported by `skills`, keep the repository package useful anyway: the agent can read `SKILL.md`, `AGENT-HANDOFF.md`, and the reference docs directly, then scaffold the harness through scripts.

Treat `--list` as source-discovery evidence. Do not claim a destination adapter
is fully installed until the local installer proves that client's skill location
or the client can read the skill through its documented direct-read path.

## Adapter Rules

- Do not duplicate core instructions into client-specific files.
- Client adapter files may contain display names, invocation hints, and default prompts only.
- Keep install docs in terms of "agent clients" rather than a single vendor.
- Use release archives for recipient trust and `npx skills add` for maintainer/developer install smoke when possible.
- If a client has its own skill format, generate it from the same source or keep it as a small adapter that points back to the canonical `SKILL.md`.

## Verification

Before publishing:

1. Run the deterministic offline package/scaffold checks.
2. Run a local install dry-run from the packaged archive.
3. Confirm `SKILL.md` does not require one client to understand the harness.
4. Confirm all client-specific examples are labeled as examples, not required infrastructure.
