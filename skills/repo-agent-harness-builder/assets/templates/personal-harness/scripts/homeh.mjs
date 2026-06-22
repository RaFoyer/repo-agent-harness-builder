#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CLI_NAME = "{{CLI_NAME}}";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configDir = path.join(root, "config");
const stateDir = path.join(root, "state");

function expandHome(p) {
  return p === "~" ? os.homedir() : p.startsWith("~/") ? path.join(os.homedir(), p.slice(2)) : p;
}

function logicalPath(p) {
  return path.resolve(expandHome(p));
}

function resolvedPath(p) {
  const logical = logicalPath(p);
  try {
    return fs.realpathSync.native(logical);
  } catch {
    return logical;
  }
}

function displayResolvedPath(resolved) {
  const home = path.resolve(os.homedir());
  if (resolved === home) return "~";
  if (containsPath(home, resolved)) return `~/${path.relative(home, resolved)}`;
  if (resolved === "/Volumes") return "<external-drives>";
  if (resolved.startsWith("/Volumes/")) {
    const parts = path.relative("/Volumes", resolved).split(path.sep).slice(1).filter(Boolean);
    return parts.length ? `<external-drive>/${parts.join("/")}` : "<external-drive>";
  }
  return "<absolute-path>";
}

function displayPath(p) {
  return isPathLike(p) ? displayResolvedPath(resolvedPath(p)) : p;
}

function isPathLike(value) {
  return value === "~" || value.startsWith("~/") || value.startsWith("/");
}

function containsPath(parent, child) {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function pathRecords(values = []) {
  return values
    .filter(isPathLike)
    .map((raw) => ({ raw, logical: logicalPath(raw), resolved: resolvedPath(raw) }));
}

function overlapsAnyPath(candidate, paths) {
  return paths.some((entry) => (
    containsPath(entry.logical, candidate.logical) ||
    containsPath(candidate.logical, entry.logical) ||
    containsPath(entry.resolved, candidate.resolved) ||
    containsPath(candidate.resolved, entry.resolved)
  ));
}

function validateScopes(scopes) {
  const blockers = [];
  const managedFolders = scopes.managedFolders || [];
  if (scopes.scopeConfirmed !== true || managedFolders.length === 0) {
    blockers.push("managed folders are not confirmed. Add exact folders to config/scopes.json and set scopeConfirmed only after human approval.");
  }
  const approved = new Set((scopes.approvedProtectedManagedFolders || []).filter(isPathLike).map(resolvedPath));
  const protectedPaths = pathRecords(scopes.explicitOptInRequired || []);
  const home = resolvedPath("~");

  for (const scope of managedFolders) {
    const managed = resolvedPath(scope.path);
    if (managed === "/" || managed === home) {
      blockers.push(`${scope.id}: managed folder must not be home or filesystem root`);
      continue;
    }
    for (const protectedPath of protectedPaths) {
      const overlaps = containsPath(protectedPath.resolved, managed) || containsPath(managed, protectedPath.resolved);
      if (overlaps && !approved.has(managed)) {
        blockers.push(`${scope.id}: ${displayPath(scope.path)} overlaps explicit opt-in area ${displayPath(protectedPath.raw)}`);
      }
    }
  }

  return blockers;
}

function loadJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(root, rel), "utf-8"));
}

function out(line = "") {
  console.log(line);
}

function help() {
  out(`Personal harness CLI

Usage:
  ./${CLI_NAME} <command>

Read-only commands:
  help
  context
  preflight
  inventory scan
  inventory report

Mutation commands are intentionally not implemented in the base skeleton.
Create plans first, then add tested apply/undo commands for your environment.
`);
}

function context() {
  const scopes = loadJson("config/scopes.json");
  out("Personal harness context");
  out(`root: ${displayResolvedPath(root)}`);
  out("managed folders:");
  for (const folder of scopes.managedFolders) out(`- ${folder.id}: ${folder.path} (${folder.defaultMode})`);
}

