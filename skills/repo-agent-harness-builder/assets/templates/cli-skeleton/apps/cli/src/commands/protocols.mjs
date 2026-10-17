import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "../config.mjs";
import { rejectUnexpectedArgs, renderHelpBlock, renderUsageError, safeLine, toonString } from "../util/agent-output.mjs";
import { parseCliArgs } from "../util/strict-args.mjs";
import { readRepositoryFile, repositoryPath } from "../util/repo-files.mjs";

function metadata(content) {
  const front = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1] || "";
  const field = (name) => front.match(new RegExp(`^${name}:\\s*([^\\r\\n]+)$`, "m"))?.[1].trim().replace(/^["']|["']$/g, "");
  return { status: field("status") || "unknown", title: field("title") || content.match(/^# (.+)$/m)?.[1] || "", summary: field("summary") || "" };
}

export function findProtocols(query, { repoRoot = CONFIG.repoRoot } = {}) {
  const candidates = new Map();
  const add = (relative, source, context = "") => {
    repositoryPath(repoRoot, relative);
    const existing = candidates.get(relative);
    if (existing) { existing.sources.add(source); existing.text += ` ${context}`; return; }
    const { bytes } = readRepositoryFile(repoRoot, relative);
    const meta = metadata(bytes.toString("utf8"));
    candidates.set(relative, { path: relative, ...meta, sources: new Set([source]), text: `${relative} ${meta.title} ${meta.summary} ${context}` });
  };
  const directory = path.join(repoRoot, CONFIG.protocolDir);
  if (fs.existsSync(directory)) {
    const files = fs.readdirSync(directory).filter((file) => file.endsWith(".md")).sort();
    if (files.length > 1024) throw new Error("protocol-discovery-budget");
    for (const file of files) add(`${CONFIG.protocolDir}/${file}`, "protocol");
  }
  for (const toc of ["AGENTS-TOC.md", "docs/TOC.md"]) {
    let text;
    try { text = readRepositoryFile(repoRoot, toc).bytes.toString("utf8"); }
    catch (error) { if (error.code === "ENOENT") continue; throw error; }
    for (const line of text.split(/\r?\n/)) {
      for (const match of line.matchAll(/`([^`\n]+\.md)`|\]\(([^)\s]+\.md)\)/g)) {
        const relative = match[1] || match[2];
        if (/^[a-z]+:\/\//i.test(relative)) continue;
        // Broken or non-repository TOC pointers are not authority or readable
        // matches. Canonical protocol read failures above remain fatal.
        try { add(relative, "toc", line); } catch { continue; }
        if (candidates.size > 1024) throw new Error("protocol-discovery-budget");
      }
    }
  }
  const terms = [...new Set(query.toLowerCase().match(/[a-z0-9]+/g) || [])];
  return [...candidates.values()].map((candidate) => ({
    path: candidate.path, title: candidate.title, status: candidate.status,
    source: [...candidate.sources].sort().join("+"),
    score: terms.reduce((sum, term) => sum + (candidate.text.toLowerCase().includes(term) ? 1 : 0) + (candidate.path.toLowerCase().includes(term) ? 2 : 0), 0)
  })).filter((candidate) => candidate.score > 0).sort((left, right) => right.score - left.score || (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
}

function search(argv, io) {
  const parsed = parseCliArgs(argv, { flags: { "--full": "boolean" }, minPositionals: 1, maxPositionals: 1 });
  if (!parsed.ok || !parsed.positionals[0].trim() || parsed.positionals[0].length > 256) {
    renderUsageError(io, { ...(parsed.ok ? { code: "invalid-query", message: "Supply one nonblank query of at most 256 characters" } : parsed), command: "protocols find", hints: [`Run ./${CONFIG.cliName} protocols find "prepare commit" [--full]`] });
    return 2;
  }
  try {
    const matches = findProtocols(parsed.positionals[0]);
    const rows = parsed.values["--full"] ? matches : matches.slice(0, 8);
    io.stdout(`count: ${matches.length}`);
    io.stdout(`truncated: ${rows.length < matches.length}`);
    io.stdout(`matches[${rows.length}]{path,title,status,source}:`);
    for (const row of rows) io.stdout(`  ${[row.path, row.title, row.status, row.source].map((value) => toonString(safeLine(value))).join(",")}`);
    if (!matches.length) io.stdout('message: "No matching protocols or TOC references"');
    io.stdout(renderHelpBlock(["Read the matched source document; discovery does not grant authority", `Run ./${CONFIG.cliName} protocols find "<query>" --full for every match`]));
    return 0;
  } catch {
    io.stdout('error: "protocol-discovery-input-invalid"');
    return 1;
  }
}

export async function listProtocols(argv, io) {
  if (argv[0] === "find") return search(argv.slice(1), io);
  if (rejectUnexpectedArgs(argv, io, { command: "protocols", hints: [`Run ./${CONFIG.cliName} protocols`] })) return 2;
  const dir = path.join(CONFIG.repoRoot, CONFIG.protocolDir);
  if (!fs.existsSync(dir)) {
    renderUsageError(io, {
      code: "missing-protocol-directory",
      command: "protocols",
      message: `Missing protocol directory: ${CONFIG.protocolDir}`,
      hints: [`Run ./${CONFIG.cliName} preflight`]
    });
    return 1;
  }

  const files = fs.readdirSync(dir).filter((file) => file.endsWith(".md")).sort();
  io.stdout(`count: ${files.length}`);
  if (!files.length) {
    io.stdout("protocols[0]{path,status}:");
    io.stdout("message: \"No protocol files found\"");
    io.stdout(renderHelpBlock([`Add protocol files under ${CONFIG.protocolDir}/`]));
    return 0;
  }
  io.stdout(`protocols[${files.length}]{path,status}:`);
  for (const file of files) {
    const filePath = path.join(dir, file);
    io.stdout(`  ${toonString(`${CONFIG.protocolDir}/${file}`)},${toonString(metadata(fs.readFileSync(filePath, "utf8")).status)}`);
  }
  io.stdout(renderHelpBlock([`Read AGENTS-TOC.md to choose the right protocol`]));
  return 0;
}
