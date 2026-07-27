import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { CONFIG } from "../config.mjs";
import { readOption } from "../util/args.mjs";
import { rejectUnexpectedArgs, renderHelpBlock, renderUsageError, safeLine, toonString } from "../util/agent-output.mjs";
import { findSecretIndicators } from "../util/secrets.mjs";

const SAFE_CREDENTIAL_REF_RE = /^(env:[A-Z][A-Z0-9_]*|keychain:[A-Za-z0-9._/@:-]+|vault:[A-Za-z0-9._/@:-]+|op:\/\/[A-Za-z0-9._/@:-]+|secret-manager:[A-Za-z0-9._/@:-]+|gcp-sm:[A-Za-z0-9._/@:-]+|aws-secretsmanager:[A-Za-z0-9._/@:-]+)$/;
const WRITE_OPERATIONS_RE = /^(write|send|modify|delete|admin|share|upload|publish)$/i;
const WRITE_SCOPE_RE = /(gmail\.send|mail\.send|readwrite|write|modify|delete|share|admin|manage|upload|publish|full[_-]?access|full[_-]?control|drive\.file|auth\/drive$|files\.readwrite|sites\.readwrite|mail\.readwrite)/i;
const READ_ONLY_SCOPE_RE = /(readonly|read\.only|(^|[./:_-])read($|[./:_-])|\.read\.all($|[./:_-]))/i;
const DOCTOR_VALUE_OPTIONS = new Set(["--profile", "--mode", "--account", "--email", "--credential-root"]);
const AUTH_PLAN_VALUE_OPTIONS = new Set(["--profile", "--browser", "--flow"]);
const ENV_VALUE_OPTIONS = new Set(["--profile"]);
const CONFIG_ROOT_STRATEGIES = new Set(["env", "flag", "unsupported"]);
const AUTH_FLOW_TYPES = new Set(["browser", "localhost-callback", "device-code", "copied-code", "api-key", "noninteractive"]);
const PROFILE_BOUNDARIES = new Set(["repository", "worktree", "unsupported"]);
const GLOBAL_STATE_POLICIES = new Set(["refuse-global-mutable-state", "isolated-config-root-required", "unsupported-global-session"]);
const SAFE_PROVIDER_SUBDIR_RE = /^[a-z][a-z0-9._-]{0,63}$/;
const SAFE_ENV_RE = /^[A-Z][A-Z0-9_]{0,63}$/;
const SAFE_FLAG_RE = /^--[a-z][a-z0-9-]{0,63}$/;
const SAFE_EXECUTABLE_RE = /^[A-Za-z][A-Za-z0-9._-]{0,63}$/;
const SAFE_PROFILE_ID_RE = /^[a-z][a-z0-9-]{0,63}$/;

function loadRegistry() {
  const registryPath = path.join(CONFIG.repoRoot, "ops", "connections.json");
  if (!fs.existsSync(registryPath)) {
    return { ok: false, error: "missing ops/connections.json" };
  }
  try {
    return { ok: true, registry: JSON.parse(fs.readFileSync(registryPath, "utf-8")) };
  } catch (error) {
    return { ok: false, error: `invalid ops/connections.json: ${error.message}` };
  }
}

function endpointSummary(value) {
  const text = safeLine(value);
  if (!text) return "not configured";
  return "configured";
}

function rejectUnknownDoctorArgs(argv, io) {
  const unexpected = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const option = arg.includes("=") ? arg.slice(0, arg.indexOf("=")) : arg;
    if (DOCTOR_VALUE_OPTIONS.has(option)) {
      if (!arg.includes("=")) {
        const next = argv[index + 1];
        if (next === undefined || next.startsWith("--")) unexpected.push(`${arg} requires a value`);
        else index += 1;
      }
      continue;
    }
    unexpected.push(arg);
  }

  if (unexpected.length === 0) return false;
  renderUsageError(io, {
    code: unexpected.some((arg) => String(arg).startsWith("-")) ? "unknown-flag" : "unexpected-argument",
    command: "connections doctor",
    message: "Unexpected argument for connections doctor",
    details: unexpected,
    hints: [`Run ./${CONFIG.cliName} connections doctor --profile <profile-id>`]
  });
  return true;
}

