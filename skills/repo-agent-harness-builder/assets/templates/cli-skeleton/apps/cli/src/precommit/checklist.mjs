import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { CONFIG } from "../config.mjs";
import { hasFlag } from "../util/args.mjs";
import { findSecretIndicators } from "../util/secrets.mjs";

const LOCAL_PATH_RE = /(\/Users\/[^\s)'"]+|\/home\/[^\s)'"]+|\/private\/var\/[^\s)'"]+|\/tmp\/[^\s)'"]+|\/var\/folders\/[^\s)'"]+|\/Volumes\/[^/\s)'"]+\/[^\s)'"]+|[A-Za-z]:\\Users\\[^\r\n)'"]+|~\/[^\s)'"]+)/;
const HARD_SENSITIVE_FILE_RE = /(^|\/)(\.env(\..*)?|\.netrc|_netrc|\.pypirc|\.pgpass|\.htpasswd|credentials|id_rsa|id_ed25519|.*private.*key.*|.*\.(pem|key|p12|pfx|jks|jceks|bcfks|keystore|ppk|kdbx|gpg|pgp|pkcs12|p8))$/i;
const REVIEW_SENSITIVE_FILE_RE = /(^|\/)(\.npmrc|.*\.(asc|der|crt|cer))$/i;
const WALK_SKIP_DIRS = new Set([".git", "node_modules", "dist", "coverage", ".next", "outputs"]);
const MAX_TEXT_FILE_BYTES = 1_000_000;
const ALLOWLIST_PATH = "ops/precommit-allow.txt";
const HOOK_MARKER = "repo-agent-harness precommit hook";

function runGitPathList(args) {
  const result = spawnSync("git", ["-c", "core.quotePath=false", ...args], {
    cwd: CONFIG.repoRoot,
    encoding: "buffer",
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (result.status !== 0) return null;
  return result.stdout.toString("utf-8").split("\0").filter(Boolean);
}

function isInsideGitWorkTree() {
  const result = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
    cwd: CONFIG.repoRoot,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  return result.status === 0 && result.stdout.trim() === "true";
}

function gitText(args) {
  const result = spawnSync("git", args, {
    cwd: CONFIG.repoRoot,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (result.status !== 0) return null;
  return result.stdout.trim();
}

function loadAllowlist() {
  const allowlistPath = path.join(CONFIG.repoRoot, ALLOWLIST_PATH);
  if (!fs.existsSync(allowlistPath)) return new Set();
  const entries = fs.readFileSync(allowlistPath, "utf-8")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  return new Set(entries);
}

function precommitHookPath() {
  if (!isInsideGitWorkTree()) return null;
  const hookPath = gitText(["rev-parse", "--git-path", "hooks/pre-commit"]);
  if (!hookPath) return null;
  return path.isAbsolute(hookPath) ? hookPath : path.join(CONFIG.repoRoot, hookPath);
}

export function isPrecommitHookInstalled() {
  const hookPath = precommitHookPath();
  if (!hookPath || !fs.existsSync(hookPath)) return false;
  return fs.readFileSync(hookPath, "utf-8").includes(HOOK_MARKER);
}

function installHook(io) {
  const hookPath = precommitHookPath();
  if (!hookPath) {
    io.stderr("blocker: Cannot install precommit hook outside a git worktree.");
    return 1;
  }

  if (fs.existsSync(hookPath)) {
    const existing = fs.readFileSync(hookPath, "utf-8");
    if (!existing.includes(HOOK_MARKER)) {
      io.stderr("blocker: Existing pre-commit hook is not managed by this harness. Merge it manually, then rerun install-hook.");
      return 1;
    }
  }

  fs.mkdirSync(path.dirname(hookPath), { recursive: true });
  fs.writeFileSync(hookPath, `#!/usr/bin/env sh
# ${HOOK_MARKER}
cd "$(git rev-parse --show-toplevel)" || exit 1
exec "./${CONFIG.cliName}" precommit
`, "utf-8");
  fs.chmodSync(hookPath, 0o755);
  io.stdout(`Installed harness precommit hook: ${path.relative(CONFIG.repoRoot, hookPath)}`);
  return 0;
}

function walkFiles(dir = CONFIG.repoRoot, prefix = "") {
  const rows = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".DS_Store") continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!WALK_SKIP_DIRS.has(entry.name)) rows.push(...walkFiles(full, rel));
      continue;
    }
    if (entry.isFile() || entry.isSymbolicLink()) rows.push(rel);
  }
  return rows;
}

