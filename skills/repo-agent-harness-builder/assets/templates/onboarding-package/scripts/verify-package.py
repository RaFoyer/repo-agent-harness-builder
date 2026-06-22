#!/usr/bin/env python3
"""Verify an extracted repo-agent harness reference package against MANIFEST.json."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import stat
from pathlib import Path

IGNORED_EXTRA_NAMES = {".DS_Store"}
IGNORED_EXTRA_PREFIXES = ("__MACOSX/",)
MAX_SCANNED_FILE_BYTES = 1_000_000
LOCAL_PATH_RE = re.compile(
    r"(^|[\s'\"(])("
    r"(/Users|/home)/[^\s'\"()]+"
    r"|/private/var/[^\s'\"()]+"
    r"|/tmp/[^\s'\"()]+"
    r"|/var/folders/[^\s'\"()]+"
    r"|/Volumes/[^/\s'\"()]+/[^\s'\"()]+"
    r"|[A-Za-z]:\\Users\\[^\r\n'\"()]+"
    r")"
)
CREDENTIAL_ASSIGNMENT_RE = re.compile(
    r"""["']?\b([A-Za-z_][A-Za-z0-9_-]*)["']?[ \t]*[:=][ \t]*(["']?)([^"',}\]\s][^"',}\]\n\r]*)\2""",
    re.IGNORECASE,
)
HIGH_ENTROPY_TOKEN_RE = re.compile(r"(?:^|[^A-Za-z0-9_+.=-])([A-Za-z0-9_+.-]{32,}={0,2})(?=$|[^A-Za-z0-9_+.=-])")
RAW_SECRET_PATTERNS = [
    ("private key block", re.compile(r"-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----", re.IGNORECASE)),
    ("GitHub token", re.compile(r"\bghp_[A-Za-z0-9_]{8,}\b")),
    ("GitHub fine-grained token", re.compile(r"\bgithub_pat_[A-Za-z0-9_]{16,}\b")),
    ("OpenAI API key", re.compile(r"\bsk-(?:proj-)?[A-Za-z0-9_-]{8,}\b")),
    ("Slack token", re.compile(r"\bxox[baprs]-[A-Za-z0-9-]{10,}\b")),
    ("AWS access key", re.compile(r"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b")),
    ("Google OAuth token", re.compile(r"\bya29\.[A-Za-z0-9._-]{20,}\b")),
    ("Stripe live secret key", re.compile(r"\bsk_live_[A-Za-z0-9]{16,}\b")),
    ("npm token", re.compile(r"\bnpm_(?!config_)[A-Za-z0-9_-]{16,}\b")),
    ("URL-embedded credential", re.compile(r"\b[a-z][a-z0-9+.-]*://[^/\s:@]+:[^/\s:@]+@", re.IGNORECASE)),
    ("netrc password entry", re.compile(r"\bmachine\s+\S+[^\n\r]*\bpassword\s+\S+", re.IGNORECASE)),
    ("JWT-like token", re.compile(r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b")),
]
CREDENTIAL_KEY_NAMES = {
    "token", "accesstoken", "refreshtoken", "password", "passwd", "pwd",
    "secret", "apikey", "privatekey", "clientsecret", "webhooksecret",
    "signingsecret", "sessionsecret", "cookie", "authorization", "bearer",
    "credential", "credentials", "dsn", "databaseurl", "databaseuri",
    "dburl", "connection", "connectionstring", "datasourceurl", "jdbcurl",
    "postgresurl", "redisurl", "mongodburi",
}
SAFE_CREDENTIAL_REF_RE = re.compile(
    r"^(env:[A-Z][A-Z0-9_]*|keychain:[A-Za-z0-9._/@:-]+|vault:[A-Za-z0-9._/@:-]+|op://[A-Za-z0-9._/@:-]+|secret-manager:[A-Za-z0-9._/@:-]+|gcp-sm:[A-Za-z0-9._/@:-]+|aws-secretsmanager:[A-Za-z0-9._/@:-]+)$"
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def normalize_key(key: str) -> str:
    return re.sub(r"[^A-Za-z0-9]", "", key).lower()


def is_reference_key(key: str) -> bool:
    normalized = normalize_key(key)
    if normalized in {"secretmanager", "awssecretsmanager", "gcpsecretmanager"}:
        return True
    return normalized.endswith(("ref", "refs", "reference", "references"))


def is_scanner_metadata_key(key: str) -> bool:
    normalized = normalize_key(key)
    return normalized.endswith(("re", "regex", "pattern", "patterns", "names", "keynames", "findings"))


def contains_credential_token_name(normalized: str) -> bool:
    return (
        normalized == "tokens"
        or normalized.startswith("token")
        or any(
            part in normalized
            for part in ("apitoken", "authtoken", "accesstoken", "refreshtoken", "idtoken", "bearertoken", "sessiontoken")
        )
    )


def is_credential_key(key: str) -> bool:
    normalized = normalize_key(key)
    if is_reference_key(key) or is_scanner_metadata_key(key):
        return False
    if normalized in CREDENTIAL_KEY_NAMES:
        return True
    if contains_credential_token_name(normalized) or any(part in normalized for part in ("password", "secret", "credential")):
        return True
    return normalized.endswith(("token", "password", "secret", "apikey", "privatekey", "accesskey", "credential", "credentials", "dsn")) or any(
        part in normalized for part in ("clientsecret", "signingsecret", "webhooksecret", "secretaccesskey", "connectionstring")
    )


def is_placeholder_value(value: str) -> bool:
    normalized = value.strip().lower()
    if not normalized or normalized in {"true", "false", "null", "none", "undefined", "str", "string", "int", "integer", "bool", "boolean", "list", "dict", "object", "path"}:
        return True
    if re.fullmatch(r"<[^>]+>", normalized):
        return True
    if value.strip().startswith("${{"):
        return True
    if re.fullmatch(r"(redacted|placeholder|example|sample|dummy|test|todo|tbd|changeme|change-me|replace-me)", normalized):
        return True
    return False


def shannon_entropy(value: str) -> float:
    counts = {char: value.count(char) for char in set(value)}
    entropy = 0.0
    for count in counts.values():
        probability = count / len(value)
        entropy -= probability * math.log2(probability)
    return entropy


def looks_high_entropy(value: str) -> bool:
    if is_placeholder_value(value) or len(value) < 32:
        return False
    if not (re.search(r"[a-z]", value) and re.search(r"[A-Z]", value) and re.search(r"[0-9]", value)):
        return False
    return shannon_entropy(value) >= 3.5


def find_credential_ref_issues(text: str) -> list[str]:
    findings: list[str] = []
    for match in re.finditer(r'"credentialRefs"\s*:\s*\[(.*?)\]', text, re.IGNORECASE | re.DOTALL):
        refs = re.findall(r'"([^"]+)"', match.group(1))
        for ref in refs:
            if not SAFE_CREDENTIAL_REF_RE.fullmatch(ref):
                finding = f"credentialRefs entry {ref!r} is not a safe reference"
                if finding not in findings:
                    findings.append(finding)
    return findings


def content_findings(path: Path, rel: str) -> list[str]:
    findings: list[str] = []
    if path.stat().st_size > MAX_SCANNED_FILE_BYTES:
        return [f"{rel}: too large for content safety scan"]
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return [f"{rel}: non-UTF-8 file could not be content-safety scanned"]
    if LOCAL_PATH_RE.search(text):
        findings.append(f"{rel}: local absolute path")
    for label, pattern in RAW_SECRET_PATTERNS:
        for match in pattern.finditer(text):
            if not is_placeholder_value(match.group(0)):
                findings.append(f"{rel}: {label}")
                break
    if any(looks_high_entropy(match.group(1)) for match in HIGH_ENTROPY_TOKEN_RE.finditer(text)):
        findings.append(f"{rel}: high-entropy token-like value")
    for match in CREDENTIAL_ASSIGNMENT_RE.finditer(text):
        key = match.group(1)
        value = match.group(3)
        if is_credential_key(key) and not is_placeholder_value(value):
            findings.append(f"{rel}: credential-like field {key!r} contains a value")
    for finding in find_credential_ref_issues(text):
        findings.append(f"{rel}: {finding}")
    return findings


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Verify package files against MANIFEST.json.")
    parser.add_argument("--root", default=".", help="Extracted package root. Defaults to current directory.")
    parser.add_argument("--require-provenance", action="store_true", help="Explicitly require sourceRef and sourceCommit; this is the default unless --allow-missing-provenance is used.")
    parser.add_argument("--allow-missing-provenance", action="store_true", help="Allow local experiment archives without sourceRef/sourceCommit.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    root = Path(args.root).expanduser().resolve()
    manifest_path = root / "MANIFEST.json"
    if not manifest_path.exists():
        print(f"blocker: missing MANIFEST.json at {manifest_path}")
        return 1

    errors: list[str] = []
    warnings: list[str] = []
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        print(f"Package verification failed:\n- invalid MANIFEST.json: {error}")
        return 1
    if not isinstance(manifest, dict):
        print("Package verification failed:\n- MANIFEST.json must contain an object")
        return 1

    files = manifest.get("files", [])
    if not isinstance(files, list):
        print("Package verification failed:\n- manifest files must be a list")
        return 1

    expected_paths = set()
    for entry in files:
        if not isinstance(entry, dict) or not isinstance(entry.get("path"), str):
            errors.append("manifest file entry missing string path")
            continue
        expected_paths.add(entry["path"])

    for entry in files:
        if not isinstance(entry, dict) or not isinstance(entry.get("path"), str):
            continue
        rel = entry["path"]
        if rel.startswith("/") or "../" in rel or rel.startswith("../"):
            errors.append(f"unsafe manifest path: {rel}")
            continue
        path = root / rel
        if path.is_symlink():
            errors.append(f"symlink not allowed: {rel}")
            continue
        if not path.exists():
            errors.append(f"missing file: {rel}")
            continue
        if path.stat().st_size != entry.get("bytes"):
            errors.append(f"byte mismatch: {rel}")
        if sha256(path) != entry.get("sha256"):
            errors.append(f"sha256 mismatch: {rel}")
        errors.extend(content_findings(path, rel))
        if entry.get("mode"):
            actual_mode = oct(stat.S_IMODE(path.stat().st_mode))
            if actual_mode != entry.get("mode"):
                warnings.append(f"mode differs after extraction: {rel} expected {entry.get('mode')} got {actual_mode}")

    actual_paths = set()
    for path in root.rglob("*"):
        rel = path.relative_to(root).as_posix()
        if path.is_symlink():
            errors.append(f"symlink not allowed: {rel}")
            continue
        if path.name in IGNORED_EXTRA_NAMES or rel.startswith(IGNORED_EXTRA_PREFIXES):
            if path.is_file():
                warnings.append(f"ignored OS metadata extra file: {rel}")
            continue
        if path.is_file() and rel != "MANIFEST.json":
            actual_paths.add(rel)
    extras = sorted(actual_paths - expected_paths)
    if extras:
        errors.append(f"files not listed in manifest: {', '.join(extras[:10])}")

    if manifest.get("containsSecrets") is not False:
        errors.append("manifest must declare containsSecrets=false")
    if args.require_provenance and args.allow_missing_provenance:
        errors.append("use either --require-provenance or --allow-missing-provenance, not both")
    if not args.allow_missing_provenance and (not manifest.get("sourceRef") or not manifest.get("sourceCommit")):
        errors.append("manifest must include sourceRef and sourceCommit; use --allow-missing-provenance only for local experiments")

    if errors:
        print("Package verification failed:")
        for error in errors:
            print(f"- {error}")
        return 1
    for warning in warnings:
        print(f"warning: {warning}")

    print(f"Package verification passed for {root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
