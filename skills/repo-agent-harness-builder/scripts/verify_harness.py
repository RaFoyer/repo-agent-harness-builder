#!/usr/bin/env python3
"""Verify the expected shape of a repo-agent harness."""

from __future__ import annotations

import argparse
import os
import re
import subprocess
from pathlib import Path


REQUIRED_PROTOCOLS = [
    "PROTOCOL-TAXONOMY.md",
    "DOCUMENT-LIFECYCLE.md",
    "DOCUMENT-QUALITY.md",
    "CLI-INTERFACE.md",
    "SOURCE-OF-TRUTH.md",
    "PRIVILEGED-DOCUMENTS.md",
    "EXTERNAL-SYSTEMS.md",
    "SESSION-PREFLIGHT.md",
    "PRE-COMMIT.md",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Verify a generated repo-agent harness.")
    parser.add_argument("--target", required=True)
    parser.add_argument("--cli-name", required=True)
    parser.add_argument("--run-tests", action="store_true")
    return parser.parse_args()


def check_file(path: Path, errors: list[str]) -> None:
    if not path.exists():
        errors.append(f"missing: {path}")
    elif path.is_file() and path.stat().st_size == 0:
        errors.append(f"empty: {path}")


def validate_evidence_token(target: Path, module: str, token: str, errors: list[str]) -> None:
    if token.startswith("./"):
        executable = token[2:].split()[0]
        if not (target / executable).exists():
            errors.append(f"checklist active module {module!r} references missing command: {token}")
        return

    if re.fullmatch(r"[A-Za-z0-9_.-]+(/[A-Za-z0-9_.-]+)*/?", token) and not (target / token).exists():
        errors.append(f"checklist active module {module!r} references missing evidence: {token}")


def validate_checklist(target: Path, errors: list[str]) -> None:
    checklist_path = target / "ops" / "HARNESS-CHECKLIST.md"
    if not checklist_path.exists():
        return

    for line in checklist_path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped.startswith("|") or not stripped.endswith("|"):
            continue
        if re.match(r"^\|[\s:-]+\|", stripped):
            continue
        cells = [cell.strip() for cell in stripped[1:-1].split("|")]
        if len(cells) < 3 or cells[1].replace("`", "") != "active":
            continue
        module = cells[0].replace("`", "")
        evidence = "|".join(cells[2:])
        if not evidence.strip():
            errors.append(f"checklist active module {module!r} has no evidence")
        for token in re.findall(r"`([^`]+)`", evidence):
            validate_evidence_token(target, module, token, errors)


def validate_no_stale_placeholders(target: Path, errors: list[str]) -> None:
    for path in sorted(target.rglob("*")):
        if path.is_dir() or ".git" in path.parts or "node_modules" in path.parts:
            continue
        if path.suffix.lower() not in {".md", ".mjs", ".js", ".json", ".yaml", ".yml", ".sh", ".txt"} and not path.name.startswith("AGENTS"):
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        in_fence = False
        for line in text.splitlines():
            if line.strip().startswith("```"):
                in_fence = not in_fence
                continue
            if not in_fence and line.strip() == "last_reviewed: YYYY-MM-DD":
                errors.append(f"stale review-date placeholder: {path}")
                break


def main() -> int:
    args = parse_args()
    target = Path(args.target).expanduser().resolve()
    errors: list[str] = []

    for rel in ["AGENTS.md", "AGENTS-TOC.md", "ops/HARNESS-CHECKLIST.md", "ops/connections.json", args.cli_name, "apps/cli/package.json"]:
        check_file(target / rel, errors)

    for protocol in REQUIRED_PROTOCOLS:
        check_file(target / "ops" / "protocols" / protocol, errors)

    for rel in [
        f"apps/cli/bin/{args.cli_name}.mjs",
        "apps/cli/src/main.mjs",
        "apps/cli/src/help.mjs",
        "apps/cli/src/config.mjs",
        "apps/cli/src/commands/checklist.mjs",
        "apps/cli/src/connections/index.mjs",
        "apps/cli/src/qa/index.mjs",
        "apps/cli/src/verify/index.mjs",
        "apps/cli/src/preflight/session.mjs",
        "apps/cli/src/precommit/checklist.mjs",
        "apps/cli/src/util/secrets.mjs",
        "apps/cli/test/cli.test.mjs",
    ]:
        check_file(target / rel, errors)

    validate_checklist(target, errors)
    validate_no_stale_placeholders(target, errors)

    facade = target / args.cli_name
    if facade.exists() and not os.access(facade, os.X_OK):
        errors.append(f"facade is not executable: {facade}")
    bin_entrypoint = target / "apps" / "cli" / "bin" / f"{args.cli_name}.mjs"
    if bin_entrypoint.exists() and not os.access(bin_entrypoint, os.X_OK):
        errors.append(f"CLI bin entrypoint is not executable: {bin_entrypoint}")

    if args.run_tests and not errors:
        result = subprocess.run(
            "node --test apps/cli/test/*.test.mjs",
            cwd=target,
            text=True,
            shell=True,
        )
        if result.returncode != 0:
            errors.append("node CLI tests failed")

    if errors:
        print("Harness verification failed:")
        for error in errors:
            print(f"- {error}")
        return 1

    print(f"Harness verification passed for {target}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
