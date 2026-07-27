const CREDENTIAL_KEY_NAMES = new Set([
  "token",
  "accesstoken",
  "refreshtoken",
  "password",
  "passwd",
  "pwd",
  "secret",
  "apikey",
  "privatekey",
  "clientsecret",
  "webhooksecret",
  "signingsecret",
  "sessionsecret",
  "cookie",
  "authorization",
  "bearer",
  "credential",
  "credentials",
  "dsn",
  "databaseurl",
  "databaseuri",
  "dburl",
  "connection",
  "connectionstring",
  "datasourceurl",
  "jdbcurl",
  "postgresurl",
  "redisurl",
  "mongodburi"
]);

const CREDENTIAL_ASSIGNMENT_RE =
  /["']?\b([A-Za-z_][A-Za-z0-9_-]*)["']?[ \t]*[:=][ \t]*(["']?)([^"',}\]\s][^"',}\]\n\r]*)\2/gi;

const RAW_SECRET_PATTERNS = [
  { label: "private key block", pattern: /-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/gi },
  { label: "GitHub token", pattern: /\bghp_[A-Za-z0-9_]{8,}\b/g },
  { label: "GitHub fine-grained token", pattern: /\bgithub_pat_[A-Za-z0-9_]{16,}\b/g },
  { label: "OpenAI API key", pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{8,}\b/g },
  { label: "Slack token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { label: "AWS access key", pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g },
  { label: "Google OAuth token", pattern: /\bya29\.[A-Za-z0-9._-]{20,}\b/g },
  { label: "Stripe live secret key", pattern: /\bsk_live_[A-Za-z0-9]{16,}\b/g },
  { label: "npm token", pattern: /\bnpm_(?!config_)[A-Za-z0-9_-]{16,}\b/g },
  { label: "netrc password entry", pattern: /\bmachine\s+\S+[^\n\r]*\bpassword\s+\S+/gi },
  { label: "URL-embedded credential", pattern: /\b[a-z][a-z0-9+.-]*:\/\/[^\/\s:@]+:[^\/\s:@]+@/gi },
  { label: "JWT-like token", pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g }
];

const HIGH_ENTROPY_TOKEN_RE = /(?:^|[^A-Za-z0-9_+.=-])([A-Za-z0-9_+.-]{32,}={0,2})(?=$|[^A-Za-z0-9_+.=-])/g;
const LOCAL_PATH_RE = /(\/Users\/[^\s)'"]+|\/home\/[^\s)'"]+|\/private\/var\/[^\s)'"]+|\/tmp\/[^\s)'"]+|\/var\/folders\/[^\s)'"]+|\/Volumes\/[^/\s)'"]+\/[^\s)'"]+|[A-Za-z]:\\Users\\[^\r\n)'"]+|~\/[^\s)'"]+)/g;

function normalizeKey(key) {
  return String(key || "").replace(/[^A-Za-z0-9]/g, "").toLowerCase();
}

function isReferenceKey(key) {
  const normalized = normalizeKey(key);
  if (["secretmanager", "awssecretsmanager", "gcpsecretmanager"].includes(normalized)) return true;
  return normalized.endsWith("ref") || normalized.endsWith("refs") || normalized.endsWith("reference") || normalized.endsWith("references");
}

function isScannerMetadataKey(key) {
  const normalized = normalizeKey(key);
  return normalized.endsWith("re") ||
    normalized.endsWith("regex") ||
    normalized.endsWith("pattern") ||
    normalized.endsWith("patterns") ||
    normalized.endsWith("names") ||
    normalized.endsWith("keynames") ||
    normalized.endsWith("findings");
}

function containsCredentialTokenName(normalized) {
  return normalized === "tokens" ||
    normalized.startsWith("token") ||
    normalized.includes("apitoken") ||
    normalized.includes("authtoken") ||
    normalized.includes("accesstoken") ||
    normalized.includes("refreshtoken") ||
    normalized.includes("idtoken") ||
    normalized.includes("bearertoken") ||
    normalized.includes("sessiontoken");
}

