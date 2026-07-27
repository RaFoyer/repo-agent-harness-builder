import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { spawnSync } from "node:child_process";
import { devNull, tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  applyRepositoryRuntimeContext,
  repositoryProfileId,
  repositoryRuntimeContextLocation
} from "../src/repository-runtime-context.mjs";

const REPOSITORY = {{REPO_SLUG_JSON}};
const VALID_PUBLIC_KEY = generateKeyPairSync("ed25519").publicKey
  .export({ format: "der", type: "spki" })
  .toString("base64");
const CONFIG_MODULE_URL = pathToFileURL(path.join(process.cwd(), "apps/cli/src/config.mjs")).href;
const CLI_BIN_URL = pathToFileURL(path.join(process.cwd(), "apps/cli/bin/{{CLI_NAME}}.mjs")).href;

// Some assertions below describe Git-storage containment, which only exists
// when the harness is scaffolded inside a repository.
const IS_GIT_REPO = spawnSync("git", ["rev-parse", "--git-dir"], {
  cwd: process.cwd(),
  encoding: "utf8"
}).status === 0;
const GIT_ONLY = { skip: IS_GIT_REPO ? false : "requires a Git repository" };

function fixture() {
  const homeDir = mkdtempSync(path.join(tmpdir(), "{{CLI_NAME}}-runtime-context-"));
  const env = {};
  const { root, contextFile } = repositoryRuntimeContextLocation({ repoSlug: REPOSITORY, env, homeDir });
  const attestor = path.join(root, "codex-native-firstmate");
  mkdirSync(attestor, { recursive: true, mode: 0o700 });
  chmodSync(path.join(homeDir, ".config", "agent-orchestration"), 0o700);
  chmodSync(root, 0o700);
  chmodSync(attestor, 0o700);
  writeFileSync(path.join(attestor, "binding-key-id"), "{{CLI_NAME}}-ed25519-test\n", { mode: 0o600 });
  writeFileSync(path.join(attestor, "binding-public.spki.b64"), `${VALID_PUBLIC_KEY}\n`, { mode: 0o600 });
  writeFileSync(contextFile, `${JSON.stringify({
    schemaVersion: 1,
    repository: REPOSITORY,
    operator: "rafoyer",
    instance: "{{CLI_NAME}}",
    attestor: {
      keyIdFile: "codex-native-firstmate/binding-key-id",
      publicKeyFile: "codex-native-firstmate/binding-public.spki.b64"
    }
  })}\n`, { mode: 0o600 });
  return { homeDir, env, contextFile, attestor };
}

function liveRegistry(prefix, managerId, workRef) {
  const registry = JSON.parse(readFileSync(path.join(process.cwd(), "ops/orchestration.example.json"), "utf8"));
  registry.revision = 1;
  registry.status = "active";
  registry.prefix = prefix;
  registry.scope = {
    id: `${managerId}-scope`,
    kind: "repository",
    rootRef: "repository-root",
    ownerRef: "fixture-owner",
    objective: "Exercise repository-scoped runtime selection."
  };
  const authority = {
    allowedReads: ["project"],
    allowedWrites: [],
    allowedExternalActions: [],
    approvalGates: [],
    canDelegate: false,
    maxActiveChildren: 0,
    stopConditions: ["scope-unclear"]
  };
  registry.nodes = [
    {
      id: `${managerId}-boss`,
      role: "boss",
      parentBindingMode: "task",
      parentId: null,
      workRef: "portfolio",
      workKind: "governance",
      governingProtocols: ["AGENT-ORCHESTRATION"],
      requiredSkills: [],
      label: "Fixture boss",
      title: `${prefix} - Boss`,
      objective: "Own the fixture registry.",
      dependencies: [],
      state: "eligible",
      taskId: null,
      trustLevel: "T1",
      authority
    },
    {
      id: managerId,
      role: "manager",
      parentBindingMode: "logical",
      parentId: `${managerId}-boss`,
      parentTaskId: null,
      workRef,
      workKind: "engineering",
      governingProtocols: ["AGENT-ORCHESTRATION"],
      requiredSkills: [],
      label: "Fixture lane",
      title: `${prefix} - Manager - ${workRef} Fixture lane`,
      objective: "Report the selected fixture registry.",
      dependencies: [],
      state: "eligible",
      taskId: null,
      trustLevel: "T1",
      authority: { ...authority },
      completionProfile: { type: "artifact", requiredEvidence: ["fixture-evidence"] }
    }
  ];
  return registry;
}

function writePrivateRegistry(repoRoot, operator, instance, registry) {
  const storeRoot = path.join(repoRoot, ".git", "repo-agent-harness", "orchestration");
  const directory = path.join(storeRoot, "operators", operator, "instances");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  for (const target of [storeRoot, path.join(storeRoot, "operators"), path.join(storeRoot, "operators", operator), directory]) {
    chmodSync(target, 0o700);
  }
  writeFileSync(path.join(directory, `${instance}.json`), `${JSON.stringify(registry)}\n`, { mode: 0o600 });
}

