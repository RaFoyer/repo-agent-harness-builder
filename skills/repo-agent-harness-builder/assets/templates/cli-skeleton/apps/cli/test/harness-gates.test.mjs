import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { CONFIG, setRepoRootForTests } from "../src/config.mjs";
import { main } from "../src/main.mjs";
import { parseCliArgs } from "../src/util/strict-args.mjs";
import { repositoryPath } from "../src/util/repo-files.mjs";
import { checkEntrySync, ENTRY_START, ENTRY_END } from "../src/docs/entry-sync.mjs";
import { evaluateQaEvidence, validateEvidencePolicy, verifyQaEvidence } from "../src/qa/evidence.mjs";
import { findProtocols } from "../src/commands/protocols.mjs";

const revision = "a".repeat(40);
const identity = { revision, target: "staging" };
const policy = { schemaVersion: 1, status: "active", owner: "maintainers", checks: ["acceptance", "regression"] };
const digest = (text) => createHash("sha256").update(text).digest("hex");
const operator = (text) => `${ENTRY_START}\n${text}\n${ENTRY_END}`;
const capture = () => { const out = []; const err = []; return { out, err, io: { stdout: (line) => out.push(line), stderr: (line) => err.push(line) } }; };

function fixture(name, fn) {
  test(name, async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "harness-gates-"));
    const previousRoot = CONFIG.repoRoot;
    const previousEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "test";
    setRepoRootForTests(root);
    const write = (relative, value) => {
      const target = path.join(root, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, typeof value === "string" ? value : `${JSON.stringify(value)}\n`);
    };
    const git = (...args) => {
      const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr);
    };
    try { await fn({ root, write, git }); }
    finally {
      setRepoRootForTests(previousRoot);
      if (previousEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousEnv;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function record(checkId, outcome = "PASS", extra = {}) {
  return { checkId, outcome, ...identity, runId: "run-1", attemptId: "attempt-1", evidence: [{ path: "proof.txt", sha256: digest("verified\n") }], ...extra };
}
function manifest(results = policy.checks.map((id) => record(id))) {
  return { schemaVersion: 1, ...identity, runId: "run-1", results };
}

test("guards: strict duplicates are refused rather than choosing a value", () => {
  const result = parseCliArgs(["--profile", "first", "--profile=second"], { flags: { "--profile": "value" } });
  assert.equal(result.ok, false);
  assert.equal(result.code, "duplicate-flag");
});

test("strict arguments support typed values and explicit passthrough", () => {
  const result = parseCliArgs(["--item=a", "--item", "b", "--check", "--", "--profile", "inner"], {
    flags: { "--item": "repeatable", "--check": "boolean" }, allowPassthrough: true
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.values["--item"], ["a", "b"]);
  assert.deepEqual(result.passthrough, ["--profile", "inner"]);
  for (const args of [["--check=false"], ["--item="], ["--item", "--check"], ["--unknown"], ["--constructor=x"], ["--item", " "]]) {
    assert.equal(parseCliArgs(args, { flags: { "--item": "value", "--check": "boolean" } }).ok, false, args.join(" "));
  }
  assert.equal(parseCliArgs(["--item=-value"], { flags: { "--item": "value" } }).ok, true);
  assert.deepEqual(parseCliArgs(["--", "-file"], { maxPositionals: 1 }).positionals, ["-file"]);
});

fixture("usage errors stop before reading configuration or tools", async () => {
  for (const args of [
    ["help", "extra"], ["docs", "entry-sync", "--write=false"], ["precommit", "--all", "--all"],
    ["github", "run", "--profile", "first", "--profile", "second", "--", "pr", "list"],
    ["github", "run", "--dry-run", "--", "pr", "list", "--profile", "inner"],
    ["qa", "evidence", "verify", "absent.json", "--revision", revision, "--target", "staging", "--target", "production"],
    ["qa", "evidence", "verify", "absent.json", "--revision", revision, "--target", "staging", "--check", "acceptance"]
  ]) {
    const result = capture();
    assert.equal(await main(args, result.io), 2, args.join(" "));
    assert.equal(result.err.length, 0);
    assert.match(result.out.join("\n"), /error:/);
  }
});

fixture("entry sync preserves client-specific content and is check-only by default", async ({ root, write }) => {
  write("ops/entry-points.json", { schemaVersion: 1, targets: ["CLAUDE.md", "GEMINI.md"] });
  write("AGENTS.md", `# Source\n${operator("Canonical operator instructions")}\n`);
  const before = `# Client\n${operator("Old instructions")}\nClient-specific hints\n`;
  write("CLAUDE.md", before);
  write("GEMINI.md", before);
  assert.equal(checkEntrySync().ok, false);
  assert.equal(fs.readFileSync(path.join(root, "CLAUDE.md"), "utf8"), before);
  assert.equal(checkEntrySync({ write: true }).ok, true);
  assert.equal(checkEntrySync().changed, 0);
  assert.match(fs.readFileSync(path.join(root, "CLAUDE.md"), "utf8"), /Canonical operator instructions[\s\S]*Client-specific hints/);
});

fixture("entry sync validates all destinations before its first write", ({ root, write }) => {
  write("ops/entry-points.json", { schemaVersion: 1, targets: ["CLAUDE.md", "GEMINI.md"] });
  write("AGENTS.md", operator("Canonical"));
  const before = operator("Old");
  write("CLAUDE.md", before);
  write("GEMINI.md", `${operator("First")}\n${operator("Duplicate")}`);
  assert.equal(checkEntrySync({ write: true }).ok, false);
  assert.equal(fs.readFileSync(path.join(root, "CLAUDE.md"), "utf8"), before);
});

fixture("guards: staged entry drift cannot be hidden by worktree repairs or config changes", async ({ write, git }) => {
  git("init", "-q");
  write("ops/entry-points.json", { schemaVersion: 1, targets: ["CLAUDE.md"] });
  write("AGENTS.md", operator("Canonical"));
  write("CLAUDE.md", operator("Stale"));
  git("add", ".");
  write("CLAUDE.md", operator("Canonical"));
  write("ops/entry-points.json", { schemaVersion: 1, targets: [] });
  assert.equal(checkEntrySync().ok, true);
  assert.equal(checkEntrySync({ source: "staged" }).ok, false);
  const result = capture();
  assert.equal(await main(["precommit"], result.io), 1);
  assert.match(result.err.join("\n"), /Client entry blocks/);
  write("ops/entry-points.json", { schemaVersion: 1, targets: ["CLAUDE.md"] });
  git("add", ".");
  assert.equal(checkEntrySync({ source: "staged" }).ok, true);
  git("rm", "--cached", "CLAUDE.md");
  assert.equal(checkEntrySync({ source: "staged" }).ok, false);
});

fixture("entry sync refuses links and traversal and leaves no-target setups inactive", ({ root, write }) => {
  assert.throws(() => repositoryPath(root, ".GiT/config.md"));
  assert.equal(checkEntrySync().ok, true);
  write("ops/entry-points.json", { schemaVersion: 1, targets: [] });
  assert.equal(checkEntrySync().configured, false);
  write("AGENTS.md", operator("Canonical"));
  write("target.md", operator("Old"));
  fs.symlinkSync("target.md", path.join(root, "CLAUDE.md"));
  for (const target of ["CLAUDE.md", "../escape.md", "AGENTS.md", ".git/policy.md"]) {
    write("ops/entry-points.json", { schemaVersion: 1, targets: [target] });
    assert.equal(checkEntrySync({ write: true }).ok, false);
  }
});

fixture("entry sync refuses invalid UTF-8 before writing and preserves valid Unicode", ({ root, write }) => {
  write("ops/entry-points.json", { schemaVersion: 1, targets: ["CLAUDE.md"] });
  write("AGENTS.md", operator("Canonical"));
  const valid = Buffer.from(`Client hints: café\n${operator("Old")}\n`);
  const invalid = Buffer.concat([valid, Buffer.from([255])]);
  fs.writeFileSync(path.join(root, "CLAUDE.md"), invalid);
  assert.equal(checkEntrySync({ write: true }).ok, false);
  assert.deepEqual(fs.readFileSync(path.join(root, "CLAUDE.md")), invalid);
  fs.writeFileSync(path.join(root, "CLAUDE.md"), valid);
  assert.equal(checkEntrySync({ write: true }).ok, true);
  assert.match(fs.readFileSync(path.join(root, "CLAUDE.md"), "utf8"), /café/);
});

test("guards: QA failure precedence prevents passing batches or summaries hiding failures", () => {
  const input = manifest([record("acceptance"), record("acceptance", "FAIL", { attemptId: "attempt-2" }), record("regression")]);
  assert.equal(evaluateQaEvidence(input, policy, identity).verdict, "FAIL");
  input.summary = "PASS";
  assert.equal(evaluateQaEvidence(input, policy, identity).verdict, "FAIL");
});

test("QA scope and identity cannot be narrowed or relabelled", () => {
  for (const input of [
    manifest([]), manifest([record("acceptance")]), manifest([record("acceptance", "NOTE"), record("regression")]),
    manifest([record("acceptance", "BLOCKED"), record("regression")]),
    manifest([record("acceptance", "PASS", { evidence: [] }), record("regression")]),
    manifest([record("acceptance", "PASS", { revision: "b".repeat(40) }), record("regression")]),
    manifest([record("acceptance", "PASS", { target: "production" }), record("regression")]),
    manifest([record("acceptance", "PASS", { attemptId: null }), record("regression")]),
    manifest([record("acceptance"), record("acceptance"), record("regression")])
  ]) assert.equal(evaluateQaEvidence(input, policy, identity).verdict, "BLOCKED");
  assert.equal(evaluateQaEvidence(manifest(), policy, identity).verdict, "PASS");
  assert.equal(evaluateQaEvidence(manifest([record("acceptance"), record("acceptance", "NOTE", { attemptId: "note-1", evidence: [] }), record("regression")]), policy, identity).verdict, "PASS");
  assert.throws(() => validateEvidencePolicy({ ...policy, checks: [] }));
  assert.throws(() => validateEvidencePolicy({ ...policy, checks: [1] }));
});

fixture("QA verification checks actual proof digests and rejects changed missing or linked artifacts", async ({ root, write }) => {
  write("ops/qa-evidence.json", policy);
  write("proof.txt", "verified\n");
  write("manifest.json", manifest());
  assert.equal(verifyQaEvidence("manifest.json", identity).verdict, "PASS");
  write("proof.txt", "changed\n");
  assert.equal(verifyQaEvidence("manifest.json", identity).verdict, "BLOCKED");
  fs.unlinkSync(path.join(root, "proof.txt"));
  assert.equal(verifyQaEvidence("manifest.json", identity).verdict, "BLOCKED");
  write("real.txt", "verified\n");
  fs.symlinkSync("real.txt", path.join(root, "proof.txt"));
  assert.equal(verifyQaEvidence("manifest.json", identity).verdict, "BLOCKED");
  const output = capture();
  assert.equal(await main(["qa", "evidence", "verify", "manifest.json", "--revision", revision, "--target", "staging"], output.io), 1);
  assert.doesNotMatch(output.out.concat(output.err).join("\n"), new RegExp(root));
});

fixture("inactive QA evidence is nonblocking for status and cannot claim a verified pass", async ({ write }) => {
  const status = capture();
  assert.equal(await main(["qa", "evidence", "status"], status.io), 0);
  write("ops/qa-evidence.json", { ...policy, status: "inactive", checks: [] });
  assert.equal(await main(["qa", "evidence", "status"], capture().io), 0);
  assert.equal(verifyQaEvidence("missing.json", identity).verdict, "BLOCKED");
});

fixture("QA policy cannot serve as proof, including filesystem case aliases", ({ root, write }) => {
  const text = JSON.stringify(policy);
  write("ops/qa-evidence.json", text);
  for (const relative of ["ops/qa-evidence.json", "OPS/QA-EVIDENCE.JSON"]) {
    if (!fs.existsSync(path.join(root, relative))) continue;
    write("manifest.json", manifest(policy.checks.map((id) => record(id, "PASS", { evidence: [{ path: relative, sha256: digest(text) }] }))));
    assert.equal(verifyQaEvidence("manifest.json", identity).verdict, "BLOCKED");
  }
});

fixture("protocol discovery finds legacy TOC entries and keeps deterministic source attribution", async ({ write }) => {
  write("ops/protocols/PRE-COMMIT.md", "---\ntitle: Commit gate\nstatus: active\nsummary: Prepare a commit\n---\n# Gate\n");
  write("docs/legacy-commit.md", "# Legacy commit evidence\nstatus: active\n");
  write("AGENTS-TOC.md", "| Prepare commit | `ops/protocols/PRE-COMMIT.md`, `docs/legacy-commit.md` |\n");
  const matches = findProtocols("commit");
  assert.equal(matches.length, 2);
  assert.equal(matches.find((item) => item.path === "docs/legacy-commit.md").source, "toc");
  assert.equal(matches.find((item) => item.path === "docs/legacy-commit.md").status, "unknown");
  assert.equal(matches.find((item) => item.path.includes("PRE-COMMIT")).source, "protocol+toc");
  assert.deepEqual(findProtocols("commit"), matches);
  const output = capture();
  assert.equal(await main(["protocols", "find", "zzzznomatch"], output.io), 0);
  assert.match(output.out.join("\n"), /count: 0/);
});
