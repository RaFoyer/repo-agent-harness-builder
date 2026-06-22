import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "../config.mjs";
import { findSecretIndicators } from "../util/secrets.mjs";

const SAFE_CREDENTIAL_REF_RE = /^(env:[A-Z][A-Z0-9_]*|keychain:[A-Za-z0-9._/@:-]+|vault:[A-Za-z0-9._/@:-]+|op:\/\/[A-Za-z0-9._/@:-]+|secret-manager:[A-Za-z0-9._/@:-]+|gcp-sm:[A-Za-z0-9._/@:-]+|aws-secretsmanager:[A-Za-z0-9._/@:-]+)$/;
const WRITE_OPERATIONS_RE = /^(write|send|modify|delete|admin|share|upload|publish)$/i;
const WRITE_SCOPE_RE = /(gmail\.send|mail\.send|readwrite|write|modify|delete|share|admin|manage|upload|publish|full[_-]?access|full[_-]?control|drive\.file|auth\/drive$|files\.readwrite|sites\.readwrite|mail\.readwrite)/i;
const READ_ONLY_SCOPE_RE = /(readonly|read\.only|(^|[./:_-])read($|[./:_-])|\.read\.all($|[./:_-]))/i;

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

function writeCapableScope(scope) {
  const value = String(scope || "");
  const lower = value.toLowerCase();
  if (WRITE_SCOPE_RE.test(value)) return true;
  return !READ_ONLY_SCOPE_RE.test(lower);
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
  return { blockers, warnings };
}

function help(io) {
  io.stdout("Connection commands are value-safe.");
  io.stdout("Available commands:");
  io.stdout("  connections help      Show this help");
  io.stdout("  connections status    Validate ops/connections.json");
  io.stdout("  connections list      List registered external authorities");
  io.stdout("  connections plan      Print setup checklist for a permanent connection");
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
  for (const connection of loaded.registry.connections || []) {
    io.stdout(`${connection.id} | ${connection.provider} | ${connection.authorityClass} | ${connection.status || "unknown"}`);
  }
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
  return 0;
}

export async function runConnections(argv, io) {
  const subcommand = argv[0] || "help";
  if (subcommand === "help") {
    help(io);
    return 0;
  }
  if (subcommand === "status") return status(io);
  if (subcommand === "list") return list(io);
  if (subcommand === "plan") return plan(io);
  io.stderr(`Unknown connections command: ${subcommand}`);
  return 2;
}