function changedFiles(all) {
  const insideGit = isInsideGitWorkTree();
  if (all) {
    const tracked = runGitPathList(["ls-files", "-z"]);
    const untracked = runGitPathList(["ls-files", "--others", "--exclude-standard", "-z"]);
    if (tracked === null || untracked === null) {
      if (insideGit) return { files: [], source: "git-error", error: "git ls-files failed" };
      return { files: walkFiles(), source: "filesystem" };
    }
    const files = [
      ...tracked,
      ...untracked
    ];
    return { files: [...new Set(files)], source: "worktree" };
  }
  const staged = runGitPathList(["diff", "--cached", "--name-only", "-z"]);
  if (staged === null) {
    if (insideGit) return { files: [], source: "git-error", error: "git diff --cached failed" };
    return { files: walkFiles(), source: "filesystem" };
  }
  if (staged.length) return { files: staged, source: "staged" };
  const modified = runGitPathList(["diff", "--name-only", "-z"]);
  const untracked = runGitPathList(["ls-files", "--others", "--exclude-standard", "-z"]);
  if (modified === null || untracked === null) return { files: [], source: "git-error", error: "git worktree enumeration failed" };
  return { files: [...new Set([...modified, ...untracked])], source: "worktree" };
}

function decodeUtf32(buffer, bigEndian) {
  const chars = [];
  for (let offset = 4; offset + 3 < buffer.length; offset += 4) {
    const codePoint = bigEndian ? buffer.readUInt32BE(offset) : buffer.readUInt32LE(offset);
    if (codePoint > 0x10ffff) return null;
    chars.push(String.fromCodePoint(codePoint));
  }
  return chars.join("");
}

function bufferScan(buffer) {
  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xfe && buffer[2] === 0x00 && buffer[3] === 0x00) {
    return { text: decodeUtf32(buffer, false), binary: false };
  }
  if (buffer.length >= 4 && buffer[0] === 0x00 && buffer[1] === 0x00 && buffer[2] === 0xfe && buffer[3] === 0xff) {
    return { text: decodeUtf32(buffer, true), binary: false };
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return { text: buffer.toString("utf16le"), binary: false };
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    const body = Buffer.from(buffer.subarray(2));
    if (body.length % 2 !== 0) return { text: null, binary: true };
    body.swap16();
    return { text: body.toString("utf16le"), binary: false };
  }
  if (buffer.includes(0)) return { text: null, binary: true };
  return { text: buffer.toString("utf-8"), binary: false };
}

function readWorktreeScan(fullPath) {
  return bufferScan(fs.readFileSync(fullPath));
}

