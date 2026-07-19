#!/usr/bin/env python3
"""Verify the expected shape of a repo-agent harness."""

from __future__ import annotations

import argparse
import os
import re
import subprocess
from pathlib import Path


REQUIRED_PROTOCOLS = [
    "AGENT-CLI-ERGONOMICS.md",
    "AUTOMATIONS.md",
    "PROTOCOL-TAXONOMY.md",
    "DOCUMENT-LIFECYCLE.md",
    "DOCUMENT-QUALITY.md",
    "CLI-INTERFACE.md",
    "DESIGN-SYSTEM.md",
    "LAVISH-REVIEW.md",
    "SOURCE-OF-TRUTH.md",
    "GOAL-GRAPH.md",
    "GOAL-CHAIN.md",
    "AGENT-ORCHESTRATION.md",
    "CODEX-NATIVE-FIRSTMATE.md",
    "QA-BROWSER.md",
    "PRIVILEGED-DOCUMENTS.md",
    "EXTERNAL-SYSTEMS.md",
    "NO-MISTAKES-GATE.md",
    "SESSION-PREFLIGHT.md",
    "PRE-COMMIT.md",
]
REQUIRED_PROTOCOL_FIELDS = ["protocol_id", "title", "status", "version", "owner", "last_reviewed", "summary", "related_protocols"]
VALID_PROTOCOL_STATUSES = {"active", "inactive", "not-applicable", "draft", "deprecated", "retired"}
COMMAND_SMOKE_TESTS = [
    ["help"],
    ["context"],
    ["checklist"],
    ["protocols"],
    ["doctor"],
    ["preflight"],
    ["verify", "--dry-run"],
    ["ergonomics", "status"],
    ["qa", "status"],
    ["secrets", "help"],
    ["connections", "status"],
    ["goals", "status"],
    ["orchestration", "status"],
    ["orchestration", "adapter-status"],
    ["orchestration", "taxonomy"],
    ["design", "status"],
    ["no-mistakes", "status"],
    ["lavish", "status"],
    ["self", "check"],
]
HARNESS_PLACEHOLDER_RE = re.compile(
    r"(?<!\\)\{\{(?:PROJECT_NAME|PROJECT_NAME_JSON|REPO_SLUG|REPO_SLUG_JSON|CLI_NAME|DEFAULT_BRANCH|DEFAULT_BRANCH_JSON|TRACKER_NAME|TRACKER_NAME_JSON)}}"
)
PATH_SEP = "/"
LOCAL_PATH_PARTS = [
    PATH_SEP + "Users" + PATH_SEP + r"[^\s)'\"]+",
    PATH_SEP + "home" + PATH_SEP + r"[^\s)'\"]+",
    PATH_SEP + "private" + PATH_SEP + "var" + PATH_SEP + r"[^\s)'\"]+",
    PATH_SEP + "tmp" + PATH_SEP + r"[^\s)'\"]+",
    PATH_SEP + "var" + PATH_SEP + "folders" + PATH_SEP + r"[^\s)'\"]+",
    PATH_SEP + "Volumes" + PATH_SEP + r"[^/\s)'\"]+" + PATH_SEP + r"[^\s)'\"]+",
    r"[A-Za-z]:\\" + "Users" + r"\\[^\r\n)'\"]+",
    r"~" + PATH_SEP + r"[^\s)'\"]+",
]
LOCAL_PATH_RE = re.compile("(" + "|".join(LOCAL_PATH_PARTS) + ")")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Verify a generated repo-agent harness.")
    parser.add_argument("--target", required=True)
    parser.add_argument("--cli-name", required=True)
    parser.add_argument("--run-tests", action="store_true")
    return parser.parse_args()


def display_path(path: Path, root: Path) -> str:
    try:
        return path.relative_to(root).as_posix()
    except ValueError:
        return LOCAL_PATH_RE.sub("<redacted-path>", str(path))


def check_file(path: Path, errors: list[str], root: Path | None = None) -> None:
    label = display_path(path, root) if root else str(path)
    if not path.exists():
        errors.append(f"missing: {label}")
    elif path.is_file() and path.stat().st_size == 0:
        errors.append(f"empty: {label}")


