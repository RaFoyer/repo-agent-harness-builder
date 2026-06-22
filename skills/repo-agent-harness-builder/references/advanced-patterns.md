# Advanced Patterns

## Hooks

Use hooks only when the base harness is already stable. The reusable pattern is a thin hook manifest that calls repo-local scripts:

- `SessionStart`: light context, no heavy doc dump
- `UserPromptSubmit`: route prompt to the right protocol or authority pack
- `Stop`: summarize changed files, evidence, drift, and next checks

Do not copy account profiles, local machine paths, model choices, or vendor-specific runtime assumptions into a generic harness.

Hook adapters must be documented before activation:

| Field | Required meaning |
| --- | --- |
| Neutral phase | Harness lifecycle phase such as session-start, prompt-submit, pre-commit, or stop |
| Client event | Exact client-specific event name, such as Codex or Claude hook name |
| Config location | Repo-local adapter file or documented client config path |
| Script boundary | Repo-local script or CLI command called by the hook |
| Input/output schema | Data received, data emitted, and redaction expectations |
| Blocking semantics | Whether the hook can block, warn, or only observe |
| Timeout/failure mode | Maximum runtime and whether failure blocks work |
| Trust/review flow | Human-visible review or approval needed before enabling |
| Disable/uninstall | Exact command or file change to turn the hook off |

Unsupported clients fall back to the repo CLI command for the same neutral
phase. Do not claim hook support for Gemini, Kimi, Cursor, or another client
until its documented event surface is confirmed.

## Intent Authority

An intent registry maps user/task intent to authoritative docs, commands, evidence, and policy. Keep the distinction clear:

- Authoritative: root instructions, protocols, schemas, source registries
- Useful: search indexes, generated summaries, latest pointers, local heuristics

Useful artifacts can route work; they do not decide truth.

## Artifact And Latest Pointer Convention

Generated artifacts should include:

- `artifactType`
- `schemaVersion`
- `generatedAt`
- `sourcePaths`
- stable fingerprint or checksum
- canonical per-run path
- optional `latest` pointer

Latest pointers are convenience links. Keep source registries and generators authoritative.

## Evidence Maps

Use evidence maps when a repo has claims, capabilities, compliance requirements, or readiness items that need proof.

Suggested fields:

```json
{
  "id": "capability.example",
  "area": "example",
  "capability": "What must be true",
  "implementationStatus": "planned",
  "targetStatus": "local-runtime",
  "statusRationale": "Why the current status is accurate",
  "dependencies": [],
  "upgradeTasks": [],
  "acceptanceEvidence": [],
  "evidenceArtifacts": [],
  "sourceDocuments": [],
  "tests": [],
  "surface": "cli",
  "riskLevel": "medium",
  "nextBuildStep": "Concrete next proof step",
  "claimGuardrail": "Do not imply this is production-live yet"
}
```

Suggested maturity ladder:

```text
deferred -> planned -> recorded -> deterministic-sim -> local-runtime -> integration-live -> user-live -> external-live
```

Start with one map, one schema, one validator, and one example. Do not import a large Flow-style artifact hub until the repo earns it.
