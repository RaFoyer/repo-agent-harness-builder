import { createHash, createPublicKey } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CONFIG } from "./config.mjs";
import { gitTopologyEnvironment } from "./util/git-environment.mjs";

const SAFE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const SAFE_RELATIVE_FILE_RE = /^[A-Za-z0-9._/-]+$/;
const CONTEXT_FILE = "runtime-context.json";
const CONFIG_ROOT_INVALID = "repository-runtime-context-config-root-invalid";
const GIT_STORAGE_UNAVAILABLE = "repository-runtime-context-git-storage-unavailable";

function mode(stat) {
  return stat.mode & 0o777;
}

function runtimeContextError(reason, message) {
  const error = new Error(message);
  error.reason = reason;
  return error;
}

function isPathWithin(candidate, parent) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function resolvedPath(target, fsImpl) {
  const resolved = path.resolve(target);
  try {
    return fsImpl.realpathSync(resolved);
  } catch (error) {
    if (error?.code === "ENOENT") return resolved;
    throw new Error("cannot resolve repository runtime context location");
  }
}

function repositoryStorageRoots({ repoRoot, env, fsImpl, spawnImpl }) {
  let root;
  try {
    root = resolvedPath(repoRoot, fsImpl);
  } catch {
    throw runtimeContextError(GIT_STORAGE_UNAVAILABLE, "cannot resolve repository Git storage");
  }
  const result = spawnImpl("git", ["-C", root, "rev-parse", "--show-toplevel", "--git-common-dir"], {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    env: gitTopologyEnvironment(env)
  });
  if (result.status !== 0) {
    // A target that is simply not a Git repository has no separate Git storage
    // to escape, so the repository root alone bounds the configuration root.
    // Any other failure means containment cannot be verified: fail closed.
    if (/not a git repository/i.test(String(result.stderr ?? ""))) return [root];
    throw runtimeContextError(GIT_STORAGE_UNAVAILABLE, "cannot resolve repository Git storage");
  }
  const [topLevel, commonDir] = result.stdout.trim().split(/\r?\n/);
  try {
    if (!topLevel || !commonDir || resolvedPath(topLevel, fsImpl) !== root) {
      throw new Error("unresolved Git storage");
    }
    return [root, resolvedPath(path.resolve(root, commonDir), fsImpl)];
  } catch {
    throw runtimeContextError(GIT_STORAGE_UNAVAILABLE, "cannot resolve repository Git storage");
  }
}

function assertExternalConfigHome(configHome, storageRoots, fsImpl) {
  if (!path.isAbsolute(configHome)) {
    throw runtimeContextError(CONFIG_ROOT_INVALID, "repository runtime context configuration root must be absolute");
  }
  let resolvedConfigHome;
  try {
    resolvedConfigHome = resolvedPath(configHome, fsImpl);
  } catch {
    throw runtimeContextError(CONFIG_ROOT_INVALID, "cannot resolve repository runtime context configuration root");
  }
  if (storageRoots.some((storageRoot) => isPathWithin(resolvedConfigHome, storageRoot))) {
    throw runtimeContextError(CONFIG_ROOT_INVALID, "repository runtime context configuration root must be outside repository storage");
  }
  return resolvedConfigHome;
}

function contextFileStat(target, fsImpl) {
  try {
    return fsImpl.lstatSync(target);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw new Error("cannot inspect repository runtime context");
  }
}

function assertEd25519PublicKey(publicKey) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(publicKey)) {
    throw new Error("repository runtime context attestor metadata is invalid");
  }
  let key;
  try {
    key = createPublicKey({ key: Buffer.from(publicKey, "base64"), format: "der", type: "spki" });
  } catch {
    throw new Error("repository runtime context attestor metadata is invalid");
  }
  if (key.asymmetricKeyType !== "ed25519") {
    throw new Error("repository runtime context attestor metadata is invalid");
  }
}

function repositoryProfileId(repoSlug) {
  const readable = repoSlug.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const digest = createHash("sha256").update(repoSlug).digest("hex").slice(0, 12);
  return `${readable}--${digest}`;
}

function assertPrivateDirectory(target, fsImpl, expectedUid) {
  const stat = fsImpl.lstatSync(target);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("repository runtime context directory is unsafe");
  if (mode(stat) !== 0o700) throw new Error("repository runtime context directories must use 0700 permissions");
  if (expectedUid !== null && stat.uid !== expectedUid) throw new Error("repository runtime context must be owned by the current user");
}

function assertPrivateFile(target, fsImpl, expectedUid) {
  const stat = fsImpl.lstatSync(target);
  if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1) {
    throw new Error("repository runtime context files must be regular single-link files");
  }
  if (mode(stat) !== 0o600) throw new Error("repository runtime context files must use 0600 permissions");
  if (expectedUid !== null && stat.uid !== expectedUid) throw new Error("repository runtime context must be owned by the current user");
}

