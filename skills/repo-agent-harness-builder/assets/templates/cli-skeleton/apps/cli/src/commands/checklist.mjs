import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "../config.mjs";
import { rejectUnexpectedArgs } from "../util/agent-output.mjs";

const VALID_STATES = new Set(["active", "inactive", "not-applicable"]);

function extractRows(markdown) {
  const rows = [];
  for (const line of markdown.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) continue;
    if (/^\|[\s:-]+\|/.test(trimmed)) continue;
    const cells = trimmed.slice(1, -1).split("|").map((cell) => cell.trim());
    if (cells.length < 3 || !VALID_STATES.has(cells[1].replaceAll("`", ""))) continue;
    rows.push({
      module: cells[0].replaceAll("`", ""),
      state: cells[1].replaceAll("`", ""),
      evidence: cells.slice(2).join("|")
    });
  }
  return rows;
}

function backtickValues(text) {
  return [...text.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
}

function validateEvidenceToken(token) {
  if (token.startsWith("./")) {
    const executable = token.slice(2).split(/\s+/)[0];
    const executablePath = path.join(CONFIG.repoRoot, executable);
    return fs.existsSync(executablePath) ? [] : [`missing command facade: ${token}`];
  }

  if (/^[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)*\/?$/.test(token)) {
    const evidencePath = path.join(CONFIG.repoRoot, token);
    return fs.existsSync(evidencePath) ? [] : [`missing evidence path: ${token}`];
  }

  return [];
}

function protocolStatus(token) {
  const protocolPath = path.join(CONFIG.repoRoot, token);
  if (!token.startsWith(`${CONFIG.protocolDir}/`) || !fs.existsSync(protocolPath)) return null;
  const content = fs.readFileSync(protocolPath, "utf-8");
  const match = content.match(/^status:\s*([A-Za-z-]+)/m);
  return match ? match[1] : "unknown";
}

function validateChecklist(markdown) {
  const blockers = [];
  const warnings = [];

  for (const row of extractRows(markdown)) {
    const evidenceTokens = backtickValues(row.evidence);
    if (row.state === "active") {
      if (!row.evidence.trim()) {
        blockers.push(`${row.module}: active module has no evidence`);
        continue;
      }
      for (const token of evidenceTokens) {
        for (const error of validateEvidenceToken(token)) blockers.push(`${row.module}: ${error}`);
      }
    }
    if (row.state === "inactive" && evidenceTokens.length === 0 && !/^add\b/i.test(row.evidence.trim())) {
      warnings.push(`${row.module}: inactive module should name scaffolded evidence or an activation path`);
    }
    if (row.state === "inactive") {
      for (const token of evidenceTokens) {
        if (protocolStatus(token) === "active") {
          blockers.push(`${row.module}: inactive checklist row points to active protocol ${token}`);
        }
      }
    }
  }

  return { blockers, warnings };
}

export async function runChecklist(argv, io) {
  if (rejectUnexpectedArgs(argv, io, { command: "checklist", hints: [`Run ./${CONFIG.cliName} checklist`] })) return 2;
  const checklistPath = path.join(CONFIG.repoRoot, "ops", "HARNESS-CHECKLIST.md");
  if (!fs.existsSync(checklistPath)) {
    io.stderr("blocker: missing ops/HARNESS-CHECKLIST.md");
    return 1;
  }
  const checklist = fs.readFileSync(checklistPath, "utf-8");
  const { blockers, warnings } = validateChecklist(checklist);

  io.stdout("Harness checklist:");
  io.stdout("- ops/HARNESS-CHECKLIST.md");
  io.stdout("");
  io.stdout("Status model:");
  io.stdout("- active: implemented and configured now");
  io.stdout("- inactive: scaffolded but switched off until needed");
  io.stdout("- not-applicable: omitted because the context rules it out");
  io.stdout("");
  io.stdout("Default: scaffold plausible optional modules as inactive, not absent.");
  for (const warning of warnings) io.stdout(`warning: ${warning}`);
  for (const blocker of blockers) io.stderr(`blocker: ${blocker}`);
  return blockers.length ? 1 : 0;
}
