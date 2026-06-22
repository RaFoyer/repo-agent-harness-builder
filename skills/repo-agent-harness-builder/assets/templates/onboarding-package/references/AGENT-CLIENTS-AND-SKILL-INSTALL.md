# Agent Clients And Skill Install

Use this before installing the included skill or publishing the harness as a GitHub skill repository.

## Principle

The harness is agent-agnostic. `AGENTS.md`, `AGENTS-TOC.md`, protocol docs, checklists, and the CLI are the shared source of truth. Codex, Claude Code, Gemini CLI, Cursor, Kimi-style clients, and future coding agents are adapters around that shared contract.

## Local Archive Install

The archive includes `scripts/install-skill.sh`. It defaults to dry-run and uses pinned `npx -y skills@1.5.12 add` when installation is approved.

Dry run:

```bash
bash scripts/install-skill.sh
```

Install for installer-detected agent clients:

```bash
bash scripts/install-skill.sh --yes --global
```

Install for a named client:

```bash
bash scripts/install-skill.sh --yes --global --agent codex
bash scripts/install-skill.sh --yes --global --agent claude-code
bash scripts/install-skill.sh --yes --global --agent gemini-cli
```

Install for every client supported by the local `skills` installer:

```bash
bash scripts/install-skill.sh --yes --global --all-agents
```

Using `bash scripts/install-skill.sh` works even when the unzip tool does not
preserve executable file permissions.
Use `--project` instead of `--global` when the human wants a project-local
install.

For project-local installs, make the destination explicit:

```bash
bash scripts/install-skill.sh --yes --project --project-dir /path/to/target --agent codex
```

Equivalent form:

```bash
cd /path/to/target
bash /path/to/extracted-package/scripts/install-skill.sh --yes --project --agent codex
```

The extracted package root itself is refused as a project install target.
After a project-local install, the script checks common client-local skill
locations under the target folder, including `.agents`, `.codex`, `.claude`,
`.gemini`, and `.cursor`. If a client uses a different location, verify that
client's documented skill directory before reporting the adapter as installed.

If the local installer does not support a desired client, do not pretend it is installed. Keep the extracted package available and have the agent read `SKILL.md`, `AGENT-HANDOFF.md`, and the references directly.

Direct-read fallback:

```text
Read skill/repo-agent-harness-builder/SKILL.md, then read only the references it routes you to for my setup mode. Use AGENT-HANDOFF.md as the package-level bootstrap.
```

This is the expected fallback for clients whose skill format is unknown or not
supported by `npx skills`.

## GitHub Skill Install Smoke

For nontechnical recipients, prefer the release archive, checksum, and manifest
verification. When this package lives in a GitHub repository, maintainers can
smoke-test mutable public source discovery with:

```bash
npx -y skills@1.5.12 add OWNER/REPO --skill repo-agent-harness-builder -g
```

Known-client examples:

```bash
npx -y skills@1.5.12 add OWNER/REPO --skill repo-agent-harness-builder --agent codex -g -y
npx -y skills@1.5.12 add OWNER/REPO --skill repo-agent-harness-builder --agent claude-code -g -y
npx -y skills@1.5.12 add OWNER/REPO --skill repo-agent-harness-builder --agent gemini-cli -g -y
```

For all locally supported agents:

```bash
npx -y skills@1.5.12 add OWNER/REPO --skill repo-agent-harness-builder --agent '*' -g -y
```

Replace `OWNER/REPO` with the real published repository. Do not copy the
placeholder literally.

`--list` proves the skill source can be discovered. It does not, by itself,
prove that a named destination adapter such as Claude Code or Gemini CLI was
installed. Report adapter installs as tested only after checking that client's
documented skill location or direct-read path.

Treat `OWNER/REPO` installs as development/convenience installs unless the
installer supports an immutable reviewed tag or commit ref and that exact form
has been tested.

## Repository Layout

Use this installable shape:

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
```

Client adapter files may improve display names or invocation prompts. They must not fork the core instructions.

## Safety

- Read install scripts before running them.
- Keep install commands dry-run first.
- Do not ask the human for secret values.
- Do not make any one client the owner of repository truth.
- Report exactly which client adapters were installed or skipped.