function writeRuntimeContext(configHome, operator, instance) {
  const env = { XDG_CONFIG_HOME: configHome };
  const { root, contextFile } = repositoryRuntimeContextLocation({ repoSlug: REPOSITORY, env });
  const attestor = path.join(root, "codex-native-firstmate");
  mkdirSync(attestor, { recursive: true, mode: 0o700 });
  chmodSync(path.dirname(root), 0o700);
  chmodSync(root, 0o700);
  chmodSync(attestor, 0o700);
  writeFileSync(path.join(attestor, "binding-key-id"), "{{CLI_NAME}}-ed25519-test\n", { mode: 0o600 });
  writeFileSync(path.join(attestor, "binding-public.spki.b64"), `${VALID_PUBLIC_KEY}\n`, { mode: 0o600 });
  writeFileSync(contextFile, `${JSON.stringify({
    schemaVersion: 1,
    repository: REPOSITORY,
    operator,
    instance,
    attestor: {
      keyIdFile: "codex-native-firstmate/binding-key-id",
      publicKeyFile: "codex-native-firstmate/binding-public.spki.b64"
    }
  })}\n`, { mode: 0o600 });
}

function runFixtureCli(repoRoot, configHome, command) {
  const program = [
    'process.env.NODE_ENV = "test";',
    `const { setRepoRootForTests } = await import(${JSON.stringify(CONFIG_MODULE_URL)});`,
    `setRepoRootForTests(${JSON.stringify(repoRoot)});`,
    `Object.assign(process.env, ${JSON.stringify({
      XDG_CONFIG_HOME: configHome,
      REPO_ORCHESTRATION_OPERATOR: "foreign",
      REPO_ORCHESTRATION_INSTANCE: "registry",
      ORCHESTRATION_BINDING_KEY_ID: "foreign",
      ORCHESTRATION_BINDING_PUBLIC_KEY: "Rk9SRUlHTg=="
    })});`,
    `process.argv = [process.execPath, "{{CLI_NAME}}", "orchestration", ${JSON.stringify(command)}];`,
    `await import(${JSON.stringify(CLI_BIN_URL)});`
  ].join("\n");
  return spawnSync(process.execPath, ["--input-type=module", "--eval", program], {
    cwd: repoRoot,
    env: { ...process.env },
    encoding: "utf8"
  });
}

test("repository profile identity is collision resistant", () => {
  assert.match(repositoryProfileId(REPOSITORY), /^[a-z0-9][a-z0-9-]*--[0-9a-f]{12}$/);
  assert.notEqual(repositoryProfileId(`${REPOSITORY}.variant`), repositoryProfileId(REPOSITORY));
});

test("repository context replaces inherited cross-repository orchestration state", () => {
  const setup = fixture();
  Object.assign(setup.env, {
    REPO_ORCHESTRATION_OPERATOR: "foreign",
    REPO_ORCHESTRATION_INSTANCE: "foreign",
    ORCHESTRATION_BINDING_KEY_ID: "foreign",
    ORCHESTRATION_BINDING_PUBLIC_KEY: "Rk9SRUlHTg=="
  });
  const result = applyRepositoryRuntimeContext({
    repoSlug: REPOSITORY,
    env: setup.env,
    homeDir: setup.homeDir,
    expectedUid: null
  });
  assert.deepEqual(result, { status: "loaded", operator: "rafoyer", instance: "{{CLI_NAME}}" });
  assert.equal(setup.env.REPO_ORCHESTRATION_OPERATOR, "rafoyer");
  assert.equal(setup.env.REPO_ORCHESTRATION_INSTANCE, "{{CLI_NAME}}");
  assert.equal(setup.env.ORCHESTRATION_BINDING_KEY_ID, "{{CLI_NAME}}-ed25519-test");
  assert.equal(setup.env.ORCHESTRATION_BINDING_PUBLIC_KEY, VALID_PUBLIC_KEY);
});

test("missing context leaves the environment untouched", () => {
  const homeDir = mkdtempSync(path.join(tmpdir(), "{{CLI_NAME}}-runtime-context-empty-"));
  const env = { REPO_ORCHESTRATION_OPERATOR: "explicit" };
  assert.deepEqual(applyRepositoryRuntimeContext({
    repoSlug: REPOSITORY,
    env,
    homeDir,
    expectedUid: null
  }), { status: "absent" });
  assert.equal(env.REPO_ORCHESTRATION_OPERATOR, "explicit");
});

