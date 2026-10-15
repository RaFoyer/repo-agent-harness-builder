#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

// Mutants run only in disposable copies of an already generated harness.
// An assertion failure is required; a syntax/import error is not evidence.
const source = process.argv[2];
assert.ok(source && process.argv.length === 3, "Supply one generated harness directory");
const cli = "apps/cli/src/";
const cases = [
  ["duplicate flags", "util/strict-args.mjs", 'if (kind !== "repeatable" && Object.hasOwn(values, flag))', "if (false)", "harness-gates.test.mjs", "guards: strict duplicates"],
  ["staged entry drift", "docs/entry-sync.mjs", "const changed = plans.filter((plan) => plan.original !== plan.next);", "const changed = [];", "harness-gates.test.mjs", "guards: staged entry drift"],
  ["QA failure precedence", "qa/evidence.mjs", 'outcomes.has("FAIL") ? "FAIL"', 'false ? "FAIL"', "harness-gates.test.mjs", "guards: QA failure precedence"],
  ["QA proof digest", "qa/evidence.mjs", 'if (cache.get(proof.path) !== proof.sha256)', "if (false)", "harness-gates.test.mjs", "QA verification checks actual proof digests"],
  ["GitHub activation ceiling", "github/index.mjs", "if (capability && Array.isArray(runtimeCapabilities(config)) && !runtimeCapabilities(config).includes(capability))", "if (false)", "cli.test.mjs", "guards: github runtime ceiling"]
];

const root = fs.mkdtempSync(path.join(os.tmpdir(), "harness-falsification-"));
try {
  for (const [label, module, before, after, file, pattern] of cases) {
    const target = path.join(root, label.replace(/[^a-z0-9]+/gi, "-"));
    fs.cpSync(source, target, { recursive: true, filter: (entry) => !path.relative(source, entry).split(path.sep).some((part) => [".git", "node_modules", "coverage"].includes(part)) });
    const run = () => spawnSync(process.execPath, ["--test", "--test-reporter=tap", `--test-name-pattern=${pattern}`, `apps/cli/test/${file}`], {
      cwd: target, encoding: "utf8", timeout: 30_000, maxBuffer: 4_000_000
    });
    assert.equal(run().status, 0, `Baseline failed for ${label}`);
    const modulePath = path.join(target, cli, module);
    const text = fs.readFileSync(modulePath, "utf8");
    assert.equal(text.split(before).length, 2, `Mutation must match one rule for ${label}`);
    fs.writeFileSync(modulePath, text.replace(before, after));
    const result = run();
    assert.equal(result.status, 1, `Disabled ${label} was not detected`);
    assert.match(result.stdout, /ERR_ASSERTION/, `Expected a real assertion failure for ${label}`);
    console.log(`falsification: detected disabled ${label}`);
  }
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