def is_harness_owned_path(rel_path: str, cli_name: str) -> bool:
    owned_exact = {
        "AGENTS.md",
        "AGENTS-TOC.md",
        "ops/HARNESS-CHECKLIST.md",
        "ops/connections.json",
        "ops/orchestration.json",
        ".agents/skills/project-orchestration/SKILL.md",
        ".agents/skills/goal-graph-loop/SKILL.md",
        ".agents/skills/goal-chain-loop/SKILL.md",
        ".agents/skills/codex-native-firstmate/SKILL.md",
        ".codex/config.firstmate.example.toml",
        ".codex/agents/firstmate-boss.toml",
        ".codex/agents/firstmate-manager.toml",
        ".codex/agents/firstmate-worker.toml",
        "docs/templates/orchestration/codex-native-firstmate-prompt.txt",
        "docs/templates/orchestration/codex-native-firstmate-adapter.example.json",
        "ops/precommit-allow.txt",
        ".no-mistakes.yaml",
        "scripts/setup-no-mistakes.sh",
        cli_name,
    }
    return rel_path in owned_exact or rel_path.startswith(("ops/protocols/", "apps/cli/", ".codex/agents/", ".agents/skills/"))


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


def validate_skill_composition(target: Path, errors: list[str]) -> None:
    contracts = {
        ".agents/skills/project-orchestration/SKILL.md": ["name: project-orchestration", "## Composition Order"],
        ".agents/skills/goal-graph-loop/SKILL.md": ["name: goal-graph-loop", "$project-orchestration"],
        ".agents/skills/goal-chain-loop/SKILL.md": ["name: goal-chain-loop", "$goal-graph-loop", "compatibility"],
        ".agents/skills/codex-native-firstmate/SKILL.md": ["name: codex-native-firstmate", "$project-orchestration"],
        "apps/cli/src/orchestration/index.mjs": ["requiredSkills", "missing required project-local skills"],
    }
    for rel_path, required_fragments in contracts.items():
        path = target / rel_path
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8")
        for fragment in required_fragments:
            if fragment not in text:
                errors.append(f"composition contract missing {fragment!r}: {rel_path}")


def leading_front_matter(text: str) -> str | None:
    match = re.match(r"^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)", text)
    return match.group(1) if match else None


def validate_protocol_front_matter(path: Path, root: Path, errors: list[str]) -> None:
    label = display_path(path, root)
    if not path.exists():
        return
    text = path.read_text(encoding="utf-8")
    front_matter = leading_front_matter(text)
    if front_matter is None:
        errors.append(f"protocol missing front matter: {label}")
        return
    for field in REQUIRED_PROTOCOL_FIELDS:
        if not re.search(rf"(?m)^{re.escape(field)}\s*:", front_matter):
            errors.append(f"protocol missing {field}: {label}")
    status_match = re.search(r"(?m)^status:\s*[\"']?([A-Za-z-]+)[\"']?\s*$", front_matter)
    if status_match and status_match.group(1).lower() not in VALID_PROTOCOL_STATUSES:
        errors.append(f"protocol has invalid status {status_match.group(1)!r}: {label}")
    if re.search(r"(?m)^last_reviewed:\s*YYYY-MM-DD\s*$", front_matter):
        errors.append(f"stale review-date placeholder: {label}")


def validate_no_stale_placeholders(target: Path, cli_name: str, errors: list[str]) -> None:
    for path in sorted(target.rglob("*")):
        if path.is_dir() or ".git" in path.parts or "node_modules" in path.parts:
            continue
        rel_path = path.relative_to(target).as_posix()
        if not is_harness_owned_path(rel_path, cli_name):
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
                errors.append(f"stale review-date placeholder: {rel_path}")
                break
            if not in_fence and HARNESS_PLACEHOLDER_RE.search(line):
                errors.append(f"unreplaced template placeholder: {rel_path}")
                break