function isCredentialKey(key) {
  const normalized = normalizeKey(key);
  if (isReferenceKey(key) || isScannerMetadataKey(key)) return false;
  if (CREDENTIAL_KEY_NAMES.has(normalized)) return true;
  if (containsCredentialTokenName(normalized) || normalized.includes("password") || normalized.includes("secret") || normalized.includes("credential")) return true;
  return normalized.endsWith("token") ||
    normalized.endsWith("password") ||
    normalized.endsWith("secret") ||
    normalized.endsWith("apikey") ||
    normalized.endsWith("privatekey") ||
    normalized.endsWith("accesskey") ||
    normalized.endsWith("credential") ||
    normalized.endsWith("credentials") ||
    normalized.endsWith("dsn") ||
    normalized.includes("clientsecret") ||
    normalized.includes("signingsecret") ||
    normalized.includes("webhooksecret") ||
    normalized.includes("secretaccesskey") ||
    normalized.includes("connectionstring");
}

function isPlaceholderValue(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return true;
  if (["true", "false", "null", "none", "undefined", "str", "string", "int", "integer", "bool", "boolean", "list", "dict", "object", "path"].includes(normalized)) return true;
  if (/^<[^>]+>$/.test(normalized)) return true;
  if (String(value || "").trim().startsWith("${{")) return true;
  if (/^(redacted|placeholder|example|sample|dummy|test|todo|tbd|changeme|change-me|replace-me)$/.test(normalized)) return true;
  return false;
}

function addFinding(findings, text) {
  if (!findings.includes(text)) findings.push(text);
}

function shannonEntropy(value) {
  const counts = new Map();
  for (const char of value) counts.set(char, (counts.get(char) || 0) + 1);
  let entropy = 0;
  for (const count of counts.values()) {
    const probability = count / value.length;
    entropy -= probability * Math.log2(probability);
  }
  return entropy;
}

function looksHighEntropy(value) {
  if (isPlaceholderValue(value) || value.length < 32) return false;
  if (!/[a-z]/.test(value) || !/[A-Z]/.test(value) || !/[0-9]/.test(value)) return false;
  return shannonEntropy(value) >= 3.5;
}

export function findSecretIndicators(text, options = {}) {
  const source = options.source ? `${options.source}: ` : "";
  const findings = [];
  const content = String(text ?? "");

  for (const pattern of RAW_SECRET_PATTERNS) {
    pattern.pattern.lastIndex = 0;
    for (const match of content.matchAll(pattern.pattern)) {
      if (!isPlaceholderValue(match[0])) addFinding(findings, `${source}${pattern.label}`);
    }
  }

  HIGH_ENTROPY_TOKEN_RE.lastIndex = 0;
  for (const match of content.matchAll(HIGH_ENTROPY_TOKEN_RE)) {
    if (looksHighEntropy(match[1])) addFinding(findings, `${source}high-entropy token-like value`);
  }

  CREDENTIAL_ASSIGNMENT_RE.lastIndex = 0;
  for (const match of content.matchAll(CREDENTIAL_ASSIGNMENT_RE)) {
    const key = match[1];
    const value = match[3];
    if (isCredentialKey(key) && !isPlaceholderValue(value)) {
      addFinding(findings, `${source}credential-like field "${key}" contains a value`);
    }
  }

  return findings;
}

export function redactSecrets(value) {
  let output = String(value ?? "");

  for (const pattern of RAW_SECRET_PATTERNS) {
    pattern.pattern.lastIndex = 0;
    output = output.replace(pattern.pattern, "<redacted>");
  }

  output = output.replace(CREDENTIAL_ASSIGNMENT_RE, (match, key, quote, secretValue) => {
    if (!isCredentialKey(key)) return match;
    return match.replace(secretValue, "<redacted>");
  });

  output = output.replace(HIGH_ENTROPY_TOKEN_RE, (match, token) => {
    if (!looksHighEntropy(token)) return match;
    return match.replace(token, "<redacted>");
  });

  output = output.replace(LOCAL_PATH_RE, "<redacted-path>");

  return output;
}
