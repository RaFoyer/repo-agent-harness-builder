# Publishing

Publishing is maintainer-only. Do not ask a recipient or nontechnical user to
run these steps unless they are deliberately maintaining this repository.

## First Publish

1. Confirm `npm run check:offline`, `npm run check:ci`, and `npm run check` pass locally.
2. Create the GitHub repository.
3. Push `main`.
4. Verify GitHub Actions.
5. Confirm the required `check` workflow also ran `npm run check`, including a temporary-project archive install.
6. Create a signed or annotated tag such as `v0.1.0`.
7. Let the release workflow build a deterministic provenance-bearing reference package, publish the zip plus `.sha256` checksum as release assets, then download and verify those published assets.
8. Treat the `.sha256` as a corruption/asset-mismatch check, not a tamper-proof signature. Use signed tags, maintainer-signed checksums, or artifact attestations when stronger provenance is needed.
9. The release workflow runs a post-publish public source discovery smoke. Confirmed source-discovery misses make the workflow red and open or reuse a repo-level follow-up issue. Transient or inconclusive npm/GitHub failures produce a warning only. The workflow does not auto-close smoke issues; close them manually after a passing diagnostic and a maintainer check. Do not re-tag, roll back, or treat the archive as untrusted solely because this diagnostic failed. Use this command while investigating:

```bash
npx -y skills@1.5.12 add RaFoyer/repo-agent-harness-builder --skill repo-agent-harness-builder --agent codex --list
```

This proves source discovery only. It does not replace release archive
provenance and should not be the trust path for nontechnical recipients.

## Release Provenance

Each package manifest should include:

- `skillVersion`
- `sourceRef`
- `sourceCommit`
- `generatedAt`
- file paths, byte counts, and SHA-256 hashes

Recipients or agents should verify the extracted package with:

```bash
python3 scripts/verify-package.py --root .
```

from inside the extracted package root.

Local experiment archives may use `--allow-missing-provenance`; do not send
those to recipients as release artifacts.

Release assets must not be silently replaced for the same tag. The workflow
accepts an existing release asset pair only when the existing checksum validates
the existing zip and the extracted filenames plus file bytes match the
deterministic rebuild. File mode differences are handled by the package verifier
as warnings, not release-overwrite evidence.
If only the zip exists and its extracted contents match the deterministic
rebuild, the workflow uploads a checksum generated from that existing zip. If
only the checksum exists, it must match the rebuild checksum before the workflow
uploads the missing zip. If existing extracted contents or checksum data differ,
stop, inspect the release, and either delete the bad assets after review or
publish a new tag.

## Maintainer Install Commands

The trusted recipient path is the GitHub release archive plus `.sha256` and
manifest verification. Default `OWNER/REPO` installs are convenience or
development installs unless the installer supports an immutable reviewed tag or
commit ref and that exact form is tested.

Agent-detected mutable-ref smoke:

```bash
npx -y skills@1.5.12 add RaFoyer/repo-agent-harness-builder --skill repo-agent-harness-builder -g
```

Known clients:

```bash
npx -y skills@1.5.12 add RaFoyer/repo-agent-harness-builder --skill repo-agent-harness-builder --agent codex -g -y
npx -y skills@1.5.12 add RaFoyer/repo-agent-harness-builder --skill repo-agent-harness-builder --agent claude-code -g -y
npx -y skills@1.5.12 add RaFoyer/repo-agent-harness-builder --skill repo-agent-harness-builder --agent gemini-cli -g -y
```

The Claude Code and Gemini CLI commands are adapter examples until a release
check verifies a real destination install for those clients. `--list` proves
source discovery, not that every destination adapter is installed.

All locally supported clients:

```bash
npx -y skills@1.5.12 add RaFoyer/repo-agent-harness-builder --skill repo-agent-harness-builder --agent '*' -g -y
```

## Release Checklist

- `npm run check:offline`
- `npm run check:ci`
- `npm run check` locally, in required CI, and in the release workflow
- GitHub Actions green on `main`
- release workflow verifies published release assets by downloading the zip and `.sha256`, checking the checksum, and running `verify-package.py`
- release workflow refuses to overwrite existing release assets unless they are byte-identical to the deterministic rebuild
- release workflow green for the tag, except transient public-source diagnostics may warn without invalidating the release assets
- confirmed public source discovery misses have a follow-up issue; this smoke is a mutable-ref diagnostic, not the recipient trust path
- review loop terminal state is `ready` or only human-accepted P2/P3 risks remain
- generated package checksum is attached to the release
- README support matrix still matches tested reality
