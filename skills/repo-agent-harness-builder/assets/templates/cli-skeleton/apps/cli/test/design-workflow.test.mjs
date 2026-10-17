import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { CONFIG, setRepoRootForTests } from "../src/config.mjs";
import { main } from "../src/main.mjs";
import { validateDesignWorkflow, renderDesignTracker, WORKFLOW_PATH } from "../src/design/workflow.mjs";
import { compareTokens } from "../../../scripts/design/compare-tokens.mjs";
import { measureLayout } from "../../../scripts/design/measure-layout.mjs";
import { measureMatrix } from "../../../scripts/design/measure-matrix.mjs";

const revision = "c".repeat(40);
const view = { id: "records", name: "Records", audience: "operators", module: "Records", route: "/records/:id", page: "src/Records.mjs", status: "todo", preview: { path: "/records/demo", port: 3280, cwd: ".", argv: ["node", "preview.mjs", "--host", "{host}", "--port", "{port}"] } };
const workflow = () => ({ schemaVersion: 1, status: "active", owner: "design-owner", componentLibrary: "packages/ui", tokenSourceRef: "config/tokens.json", tracker: "artifacts/design/tracker.md", views: [structuredClone(view)] });
const capture = () => { const out = []; return { out, io: { stdout: (line) => out.push(line), stderr: (line) => out.push(line) } }; };
function fixture(name, fn) {
  test(name, async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "design-workflow-"));
    const previous = CONFIG.repoRoot;
    const previousEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "test";
    setRepoRootForTests(root);
    const write = (relative, value) => { const target = path.join(root, relative); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, typeof value === "string" ? value : JSON.stringify(value)); };
    const run = async (...args) => { const result = capture(); result.code = await main(["design", ...args], result.io); return { ...result, text: result.out.join("\n") }; };
    try { await fn({ root, write, run }); }
    finally { setRepoRootForTests(previous); if (previousEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousEnv; fs.rmSync(root, { recursive: true, force: true }); }
  });
}

fixture("design workflow usage fails before missing configuration can be read", async ({ run }) => {
  for (const args of [["views", "--json=false"], ["session"], ["session", "records", "--launch", "terminal"], ["preview", "records", "--run"], ["tracker", "--write", "--write"], ["check", "proof.json", "--view", "records"]]) assert.equal((await run(...args)).code, 2, args.join(" "));
});

fixture("inactive design workflow never launches, writes or requires credentials", async ({ root, write, run }) => {
  const config = workflow(); config.status = "inactive"; config.componentLibrary = null; config.tokenSourceRef = null; config.views = [];
  write(WORKFLOW_PATH, config);
  assert.equal((await run("views")).code, 1);
  assert.equal((await run("tracker", "--write")).code, 1);
  assert.equal(fs.existsSync(path.join(root, "artifacts")), false);
  const status = await run("status");
  assert.equal(status.code, 0);
  assert.match(status.text, /design workflow: inactive \(declared, not verified\)/);
});

fixture("design lists filter and return a definitive empty result", async ({ write, run }) => {
  write(WORKFLOW_PATH, workflow());
  const all = await run("views", "--json");
  assert.equal(all.code, 0);
  assert.equal(JSON.parse(all.text).views[0].id, "records");
  assert.match((await run("status")).text, /design workflow: active \(declared, not verified\)/);
  const empty = await run("views", "--audience", "visitors", "--json");
  assert.deepEqual(JSON.parse(empty.text), { count: 0, views: [] });
});

fixture("session emitted contract carries milestone stop, real sources and an unexecuted preview", async ({ root, write, run }) => {
  write(WORKFLOW_PATH, workflow());
  const session = await run("session", "records", "--json");
  assert.equal(session.code, 0);
  const payload = JSON.parse(session.text);
  assert.equal(payload.milestone.stopBeforeImplementation, true);
  assert.equal(payload.milestone.approvalRequired, true);
  assert.deepEqual(payload.sources, { components: "packages/ui", tokenSourceRef: "config/tokens.json" });
  assert.equal(payload.preview.url, "http://127.0.0.1:3280/records/demo");
  assert.equal(payload.preview.executed, false);
  assert.equal(fs.existsSync(path.join(root, "artifacts")), false);
  assert.equal(fs.existsSync(path.join(root, ".git")), false);
});

