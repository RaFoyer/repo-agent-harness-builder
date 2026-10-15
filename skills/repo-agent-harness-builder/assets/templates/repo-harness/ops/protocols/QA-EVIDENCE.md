---
protocol_id: QA-EVIDENCE
title: QA Evidence Verification
status: inactive
version: 0.1.0
owner: repo-maintainers
last_reviewed: YYYY-MM-DD
summary: Verifies declared QA scope against revision-bound results and unchanged local evidence.
related_protocols:
  - QA-BROWSER
  - CLI-INTERFACE
  - SOURCE-OF-TRUTH
---

# QA evidence verification

## Activation and authority

`ops/qa-evidence.json` declares the owner and required check IDs independently
of run results. It starts inactive. An owner activates it by setting `status`
to `active`, selecting a nonempty unique `checks` list, and testing the
repository's evidence producer. Keep the policy review separate from running
or filtering results. Change scope through a reviewed policy change, not a
command-line subset or hidden exclusion.

`./{{CLI_NAME}} qa evidence status` is credential-free and nonblocking while
inactive. Explicit verification refuses to claim a pass while inactive.
Disable through a reviewed policy change to `inactive`.

This verifier reads local files only. It does not run tests, authenticate their
producer, discover omitted run files, post results, deploy, or grant release
authority. The owning runner must preserve the complete applicable run and
independently establish which revision and target were tested. A digest proves
byte identity, not trustworthy authorship or useful test assertions.

## Manifest contract

Run `./{{CLI_NAME}} qa evidence verify <manifest> --revision <full-sha> --target <id>`.
The caller supplies the expected full Git revision and target. The manifest
must contain exactly these fields:

```json
{
  "schemaVersion": 1,
  "revision": "full-git-revision",
  "target": "staging",
  "runId": "run-1",
  "results": [
    {
      "checkId": "acceptance",
      "outcome": "PASS",
      "revision": "full-git-revision",
      "target": "staging",
      "runId": "run-1",
      "attemptId": "attempt-1",
      "evidence": [
        { "path": "qa-artifacts/acceptance.json", "sha256": "artifact-sha256" }
      ]
    }
  ]
}
```

Replace the schema example's revision and digest labels with actual values.
Every configured check needs a positive PASS observation with nonempty proof.
Every record must match the requested revision, target, and manifest run ID.
Repeated attempts for one check keep all outcomes; their attempt IDs must
differ. Unknown checks, fields, and outcomes are refused. Summary text does
not override records. This schema has no exclusion or waiver field.

## Verdict and evidence rules

FAIL outranks BLOCKED, which outranks PASS. A FAIL for any required check stays
FAIL even when another attempt passes. An explicit BLOCKED observation blocks
the check. NOTE-only and absent observations are BLOCKED. NOTE alongside an
otherwise valid PASS is allowed. An empty result set never proves readiness.

Evidence paths are repository-relative regular single-link files, with no
symlink components or traversal. Actual SHA-256 digests must match the supplied
digests. The manifest and policy cannot serve as their own proof. Missing,
changed, oversize, or unsafe artifacts block a pass. Reads are bounded to one
megabyte for policy/manifest, ten megabytes per proof, and 32 megabytes of
unique proof bytes with at most 256 files. A bounded verification failure
cannot become PASS. Use small result receipts for large videos or traces and
have the owning pipeline verify those underlying artifacts separately.

Exit `0` means the supplied evidence passed this local contract. FAIL and
BLOCKED exit `1`; invalid command arguments exit `2`. Outputs contain check IDs,
verdicts, counts, an input digest, and value-safe error codes, not artifact
contents. Never interpret the exit code as production readiness.

## Verification and maintenance

Test mixed outcomes, empty or narrowed scope, changed revision/target/run,
repeated attempts, missing proof, digest drift, links, unsafe paths, and the
inactive state. Disable a gate in a disposable copy and confirm the negative
test fails. Keep policy, manifest producers, this protocol, CLI help, TOC,
checklist, and tests in sync.
