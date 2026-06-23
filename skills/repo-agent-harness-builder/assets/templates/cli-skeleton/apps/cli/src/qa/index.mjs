import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "../config.mjs";

const PLAYWRIGHT_CONFIGS = [
  "playwright.config.ts",
  "playwright.config.js",
  "playwright.config.mjs",
  "testing/e2e/playwright.config.ts",
  "testing/e2e/playwright.config.js"
];

const QA_ARTIFACT_DIRS = [
  "test-results",
  "playwright-report",
  "qa-artifacts",
  "tests/e2e/__screenshots__",
  "testing/e2e/artifacts",
  "testing/e2e/output/playwright"
];

const COMMON_SOURCE_DIRS = [
  "tests/e2e",
  "testing/e2e",
  "e2e",
  "playwright/tests",
  "tests/playwright",
  "cypress/e2e",
  "cypress/integration"
];

const DISCOVERY_ROOTS = ["apps", "packages", "src", "tests", "testing", "playwright", "cypress"];
const SOURCE_EXTENSIONS = new Set([".js", ".cjs", ".mjs", ".ts", ".tsx", ".jsx"]);
const EXCLUDED_PARTS = new Set([
  ".git",
  "node_modules",
  "artifacts",
  "output",
  "playwright-report",
  "test-results",
  ".auth",
  ".cache",
  ".preflight",
  "__screenshots__"
]);

