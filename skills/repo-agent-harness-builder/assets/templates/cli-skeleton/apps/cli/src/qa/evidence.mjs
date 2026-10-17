import { createHash } from "node:crypto";
import { CONFIG } from "../config.mjs";
import { parseCliArgs } from "../util/strict-args.mjs";
import { decodeRepositoryText, readRepositoryFile, repositoryPath } from "../util/repo-files.mjs";
import { renderUsageError, toonString } from "../util/agent-output.mjs";

const POLICY = "ops/qa-evidence.json";
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const REVISION = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const TARGET = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const shape = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));

export function validateEvidencePolicy(policy) {
  if (!shape(policy, ["schemaVersion", "status", "owner", "checks"]) || policy.schemaVersion !== 1
    || !["active", "inactive"].includes(policy.status) || typeof policy.owner !== "string" || !policy.owner.trim()
    || !Array.isArray(policy.checks) || policy.checks.length > 256 || policy.checks.some((id) => typeof id !== "string" || !ID.test(id))
    || new Set(policy.checks).size !== policy.checks.length || (policy.status === "active" && !policy.checks.length)) {
    throw new Error("invalid-qa-evidence-policy");
  }
  return policy;
}

// No I/O here. Required scope comes from policy, never from a result filter.
export function evaluateQaEvidence(manifest, policy, { revision, target }) {
  const errors = [];
  const proofs = [];
  const records = [];
  if (!shape(manifest, ["schemaVersion", "revision", "target", "runId", "results"]) || manifest?.schemaVersion !== 1) errors.push("invalid-manifest-shape");
  if (typeof revision !== "string" || !REVISION.test(revision) || typeof target !== "string" || !TARGET.test(target)
    || manifest?.revision !== revision || manifest?.target !== target || typeof manifest?.runId !== "string" || !ID.test(manifest.runId)) errors.push("manifest-identity-mismatch");
  const results = manifest?.results;
  const attempts = new Set();
  if (!Array.isArray(results) || results.length > 1000) errors.push("invalid-results");
  else for (const record of results) {
    if (!shape(record, ["checkId", "outcome", "revision", "target", "runId", "attemptId", "evidence"])
      || !policy.checks.includes(record.checkId) || !["PASS", "FAIL", "BLOCKED", "NOTE"].includes(record.outcome)
      || record.revision !== revision || record.target !== target || record.runId !== manifest.runId || typeof record.attemptId !== "string" || !ID.test(record.attemptId)
      || !Array.isArray(record.evidence) || record.evidence.length > 32) {
      errors.push("invalid-result-record");
      continue;
    }
    const attempt = `${record.checkId}/${record.attemptId}`;
    if (attempts.has(attempt)) errors.push("duplicate-check-attempt");
    attempts.add(attempt);
    if (record.outcome === "PASS" && !record.evidence.length) errors.push("pass-without-evidence");
    for (const proof of record.evidence) {
      if (!shape(proof, ["path", "sha256"]) || typeof proof.path !== "string" || !DIGEST.test(proof.sha256)) errors.push("invalid-evidence-reference");
      else proofs.push(proof);
    }
    records.push(record);
  }
  const checks = policy.checks.map((id) => {
    const observations = records.filter((record) => record.checkId === id);
    const outcomes = new Set(observations.map((record) => record.outcome));
    const outcome = outcomes.has("FAIL") ? "FAIL" : outcomes.has("BLOCKED") ? "BLOCKED" : outcomes.has("PASS") ? "PASS" : "BLOCKED";
    return { id, outcome, observations: observations.length };
  });
  const verdict = checks.some((check) => check.outcome === "FAIL") ? "FAIL"
    : errors.length || !checks.length || checks.some((check) => check.outcome !== "PASS") ? "BLOCKED" : "PASS";
  return { verdict, checks, errors: [...new Set(errors)], proofs };
}