function rejectUnknownValueArgs(argv, allowedOptions, io, command) {
  const unexpected = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const option = arg.includes("=") ? arg.slice(0, arg.indexOf("=")) : arg;
    if (allowedOptions.has(option)) {
      if (!arg.includes("=")) {
        const next = argv[index + 1];
        if (next === undefined || next.startsWith("--")) unexpected.push(`${arg} requires a value`);
        else index += 1;
      }
      continue;
    }
    unexpected.push(arg);
  }

  if (unexpected.length === 0) return false;
  renderUsageError(io, {
    code: unexpected.some((arg) => String(arg).startsWith("-")) ? "unknown-flag" : "unexpected-argument",
    command,
    message: `Unexpected argument for ${command}`,
    details: unexpected,
    hints: [`Run ./${CONFIG.cliName} connections help`]
  });
  return true;
}

function pathInsideRepo(candidatePath) {
  const resolved = path.resolve(candidatePath);
  const repoRoot = path.resolve(CONFIG.repoRoot);
  return resolved === repoRoot || resolved.startsWith(`${repoRoot}${path.sep}`);
}

function writeCapableScope(scope) {
  const value = String(scope || "");
  const lower = value.toLowerCase();
  if (WRITE_SCOPE_RE.test(value)) return true;
  return !READ_ONLY_SCOPE_RE.test(lower);
}

function connectorProfiles(registry) {
  return Array.isArray(registry.connectorProfiles) ? registry.connectorProfiles : [];
}

function authConfig(profile) {
  if (profile.cliAuth && typeof profile.cliAuth === "object") return profile.cliAuth;
  if (profile.authProfile && typeof profile.authProfile === "object") return profile.authProfile;
  return null;
}

function safeProviderSubdir(profile, auth = authConfig(profile)) {
  const configured = auth?.configRoot?.providerSubdir || auth?.configRoot?.subdir || profile.provider || profile.id || "provider";
  return String(configured).toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "provider";
}

function repoProfileId() {
  const source = String(CONFIG.repoSlug || CONFIG.projectName || "repository");
  const slug = source.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "repository";
  const hash = crypto.createHash("sha256").update(source).digest("hex").slice(0, 12);
  return `${slug}--${hash}`;
}

function connectorRootExpression(profile) {
  return `\${XDG_CONFIG_HOME:-$HOME/.config}/agent-connectors/${repoProfileId()}/${safeProviderSubdir(profile)}/${profile.id}`;
}

function commandList(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.trim()) : [];
}

function validateCliAuth(profile, id) {
  const blockers = [];
  const warnings = [];
  const auth = authConfig(profile);
  if (!auth) {
    warnings.push(`${id} has no cliAuth profile isolation metadata`);
    return { blockers, warnings };
  }

  if (auth.status === "unsupported") warnings.push(`${id} connector auth profile is unsupported`);
  if (auth.profileBoundary && !PROFILE_BOUNDARIES.has(auth.profileBoundary)) {
    blockers.push(`${id} cliAuth.profileBoundary must be repository, worktree, or unsupported`);
  }
  if (auth.globalStatePolicy && !GLOBAL_STATE_POLICIES.has(auth.globalStatePolicy)) {
    blockers.push(`${id} cliAuth.globalStatePolicy must be refuse-global-mutable-state, isolated-config-root-required, or unsupported-global-session`);
  }
  if (auth.profileBoundary === "unsupported" || auth.globalStatePolicy === "unsupported-global-session") {
    warnings.push(`${id} reports a global mutable session limitation`);
  }

  const configRoot = auth.configRoot || {};
  const strategy = configRoot.strategy;
  if (!strategy) blockers.push(`${id} cliAuth.configRoot.strategy is required`);
  else if (!CONFIG_ROOT_STRATEGIES.has(strategy)) blockers.push(`${id} unknown config root strategy ${strategy}`);

  const configuredSubdir = auth?.configRoot?.providerSubdir || auth?.configRoot?.subdir;
  const providerSubdir = safeProviderSubdir(profile, auth);
  if (configuredSubdir && !SAFE_PROVIDER_SUBDIR_RE.test(String(configuredSubdir))) {
    blockers.push(`${id} cliAuth.configRoot.providerSubdir must be a safe relative name`);
  } else if (!SAFE_PROVIDER_SUBDIR_RE.test(providerSubdir)) {
    blockers.push(`${id} cliAuth.configRoot.providerSubdir must be a safe relative name`);
  }

  if (strategy === "env") {
    if (!SAFE_ENV_RE.test(String(configRoot.env || ""))) blockers.push(`${id} env config root strategy requires a safe env name`);
  } else if (strategy === "flag") {
    if (!SAFE_FLAG_RE.test(String(configRoot.flag || ""))) blockers.push(`${id} flag config root strategy requires a safe flag name`);
    if (!SAFE_EXECUTABLE_RE.test(String(configRoot.executable || profile.provider || ""))) blockers.push(`${id} flag config root strategy requires a safe executable name`);
  } else if (strategy === "unsupported") {
    warnings.push(`${id} does not support repository-scoped config roots`);
  }

  const flowTypes = Array.isArray(auth.authFlowTypes) ? auth.authFlowTypes : [];
  for (const flow of flowTypes) {
    if (!AUTH_FLOW_TYPES.has(flow)) blockers.push(`${id} unsupported auth flow type ${flow}`);
  }
  if (!flowTypes.length && strategy !== "unsupported") warnings.push(`${id} has no authFlowTypes metadata`);

  for (const command of commandList(auth.identityCheckCommands)) {
    for (const finding of findSecretIndicators(command, { source: id })) blockers.push(`${finding}. Keep identity check commands value-safe.`);
  }

  return { blockers, warnings };
}

