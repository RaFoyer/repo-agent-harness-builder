#!/usr/bin/env python3
"""Fail closed on content that should not enter the public repository."""

from __future__ import annotations

import importlib.util
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BUILDER_PATH = ROOT / "skills" / "repo-agent-harness-builder" / "scripts" / "build_reference_package.py"
MAX_SCANNED_FILE_BYTES = 1_000_000
SKIP_DIRS = {".git", "node_modules", "dist", "outputs", "work", "coverage", ".next", "__pycache__"}
FORBIDDEN_FILENAMES = {".env", ".netrc", "_netrc", ".npmrc", ".pypirc", ".pgpass"}
FORBIDDEN_SUFFIXES = {".pem", ".p12", ".pfx", ".jks", ".jceks", ".bcfks", ".keystore", ".ppk", ".kdbx", ".key"}
REQUIRED_GITIGNORE_LINES = {
    ".env",
    ".env.*",
    ".netrc",
    "_netrc",
    ".npmrc",
    ".pypirc",
    ".pgpass",
    "*.pem",
    "*.p12",
    "*.pfx",
    "*.key",
    "*.kdbx",
}


def load_builder():
    spec = importlib.util.spec_from_file_location("builder", BUILDER_PATH)
    if spec is None or spec.loader is None:
        raise SystemExit(f"Could not load scanner helpers from {BUILDER_PATH}")
    builder = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(builder)
    return builder


def should_skip(path: Path) -> bool:
    rel = path.relative_to(ROOT)
    return any(part in SKIP_DIRS for part in rel.parts)


def git_ignored(paths: list[Path]) -> set[Path]:
    """Paths git would never publish, including global/system excludes.

    Fails open: if git cannot answer, nothing is excluded and every candidate
    is scanned, so the check stays fail-closed on content.
    """
    if not paths:
        return set()
    try:
        result = subprocess.run(
            ["git", "-C", str(ROOT), "check-ignore", "--stdin", "-z"],
            input="\0".join(str(path.relative_to(ROOT)) for path in paths),
            capture_output=True,
            text=True,
            check=False,
        )
    except (OSError, ValueError):
        return set()
    if result.returncode not in (0, 1):
        return set()
    return {ROOT / rel for rel in result.stdout.split("\0") if rel}


def iter_public_paths() -> list[Path]:
    candidates = [path for path in sorted(ROOT.rglob("*")) if not should_skip(path)]
    ignored = git_ignored(candidates)
    return [path for path in candidates if path not in ignored]


def check_gitignore(errors: list[str]) -> None:
    gitignore = ROOT / ".gitignore"
    if not gitignore.exists():
        errors.append("missing .gitignore")
        return
    lines = {
        line.strip()
        for line in gitignore.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.strip().startswith("#")
    }
    missing = sorted(REQUIRED_GITIGNORE_LINES - lines)
    if missing:
        errors.append(f".gitignore is missing public-safety ignores: {', '.join(missing)}")


def check_path(path: Path, builder, errors: list[str]) -> None:
    rel = path.relative_to(ROOT).as_posix()
    if path.is_symlink():
        errors.append(f"symlink must not be committed: {rel}")
        return
    if not path.is_file():
        return
    if path.name in FORBIDDEN_FILENAMES or path.name.startswith(".env.") or path.suffix.lower() in FORBIDDEN_SUFFIXES:
        errors.append(f"credential-like filename must not be committed: {rel}")
        return
    if path.stat().st_size > MAX_SCANNED_FILE_BYTES:
        errors.append(f"file over {MAX_SCANNED_FILE_BYTES} bytes needs explicit public review: {rel}")
        return
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        errors.append(f"non-UTF-8 file needs explicit public review: {rel}")
        return
    if builder.LOCAL_PATH_RE.search(text):
        errors.append(f"local absolute path found: {rel}")
    secret_findings = builder.find_secret_indicators(text)
    if secret_findings:
        errors.append(f"possible secret content in {rel}: {', '.join(secret_findings)}")
    credential_ref_findings = builder.find_credential_ref_issues(text)
    if credential_ref_findings:
        errors.append(f"unsafe credential reference in {rel}: {', '.join(credential_ref_findings)}")


def main() -> int:
    builder = load_builder()
    errors: list[str] = []
    check_gitignore(errors)
    for path in iter_public_paths():
        check_path(path, builder, errors)
    if errors:
        print("Public tree scan failed:")
        for error in errors:
            print(f"- {error}")
        return 1
    print("Public tree scan passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
