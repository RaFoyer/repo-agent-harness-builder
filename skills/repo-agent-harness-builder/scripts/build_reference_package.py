#!/usr/bin/env python3
"""Build the portable repo-agent harness reference archive."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import shutil
import subprocess
import tempfile
import zipfile
from datetime import datetime, timezone
from pathlib import Path


SKILL_DIR = Path(__file__).resolve().parents[1]
TEMPLATE_DIR = SKILL_DIR / "assets" / "templates" / "onboarding-package"
PACKAGE_NAME = "repo-agent-harness-reference"
SKILL_VERSION = "0.1.0"
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
    ("netrc password entry", re.compile(r"\bmachine\s+\S+[^\n\r]*\bpassword\s+\S+", re.IGNORECASE)),
    ("URL-embedded credential", re.compile(r"\b[a-z][a-z0-9+.-]*://[^/\s:@]+:[^/\s:@]+@", re.IGNORECASE)),
    ("JWT-like token", re.compile(r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b")),
]
SAFE_CREDENTIAL_REF_RE = re.compile(
    r"^(env:[A-Z][A-Z0-9_]*|keychain:[A-Za-z0-9._/@:-]+|vault:[A-Za-z0-9._/@:-]+|op://[A-Za-z0-9._/@:-]+|secret-manager:[A-Za-z0-9._/@:-]+|gcp-sm:[A-Za-z0-9._/@:-]+|aws-secretsmanager:[A-Za-z0-9._/@:-]+)$"
)
CREDENTIAL_KEY_NAMES = {
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
    "mongodburi",
}
SKIP_NAMES = {".DS_Store", "__pycache__"}
SKIP_SUFFIXES = (".zip", ".sha256")
FALLBACK_GENERATED_AT = "1970-01-01T00:00:00Z"
ZIP_DATE_TIME = (1980, 1, 1, 0, 0, 0)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build the shareable harness reference zip.")
    parser.add_argument("--out-dir", default="outputs", help="Directory for the final zip and checksum.")
    parser.add_argument("--work-dir", default="", help="Optional staging parent. Defaults to a temporary directory.")
    parser.add_argument("--zip-name", default=f"{PACKAGE_NAME}.zip")
    parser.add_argument("--keep-work", action="store_true", help="Keep the staging directory for inspection.")
    parser.add_argument("--source-ref", default="", help="Override manifest sourceRef, useful in release CI.")
    parser.add_argument("--source-commit", default="", help="Override manifest sourceCommit, useful in release CI.")
    parser.add_argument("--require-git-provenance", action="store_true", help="Explicit release-CI provenance requirement; this is the default unless --allow-missing-provenance is used.")
    parser.add_argument("--allow-missing-provenance", action="store_true", help="Allow local experiment archives without sourceRef/sourceCommit.")
    return parser.parse_args()


def ignore(_dir: str, names: list[str]) -> set[str]:
    ignored: set[str] = set()
    for name in names:
        if name in SKIP_NAMES or name.endswith(SKIP_SUFFIXES):
            ignored.add(name)
        if name in {".git", "node_modules", "dist", "coverage"} or name.startswith(".backup-"):
            ignored.add(name)
    return ignored


def path_contains(parent: Path, child: Path) -> bool:
    try:
        child.relative_to(parent)
        return True
    except ValueError:
        return False


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


def find_secret_indicators(text: str) -> list[str]:
    findings: list[str] = []
    for label, pattern in RAW_SECRET_PATTERNS:
        for match in pattern.finditer(text):
            if not is_placeholder_value(match.group(0)) and label not in findings:
                findings.append(label)
    if any(looks_high_entropy(match.group(1)) for match in HIGH_ENTROPY_TOKEN_RE.finditer(text)):
        findings.append("high-entropy token-like value")
    for match in CREDENTIAL_ASSIGNMENT_RE.finditer(text):
        key = match.group(1)
        value = match.group(3)
        finding = f"credential-like field {key!r} contains a value"
        if is_credential_key(key) and not is_placeholder_value(value) and finding not in findings:
            findings.append(finding)
    return findings


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


def ensure_no_symlinks(root: Path) -> None:
    for path in sorted(root.rglob("*")):
        if path.is_symlink():
            raise SystemExit(f"Refusing to package symlink: {path}")


def copy_inputs(package_root: Path) -> None:
    ensure_no_symlinks(TEMPLATE_DIR)
    ensure_no_symlinks(SKILL_DIR)
    shutil.copytree(TEMPLATE_DIR, package_root, ignore=ignore)
    skill_dest = package_root / "skill" / SKILL_DIR.name
    shutil.copytree(SKILL_DIR, skill_dest, ignore=ignore)


def git_value(args: list[str]) -> str | None:
    try:
        result = subprocess.run(["git", "-C", str(SKILL_DIR), *args], check=True, text=True, capture_output=True)
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None
    return result.stdout.strip() or None


def normalize_iso_timestamp(value: str) -> str | None:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def generated_at_for_source(source_commit: str | None) -> str:
    if source_commit:
        commit_timestamp = git_value(["show", "-s", "--format=%cI", source_commit])
        if commit_timestamp:
            normalized = normalize_iso_timestamp(commit_timestamp)
            if normalized:
                return normalized
    return FALLBACK_GENERATED_AT


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def iter_files(root: Path) -> list[Path]:
    files: list[Path] = []
    for path in sorted(root.rglob("*")):
        if path.is_symlink():
            raise SystemExit(f"Refusing to package symlink: {path}")
        if path.is_file():
            files.append(path)
    return files


def validate_relpath(rel: str) -> None:
    if rel.startswith("/") or rel.startswith("../") or "/../" in rel:
        raise SystemExit(f"Unsafe archive path: {rel}")
    parts = rel.split("/")
    if any(part in {"", ".", ".."} for part in parts):
        raise SystemExit(f"Unsafe archive path: {rel}")
    if any(part == ".env" or part.startswith(".env.") for part in parts):
        raise SystemExit(f"Refusing to package environment file: {rel}")


def validate_zip_name(zip_name: str) -> None:
    path = Path(zip_name)
    if path.name != zip_name or path.is_absolute() or any(part in {"", ".", ".."} for part in path.parts):
        raise SystemExit(f"--zip-name must be a safe basename: {zip_name}")
    if not zip_name.endswith(".zip"):
        raise SystemExit("--zip-name must end with .zip")


def validate_content(path: Path, rel: str) -> None:
    if path.stat().st_size > MAX_SCANNED_FILE_BYTES:
        raise SystemExit(f"Refusing to package file over {MAX_SCANNED_FILE_BYTES} bytes without explicit review: {rel}")
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        raise SystemExit(f"Refusing to package non-UTF-8 file without explicit review: {rel}")
    if LOCAL_PATH_RE.search(text):
        raise SystemExit(f"Refusing to package local absolute path in {rel}")
    secret_findings = find_secret_indicators(text)
    if secret_findings:
        raise SystemExit(f"Refusing to package possible secret content in {rel}: {', '.join(secret_findings)}")
    credential_ref_findings = find_credential_ref_issues(text)
    if credential_ref_findings:
        raise SystemExit(f"Refusing to package unsafe credential reference in {rel}: {', '.join(credential_ref_findings)}")


def validate_staging_parent(staging_parent: Path, out_dir: Path) -> None:
    forbidden = [SKILL_DIR.resolve(), TEMPLATE_DIR.resolve(), out_dir.resolve()]
    for parent in forbidden:
        if path_contains(parent, staging_parent):
            raise SystemExit(f"Refusing --work-dir inside source/output tree: {staging_parent}")


def write_manifest(package_root: Path, source_ref: str | None, source_commit: str | None, allow_missing_provenance: bool) -> None:
    files = []
    for path in iter_files(package_root):
        rel = path.relative_to(package_root).as_posix()
        if rel == "MANIFEST.json":
            continue
        validate_relpath(rel)
        validate_content(path, rel)
        files.append({"path": rel, "bytes": path.stat().st_size, "sha256": sha256(path), "mode": stat_mode(path)})

    source_ref = source_ref or git_value(["rev-parse", "--abbrev-ref", "HEAD"])
    source_commit = source_commit or git_value(["rev-parse", "HEAD"])
    if not allow_missing_provenance and (not source_ref or not source_commit):
        raise SystemExit("Shareable package requires non-empty sourceRef and sourceCommit. Use --allow-missing-provenance only for local experiments.")

    manifest = {
        "packageName": PACKAGE_NAME,
        "entrypoint": "START-HERE.md",
        "agentEntrypoint": "AGENT-HANDOFF.md",
        "generatedAt": generated_at_for_source(source_commit),
        "skillVersion": SKILL_VERSION,
        "sourceRef": source_ref,
        "sourceCommit": source_commit,
        "containsSecrets": False,
        "intendedUse": "Agent-assisted repository, project-folder, and personal-folder harness setup",
        "skill": "repo-agent-harness-builder",
        "manifestSelfHash": "excluded",
        "files": files,
    }
    manifest_path = package_root / "MANIFEST.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    validate_content(manifest_path, "MANIFEST.json")


def stat_mode(path: Path) -> str:
    return oct(path.stat().st_mode & 0o777)


def write_zip(package_root: Path, out_path: Path) -> None:
    if out_path.exists():
        out_path.unlink()
    with zipfile.ZipFile(out_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in iter_files(package_root):
            rel = path.relative_to(package_root).as_posix()
            validate_relpath(rel)
            info = zipfile.ZipInfo(f"{PACKAGE_NAME}/{rel}", ZIP_DATE_TIME)
            info.create_system = 3
            info.external_attr = (path.stat().st_mode & 0o777) << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, path.read_bytes())


def write_checksum(out_path: Path) -> Path:
    checksum_path = out_path.with_suffix(out_path.suffix + ".sha256")
    checksum_path.write_text(f"{sha256(out_path)}  {out_path.name}\n", encoding="utf-8")
    return checksum_path


def main() -> int:
    args = parse_args()
    if args.require_git_provenance and args.allow_missing_provenance:
        raise SystemExit("Use either --require-git-provenance or --allow-missing-provenance, not both.")
    validate_zip_name(args.zip_name)
    out_dir = Path(args.out_dir).expanduser().resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / args.zip_name

    if args.work_dir:
        staging_parent = Path(args.work_dir).expanduser().resolve()
        validate_staging_parent(staging_parent, out_dir)
        staging_parent.mkdir(parents=True, exist_ok=True)
        temp_dir = staging_parent / f"{PACKAGE_NAME}-build"
        if temp_dir.exists():
            shutil.rmtree(temp_dir)
        temp_dir.mkdir(parents=True)
        cleanup = False
    else:
        temp_dir = Path(tempfile.mkdtemp(prefix=f"{PACKAGE_NAME}-"))
        cleanup = not args.keep_work

    try:
        package_root = temp_dir / PACKAGE_NAME
        copy_inputs(package_root)
        write_manifest(
            package_root,
            args.source_ref or None,
            args.source_commit or None,
            args.allow_missing_provenance,
        )
        write_zip(package_root, out_path)
        checksum_path = write_checksum(out_path)
        print(out_path)
        print(checksum_path)
        if args.keep_work or args.work_dir:
            print(package_root)
    finally:
        if cleanup:
            shutil.rmtree(temp_dir)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
