import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "../config.mjs";
import { readOption } from "../util/args.mjs";
import { rejectUnexpectedArgs, renderHelpBlock, renderUsageError, safeLine, toonString } from "../util/agent-output.mjs";
import { findSecretIndicators } from "../util/secrets.mjs";

const SAFE_CREDENTIAL_REF_RE = /^(env:[A-Z][A-Z0-9_]*|keychain:[A-Za-z0-9._/@:-]+|vault:[A-Za-z0-9._/@:-]+|op:\/\/[A-Za-z0-9._/@:-]+|secret-manager:[A-Za-z0-9._/@:-]+|gcp-sm:[A-Za-z0-9._/@:-]+|aws-secretsmanager:[A-Za-z0-9._/@:-]+)$/;
const WRITE_OPERATIONS_RE = /^(write|send|modify|delete|admin|share|upload|publish)$/i;
const WRITE_SCOPE_RE = /(gmail\.send|mail\.send|readwrite|write|modify|delete|share|admin|manage|upload|publish|full[_-]?access|full[_-]?control|drive\.file|auth\/drive$|files\.readwrite|sites\.readwrite|mail\.readwrite)/i;
const READ_ONLY_SCOPE_RE = /(readonly|read\.only|(^|[./:_-])read($|[./:_-])|\.read\.all($|[./:_-]))/i;
const DOCTOR_VALUE_OPTIONS = new Set(["--profile", "--mode", "--account", "--email", "--credential-root"]);

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
    if (!profile.provider) blockers.push(`${id} missing provider`);
    if (!storageClass) blockers.push(`${id} missing authStorageClass`);
    if (profile.status === "not-configured" || profile.status === "inactive") warnings.push(`${id} connector profile is ${profile.status}`);
    const profileScopes = profileScopeValidation(profile, id);
    blockers.push(...profileScopes.blockers);
    const writeScopes = profileScopes.writeScopes;
    if (writeScopes.length && !writeApprovalRequired(profile)) {
      blockers.push(`${id} write-capable connector scopes require writeApproval.required=true metadata`);
    }
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
  io.stdout("5. Run ./{{CLI_NAME}} connections status.");
  io.stdout("6. Add repo-safe pointers instead of copying privileged content.");
  io.stdout("7. Document revoke, rotation, and owner contact.");
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
  renderUsageError(io, {
    code: "unknown-connections-command",
    command: "connections",
    message: `Unknown connections command: ${subcommand}`,
    hints: [`Run ./${CONFIG.cliName} connections help`]
  });
  return 2;
}