const MASKING_PATTERNS = [
  { label: "page.route", pattern: /\bpage\.route\s*\(/ },
  { label: "context.route", pattern: /\b(?:context|browserContext)\.route\s*\(/ },
  { label: "route.fulfill", pattern: /\broute\.fulfill\s*\(/ },
  { label: "route.abort", pattern: /\broute\.abort\s*\(/ },
  { label: "routeFromHAR", pattern: /\brouteFromHAR\s*\(/ },
  { label: "HAR replay", pattern: /\bhar\s*replay|\bfromHAR\b/i },
  { label: "cy.intercept", pattern: /\bcy\.intercept\s*\(/ },
  { label: "MSW handler", pattern: /\bsetupServer\s*\(|\b(?:http|rest)\.(?:get|post|put|patch|delete|all|options|head)\s*\(/ },
  { label: "fetch mock", pattern: /\bfetchMock\b|\bmockFetch\b|\bjest\.spyOn\s*\([^)]*fetch/ }
];

function rel(filePath) {
  return path.relative(CONFIG.repoRoot, filePath).split(path.sep).join("/");
}

function readPackageScripts() {
  const packagePath = path.join(CONFIG.repoRoot, "package.json");
  if (!fs.existsSync(packagePath)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(packagePath, "utf-8"));
    return parsed.scripts && typeof parsed.scripts === "object" ? parsed.scripts : {};
  } catch {
    return {};
  }
}

function findPlaywrightConfigs() {
  return PLAYWRIGHT_CONFIGS.filter((candidate) => fs.existsSync(path.join(CONFIG.repoRoot, candidate)));
}

function e2eScripts() {
  const scripts = readPackageScripts();
  return Object.entries(scripts)
    .filter(([name, command]) => /e2e|playwright|cypress|storybook/i.test(`${name} ${command}`))
    .sort(([left], [right]) => left.localeCompare(right));
}

function addSourceRoot(roots, candidate) {
  const cleaned = String(candidate || "")
    .replace(/^['"`]+|['"`]+$/g, "")
    .replace(/[),;]+$/g, "");
  if (!cleaned || cleaned.startsWith("-") || /^[A-Za-z]+:\/\//.test(cleaned)) return;

  const wildcardIndex = cleaned.search(/[*[{]/);
  const withoutGlob = wildcardIndex >= 0 ? cleaned.slice(0, wildcardIndex) : cleaned;
  const normalized = withoutGlob.replace(/\\/g, "/").replace(/\/+$/, "");
  if (!normalized || normalized === ".") return;

  const fullPath = path.resolve(CONFIG.repoRoot, normalized);
  if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
    roots.add(rel(path.dirname(fullPath)));
    return;
  }
  roots.add(path.relative(CONFIG.repoRoot, fullPath).split(path.sep).join("/"));
}

function rootsFromPlaywrightConfigs() {
  const roots = new Set();
  for (const config of findPlaywrightConfigs()) {
    const configPath = path.join(CONFIG.repoRoot, config);
    const configDir = path.dirname(configPath);
    let content = "";
    try {
      content = fs.readFileSync(configPath, "utf-8");
    } catch {
      continue;
    }
    const testDirRe = /\btestDir\s*:\s*["'`]([^"'`]+)["'`]/g;
    for (const match of content.matchAll(testDirRe)) {
      roots.add(path.relative(CONFIG.repoRoot, path.resolve(configDir, match[1])).split(path.sep).join("/"));
    }
  }
  return roots;
}

function rootsFromScripts() {
  const roots = new Set();
  for (const [, command] of e2eScripts()) {
    for (const token of String(command).split(/\s+/)) {
      if (!/(e2e|playwright|cypress|\.spec\.|\.test\.)/i.test(token)) continue;
      addSourceRoot(roots, token);
    }
  }
  return roots;
}

function discoverBrowserTestRoots() {
  const roots = new Set();

  function walk(dirPath, depth = 0) {
    if (!fs.existsSync(dirPath) || shouldSkipDir(dirPath) || depth > 5) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch {
      return;
    }

    const relParts = rel(dirPath).split("/");
    const base = relParts.at(-1);
    if (
      base === "e2e" ||
      (relParts.includes("playwright") && base === "tests") ||
      (relParts.includes("cypress") && ["e2e", "integration"].includes(base))
    ) {
      roots.add(rel(dirPath));
    }

    for (const entry of entries) {
      if (entry.isDirectory()) walk(path.join(dirPath, entry.name), depth + 1);
    }
  }

  for (const root of DISCOVERY_ROOTS) walk(path.join(CONFIG.repoRoot, root));
  return roots;
}

function sourceRoots() {
  return [
    ...new Set([
      ...COMMON_SOURCE_DIRS,
      ...rootsFromPlaywrightConfigs(),
      ...rootsFromScripts(),
      ...discoverBrowserTestRoots()
    ])
  ].filter(Boolean);
}

function help(io) {
  io.stdout("QA commands are read-only unless a repo-specific protocol says otherwise.");
  io.stdout("Available commands:");
  io.stdout("  qa help          Show this help");
  io.stdout("  qa status        Detect Playwright configs and browser/e2e scripts");
  io.stdout("  qa plan          Print deterministic/live browser QA guidance");
  io.stdout("  qa artifacts     List common browser QA artifact locations");
  io.stdout("  qa no-masking    Detect route mocking/bypass patterns in deterministic E2E tests");
}

function status(io) {
  const configs = findPlaywrightConfigs();
  if (configs.length) {
    for (const config of configs) io.stdout(`Playwright config: ${config}`);
  } else {
    io.stdout("Playwright config: not found");
  }

  const scripts = e2eScripts();
  if (scripts.length) {
    io.stdout("Browser/e2e scripts:");
    for (const [name, command] of scripts) io.stdout(`- ${name}: ${command}`);
  } else {
    io.stdout("Browser/e2e scripts: none detected");
  }

  io.stdout("Protocol: ops/protocols/QA-BROWSER.md if present");
  return 0;
}

function plan(io) {
  io.stdout("Browser QA plan:");
  io.stdout("1. Use deterministic E2E for user-facing flows that can run with mocked or seeded data.");
  io.stdout("2. Keep mocked and live lanes separate; live lanes need explicit credentials, scope, and approval.");
  io.stdout("3. Check dev-server readiness and port hygiene before opening a browser.");
  io.stdout("4. Treat storage state, cookies, screenshots, videos, traces, HARs, console logs, DOM snapshots, and downloads as reviewable artifacts with retention and redaction rules.");
  io.stdout("5. Use Storybook/component QA and advisory browser reconnaissance as separate lanes from deterministic E2E.");
  io.stdout("6. Run qa no-masking before treating deterministic E2E as acceptance evidence.");
  return 0;
}

function artifacts(io) {
  io.stdout("Common browser QA artifact locations:");
  for (const candidate of QA_ARTIFACT_DIRS) {
    const fullPath = path.join(CONFIG.repoRoot, candidate);
    io.stdout(`- ${candidate}: ${fs.existsSync(fullPath) ? "present" : "not found"}`);
  }
  io.stdout("Review artifacts for secrets, private data, account identifiers, cookies, storage state, and local paths before sharing.");
  return 0;
}

function shouldSkipDir(dirPath) {
  return rel(dirPath).split("/").some((part) => EXCLUDED_PARTS.has(part));
}

function walkSourceFiles(dirPath, files = []) {
  if (!fs.existsSync(dirPath) || shouldSkipDir(dirPath)) return files;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walkSourceFiles(fullPath, files);
    } else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

function noMasking(io) {
  const files = [];
  for (const sourceDir of sourceRoots()) {
    walkSourceFiles(path.join(CONFIG.repoRoot, sourceDir), files);
  }

  if (!files.length && (findPlaywrightConfigs().length || e2eScripts().length)) {
    io.stderr("blocker: browser test commands or Playwright config were detected, but no browser test source files were inspected.");
    io.stderr("Add a detectable source path, configure Playwright testDir, or document the mocked/advisory lane before relying on no-masking evidence.");
    return 1;
  }

  const blockers = [];
  for (const filePath of files) {
    const content = fs.readFileSync(filePath, "utf-8");
    for (const { label, pattern } of MASKING_PATTERNS) {
      if (pattern.test(content)) blockers.push(`${rel(filePath)} uses ${label}`);
    }
  }

  for (const blocker of blockers) io.stderr(`blocker: ${blocker}`);
  if (blockers.length) {
    io.stderr("Deterministic E2E lanes should not mask network behavior unless a repo protocol explicitly marks the test as mocked/advisory.");
    return 1;
  }
  if (!files.length) {
    io.stdout("No browser test source paths detected.");
    return 0;
  }
  io.stdout("No deterministic E2E masking patterns found in detected browser test source paths.");
  return 0;
}

export async function runQa(argv, io) {
  const subcommand = argv[0] || "help";
  if (subcommand === "help") {
    help(io);
    return 0;
  }
  if (subcommand === "status") return status(io);
  if (subcommand === "plan") return plan(io);
  if (subcommand === "artifacts") return artifacts(io);
  if (subcommand === "no-masking") return noMasking(io);
  io.stderr(`Unknown qa command: ${subcommand}`);
  return 2;
}
