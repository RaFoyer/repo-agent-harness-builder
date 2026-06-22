# 2026-06-21 Review Loop

## Change Summary

Created the public `repo-agent-harness-builder` skill repository from the local
global skill, then repaired first- and second-round adversarial findings across
distribution docs, package safety, generated CLI behavior, personal-folder
privacy, loop/automation docs, and release provenance.

## Reviewers

- Product owner
- CTO/release architecture
- Security/privacy
- Nontechnical beginner
- User journey QA
- Loops/automation and agent-adapter review
- Claude adversarial review, pending final result for this repair pass

## Commands Run

```bash
npm run check
npm run check:offline
```

## Evidence

- Local skill discovery through `npx -y skills@1.5.12 add <local repo> --list` passed.
- Package build produced `repo-agent-harness-reference.zip` and `.sha256`.
- Extracted package passed `scripts/verify-package.py`.
- Unsafe `--zip-name ../bad.zip` was rejected.
- Generated repository harness passed `verify_harness.py --run-tests`.
- Generated CLI tests passed 11/11, including credential-value detection,
  unsafe `credentialRefs`, core command smoke paths, active checklist evidence,
  and `precommit --all` coverage for untracked files.
- Generated repo scaffolding with quotes, backticks, and `${...}` in
  `--project-name` ran successfully.
- Generated harnesses contain no `YYYY-MM-DD` review-date placeholders.
- Protected repo and personal scaffold targets under `~/.ssh` were rejected.
- Personal harness scope guard rejected protected managed folders.
- Custom personal CLI names no longer print `./homeh` in inventory hints.

## Findings Repaired

- Public docs now distinguish tested Codex install discovery from example
  Claude/Gemini adapter commands and direct-read fallbacks.
- README now includes a plain agent definition, first-success criteria,
  prerequisites, and beginner release-asset path.
- Package builder rejects unsafe zip names, non-UTF-8 files, oversized files,
  symlinks, local paths, common token shapes, unsafe `credentialRefs`, and
  secret-looking manifest metadata.
- Package manifest now records `skillVersion`, `sourceRef`, `sourceCommit`,
  file hashes, byte counts, and file modes.
- Release workflow builds with required provenance and verifies extracted
  package with provenance required.
- Archive docs now include checksum-first verification and manifest
  verification.
- Generated repo CLI uses JSON-safe config substitutions for user-provided
  values.
- Generated connection registry validates safe credential references, owner,
  scopes, revocation, and write-approval metadata.
- Generated personal inventories use home-relative or redacted display paths
  and warn that filenames are private metadata.
- Automation, loop, and run-log templates now share one minimum schema and
  allow either a user-supplied cap or deterministic stagnation/no-progress stop.
- Review loop now has severity levels, artifact paths, iteration caps, and an
  `exhausted-review-rounds` terminal state.
- Claude repair pass found package-verification mode checks could false-fail
  after normal extraction; verifier now treats mode differences as warnings and
  ignores common incidental extraction files.
- Claude repair pass found `npx -y skills` was unpinned; check scripts, archive
  installer, and public docs now use `skills@1.5.12` with an override variable
  for deliberate upgrades.
- Claude repair pass found generated precommit scanning was extension-limited;
  it now scans likely text files by binary sniffing and has `.cfg` regression
  coverage.
- Claude repair pass found checksum language overstated tamper protection; docs
  now describe `.sha256` as corruption/asset-mismatch checking and point to
  signatures/attestations for stronger provenance.
- Claude repair pass found `test`/`example` substring placeholder heuristics
  could hide real secrets; placeholder detection is now exact-token only in both
  JS and Python scanners, with regression coverage.
- Claude repair pass found staged precommit scans read worktree content; default
  precommit now scans staged blobs and has a stage-secret-then-clean-worktree
  regression test.
- Claude repair pass found nested macOS `.DS_Store` files could false-fail
  extracted package verification; verifier now ignores `.DS_Store` by basename
  anywhere in the tree.
- Claude repair pass found generated precommit was inert in non-git project
  folders; precommit now falls back to a filesystem walk when Git metadata is
  unavailable and has regression coverage.
- Claude repair pass found Git path quoting/redaction could skip unusual file
  names; precommit now uses raw NUL-delimited Git path enumeration and has
  token-looking filename regression coverage.
- Claude repair pass found malformed manifests produced tracebacks; package
  verifier now emits clear verification-failed messages for malformed manifest
  JSON or malformed file entries.
- Claude repair pass found large text files could crash generated precommit;
  precommit now caps content scans at 1 MB and warns when skipping large files.
- Claude repair pass found common binary credential containers were not
  filename-blocked; generated precommit now blocks `.p12`, `.pfx`, `.jks`,
  `.keystore`, `.key`, and `.ppk` names.
- Claude repair pass found the archive installer was not exercised by checks;
  `npm run check` now runs the archive installer dry-run and a temp
  project-scope install, while `check:offline` keeps the install dry-run only.
- Claude repair pass found Loop Library guidance still read as a global live
  install; docs now make it an inspect-first optional reference and recommend
  human approval plus pinned source refs for install.
- Claude repair pass found large files only warned while skipping content
  scans; generated precommit now fails closed for files over the scan cap.
- Claude repair pass found binary credential container coverage incomplete;
  generated precommit now also blocks `.kdbx`, `.gpg`, `.pgp`, `.asc`,
  `.pkcs12`, `.der`, `.crt`, and `.cer`.
- Claude repair pass found review-date substitution could alter examples and
  pointer templates; scaffolders now render only front-matter `last_reviewed`
  fields and the verifier ignores fenced examples.
- Claude repair pass found additional plaintext and binary credential filename
  gaps; generated precommit now blocks `.netrc`, `_netrc`, `.npmrc`, `.pypirc`,
  `.pgpass`, `.htpasswd`, `credentials`, `.jceks`, `.bcfks`, and `.p8`, and
  scanner coverage now includes underscore-prefixed auth tokens and netrc
  password entries.
- Claude repair pass found Git enumeration errors could fail open; generated
  precommit now distinguishes non-git folders from broken Git state and blocks
  when it cannot safely inspect an index inside a Git worktree.

## Remaining External Smoke

- Optional `npm run check:public-install` cannot run until the GitHub repository
  exists at `RaFoyer/repo-agent-harness-builder` and the first commit is pushed.
  This proves mutable public source discovery only; recipient trust comes from
  the release archive manifest, provenance, and checksum flow.

## Accepted Risks

- None yet. Public release remains `repair-needed` until GitHub publish, release
  archive verification, and final review pass complete.
