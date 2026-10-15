import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { CONFIG } from "../config.mjs";
import { parseCliArgs } from "../util/strict-args.mjs";
import { decodeRepositoryText, readRepositoryFile, repositoryPath } from "../util/repo-files.mjs";
import { renderUsageError, toonString } from "../util/agent-output.mjs";
import { gitTopologyEnvironment } from "../util/git-environment.mjs";

export const ENTRY_START = "<!-- harness:operator:start -->";
export const ENTRY_END = "<!-- harness:operator:end -->";
const CONFIG_PATH = "ops/entry-points.json";

function block(text) {
  if (text.split(ENTRY_START).length !== 2 || text.split(ENTRY_END).length !== 2) throw new Error("invalid-entry-block");
  const start = text.indexOf(ENTRY_START);
  const end = text.indexOf(ENTRY_END) + ENTRY_END.length;
  for (const [offset, marker] of [[start, ENTRY_START], [end - ENTRY_END.length, ENTRY_END]]) {
    if ((offset && text[offset - 1] !== "\n") || !/^(?:\r?\n|$)/.test(text.slice(offset + marker.length))) throw new Error("invalid-entry-block");
  }
  if (end <= start) throw new Error("invalid-entry-block");
  return { start, end, text: text.slice(start, end) };
}

function reader(repoRoot, source) {
  if (source === "worktree") return (relative) => {
    try { return decodeRepositoryText(readRepositoryFile(repoRoot, relative).bytes); }
    catch (error) { if (error.code === "ENOENT") return null; throw error; }
  };
  return (relative) => {
    repositoryPath(repoRoot, relative);
    const options = { cwd: repoRoot, encoding: "utf8", timeout: 5000, maxBuffer: 1_000_000, env: gitTopologyEnvironment(process.env) };
    const listed = spawnSync("git", ["ls-files", "--stage", "-z", "--", relative], options);
    if (listed.status !== 0) throw new Error("entry-index-unavailable");
    if (!listed.stdout) return null;
    const rows = listed.stdout.split("\0").filter(Boolean);
    if (rows.length !== 1 || !/^100(?:644|755) [a-f0-9]+ 0\t/.test(rows[0])) throw new Error("unsafe-entry-index-file");
    const result = spawnSync("git", ["show", `:${relative}`], { ...options, encoding: "buffer" });
    if (result.status !== 0) throw new Error("entry-index-unavailable");
    return decodeRepositoryText(result.stdout);
  };
}

export function checkEntrySync({ repoRoot = CONFIG.repoRoot, source = "worktree", write = false } = {}) {
  try {
    if (!["worktree", "staged"].includes(source) || (write && source !== "worktree")) throw new Error("invalid-entry-source");
    const read = reader(repoRoot, source);
    const raw = read(CONFIG_PATH);
    if (raw === null) return { ok: true, configured: false, targets: 0, changed: 0, source };
    const config = JSON.parse(raw);
    if (config.schemaVersion !== 1 || !Array.isArray(config.targets) || Object.keys(config).some((key) => !["schemaVersion", "targets"].includes(key))) throw new Error("invalid-entry-config");
    const targets = config.targets;
    if (targets.length > 32 || new Set(targets).size !== targets.length) throw new Error("invalid-entry-config");
    for (const target of targets) {
      repositoryPath(repoRoot, target);
      if (!target.endsWith(".md") || target.toLowerCase() === "agents.md") throw new Error("invalid-entry-target");
    }
    if (!targets.length) return { ok: true, configured: false, targets: 0, changed: 0, source };
    const canonical = block(read("AGENTS.md") ?? "").text;
    // Validate every destination before writing any of them.
    const plans = targets.map((relative) => {
      const original = read(relative);
      if (original === null) throw new Error("missing-entry-target");
      const found = block(original);
      return { relative, original, next: original.slice(0, found.start) + canonical + original.slice(found.end) };
    });
    const changed = plans.filter((plan) => plan.original !== plan.next);
    if (write) {
      const opened = [];
      try {
        for (const plan of changed) {
          const current = readRepositoryFile(repoRoot, plan.relative);
          if (decodeRepositoryText(current.bytes) !== plan.original) throw new Error("entry-target-changed");
          const fd = fs.openSync(current.target, fs.constants.O_RDWR | fs.constants.O_NOFOLLOW);
          opened.push({ fd, plan });
          const stat = fs.fstatSync(fd);
          if (stat.dev !== current.stat.dev || stat.ino !== current.stat.ino) throw new Error("entry-target-changed");
        }
        for (const { fd, plan } of opened) {
          const bytes = Buffer.from(plan.next);
          let offset = 0;
          while (offset < bytes.length) offset += fs.writeSync(fd, bytes, offset, bytes.length - offset, offset);
          fs.ftruncateSync(fd, bytes.length);
        }
      } finally {
        for (const { fd } of opened) fs.closeSync(fd);
      }
    }
    return { ok: write || !changed.length, configured: true, targets: targets.length, changed: changed.length, source };
  } catch {
    return { ok: false, configured: true, targets: 0, changed: 0, source, error: "entry-sync-input-invalid" };
  }
}

export async function runDocs(argv, io) {
  const [command = "help", ...rest] = argv;
  const parsed = parseCliArgs(rest, { flags: command === "entry-sync" ? { "--write": "boolean" } : {} });
  if (!parsed.ok) {
    renderUsageError(io, { ...parsed, command: "docs", hints: [`Run ./${CONFIG.cliName} docs help`] });
    return 2;
  }
  if (command === "help") {
    io.stdout("Usage: ./{{CLI_NAME}} docs entry-sync [--write]");
    io.stdout("Checks selected entry blocks; --write replaces only those blocks after validating every target.");
    return 0;
  }
  if (command !== "entry-sync") {
    renderUsageError(io, { code: "unknown-docs-command", command: "docs", message: "Unknown docs command", hints: [`Run ./${CONFIG.cliName} docs help`] });
    return 2;
  }
  const result = checkEntrySync({ write: parsed.values["--write"] === true });
  io.stdout(`entry_sync: ${result.ok ? "ok" : "blocked"}`);
  io.stdout(`configured: ${result.configured}`);
  io.stdout(`targets: ${result.targets}`);
  io.stdout(`changed: ${result.changed}`);
  if (result.error) io.stdout(`error: ${toonString(result.error)}`);
  if (!result.ok) io.stdout(`help: ${toonString(`Read ops/protocols/ENTRY-POINTS.md; run ./${CONFIG.cliName} docs entry-sync --write to repair valid blocks`)}`);
  return result.ok ? 0 : 1;
}