def run_command_smoke(target: Path, cli_name: str, errors: list[str]) -> None:
    facade = target / cli_name
    if not facade.exists() or not os.access(facade, os.X_OK):
        return
    for args in COMMAND_SMOKE_TESTS:
        result = subprocess.run(
            [str(facade), *args],
            cwd=target,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        if result.returncode != 0:
            command = " ".join([f"./{cli_name}", *args])
            errors.append(f"command smoke failed ({result.returncode}) for {command}")


def main() -> int:
    args = parse_args()
    target = Path(args.target).expanduser().resolve()
    errors: list[str] = []

    for rel in [
        "AGENTS.md",
        "AGENTS-TOC.md",
        ".no-mistakes.yaml",
        "ops/HARNESS-CHECKLIST.md",
        "ops/connections.json",
        "ops/orchestration.json",
        ".agents/skills/project-orchestration/SKILL.md",
        ".agents/skills/project-orchestration/agents/openai.yaml",
        ".agents/skills/goal-graph-loop/SKILL.md",
        ".agents/skills/goal-graph-loop/agents/openai.yaml",
        ".agents/skills/goal-chain-loop/SKILL.md",
        ".agents/skills/goal-chain-loop/agents/openai.yaml",
        ".agents/skills/codex-native-firstmate/SKILL.md",
        ".agents/skills/codex-native-firstmate/agents/openai.yaml",
        ".codex/config.firstmate.example.toml",
        ".codex/agents/firstmate-boss.toml",
        ".codex/agents/firstmate-manager.toml",
        ".codex/agents/firstmate-worker.toml",
        "docs/templates/orchestration/codex-native-firstmate-prompt.txt",
        "docs/templates/orchestration/codex-native-firstmate-adapter.example.json",
        "scripts/setup-no-mistakes.sh",
        args.cli_name,
        "apps/cli/package.json",
    ]:
        check_file(target / rel, errors, target)

    for protocol in REQUIRED_PROTOCOLS:
        protocol_path = target / "ops" / "protocols" / protocol
        check_file(protocol_path, errors, target)
        validate_protocol_front_matter(protocol_path, target, errors)

    for rel in [
        f"apps/cli/bin/{args.cli_name}.mjs",
        "apps/cli/src/main.mjs",
        "apps/cli/src/help.mjs",
        "apps/cli/src/config.mjs",
        "apps/cli/src/commands/checklist.mjs",
        "apps/cli/src/connections/index.mjs",
        "apps/cli/src/ergonomics/index.mjs",
        "apps/cli/src/goals/index.mjs",
        "apps/cli/src/orchestration/index.mjs",
        "apps/cli/src/lavish/index.mjs",
        "apps/cli/src/no-mistakes/index.mjs",
        "apps/cli/src/qa/index.mjs",
        "apps/cli/src/verify/index.mjs",
        "apps/cli/src/preflight/session.mjs",
        "apps/cli/src/precommit/checklist.mjs",
        "apps/cli/src/util/secrets.mjs",
        "apps/cli/test/cli.test.mjs",
    ]:
        check_file(target / rel, errors, target)

    validate_checklist(target, errors)
    validate_skill_composition(target, errors)
    validate_no_stale_placeholders(target, args.cli_name, errors)

    facade = target / args.cli_name
    if facade.exists() and not os.access(facade, os.X_OK):
        errors.append(f"facade is not executable: {display_path(facade, target)}")
    bin_entrypoint = target / "apps" / "cli" / "bin" / f"{args.cli_name}.mjs"
    if bin_entrypoint.exists() and not os.access(bin_entrypoint, os.X_OK):
        errors.append(f"CLI bin entrypoint is not executable: {display_path(bin_entrypoint, target)}")
    setup_no_mistakes = target / "scripts" / "setup-no-mistakes.sh"
    if setup_no_mistakes.exists() and not os.access(setup_no_mistakes, os.X_OK):
        errors.append(f"no-mistakes setup script is not executable: {display_path(setup_no_mistakes, target)}")

    if not errors:
        run_command_smoke(target, args.cli_name, errors)

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

    print("Harness verification passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
