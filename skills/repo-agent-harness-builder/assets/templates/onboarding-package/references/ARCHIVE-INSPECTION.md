# Archive Inspection

For a nontechnical human: give the zip to an agent and ask it to inspect the
archive before extracting or installing anything. You do not need to run these
commands yourself.

Use the path that matches the assistant:

- Zip-capable local agent: attach the `.zip` and `.sha256` files and ask it to verify before extraction.
- Text-only chat: do not treat a pasted hash as verification. Ask for manual unzip/local terminal guidance or use reference-only mode.
- Local terminal fallback: unzip into a temporary folder, then run the verification commands below.

Before extracting:

If a `.sha256` checksum file was provided next to the zip, verify it before
opening the archive. This checks for download corruption or asset mismatch; it
is not a signature and does not prove the GitHub release itself could not have
been replaced.

```bash
shasum -a 256 -c repo-agent-harness-reference.zip.sha256
```

If checksum verification fails, redownload or re-copy the zip and checksum once
as a clean pair. If it still fails, stop and ask the sender or maintainer for a
fresh package.

If the command is unavailable, ask the agent to compute the zip's SHA-256 and
compare it to the checksum file. For stronger tamper resistance, use a signed
release or GitHub artifact attestation when available.

```bash
unzip -l package.zip
```

or:

```bash
bsdtar -tf package.zip
```

Reject entries that:

- start with `/`
- contain `..`
- point into credential directories
- overwrite shell startup files
- include `.env`, token stores, private keys, or OAuth client secrets

Extract into a temporary directory first. Read scripts before running them.

After extraction, verify the manifest from the extracted package root when
Python is available:

```bash
python3 scripts/verify-package.py --root .
```

The verification checks that every listed file exists, byte counts and SHA-256
hashes match, no unlisted files are present, no symlinks are present, provenance
exists by default, and extracted text files do not contain obvious secret
patterns or local machine-specific paths.

If Python 3 is unavailable, do not describe the package as verified. Report
`manifest unverified`, compare the zip-level SHA-256 against the `.sha256` file
if possible, list archive entries, inspect `MANIFEST.json` manually, and use
reference-only mode unless the human explicitly accepts the risk of installing
or scaffolding from an unverified archive.

If the manifest is missing, checks fail, or paths look surprising, stop and ask
the human before continuing.
