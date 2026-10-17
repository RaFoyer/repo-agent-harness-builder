import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "../config.mjs";
import { parseCliArgs } from "../util/strict-args.mjs";
import { decodeRepositoryText, readRepositoryFile, repositoryPath } from "../util/repo-files.mjs";
import { renderUsageError, safeLine, safeText, toonString } from "../util/agent-output.mjs";
import { verifyQaEvidence } from "../qa/evidence.mjs";

export const WORKFLOW_PATH = "ops/design-workflow.json";
export const DESIGN_EVIDENCE_PATH = "ops/design-evidence.json";
const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const STATUSES = new Set(["todo", "designing", "review", "building", "merged", "released"]);
const text = (value, max = 500) => typeof value === "string" && value.trim() && value.length <= max && !/[\x00-\x1f\x7f]/.test(value);
const object = (value) => value && typeof value === "object" && !Array.isArray(value);
const keys = (value, allowed, required = allowed) => object(value) && required.every((key) => Object.hasOwn(value, key)) && Object.keys(value).every((key) => allowed.includes(key));
const route = (value) => text(value) && value.startsWith("/") && !value.startsWith("//") && !/[\\#\s]/.test(value);
const localPath = (value) => { repositoryPath(CONFIG.repoRoot, value); return value; };

export function validateDesignWorkflow(value) {
  if (!keys(value, ["schemaVersion", "status", "owner", "componentLibrary", "tokenSourceRef", "tracker", "views"]) || value.schemaVersion !== 1
    || !["active", "inactive"].includes(value.status) || !text(value.owner) || !Array.isArray(value.views) || value.views.length > 1000) throw new Error("invalid-design-workflow");
  localPath(value.tracker);
  if (!value.tracker.startsWith("artifacts/design/") || !value.tracker.endsWith(".md")) throw new Error("invalid-design-tracker-path");
  for (const field of ["componentLibrary", "tokenSourceRef"]) {
    if (value[field] !== null) localPath(value[field]);
    if (value.status === "active" && value[field] === null) throw new Error("design-authority-required");
  }
  const ids = new Set();
  const ports = new Set();
  for (const view of value.views) {
    if (!keys(view, ["id", "name", "audience", "module", "route", "page", "status", "preview", "designUrl", "prUrl"], ["id", "name", "audience", "module", "route", "page", "status", "preview"])
      || typeof view.id !== "string" || !ID.test(view.id) || ids.has(view.id) || !text(view.name) || !text(view.audience) || !text(view.module) || !route(view.route) || !STATUSES.has(view.status)) throw new Error("invalid-design-view");
    ids.add(view.id);
    localPath(view.page);
    for (const field of ["designUrl", "prUrl"]) {
      if (view[field] == null) continue;
      const url = new URL(view[field]);
      if (url.protocol !== "https:" || url.username || url.password || !text(view[field], 2000)) throw new Error("invalid-design-link");
    }
    if (view.preview === null) continue;
    const preview = view.preview;
    if (!keys(preview, ["path", "port", "cwd", "argv"]) || !route(preview.path) || /(^|\/)[:*]|[{}]/.test(preview.path)
      || !Number.isInteger(preview.port) || preview.port < 1024 || preview.port > 65535 || ports.has(preview.port)
      || !Array.isArray(preview.argv) || !preview.argv.length || preview.argv.length > 64 || !preview.argv.every((arg) => text(arg, 2000))) throw new Error("invalid-design-preview");
    ports.add(preview.port);
    if (preview.cwd !== ".") localPath(preview.cwd);
  }
  return value;
}

export function loadDesignWorkflow() {
  return validateDesignWorkflow(JSON.parse(decodeRepositoryText(readRepositoryFile(CONFIG.repoRoot, WORKFLOW_PATH).bytes)));
}

export function previewPlan(view) {
  if (!view.preview) return { available: false, reason: "No reviewed seeded preview is configured. Record the blocker; do not invent a record or disable authentication." };
  const { port, cwd, argv } = view.preview;
  return {
    available: true,
    url: `http://127.0.0.1:${port}${view.preview.path}`,
    cwd,
    argv: argv.map((arg) => arg.replaceAll("{port}", String(port)).replaceAll("{host}", "127.0.0.1")),
    executed: false,
    authority: "Plan only. Review the configured command, synthetic data and network isolation before an approved local launch. A URL is not proof of a running app."
  };
}

export function designSession(workflow, view) {
  return {
    schemaVersion: 1,
    view: { id: view.id, name: view.name, audience: view.audience, module: view.module, route: view.route, page: view.page },
    owner: workflow.owner,
    sources: { components: workflow.componentLibrary, tokenSourceRef: workflow.tokenSourceRef },
    preview: previewPlan(view),
    milestone: { id: "grounding", stopBeforeImplementation: true, deliverables: ["today-capture", "data-actions-permissions-map", "real-component-options", "questions-and-backend-gaps"], approvalRequired: true },
    prompt: [
      `# Design in code: ${view.name}`,
      `Read AGENTS.md, AGENTS-TOC.md and ops/protocols/DESIGN-IN-CODE.md. Work only on ${view.page} and the explicitly agreed scope.`,
      `Design owner: ${workflow.owner}. Audience: ${view.audience}. Canonical components: ${workflow.componentLibrary}. The canonical design token source is ${workflow.tokenSourceRef}.`,
      "Check current ownership before editing. Follow this repository's branch/worktree policy; do not create tasks, worktrees, tickets or external canvases without authority.",
      "Milestone 1 is read-only product grounding: capture Today from the running app with synthetic data, map every data field, action, backend operation and permission as exists, available or gap, then show real-component options and the decisions needed.",
      "STOP after milestone 1. Wait for the design owner's explicit approval before implementation. A session brief, registry status or unanswered card is not approval.",
      "The design owner carries the work through implementation and verification. Ask the shared-library owner for shared changes; reuse them rather than building parallel copies.",
      "Keep money, permissions, data loading and server writes unchanged unless separately authorized. Mock previews do not prove backend, auth, deployment or release behavior.",
      "Show Today before alternatives. Measure layout at the agreed content widths, sidebar states, stress content and UI states. Check keyboard, real browser zoom, contrast and target sizes before cards or PR claims.",
      "After approval, build with the same components, run the repository's checks, and attach revision-bound evidence. Registry and tracker changes travel in the view's own PR. Merged and released are distinct states; neither is inferred from a screenshot.",
      "Report evidence, blockers and the next decision to the owner. The brief grants no permission to message another task or publish externally."
    ].join("\n\n")
  };
}

const cell = (value) => String(value ?? "").replaceAll("|", "\\|").replace(/[\r\n]/g, " ");
export function renderDesignTracker(workflow) {
  return ["# Design tracker", "", `Generated from ${WORKFLOW_PATH}. Edit the registry in the same PR as the view. Status is recorded metadata, not release proof.`, "",
    "| Id | View | Audience | Module | Route | Status |", "| --- | --- | --- | --- | --- | --- |",
    ...workflow.views.map((view) => `| ${view.id} | ${cell(view.name)} | ${cell(view.audience)} | ${cell(view.module)} | ${cell(view.route)} | ${view.status} |`), ""].join("\n");
}

// Runtime never reads the derived tracker. CI tests compare it with this pure renderer.
function writeTracker(workflow) {
  const destination = repositoryPath(CONFIG.repoRoot, workflow.tracker);
  let current = CONFIG.repoRoot;
  for (const part of workflow.tracker.split("/").slice(0, -1)) {
    current = path.join(current, part);
    if (!fs.existsSync(current)) fs.mkdirSync(current);
    const stat = fs.lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("unsafe-design-output");
  }
  if (fs.existsSync(destination)) {
    const stat = fs.lstatSync(destination);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error("unsafe-design-output");
  }
  const fd = fs.openSync(destination, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_NOFOLLOW, 0o644);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1) throw new Error("unsafe-design-output");
    fs.ftruncateSync(fd, 0);
    fs.writeFileSync(fd, renderDesignTracker(workflow));
  } finally { fs.closeSync(fd); }
}

