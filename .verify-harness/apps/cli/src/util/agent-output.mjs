import os from "node:os";
import path from "node:path";
import { CONFIG } from "../config.mjs";
import { redactSecrets } from "./secrets.mjs";

export function toonString(value) {
  return JSON.stringify(String(value));
}

export function displayPath(filePath) {
  const resolved = path.resolve(filePath);
  const home = path.resolve(os.homedir());
  const relative = path.relative(home, resolved);
  if (relative === "") return "~";
  if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
    return ["~", relative].join("/");
  }
  return resolved;
}

export function currentExecutablePath() {
  return displayPath(path.join(CONFIG.repoRoot, CONFIG.cliName));
}

export function renderHelpBlock(hints) {
  return [`help[${hints.length}]:`, ...hints.map((hint) => `  ${toonString(hint)}`)].join("\n");
}

export function safeText(value) {
  return redactSecrets(String(value));
}

export function safeLine(value) {
  return safeText(value).replace(/\r?\n/g, " ");
}

export function safeDetail(value) {
  const text = safeLine(value);
  if (/^--?[A-Za-z0-9][A-Za-z0-9._-]*(?:=.*)?$/.test(text)) {
    const [flag] = text.split("=", 1);
    return text.includes("=") ? `${flag}=<redacted>` : flag;
  }
  return "<redacted-argument>";
}

export function renderUsageError(io, { code, command, message, details = [], hints = [] }) {
  io.stdout("error:");
  io.stdout(`  code: ${safeLine(code)}`);
  if (command) io.stdout(`  command: ${toonString(safeLine(command))}`);
  io.stdout(`  message: ${toonString(safeLine(message))}`);
  for (const detail of details) io.stdout(`  detail: ${toonString(safeDetail(detail))}`);
  if (hints.length) io.stdout(renderHelpBlock(hints));
}

export function rejectUnexpectedArgs(argv, io, { command, allowedFlags = [], hints = [] }) {
  const allowed = new Set(["--help", "-h", ...allowedFlags]);
  const unexpected = argv.filter((arg) => !allowed.has(arg));
  if (unexpected.length === 0) return false;
  renderUsageError(io, {
    code: unexpected.some((arg) => arg.startsWith("-")) ? "unknown-flag" : "unexpected-argument",
    command,
    message: `Unexpected argument for ${command}`,
    details: unexpected,
    hints: hints.length ? hints : [`Run ./${CONFIG.cliName} help`]
  });
  return true;
}

export function truncateText(value, { limit = 1200 } = {}) {
  const text = safeText(value);
  if (text.length <= limit) {
    return { text, truncated: false, shown: text.length, total: text.length };
  }
  return {
    text: text.slice(0, limit),
    truncated: true,
    shown: limit,
    total: text.length
  };
}