function readStagedScan(file) {
  const result = spawnSync("git", ["show", `:${file}`], {
    cwd: CONFIG.repoRoot,
    encoding: "buffer",
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (result.status !== 0) return null;
  return bufferScan(result.stdout);
}

function stagedBlobSize(file) {
  const result = spawnSync("git", ["cat-file", "-s", `:${file}`], {
    cwd: CONFIG.repoRoot,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (result.status !== 0) return null;
  const size = Number.parseInt(result.stdout.trim(), 10);
  return Number.isFinite(size) ? size : null;
}

function isStagedSymlink(file) {
  const result = spawnSync("git", ["ls-files", "-s", "--", file], {
    cwd: CONFIG.repoRoot,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (result.status !== 0) return false;
  return result.stdout.split(/\r?\n/u).some((line) => line.startsWith("120000 "));
}

export async function runPrecommit(argv, io) {
  if (argv[0] === "install-hook") return installHook(io);
  if (argv[0] === "hook-status") {
    io.stdout(isPrecommitHookInstalled() ? "precommit hook: installed" : "precommit hook: not installed");
    return 0;
  }

  const all = hasFlag(argv, "--all");
  const { files, source, error } = changedFiles(all);
  const blockers = [];
  const warnings = [];
  const allowlist = loadAllowlist();

  if (source === "git-error") {
    blockers.push(`${error}. Precommit cannot safely inspect the index; repair git state and rerun.`);
  }

  for (const file of files) {
    const fullPath = path.join(CONFIG.repoRoot, file);
    if (file.includes("\uFFFD")) {
      blockers.push(`Path contains undecodable bytes and must be reviewed manually: ${file}`);
      continue;
    }
    const allowlisted = allowlist.has(file);
    if (HARD_SENSITIVE_FILE_RE.test(file) && !allowlisted) {
      blockers.push(`Sensitive filename requires an explicit ${ALLOWLIST_PATH} exception before commit: ${file}`);
    } else if (HARD_SENSITIVE_FILE_RE.test(file)) {
      warnings.push(`Allowlisted sensitive filename still requires human review: ${file}`);
    } else if (REVIEW_SENSITIVE_FILE_RE.test(file) && !allowlisted) {
      warnings.push(`Sensitive-looking filename should be reviewed or listed in ${ALLOWLIST_PATH}: ${file}`);
    }
    if (source === "worktree" || source === "filesystem") {
      let stat;
      try {
        stat = fs.lstatSync(fullPath);
      } catch {
        continue;
      }
      if (stat.isSymbolicLink()) {
        if (allowlisted) {
          warnings.push(`Allowlisted symlink was not followed or content-scanned: ${file}`);
        } else {
          blockers.push(`Symlink requires explicit ${ALLOWLIST_PATH} exception before commit: ${file}`);
        }
        continue;
      }
      if (!stat.isFile()) continue;
      if (stat.size > MAX_TEXT_FILE_BYTES) {
        blockers.push(`Large file requires explicit review before commit because content was not scanned: ${file}`);
        continue;
      }
    }
    if (source === "staged") {
      if (isStagedSymlink(file)) {
        if (allowlisted) {
          warnings.push(`Allowlisted staged symlink was not followed or content-scanned: ${file}`);
        } else {
          blockers.push(`Staged symlink requires explicit ${ALLOWLIST_PATH} exception before commit: ${file}`);
        }
        continue;
      }
      const size = stagedBlobSize(file);
      if (size !== null && size > MAX_TEXT_FILE_BYTES) {
        blockers.push(`Large staged file requires explicit review before commit because content was not scanned: ${file}`);
        continue;
      }
    }
    const scanned = source === "staged" ? readStagedScan(file) : readWorktreeScan(fullPath);
    if (scanned === null) continue;
    if (scanned.binary || scanned.text === null) {
      if (allowlisted) {
        warnings.push(`Allowlisted binary or unsupported encoded file was not content-scanned: ${file}`);
      } else {
        blockers.push(`Binary or unsupported encoded file requires explicit ${ALLOWLIST_PATH} exception before commit: ${file}`);
      }
      continue;
    }
    const content = scanned.text;

    const secretFindings = findSecretIndicators(content, { source: file });
    for (const finding of secretFindings) blockers.push(`Possible secret content: ${finding}`);
    if (LOCAL_PATH_RE.test(content)) blockers.push(`Machine-local path found: ${file}`);
    if (file.startsWith(CONFIG.protocolDir) && !content.startsWith("---")) {
      blockers.push(`Protocol missing front matter: ${file}`);
    }
  }

  if (files.some((file) => file === "AGENTS.md" || file.startsWith(CONFIG.protocolDir))) {
    warnings.push("Root/protocol docs changed. Confirm AGENTS-TOC.md and CLI help still route correctly.");
  }

  for (const warning of warnings) io.stdout(`warning: ${warning}`);
  for (const blocker of blockers) io.stderr(`blocker: ${blocker}`);

  if (blockers.length) return 1;
  io.stdout(`Precommit checks passed for ${files.length} file(s).`);
  return 0;
}