test("context rejects relative and repository-contained configuration roots", () => {
  const setup = fixture();
  assert.throws(() => applyRepositoryRuntimeContext({
    repoSlug: REPOSITORY,
    env: { ...setup.env, XDG_CONFIG_HOME: "." },
    homeDir: setup.homeDir,
    expectedUid: null
  }), /must be absolute/);

  // Containment is exercised against an isolated repository so the test never
  // writes inside the harness tree that sibling tests copy.
  const repoRoot = mkdtempSync(path.join(tmpdir(), "{{CLI_NAME}}-contained-repo-"));
  spawnSync("git", ["init", "--quiet", repoRoot], { encoding: "utf8" });
  const commonDir = spawnSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
    cwd: repoRoot,
    encoding: "utf8"
  }).stdout.trim();
  const containedRoots = [path.join(repoRoot, ".runtime-context")];
  if (commonDir) containedRoots.push(path.join(commonDir, "runtime-context"));
  // A repository-contained configuration root is rejected only once it actually
  // declares a context; an absent context is inert and must not fail the CLI.
  for (const configHome of containedRoots) {
    const env = { XDG_CONFIG_HOME: configHome };
    assert.deepEqual(
      applyRepositoryRuntimeContext({ repoSlug: REPOSITORY, env, repoRoot, expectedUid: null }),
      { status: "absent" }
    );

    const { root, contextFile } = repositoryRuntimeContextLocation({ repoSlug: REPOSITORY, env });
    mkdirSync(root, { recursive: true, mode: 0o700 });
    writeFileSync(contextFile, "{}\n", { mode: 0o600 });
    assert.throws(() => applyRepositoryRuntimeContext({
      repoSlug: REPOSITORY,
      env,
      repoRoot,
      expectedUid: null
    }), /outside repository storage/);
  }
  rmSync(repoRoot, { recursive: true, force: true });
});

test("context sanitizes every inherited Git topology override before resolving storage", GIT_ONLY, () => {
  const setup = fixture();
  const repoRoot = process.cwd();
  const commonDir = spawnSync("git", ["rev-parse", "--git-common-dir"], {
    cwd: repoRoot,
    encoding: "utf8"
  }).stdout.trim();
  const overrides = {
    GIT_DIR: "redirected",
    GIT_WORK_TREE: "redirected",
    GIT_COMMON_DIR: "redirected",
    GIT_OBJECT_DIRECTORY: "redirected",
    GIT_ALTERNATE_OBJECT_DIRECTORIES: "redirected",
    GIT_INDEX_FILE: "redirected",
    GIT_CEILING_DIRECTORIES: "redirected",
    GIT_DISCOVERY_ACROSS_FILESYSTEM: "redirected",
    GIT_CONFIG: "redirected",
    GIT_CONFIG_GLOBAL: "redirected",
    GIT_CONFIG_SYSTEM: "redirected",
    GIT_CONFIG_NOSYSTEM: "redirected",
    GIT_CONFIG_PARAMETERS: "redirected",
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "core.worktree",
    GIT_CONFIG_VALUE_0: "redirected"
  };
  let gitEnvironment;
  const result = applyRepositoryRuntimeContext({
    repoSlug: REPOSITORY,
    env: { ...setup.env, ...overrides },
    homeDir: setup.homeDir,
    repoRoot,
    expectedUid: null,
    spawnImpl: (_command, _args, options) => {
      gitEnvironment = options.env;
      return { status: 0, stdout: `${repoRoot}\n${commonDir}\n` };
    }
  });
  assert.equal(result.status, "loaded");
  for (const name of Object.keys(overrides)) {
    if (name === "GIT_CONFIG_NOSYSTEM" || name === "GIT_CONFIG_GLOBAL") continue;
    assert.equal(gitEnvironment[name], undefined, name);
  }
  assert.equal(gitEnvironment.GIT_CONFIG_NOSYSTEM, "1");
  assert.equal(gitEnvironment.GIT_CONFIG_GLOBAL, devNull);
});

test("context rejects dangling context links instead of treating them as absent", () => {
  const setup = fixture();
  unlinkSync(setup.contextFile);
  symlinkSync(path.join(setup.homeDir, "missing-runtime-context.json"), setup.contextFile);
  assert.throws(() => applyRepositoryRuntimeContext({
    repoSlug: REPOSITORY,
    env: setup.env,
    homeDir: setup.homeDir,
    expectedUid: null
  }), /regular single-link/);
});