const SCOPE_FIELDS = new Set(["readOnlyScopes", "approvalGatedWriteScopes", "writeScopes", "scopes", "oauthScopes", "requiredScopes", "scopeRefs"]);
const WRITE_SCOPE_FIELDS = new Set(["approvalGatedWriteScopes", "writeScopes", "scopes", "oauthScopes", "requiredScopes", "scopeRefs"]);

function scopeValues(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return [value];
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(scopeValues);
  }
  return [];
}

function writeApprovalRequired(profile) {
  return profile.writeApproval && typeof profile.writeApproval === "object" && profile.writeApproval.required === true;
}

function profileScopeValidation(profile, id) {
  const blockers = [];
  const writeScopes = [];

  for (const [key, value] of Object.entries(profile)) {
    if (!/scope/i.test(key)) continue;
    if (!SCOPE_FIELDS.has(key)) {
      blockers.push(`${id} has unrecognized scope field ${key}; use readOnlyScopes, approvalGatedWriteScopes, writeScopes, scopes, oauthScopes, requiredScopes, or scopeRefs`);
      continue;
    }

    const values = scopeValues(value);
    if (key === "readOnlyScopes") {
      const unsafeReadOnly = values.filter(writeCapableScope);
      for (const scope of unsafeReadOnly) blockers.push(`${id} readOnlyScopes contains write-capable scope ${scope}`);
      continue;
    }
    if (WRITE_SCOPE_FIELDS.has(key)) writeScopes.push(...values.filter(writeCapableScope));
  }

  return { blockers, writeScopes };
}

function validateConnectorProfiles(registry) {
  const blockers = [];
  const warnings = [];
  for (const profile of connectorProfiles(registry)) {
    const id = profile.id || "(unknown)";
    const storageClass = profile.authStorageClass || profile.credentialStorage;
    if (!profile.id) blockers.push("connector profile missing id");
    else if (!SAFE_PROFILE_ID_RE.test(profile.id)) blockers.push(`${id} connector profile id must be a safe lowercase slug`);
    if (!profile.provider) blockers.push(`${id} missing provider`);
    if (!storageClass) blockers.push(`${id} missing authStorageClass`);
    if (profile.status === "not-configured" || profile.status === "inactive") warnings.push(`${id} connector profile is ${profile.status}`);
    const profileScopes = profileScopeValidation(profile, id);
    blockers.push(...profileScopes.blockers);
    const writeScopes = profileScopes.writeScopes;
    if (writeScopes.length && !writeApprovalRequired(profile)) {
      blockers.push(`${id} write-capable connector scopes require writeApproval.required=true metadata`);
    }
    const authValidation = validateCliAuth(profile, id);
    blockers.push(...authValidation.blockers);
    warnings.push(...authValidation.warnings);
    for (const finding of findSecretIndicators(JSON.stringify(profile), { source: id })) {
      blockers.push(`${finding}. Store credential values outside connector profile metadata.`);
    }
  }
  return { blockers, warnings };
}