function resolveContextFile(root, relativeFile, fsImpl, expectedUid) {
  if (!SAFE_RELATIVE_FILE_RE.test(relativeFile || "") || path.isAbsolute(relativeFile) || relativeFile.includes("..")) {
    throw new Error("repository runtime context contains an unsafe file reference");
  }
  const target = path.resolve(root, relativeFile);
  if (!target.startsWith(`${root}${path.sep}`)) throw new Error("repository runtime context file escapes its repository boundary");

  let current = root;
  for (const component of path.relative(root, path.dirname(target)).split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    assertPrivateDirectory(current, fsImpl, expectedUid);
  }
  assertPrivateFile(target, fsImpl, expectedUid);
  return target;
}

export function repositoryRuntimeContextLocation({
  repoSlug,
  env = process.env,
  homeDir = os.homedir()
}) {
  const configHome = env.XDG_CONFIG_HOME || path.join(homeDir, ".config");
  const root = path.join(configHome, "agent-orchestration", repositoryProfileId(repoSlug));
  return { configHome, root, contextFile: path.join(root, CONTEXT_FILE) };
}

export function applyRepositoryRuntimeContext({
  repoSlug,
  env = process.env,
  fsImpl = fs,
  homeDir = os.homedir(),
  repoRoot = CONFIG.repoRoot,
  spawnImpl = spawnSync,
  expectedUid = typeof process.getuid === "function" ? process.getuid() : null
}) {
  const location = repositoryRuntimeContextLocation({ repoSlug, env, homeDir });
  if (!path.isAbsolute(location.configHome)) {
    throw runtimeContextError(CONFIG_ROOT_INVALID, "repository runtime context configuration root must be absolute");
  }
  // No context declared for this repository means nothing to isolate. Resolve
  // that before requiring Git storage so harnesses scaffolded outside a
  // repository still run; every path that actually loads a context below is
  // fully validated.
  if (!contextFileStat(location.contextFile, fsImpl)) return { status: "absent" };
  const configHome = assertExternalConfigHome(
    location.configHome,
    repositoryStorageRoots({ repoRoot, env, fsImpl, spawnImpl }),
    fsImpl
  );
  const root = path.join(configHome, "agent-orchestration", repositoryProfileId(repoSlug));
  const contextFile = path.join(root, CONTEXT_FILE);
  if (!contextFileStat(contextFile, fsImpl)) return { status: "absent" };

  assertPrivateDirectory(path.dirname(root), fsImpl, expectedUid);
  assertPrivateDirectory(root, fsImpl, expectedUid);
  assertPrivateFile(contextFile, fsImpl, expectedUid);

  let context;
  try {
    context = JSON.parse(fsImpl.readFileSync(contextFile, "utf8"));
  } catch {
    throw new Error("repository runtime context is not valid JSON");
  }
  if (context?.schemaVersion !== 1 || context.repository !== repoSlug) {
    throw new Error("repository runtime context does not match this repository");
  }
  if (!SAFE_NAME_RE.test(context.operator || "") || !SAFE_NAME_RE.test(context.instance || "")) {
    throw new Error("repository runtime context has invalid orchestration selectors");
  }
  if (!context.attestor || typeof context.attestor !== "object") {
    throw new Error("repository runtime context has no attestor references");
  }

  const keyIdFile = resolveContextFile(root, context.attestor.keyIdFile, fsImpl, expectedUid);
  const publicKeyFile = resolveContextFile(root, context.attestor.publicKeyFile, fsImpl, expectedUid);
  const keyId = fsImpl.readFileSync(keyIdFile, "utf8").trim();
  const publicKey = fsImpl.readFileSync(publicKeyFile, "utf8").trim();
  if (!SAFE_NAME_RE.test(keyId)) {
    throw new Error("repository runtime context attestor metadata is invalid");
  }
  assertEd25519PublicKey(publicKey);

  env.REPO_ORCHESTRATION_OPERATOR = context.operator;
  env.REPO_ORCHESTRATION_INSTANCE = context.instance;
  env.ORCHESTRATION_BINDING_KEY_ID = keyId;
  env.ORCHESTRATION_BINDING_PUBLIC_KEY = publicKey;
  return { status: "loaded", operator: context.operator, instance: context.instance };
}

export function repositoryRuntimeContextFailureHint(error) {
  if (error?.reason === CONFIG_ROOT_INVALID) {
    return "Unset XDG_CONFIG_HOME or set it to an absolute directory outside this repository's Git storage, then rerun ./{{CLI_NAME}}.";
  }
  if (error?.reason === GIT_STORAGE_UNAVAILABLE) {
    return "Verify Git can resolve this worktree's common directory, then rerun ./{{CLI_NAME}}.";
  }
  return "Repair or remove the repository-private runtime context in the agent-orchestration directory under $XDG_CONFIG_HOME, or under the default user config directory when that variable is unset, then rerun ./{{CLI_NAME}}.";
}

export { repositoryProfileId };