test("CLI provides filesystem remediation when runtime context validation fails", () => {
  const result = spawnSync(process.execPath, ["apps/cli/bin/{{CLI_NAME}}.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, XDG_CONFIG_HOME: "." },
    encoding: "utf8"
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unset XDG_CONFIG_HOME or set it to an absolute directory/);
  assert.doesNotMatch(result.stderr, /\.\/{{CLI_NAME}} context/);
});

test("CLI provides Git-storage remediation when Git resolution fails", () => {
  // Git storage is only required once a context is actually declared, so the
  // fixture must publish one before Git resolution can be the failing step.
  const configHome = mkdtempSync(path.join(tmpdir(), "{{CLI_NAME}}-git-storage-"));
  const { root, contextFile } = repositoryRuntimeContextLocation({
    repoSlug: REPOSITORY,
    env: { XDG_CONFIG_HOME: configHome }
  });
  mkdirSync(root, { recursive: true, mode: 0o700 });
  writeFileSync(contextFile, "{}\n", { mode: 0o600 });
  const result = spawnSync(process.execPath, ["apps/cli/bin/{{CLI_NAME}}.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, XDG_CONFIG_HOME: configHome, PATH: "" },
    encoding: "utf8"
  });
  rmSync(configHome, { recursive: true, force: true });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Verify Git can resolve this worktree's common directory/);
  assert.doesNotMatch(result.stderr, /XDG_CONFIG_HOME\/agent-orchestration/);
});

test("context rejects malformed public keys before replacing inherited values", () => {
  const setup = fixture();
  writeFileSync(path.join(setup.attestor, "binding-public.spki.b64"), "QUJDRA==\n", { mode: 0o600 });
  Object.assign(setup.env, {
    REPO_ORCHESTRATION_OPERATOR: "foreign",
    REPO_ORCHESTRATION_INSTANCE: "foreign",
    ORCHESTRATION_BINDING_KEY_ID: "foreign",
    ORCHESTRATION_BINDING_PUBLIC_KEY: "Rk9SRUlHTg=="
  });
  assert.throws(() => applyRepositoryRuntimeContext({
    repoSlug: REPOSITORY,
    env: setup.env,
    homeDir: setup.homeDir,
    expectedUid: null
  }), /attestor metadata/);
  assert.equal(setup.env.REPO_ORCHESTRATION_OPERATOR, "foreign");
  assert.equal(setup.env.ORCHESTRATION_BINDING_PUBLIC_KEY, "Rk9SRUlHTg==");
});

test("CLI report and reconcile select the repository runtime registry", (context) => {
  const fixtureRoot = mkdtempSync(path.join(process.cwd(), ".runtime-context-cli-"));
  context.after(() => rmSync(fixtureRoot, { recursive: true, force: true }));
  const repoRoot = path.join(fixtureRoot, "repo");
  const configHome = path.join(fixtureRoot, "config");
  mkdirSync(repoRoot, { recursive: true });
  spawnSync("git", ["init", "--quiet"], { cwd: repoRoot, encoding: "utf8" });
  writePrivateRegistry(repoRoot, "tfs", "registry", liveRegistry("TFS Registry", "tfs-manager", "tfs-work"));
  writePrivateRegistry(repoRoot, "foreign", "registry", liveRegistry("Foreign Registry", "foreign-manager", "foreign-work"));
  writeRuntimeContext(configHome, "tfs", "registry");

  for (const command of ["report", "reconcile"]) {
    const result = runFixtureCli(repoRoot, configHome, command);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /registry: "local:tfs\/registry"/);
    assert.match(result.stdout, /tfs-manager/);
    assert.doesNotMatch(result.stdout, /foreign-manager|Foreign Registry/);
  }
});

test("context rejects repository mismatch, unsafe modes, and symlinked attestor files", () => {
  const mismatched = fixture();
  const parsed = JSON.parse(readFileSync(mismatched.contextFile, "utf8"));
  parsed.repository = "RaFoyer/Other";
  writeFileSync(mismatched.contextFile, `${JSON.stringify(parsed)}\n`, { mode: 0o600 });
  assert.throws(() => applyRepositoryRuntimeContext({
    repoSlug: REPOSITORY,
    env: mismatched.env,
    homeDir: mismatched.homeDir,
    expectedUid: null
  }), /does not match/);

  const permissive = fixture();
  chmodSync(permissive.contextFile, 0o644);
  assert.throws(() => applyRepositoryRuntimeContext({
    repoSlug: REPOSITORY,
    env: permissive.env,
    homeDir: permissive.homeDir,
    expectedUid: null
  }), /0600/);

  const linked = fixture();
  const target = path.join(linked.attestor, "public-target");
  writeFileSync(target, `${VALID_PUBLIC_KEY}\n`, { mode: 0o600 });
  const publicKey = path.join(linked.attestor, "binding-public.spki.b64");
  unlinkSync(publicKey);
  symlinkSync(target, publicKey);
  assert.throws(() => applyRepositoryRuntimeContext({
    repoSlug: REPOSITORY,
    env: linked.env,
    homeDir: linked.homeDir,
    expectedUid: null
  }), /regular single-link/);
});