function validateRegistry(registry) {
  const blockers = [];
  const warnings = [];
  if (registry.version !== 1) blockers.push("connections registry version must be 1");
  if (!Array.isArray(registry.connections)) blockers.push("connections must be an array");
  for (const connection of registry.connections || []) {
    if (!connection.id) blockers.push("connection missing id");
    if (!connection.provider) blockers.push(`${connection.id || "(unknown)"} missing provider`);
    if (!connection.authorityClass) blockers.push(`${connection.id || "(unknown)"} missing authorityClass`);
    if (connection.status === "not-configured") warnings.push(`${connection.id} is not configured`);
    if (connection.status === "configured") {
      for (const field of ["allowedOperations", "credentialRefs", "scopeRefs", "revocation", "owner"]) {
        if (connection[field] === undefined || connection[field] === "" || (Array.isArray(connection[field]) && connection[field].length === 0)) {
          blockers.push(`${connection.id || "(unknown)"} configured connection missing ${field}`);
        }
      }
    }
    if (connection.credentialRefs !== undefined) {
      if (!Array.isArray(connection.credentialRefs)) {
        blockers.push(`${connection.id || "(unknown)"} credentialRefs must be an array of safe references`);
      } else {
        for (const ref of connection.credentialRefs) {
          if (typeof ref !== "string" || !SAFE_CREDENTIAL_REF_RE.test(ref)) {
            blockers.push(`${connection.id || "(unknown)"} credentialRef must use a safe reference format such as env:NAME, keychain:item, vault:path, or op://vault/item`);
          }
        }
      }
    }
    const writeOps = (connection.allowedOperations || []).filter((op) => WRITE_OPERATIONS_RE.test(String(op)));
    const writeScopes = (connection.scopeRefs || []).filter(writeCapableScope);
    if ((writeOps.length || writeScopes.length) && !connection.writeApproval) {
      blockers.push(`${connection.id || "(unknown)"} write-capable operations or scopes require writeApproval metadata`);
    }
    const secretFindings = findSecretIndicators(JSON.stringify(connection), { source: connection.id || "(unknown)" });
    for (const finding of secretFindings) {
      blockers.push(`${finding}. Store credential values outside ops/connections.json and keep only value-safe refs.`);
    }
  }
  const profileValidation = validateConnectorProfiles(registry);
  blockers.push(...profileValidation.blockers);
  warnings.push(...profileValidation.warnings);
  return { blockers, warnings };
}

function help(io) {
  io.stdout("Connection commands are value-safe.");
  io.stdout("Available commands:");
  io.stdout("  connections help      Show this help");
  io.stdout("  connections status    Validate ops/connections.json");
  io.stdout("  connections list      List registered external authorities");
  io.stdout("  connections plan      Print setup checklist and connector profile inventory");
  io.stdout("  connections doctor    Check a connector profile without printing secrets");
  io.stdout("  connections auth-plan Print repository-scoped auth plan for a connector profile");
  io.stdout("  connections env       Print value-safe env or flag guidance for a connector profile");
}

function status(io) {
  const loaded = loadRegistry();
  if (!loaded.ok) {
    io.stderr(`blocker: ${loaded.error}`);
    return 1;
  }
  const { blockers, warnings } = validateRegistry(loaded.registry);
  for (const warning of warnings) io.stdout(`warning: ${warning}`);
  for (const blocker of blockers) io.stderr(`blocker: ${blocker}`);
  io.stdout(`connections: ${(loaded.registry.connections || []).length}`);
  if (blockers.length) return 1;
  io.stdout("Connection registry is readable. Verify live access with the provider-specific tool before using external content.");
  return 0;
}

function list(io) {
  const loaded = loadRegistry();
  if (!loaded.ok) {
    io.stderr(`blocker: ${loaded.error}`);
    return 1;
  }
  const connections = loaded.registry.connections || [];
  io.stdout(`count: ${connections.length}`);
  io.stdout(`connections[${connections.length}]{id,provider,authority_class,status}:`);
  for (const connection of connections) {
    io.stdout(`  ${toonString(connection.id || "unknown")},${toonString(connection.provider || "unknown")},${toonString(connection.authorityClass || "unknown")},${toonString(connection.status || "unknown")}`);
  }
  if (!connections.length) {
    io.stdout("empty: no registered external authorities");
  }
  io.stdout(renderHelpBlock([`Run ./${CONFIG.cliName} connections plan to see setup guidance`]));
  return 0;
}