fixture("preview expands public argv tokens without a shell or process launch", async ({ write, run }) => {
  write(WORKFLOW_PATH, workflow());
  const preview = JSON.parse((await run("preview", "records", "--json")).text);
  assert.deepEqual(preview.argv, ["node", "preview.mjs", "--host", "127.0.0.1", "--port", "3280"]);
  assert.equal(preview.executed, false);
  const config = workflow(); config.views[0].preview = null; write(WORKFLOW_PATH, config);
  const blocked = await run("preview", "records");
  assert.equal(blocked.code, 1);
  assert.equal(JSON.parse(blocked.text).available, false);
});

fixture("registry rejects duplicate ports, unsafe pointers and invented preview parameters", () => {
  for (const mutate of [
    (config) => config.views.push({ ...structuredClone(view), id: "second" }),
    (config) => { config.views[0].preview.path = "//example.com"; },
    (config) => { config.views[0].preview.path = "/records/:id"; },
    (config) => { config.views[0].page = "../outside.mjs"; },
    (config) => { config.componentLibrary = null; },
    (config) => { config.views[0].id = null; },
    (config) => { config.views[0].prUrl = "https://" + "user" + ":" + "password" + "@example.com/x"; },
    (config) => { config.tracker = "docs/policy.md"; }
  ]) { const config = workflow(); mutate(config); assert.throws(() => validateDesignWorkflow(config)); }
});

fixture("tracker defaults to stdout, explicitly writes and never needs to read derived content", async ({ root, write, run }) => {
  const config = workflow(); write(WORKFLOW_PATH, config);
  assert.equal((await run("tracker")).text, renderDesignTracker(config));
  assert.equal(fs.existsSync(path.join(root, config.tracker)), false);
  assert.equal((await run("tracker", "--write")).code, 0);
  assert.equal(fs.readFileSync(path.join(root, config.tracker), "utf8"), renderDesignTracker(config));
  write(config.tracker, "stale derived content");
  fs.chmodSync(path.join(root, config.tracker), 0o200);
  try { assert.equal((await run("tracker", "--write")).code, 0); }
  finally { fs.chmodSync(path.join(root, config.tracker), 0o600); }
  assert.equal(fs.readFileSync(path.join(root, config.tracker), "utf8"), renderDesignTracker(config));
});

fixture("tracker refuses linked output without modifying the other file", async ({ root, write, run }) => {
  write(WORKFLOW_PATH, workflow()); write("other.md", "keep");
  fs.mkdirSync(path.join(root, "artifacts", "design"), { recursive: true });
  fs.symlinkSync(path.join(root, "other.md"), path.join(root, "artifacts", "design", "tracker.md"));
  assert.equal((await run("tracker", "--write")).code, 1);
  assert.equal(fs.readFileSync(path.join(root, "other.md"), "utf8"), "keep");
});

fixture("design evidence uses its own fixed policy and blocks omitted checks and changed proofs", async ({ write, run }) => {
  write(WORKFLOW_PATH, workflow());
  write("ops/qa-evidence.json", { schemaVersion: 1, status: "active", owner: "backend", checks: ["other-check"] });
  write("ops/design-evidence.json", { schemaVersion: 1, status: "active", owner: "design", checks: ["layout", "keyboard"] });
  const proof = "real test receipt\n"; write("artifacts/design/result.txt", proof);
  const manifest = { schemaVersion: 1, revision, target: "records", runId: "design-1", results: ["layout", "keyboard"].map((checkId) => ({ checkId, outcome: "PASS", revision, target: "records", runId: "design-1", attemptId: "attempt-1", evidence: [{ path: "artifacts/design/result.txt", sha256: createHash("sha256").update(proof).digest("hex") }] })) };
  write("artifacts/design/manifest.json", manifest);
  assert.equal((await run("check", "artifacts/design/manifest.json", "--revision", revision, "--view", "records")).code, 0);
  const keyboard = manifest.results.pop(); write("artifacts/design/manifest.json", manifest);
  assert.equal((await run("check", "artifacts/design/manifest.json", "--revision", revision, "--view", "records")).code, 1);
  manifest.results.push(keyboard); write("artifacts/design/manifest.json", manifest);
  assert.equal((await run("check", "artifacts/design/manifest.json", "--revision", revision, "--view", "records")).code, 0);
  write("artifacts/design/result.txt", "changed");
  assert.equal((await run("check", "artifacts/design/manifest.json", "--revision", revision, "--view", "records")).code, 1);
});

test("guards: semantic token mismatch and missing declarations fail", () => {
  assert.equal(compareTokens({ radius: "6px", space: "4px" }, { radius: "6px", space: "4px" }).pass, true);
  assert.equal(compareTokens({ radius: "6px" }, { radius: "8px" }).pass, false);
  assert.equal(compareTokens({ radius: "6px", space: "4px" }, { radius: "6px" }).pass, false);
});