const specs = {
  views: { flags: { "--audience": "value", "--module": "value", "--json": "boolean" } },
  session: { flags: { "--json": "boolean" }, minPositionals: 1, maxPositionals: 1 },
  preview: { flags: { "--json": "boolean" }, minPositionals: 1, maxPositionals: 1 },
  tracker: { flags: { "--write": "boolean" } },
  check: { flags: { "--revision": "value", "--view": "value" }, minPositionals: 1, maxPositionals: 1 }
};

export async function runDesignWorkflow(command, argv, io) {
  const parsed = parseCliArgs(argv, specs[command]);
  const usage = (code, message) => { renderUsageError(io, { code, command: `design ${command}`, message, hints: [`Run ./${CONFIG.cliName} design help`] }); return 2; };
  if (!parsed.ok) return usage(parsed.code, parsed.message);
  if (["session", "preview"].includes(command) && !ID.test(parsed.positionals[0])) return usage("invalid-design-view-id", "Use a registered view id");
  if (command === "check" && (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(parsed.values["--revision"] || "") || !ID.test(parsed.values["--view"] || ""))) return usage("invalid-design-evidence-identity", "Supply a full --revision and registered --view");
  try {
    const workflow = loadDesignWorkflow();
    if (workflow.status !== "active") { io.stdout("design_workflow: inactive"); io.stdout("activation: configure owner, real source paths, views, reviewed preview commands and visual evidence policy"); return 1; }
    if (command === "views") {
      const views = workflow.views.filter((view) => (!parsed.values["--audience"] || view.audience === parsed.values["--audience"]) && (!parsed.values["--module"] || view.module === parsed.values["--module"]));
      if (parsed.values["--json"]) io.stdout(safeText(JSON.stringify({ count: views.length, views })));
      else { io.stdout(`count: ${views.length}`); io.stdout(`views[${views.length}]{id,name,audience,module,status}:`); for (const view of views) io.stdout(`  ${[view.id, view.name, view.audience, view.module, view.status].map((value) => toonString(safeLine(value))).join(",")}`); }
      return 0;
    }
    if (command === "tracker") {
      if (parsed.values["--write"]) { writeTracker(workflow); io.stdout(`wrote: ${toonString(workflow.tracker)}`); }
      else io.stdout(safeText(renderDesignTracker(workflow)));
      return 0;
    }
    const viewId = command === "check" ? parsed.values["--view"] : parsed.positionals[0];
    const view = workflow.views.find((candidate) => candidate.id === viewId);
    if (!view) { io.stdout("error: design-view-not-found"); return 1; }
    if (command === "check") {
      const result = verifyQaEvidence(parsed.positionals[0], { revision: parsed.values["--revision"], target: view.id, policyPath: DESIGN_EVIDENCE_PATH });
      io.stdout(`design_evidence: ${result.verdict}`);
      io.stdout("scope: local evidence coherence only; not visual inspection, producer authenticity or release readiness");
      for (const check of result.checks) io.stdout(`check: ${toonString(check.id)} ${check.outcome}`);
      for (const error of result.errors) io.stdout(`error: ${toonString(error)}`);
      return result.verdict === "PASS" ? 0 : 1;
    }
    const result = command === "preview" ? previewPlan(view) : designSession(workflow, view);
    if (parsed.values["--json"] || command === "preview") io.stdout(safeText(JSON.stringify(result)));
    else io.stdout(safeText(result.prompt));
    return command === "preview" && !result.available ? 1 : 0;
  } catch { io.stdout("error: design-workflow-input-or-output-invalid"); return 1; }
}