function plan(io) {
  io.stdout("Permanent connection setup checklist:");
  io.stdout("1. Identify the external authority and required role boundary.");
  io.stdout("2. Choose least-privilege read scopes first.");
  io.stdout("3. Store credentials outside the repository.");
  io.stdout("4. Add value-safe metadata to ops/connections.json.");
  io.stdout("5. Run ./verify-harness connections status.");
  io.stdout("6. For browser or CLI login, run ./verify-harness connections auth-plan --profile <profile-id>.");
  io.stdout("7. Put provider config-root selection in repo wrappers, not global shell startup files.");
  io.stdout("8. Add repo-safe pointers instead of copying privileged content.");
  io.stdout("9. Document revoke, rotation, and owner contact.");
  io.stdout("");
  io.stdout("Connector profile inventory (does not require live auth):");
  const loaded = loadRegistry();
  if (!loaded.ok) {
    io.stdout(`- unavailable: ${loaded.error}`);
    return 0;
  }
  const profiles = connectorProfiles(loaded.registry);
  if (!profiles.length) {
    io.stdout("- no connector profiles registered");
    return 0;
  }
  for (const profile of profiles) {
    io.stdout(`- ${profile.id} (${profile.provider}; ${profile.status || "unknown"})`);
    const servers = profile.serverNames || {};
    for (const [service, name] of Object.entries(servers)) io.stdout(`  server ${safeLine(service)}: ${safeLine(name)}`);
    const endpoints = profile.remoteConnectorUrls || profile.remoteMcpUrls || {};
    for (const [service, endpoint] of Object.entries(endpoints)) io.stdout(`  endpoint ${safeLine(service)}: ${endpointSummary(endpoint)}`);
    if (profile.expectedAccountDomain) io.stdout("  expected account domain: configured");
    const storageClass = profile.authStorageClass || profile.credentialStorage;
    if (storageClass) io.stdout(`  credential storage: ${safeLine(storageClass)}`);
    const auth = authConfig(profile);
    if (auth) {
      io.stdout(`  auth profile boundary: ${safeLine(auth.profileBoundary || "unknown")}`);
      const strategy = auth.configRoot?.strategy || "unknown";
      io.stdout(`  config root strategy: ${safeLine(strategy)}`);
    }
  }
  return 0;
}

function findProfile(registry, id) {
  return connectorProfiles(registry).find((profile) => profile.id === id);
}

function checkDomain(profile, account, blockers, warnings) {
  if (!profile.expectedAccountDomain) return;
  if (!account) {
    warnings.push(`${profile.id} has expected account domain metadata; no live account was supplied.`);
    return;
  }
  if (!String(account).toLowerCase().endsWith(`@${String(profile.expectedAccountDomain).toLowerCase()}`)) {
    blockers.push(`${profile.id} supplied account is outside expected domain`);
  }
}

function checkLocalPaths(profile, argv, blockers, warnings) {
  const authRootPath = readOption(argv, "--credential-root", profile.credentialRootRef || profile.credentialRoot || "");
  if (!authRootPath) {
    warnings.push(`${profile.id} has no credential root metadata; verify storage outside the repository before local auth.`);
    return;
  }
  if (/^(env:|keychain:|vault:|op:\/\/|secret-manager:|gcp-sm:|aws-secretsmanager:)/.test(authRootPath)) {
    warnings.push(`${profile.id} credential root is an external reference; resolve it outside the repository before local auth.`);
    return;
  }
  if (pathInsideRepo(authRootPath)) {
    blockers.push(`${profile.id} credential root must be outside the repository`);
  } else {
    warnings.push(`${profile.id} credential root is outside repo or not present locally`);
  }
}

