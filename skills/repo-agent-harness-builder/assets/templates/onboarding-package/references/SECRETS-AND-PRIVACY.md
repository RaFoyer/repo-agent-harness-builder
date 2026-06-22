# Secrets And Privacy

Use this before scanning, packaging, sharing, committing, or installing anything that may touch credentials or private files.

## Never Include

- `.env` files
- private keys
- OAuth client secrets
- token stores
- browser profiles
- password manager exports
- credential folders such as `~/.ssh` and `~/.gnupg`
- mail stores
- private cloud-drive internals
- local absolute paths in shareable docs

## Value-Safe Reporting

Safe:

- secret name
- whether it is configured
- source type, such as environment variable or keychain
- missing/valid/invalid status
- count of records

Unsafe:

- raw value
- token prefix beyond a documented safe mask
- full private URL
- screenshot of a credential screen
- copied terminal output containing secrets

## Personal Folder Privacy

Start metadata-only. Ask before reading document text. Treat the following as explicit opt-in:

- medical, legal, financial, tax, identity, immigration, or employment records
- photos libraries
- backups
- external drives
- chat exports
- email archives

## Package Safety

Before creating a zip:

1. List files to be included.
2. Reject traversal paths, absolute paths, and generated archives.
3. Scan text files for obvious secret patterns.
4. Confirm the manifest does not include local paths.
5. Write a checksum next to the archive.