function domFixture() {
  const style = { visibility: "visible", display: "block", overflowX: "visible", overflowY: "visible", textOverflow: "clip" };
  const element = { tagName: "BUTTON", clientWidth: 100, scrollWidth: 100, clientHeight: 44, scrollHeight: 44, disabled: false,
    getBoundingClientRect: () => ({ width: element.clientWidth, height: element.clientHeight }),
    matches: (selector) => selector.includes("button") || selector === ".allowed" };
  const body = { tagName: "MAIN", clientWidth: 640, scrollWidth: 640, clientHeight: 800, scrollHeight: 800, getBoundingClientRect: () => ({ width: 640, height: 800 }), matches: () => false, querySelectorAll: () => [element] };
  return { style, element, body };
}

test("layout measures 4px overflow, clipped height and small targets; explicit exceptions are narrow", async () => {
  const { style, element, body } = domFixture();
  const previous = { document: globalThis.document, window: globalThis.window, getComputedStyle: globalThis.getComputedStyle };
  globalThis.document = { querySelector: () => body }; globalThis.window = { innerWidth: 900, innerHeight: 900 }; globalThis.getComputedStyle = () => style;
  const page = { evaluate: (callback, args) => callback(args) };
  try {
    assert.equal((await measureLayout(page)).pass, true);
    element.scrollWidth = 104;
    assert.equal((await measureLayout(page)).overflow[0].excessX, 4);
    style.textOverflow = "ellipsis";
    assert.equal((await measureLayout(page)).truncation.length, 1);
    assert.equal((await measureLayout(page, { allowTruncation: [".allowed"] })).pass, true);
    element.scrollWidth = 100; element.scrollHeight = 49; style.overflowY = "hidden";
    assert.equal((await measureLayout(page)).overflow.length, 1);
    element.scrollHeight = 44; element.clientHeight = 40; element.scrollHeight = 40;
    assert.equal((await measureLayout(page)).smallTargets.length, 1);
    assert.equal((await measureLayout(page, { allowSmallTargets: [".allowed"] })).pass, true);
  } finally { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } }
});

test("matrix reaches every configured viewport and state and blocks unproven fixtures", async () => {
  const widths = []; const samples = [];
  const page = { setViewportSize: async (viewport) => widths.push(viewport.width), evaluate: async () => ({ pass: true }) };
  const policy = { schemaVersion: 1, status: "active", viewports: [375, 640, 768, 1024, 1280, 1536].map((width) => ({ width, height: 900 })), sidebarStates: ["open"], states: ["default", "stress", "error"] };
  const result = await measureMatrix(page, policy, async (_page, sample) => { samples.push(sample); return true; });
  assert.equal(result.samples.length, 18); assert.equal(samples.length, 18); assert.deepEqual(widths, policy.viewports.map((value) => value.width));
  await assert.rejects(() => measureMatrix(page, policy, async () => false), /not proven/);
  await assert.rejects(() => measureMatrix(page, { ...policy, status: "inactive" }, async () => true), /policy/);
});

fixture("static render preserves full CSS, refuses overwrites and validates all names before writing", ({ root, write }) => {
  const renderer = fileURLToPath(new URL("../../../scripts/design/render-previews.mjs", import.meta.url));
  const css = ".panel { color: black; } @media (max-width: 640px) { .panel { display: grid; } }";
  write("previews.mjs", `export function renderPreviews() { return { css: ${JSON.stringify(css)}, previews: [{name: 'today', width: 640, html: '<section class="panel">Real module output</section>'}] }; }`);
  const run = (...args) => spawnSync(process.execPath, [renderer, ...args], { cwd: root, encoding: "utf8" });
  const rendered = run("previews.mjs", "artifacts/design/run-1");
  assert.equal(rendered.status, 0, rendered.stderr);
  assert.equal(fs.readFileSync(path.join(root, "artifacts/design/run-1/styles.css"), "utf8"), css);
  assert.equal(JSON.parse(rendered.stdout).browserVerificationRequired, true);
  assert.equal(run("previews.mjs", "artifacts/design/run-1").status, 1);
  write("bad.mjs", `export function renderPreviews() { return { css: 'body{}', previews: [{name: '../bad', width: 640, html: '<p>x</p>'}] }; }`);
  assert.equal(run("bad.mjs", "artifacts/design/run-2").status, 1);
  assert.equal(fs.existsSync(path.join(root, "artifacts/design/run-2")), false);
  assert.equal(run("previews.mjs", "../outside").status, 1);
});