function doctor(argv, io) {
  if (rejectUnknownDoctorArgs(argv, io)) return 2;
  const loaded = loadRegistry();
  if (!loaded.ok) {
    io.stderr(`blocker: ${loaded.error}`);
    return 1;
  }
  const profileId = readOption(argv, "--profile");
  if (!profileId) {
    renderUsageError(io, {
      code: "missing-profile",
      command: "connections doctor",
      message: "Missing connector profile id",
      hints: [`Run ./${CONFIG.cliName} connections doctor --profile <profile-id>`]
    });
    return 2;
  }
  const profile = findProfile(loaded.registry, profileId);
  if (!profile) {
    io.stderr("blocker: unknown connector profile supplied");
    return 1;
  }

  const mode = readOption(argv, "--mode", profile.mode || profile.connectorMode || "remote");
  const account = readOption(argv, "--account", readOption(argv, "--email", ""));
  const blockers = [];
  const warnings = [];
  checkDomain(profile, account, blockers, warnings);

  io.stdout(`Connector profile doctor: ${profile.id}`);
  io.stdout(`provider: ${profile.provider}`);
  io.stdout(`mode: ${mode}`);

  if (mode === "remote") {
    io.stdout("remote connector mode: local token files are not inspected; verify token persistence through the client auth/status surface after restart.");
  } else if (mode === "local") {
    checkLocalPaths(profile, argv, blockers, warnings);
  } else {
    blockers.push(`${profile.id} unknown connector mode: ${mode}`);
  }

  for (const warning of warnings) io.stdout(`warning: ${warning}`);
  for (const blocker of blockers) io.stderr(`blocker: ${blocker}`);
  if (blockers.length) return 1;
  io.stdout("Connector profile doctor completed with value-safe checks only.");
  return 0;
}

function loadProfileForCommand(argv, io, command) {
  const loaded = loadRegistry();
  if (!loaded.ok) {
    io.stderr(`blocker: ${loaded.error}`);
    return { ok: false, code: 1 };
  }
  const profileId = readOption(argv, "--profile");
  if (!profileId) {
    renderUsageError(io, {
      code: "missing-profile",
      command,
      message: "Missing connector profile id",
      hints: [`Run ./${CONFIG.cliName} ${command} --profile <profile-id>`]
    });
    return { ok: false, code: 2 };
  }
  const profile = findProfile(loaded.registry, profileId);
  if (!profile) {
    io.stderr("blocker: unknown connector profile supplied");
    return { ok: false, code: 1 };
  }
  return { ok: true, profile };
}

function authPlan(argv, io) {
  if (rejectUnknownValueArgs(argv, AUTH_PLAN_VALUE_OPTIONS, io, "connections auth-plan")) return 2;
  const loaded = loadProfileForCommand(argv, io, "connections auth-plan");
  if (!loaded.ok) return loaded.code;
  const { profile } = loaded;
  const auth = authConfig(profile);
  if (!auth) {
    io.stderr("blocker: connector profile has no cliAuth profile isolation metadata");
    return 1;
  }

  const validation = validateCliAuth(profile, profile.id);
  const requestedFlow = readOption(argv, "--flow", "");
  const flowTypes = Array.isArray(auth.authFlowTypes) ? auth.authFlowTypes : [];
  if (requestedFlow && !flowTypes.includes(requestedFlow)) {
    validation.blockers.push(`${profile.id} requested auth flow is not listed for this connector profile`);
  }

  io.stdout(`Connector auth plan: ${safeLine(profile.id)}`);
  io.stdout(`provider: ${safeLine(profile.provider || "unknown")}`);
  io.stdout(`repo_id: ${safeLine(repoProfileId())}`);
  io.stdout(`profile_boundary: ${safeLine(auth.profileBoundary || "unknown")}`);
  io.stdout(`global_state_policy: ${safeLine(auth.globalStatePolicy || "unknown")}`);
  io.stdout(`config_root_strategy: ${safeLine(auth.configRoot?.strategy || "unknown")}`);
  io.stdout("config_root: computed outside repository");
  io.stdout(`expected_account_label: ${(profile.expectedAccountLabelRef || profile.expectedAccountDomain || profile.accountRef) ? "configured" : "not configured"}`);
  io.stdout(`auth_flow_types: ${flowTypes.length ? flowTypes.map(safeLine).join(",") : "not configured"}`);
  const browser = readOption(argv, "--browser", "");
  io.stdout(`selected_browser: ${browser ? toonString(safeLine(browser)) : "not provided"}`);
  io.stdout(`identity_checks: ${commandList(auth.identityCheckCommands).length ? "configured" : "not configured"}`);
  io.stdout("starts_auth: false");
  io.stdout("opens_browser: false");
  io.stdout("prints_authorization_values: false");
  io.stdout("postconditions:");
  io.stdout("  - start one fresh provider auth process only after human approval");
  io.stdout("  - route the one-time authorization handoff through the selected browser or documented flow");
  io.stdout("  - verify completion with the original process exit status and read-only identity checks");
  io.stdout("  - remove stale attempt artifacts after proving the originating process is gone");

  for (const warning of validation.warnings) io.stdout(`warning: ${warning}`);
  for (const blocker of validation.blockers) io.stderr(`blocker: ${blocker}`);
  return validation.blockers.length ? 1 : 0;
}