function preflight() {
  const scopes = loadJson("config/scopes.json");
  const required = [
    "AGENTS.md",
    "AGENTS-TOC.md",
    "ops/HARNESS-CHECKLIST.md",
    "config/scopes.json",
    "config/taxonomy.json",
    "config/naming.json",
    "state/inventories",
    "state/plans",
    "state/receipts",
    "state/quarantine",
    "reports/RUN-LOG.md"
  ];
  const blockers = required.filter((rel) => !fs.existsSync(path.join(root, rel)));
  if (blockers.length) {
    for (const rel of blockers) console.error(`blocker: missing ${rel}`);
    process.exitCode = 1;
    return;
  }
  const scopeBlockers = validateScopes(scopes);
  if (scopeBlockers.length) {
    for (const blocker of scopeBlockers) console.error(`blocker: ${blocker}`);
    process.exitCode = 1;
    return;
  }
  out("preflight passed. Read-only work may continue.");
}

function inventoryScan() {
  const scopes = loadJson("config/scopes.json");
  const scopeBlockers = validateScopes(scopes);
  if (scopeBlockers.length) {
    for (const blocker of scopeBlockers) console.error(`blocker: ${blocker}`);
    process.exitCode = 1;
    return;
  }
  fs.mkdirSync(path.join(stateDir, "inventories"), { recursive: true });
  const rows = [];
  const harnessRoot = resolvedPath(root);
  const excludedPaths = pathRecords(scopes.excludedPaths || []);
  for (const scope of scopes.managedFolders) {
    const folder = expandHome(scope.path);
    if (!fs.existsSync(folder)) {
      rows.push({ scope: scope.id, path: displayResolvedPath(logicalPath(folder)), missing: true });
      continue;
    }
    let names = [];
    try {
      names = fs.readdirSync(folder);
    } catch (error) {
      rows.push({ scope: scope.id, path: displayResolvedPath(path.resolve(folder)), error: error.message });
      continue;
    }
    for (const name of names) {
      const filePath = path.join(folder, name);
      const logical = logicalPath(filePath);
      const resolved = resolvedPath(filePath);
      if (containsPath(harnessRoot, resolved) || containsPath(harnessRoot, logical)) continue;
      if (overlapsAnyPath({ logical, resolved }, excludedPaths)) {
        rows.push({
          scope: scope.id,
          path: displayResolvedPath(logical),
          skipped: true,
          reason: "excluded-path"
        });
        continue;
      }
      let stat;
      try {
        stat = fs.lstatSync(filePath);
      } catch (error) {
        rows.push({ scope: scope.id, path: displayResolvedPath(logical), error: error.message });
        continue;
      }
      if (stat.isSymbolicLink()) {
        rows.push({
          scope: scope.id,
          path: displayResolvedPath(logical),
          type: "symlink",
          skipped: true,
          reason: "symlink-not-followed"
        });
        continue;
      }
      rows.push({
        scope: scope.id,
        path: displayResolvedPath(resolved),
        type: stat.isDirectory() ? "directory" : "file",
        bytes: stat.size,
        modified: stat.mtime.toISOString()
      });
    }
  }
  const outPath = path.join(stateDir, "inventories", `inventory-${new Date().toISOString().replaceAll(":", "-")}.json`);
  fs.writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), metadataOnly: true, rows }, null, 2));
  out(`metadata-only inventory written: ${displayResolvedPath(outPath)}`);
}

function inventoryReport() {
  const dir = path.join(stateDir, "inventories");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  if (!files.length) {
    out(`no inventories yet. Run ./${CLI_NAME} inventory scan first.`);
    return;
  }
  const latest = path.join(dir, files.at(-1));
  const data = JSON.parse(fs.readFileSync(latest, "utf-8"));
  out(`latest inventory: ${displayResolvedPath(latest)}`);
  out(`items: ${data.rows.length}`);
}

const [command = "help", subcommand = ""] = process.argv.slice(2);
if (command === "help") help();
else if (command === "context") context();
else if (command === "preflight") preflight();
else if (command === "inventory" && subcommand === "scan") inventoryScan();
else if (command === "inventory" && subcommand === "report") inventoryReport();
else {
  console.error(`unknown command: ${command} ${subcommand}`.trim());
  process.exitCode = 2;
}