export function verifyQaEvidence(manifestPath, { revision, target, repoRoot = CONFIG.repoRoot } = {}) {
  try {
    const policyFile = readRepositoryFile(repoRoot, POLICY);
    const policy = validateEvidencePolicy(JSON.parse(decodeRepositoryText(policyFile.bytes)));
    if (policy.status !== "active") return { verdict: "BLOCKED", checks: [], errors: ["qa-evidence-inactive"] };
    const manifestFile = readRepositoryFile(repoRoot, manifestPath);
    const { bytes } = manifestFile;
    const result = evaluateQaEvidence(JSON.parse(decodeRepositoryText(bytes)), policy, { revision, target });
    const cache = new Map();
    let totalBytes = 0;
    for (const proof of result.proofs) {
      try {
        repositoryPath(repoRoot, proof.path);
        if (proof.path === manifestPath || proof.path === POLICY) throw new Error("self-evidence");
        if (!cache.has(proof.path)) {
          if (cache.size >= 256) throw new Error("evidence-budget");
          const artifact = readRepositoryFile(repoRoot, proof.path, Math.min(10_000_000, 32_000_000 - totalBytes));
          if ([policyFile, manifestFile].some((input) => input.stat.dev === artifact.stat.dev && input.stat.ino === artifact.stat.ino)) throw new Error("self-evidence");
          totalBytes += artifact.bytes.length;
          cache.set(proof.path, sha256(artifact.bytes));
        }
        if (cache.get(proof.path) !== proof.sha256) throw new Error("evidence-digest-mismatch");
      } catch {
        result.errors.push("evidence-unavailable-or-changed");
      }
    }
    if (result.errors.length && result.verdict !== "FAIL") result.verdict = "BLOCKED";
    return { ...result, proofs: undefined, errors: [...new Set(result.errors)], manifestSha256: sha256(bytes) };
  } catch {
    return { verdict: "BLOCKED", checks: [], errors: ["qa-evidence-input-invalid"] };
  }
}

export async function runQaEvidence(argv, io) {
  const [command = "help", ...rest] = argv;
  const parsed = parseCliArgs(rest, command === "verify"
    ? { flags: { "--revision": "value", "--target": "value" }, minPositionals: 1, maxPositionals: 1 }
    : {});
  if (!parsed.ok) {
    renderUsageError(io, { ...parsed, command: "qa evidence", hints: [`Run ./${CONFIG.cliName} qa evidence help`] });
    return 2;
  }
  if (command === "help") {
    io.stdout("Usage: ./{{CLI_NAME}} qa evidence status");
    io.stdout("Usage: ./{{CLI_NAME}} qa evidence verify <manifest> --revision <full-sha> --target <id>");
    io.stdout("Read-only; policy fixes required scope. Local verification grants no release or posting authority.");
    return 0;
  }
  if (command === "status") {
    try {
      const policy = validateEvidencePolicy(JSON.parse(decodeRepositoryText(readRepositoryFile(CONFIG.repoRoot, POLICY).bytes)));
      io.stdout(`qa_evidence: ${policy.status}`);
      io.stdout(`required_checks: ${policy.checks.length}`);
      return 0;
    } catch (error) {
      if (error.code === "ENOENT") { io.stdout("qa_evidence: not-configured"); return 0; }
      io.stdout("qa_evidence: invalid-policy");
      return 1;
    }
  }
  if (command !== "verify" || !REVISION.test(parsed.values["--revision"] || "") || !TARGET.test(parsed.values["--target"] || "")) {
    renderUsageError(io, { code: "invalid-evidence-command", command: "qa evidence", message: "Use verify with a full revision and target, or status", hints: [`Run ./${CONFIG.cliName} qa evidence help`] });
    return 2;
  }
  const result = verifyQaEvidence(parsed.positionals[0], { revision: parsed.values["--revision"], target: parsed.values["--target"] });
  io.stdout(`verdict: ${result.verdict}`);
  io.stdout(`manifest_sha256: ${toonString(result.manifestSha256 || "unavailable")}`);
  io.stdout(`checks[${result.checks.length}]{id,outcome,observations}:`);
  for (const check of result.checks) io.stdout(`  ${toonString(check.id)},${check.outcome},${check.observations}`);
  io.stdout(`errors[${result.errors.length}]:`);
  for (const error of result.errors) io.stdout(`  ${toonString(error)}`);
  return result.verdict === "PASS" ? 0 : 1;
}