function envPlan(argv, io) {
  if (rejectUnknownValueArgs(argv, ENV_VALUE_OPTIONS, io, "connections env")) return 2;
  const loaded = loadProfileForCommand(argv, io, "connections env");
  if (!loaded.ok) return loaded.code;
  const { profile } = loaded;
  const auth = authConfig(profile);
  if (!auth) {
    io.stderr("blocker: connector profile has no cliAuth profile isolation metadata");
    return 1;
  }

  const validation = validateCliAuth(profile, profile.id);
  for (const warning of validation.warnings) io.stdout(`warning: ${warning}`);
  for (const blocker of validation.blockers) io.stderr(`blocker: ${blocker}`);
  if (validation.blockers.length) return 1;

  const strategy = auth.configRoot?.strategy;
  const root = connectorRootExpression(profile);
  io.stdout(`Connector auth environment: ${safeLine(profile.id)}`);
  io.stdout(`provider: ${safeLine(profile.provider || "unknown")}`);
  io.stdout(`repo_id: ${safeLine(repoProfileId())}`);
  io.stdout("config_root: computed outside repository");
  if (strategy === "env") {
    const envName = auth.configRoot.env;
    io.stdout(`strategy: env`);
    io.stdout(`env: ${safeLine(envName)}`);
    io.stdout("shell[1]:");
    io.stdout(`  ${toonString(`export ${envName}="${root}"`)}`);
    io.stdout("provider commands must inherit this environment.");
    return 0;
  }
  if (strategy === "flag") {
    const executable = auth.configRoot.executable || profile.provider;
    const flag = auth.configRoot.flag;
    io.stdout(`strategy: flag`);
    io.stdout(`flag: ${safeLine(flag)}`);
    io.stdout(`executable: ${safeLine(executable)}`);
    io.stdout(`command_hint: ${toonString(`${executable} ${flag} "${root}" <command>`)}`);
    return 0;
  }
  io.stderr("blocker: connector profile does not support repository-scoped config roots");
  return 1;
}

export async function runConnections(argv, io) {
  const [subcommand = "help", ...rest] = argv;
  if (subcommand === "help") {
    if (rejectUnexpectedArgs(rest, io, { command: "connections help", hints: [`Run ./${CONFIG.cliName} connections help`] })) return 2;
    help(io);
    return 0;
  }
  if (subcommand === "status") {
    if (rejectUnexpectedArgs(rest, io, { command: "connections status", hints: [`Run ./${CONFIG.cliName} connections status`] })) return 2;
    return status(io);
  }
  if (subcommand === "list") {
    if (rejectUnexpectedArgs(rest, io, { command: "connections list", hints: [`Run ./${CONFIG.cliName} connections list`] })) return 2;
    return list(io);
  }
  if (subcommand === "plan") {
    if (rejectUnexpectedArgs(rest, io, { command: "connections plan", hints: [`Run ./${CONFIG.cliName} connections plan`] })) return 2;
    return plan(io);
  }
  if (subcommand === "doctor") return doctor(rest, io);
  if (subcommand === "auth-plan") return authPlan(rest, io);
  if (subcommand === "env") return envPlan(rest, io);
  renderUsageError(io, {
    code: "unknown-connections-command",
    command: "connections",
    message: `Unknown connections command: ${subcommand}`,
    hints: [`Run ./${CONFIG.cliName} connections help`]
  });
  return 2;
}
