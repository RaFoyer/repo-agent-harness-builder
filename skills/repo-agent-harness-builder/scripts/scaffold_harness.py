#!/usr/bin/env python3
"""Scaffold a generic repo-agent harness from bundled templates."""

from __future__ import annotations

import argparse
import json
import re
import shutil
import stat
import tempfile
from datetime import date
from pathlib import Path


SKILL_DIR = Path(__file__).resolve().parents[1]
TEMPLATE_DIR = SKILL_DIR / "assets" / "templates"
CODEX_FIRSTMATE_TEMPLATE_DIR = TEMPLATE_DIR / "client-adapters" / "codex-native-firstmate"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Scaffold a repo-agent harness.")
    parser.add_argument("--target", required=True, help="Repository root to write into.")
    parser.add_argument("--project-name", required=True)
    parser.add_argument("--repo-slug", required=True)
    parser.add_argument("--cli-name", required=True)
    parser.add_argument("--default-branch", default="main")
    parser.add_argument("--tracker-name", default="the canonical tracker")
    parser.add_argument("--force", action="store_true", help="Overwrite existing scaffold files.")
    parser.add_argument("--allow-non-git", action="store_true", help="Allow a non-git project folder. Personal folders are still refused.")
    parser.add_argument(
        "--allow-protected-target",
        action="store_true",
        help="Allow scaffolding inside hidden, credential, app-support, cloud-internal, or external-drive paths after explicit approval.",
    )
    return parser.parse_args()


def substitutions(args: argparse.Namespace) -> dict[str, str]:
    return {
        "{{PROJECT_NAME}}": args.project_name,
        "{{REPO_SLUG}}": args.repo_slug,
        "{{CLI_NAME}}": args.cli_name,
        "{{DEFAULT_BRANCH}}": args.default_branch,
        "{{TRACKER_NAME}}": args.tracker_name,
        "{{PROJECT_NAME_JSON}}": json.dumps(args.project_name),
        "{{REPO_SLUG_JSON}}": json.dumps(args.repo_slug),
        "{{DEFAULT_BRANCH_JSON}}": json.dumps(args.default_branch),
        "{{TRACKER_NAME_JSON}}": json.dumps(args.tracker_name),
        "{{REVIEW_DATE}}": date.today().isoformat(),
    }


def validate_args(args: argparse.Namespace) -> None:
    if not re.fullmatch(r"[a-z][a-z0-9-]{0,39}", args.cli_name):
        raise SystemExit("--cli-name must be lowercase letters, digits, or hyphens, and start with a letter.")

    values = {
        "--project-name": args.project_name,
        "--repo-slug": args.repo_slug,
        "--default-branch": args.default_branch,
        "--tracker-name": args.tracker_name,
    }
    for flag, value in values.items():
        if any(ch in value for ch in "\r\n\0"):
            raise SystemExit(f"{flag} must be a single-line value.")


def is_git_repo(path: Path) -> bool:
    return (path / ".git").exists()


def is_personal_root(path: Path) -> bool:
    home = Path.home().resolve()
    personal_roots = {
        home,
        (home / "Desktop").resolve(),
        (home / "Documents").resolve(),
        (home / "Downloads").resolve(),
    }
    return path in personal_roots


def path_contains(parent: Path, child: Path) -> bool:
    try:
        child.relative_to(parent)
        return True
    except ValueError:
        return False


def is_sensitive_target(path: Path) -> bool:
    home = Path.home().resolve()
    sensitive_roots = [
        home / ".ssh",
        home / ".gnupg",
        home / ".config",
        home / "Library",
        home / "Pictures" / "Photos Library.photoslibrary",
        Path("/Volumes").resolve(),
    ]
    if path_contains(home, path) and any(part.startswith(".") for part in path.relative_to(home).parts):
        return True
    return any(path_contains(root.resolve(), path) or path_contains(path, root.resolve()) for root in sensitive_roots)


def validate_target(target: Path, allow_non_git: bool, allow_protected_target: bool) -> None:
    if is_personal_root(target):
        raise SystemExit(
            "Refusing to scaffold a repo harness directly into a personal root folder. "
            "Use scaffold_personal_harness.py for Documents/Downloads/Desktop-style use cases, "
            "or choose a project subfolder."
        )

    if is_sensitive_target(target) and not allow_protected_target:
        raise SystemExit(
            f"Refusing protected target without explicit approval: {target}. "
            "Use --allow-protected-target only after the user confirms this exact install location."
        )

    if not target.exists() and not allow_non_git:
        raise SystemExit("Target does not exist. Create or clone the repo first, or pass --allow-non-git for a project folder.")

    if target.exists() and not is_git_repo(target) and not allow_non_git:
        raise SystemExit("Target is not a git repository. Pass --allow-non-git only for a deliberate project folder.")


def render(text: str, mapping: dict[str, str]) -> str:
    for key, value in mapping.items():
        text = text.replace(key, value)
    review_date = mapping["{{REVIEW_DATE}}"]
    if text.startswith("---\n"):
        end = text.find("\n---", 4)
        if end != -1:
            front_matter = text[:end]
            body = text[end:]
            front_matter = re.sub(r"(?m)^last_reviewed: YYYY-MM-DD$", f"last_reviewed: {review_date}", front_matter)
            text = front_matter + body
    return text


def destination_for(template_root: Path, source: Path, target: Path, cli_name: str) -> Path:
    rel = source.relative_to(template_root)
    parts = [cli_name if part == "__CLI_NAME__" else part for part in rel.parts]
    path = target.joinpath(*parts)
    if path.name.endswith(".template"):
        path = path.with_name(path.name[: -len(".template")])
    if path.name == "facade":
        path = path.with_name(cli_name)
    if path.name == "facade.mjs":
        path = path.with_name(f"{cli_name}.mjs")
    return path


def collect_tree(template_root: Path, target: Path, mapping: dict[str, str], cli_name: str) -> list[tuple[Path, Path, str]]:
    planned: list[tuple[Path, Path, str]] = []
    for source in sorted(template_root.rglob("*")):
        if source.is_dir():
            continue
        dest = destination_for(template_root, source, target, cli_name)
        content = render(source.read_text(encoding="utf-8"), mapping)
        planned.append((source, dest, content))
    return planned


def merge_root_package_json(existing_text: str, generated_text: str) -> str:
    try:
        existing = json.loads(existing_text)
        generated = json.loads(generated_text)
    except json.JSONDecodeError as error:
        raise SystemExit(f"Refusing to merge invalid root package.json: {error}") from error
    if not isinstance(existing, dict) or not isinstance(generated, dict):
        raise SystemExit("Refusing to merge root package.json unless both files contain JSON objects.")
    scripts = existing.setdefault("scripts", {})
    if not isinstance(scripts, dict):
        raise SystemExit("Refusing to merge root package.json because scripts is not an object.")
    generated_scripts = generated.get("scripts", {})
    if "test:cli" in generated_scripts and "test:cli" not in scripts:
        scripts["test:cli"] = generated_scripts["test:cli"]
    return json.dumps(existing, indent=2) + "\n"


def plan_writes(entries: list[tuple[Path, Path, str]], target: Path, force: bool) -> list[tuple[Path, str]]:
    root_package = target / "package.json"
    conflicts: list[Path] = []
    parent_conflicts: list[Path] = []
    planned: list[tuple[Path, str]] = []
    for _source, dest, content in entries:
        if dest == root_package and dest.exists():
            if not dest.is_file():
                parent_conflicts.append(dest)
                continue
            planned.append((dest, merge_root_package_json(dest.read_text(encoding="utf-8"), content)))
            continue
        if dest.exists() and not dest.is_file():
            parent_conflicts.append(dest)
            continue
        if dest.exists() and not force:
            conflicts.append(dest)
        for parent in dest.parents:
            if parent.exists():
                if not parent.is_dir():
                    parent_conflicts.append(parent)
                break
        planned.append((dest, content))
    if parent_conflicts:
        unique = sorted(set(parent_conflicts))
        sample = "\n".join(f"- {path}" for path in unique[:10])
        extra = "" if len(unique) <= 10 else f"\n... and {len(unique) - 10} more"
        raise SystemExit(f"Refusing to scaffold because parent paths are not directories. No files were written.\n{sample}{extra}")
    if conflicts:
        sample = "\n".join(f"- {path}" for path in conflicts[:10])
        extra = "" if len(conflicts) <= 10 else f"\n... and {len(conflicts) - 10} more"
        raise SystemExit(f"Refusing to overwrite existing files without --force. No files were written.\n{sample}{extra}")
    return planned


class WriteTransaction:
    def __init__(self) -> None:
        self.backup_dir = Path(tempfile.mkdtemp(prefix="repo-harness-scaffold-backup-"))
        self.backups: dict[Path, Path | None] = {}
        self.original_modes: dict[Path, int] = {}
        self.created_dirs: list[Path] = []
        self.closed = False

    def mkdir(self, path: Path) -> None:
        if path.exists():
            if not path.is_dir():
                raise NotADirectoryError(path)
            return
        self.mkdir(path.parent)
        path.mkdir()
        self.created_dirs.append(path)

    def remember_file(self, path: Path) -> None:
        if path in self.backups:
            return
        if path.exists():
            backup = self.backup_dir / str(len(self.backups))
            shutil.copy2(path, backup)
            self.backups[path] = backup
        else:
            self.backups[path] = None

    def write_text(self, path: Path, content: str) -> None:
        self.mkdir(path.parent)
        self.remember_file(path)
        path.write_text(content, encoding="utf-8")

    def chmod_executable(self, path: Path) -> None:
        if not path.exists():
            return
        if path not in self.original_modes:
            self.original_modes[path] = path.stat().st_mode
        mode = path.stat().st_mode
        path.chmod(mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

    def rollback(self) -> None:
        if self.closed:
            return
        for path, mode in reversed(list(self.original_modes.items())):
            if path.exists():
                path.chmod(mode)
        for path, backup in reversed(list(self.backups.items())):
            if backup is None:
                if path.exists() and path.is_file():
                    path.unlink()
            elif backup.exists():
                self.mkdir(path.parent)
                shutil.copy2(backup, path)
        for directory in reversed(self.created_dirs):
            try:
                directory.rmdir()
            except OSError:
                pass
        shutil.rmtree(self.backup_dir, ignore_errors=True)
        self.closed = True

    def commit(self) -> None:
        shutil.rmtree(self.backup_dir, ignore_errors=True)
        self.closed = True


def write_planned(planned: list[tuple[Path, str]], transaction: WriteTransaction) -> list[Path]:
    written: list[Path] = []
    for dest, content in planned:
        transaction.write_text(dest, content)
        written.append(dest)
    return written


def make_executable(path: Path) -> None:
    mode = path.stat().st_mode
    path.chmod(mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


def main() -> int:
    args = parse_args()
    validate_args(args)
    target = Path(args.target).expanduser().resolve()
    validate_target(target, args.allow_non_git, args.allow_protected_target)
    mapping = substitutions(args)

    entries: list[tuple[Path, Path, str]] = []
    entries.extend(collect_tree(TEMPLATE_DIR / "repo-harness", target, mapping, args.cli_name))
    entries.extend(collect_tree(TEMPLATE_DIR / "cli-skeleton", target, mapping, args.cli_name))
    entries.extend(collect_tree(CODEX_FIRSTMATE_TEMPLATE_DIR / "repo-root", target, mapping, args.cli_name))
    entries.extend(
        collect_tree(
            CODEX_FIRSTMATE_TEMPLATE_DIR / "skill",
            target / ".agents" / "skills" / "codex-native-firstmate",
            mapping,
            args.cli_name,
        )
    )
    planned = plan_writes(entries, target, args.force)

    transaction = WriteTransaction()
    try:
        transaction.mkdir(target)
        written = write_planned(planned, transaction)

        facade = target / args.cli_name
        transaction.chmod_executable(facade)
        bin_entrypoint = target / "apps" / "cli" / "bin" / f"{args.cli_name}.mjs"
        transaction.chmod_executable(bin_entrypoint)
        setup_no_mistakes = target / "scripts" / "setup-no-mistakes.sh"
        transaction.chmod_executable(setup_no_mistakes)
        transaction.commit()
    except BaseException:
        transaction.rollback()
        raise

    print(f"Scaffolded {len(written)} files into {target}")
    print(f"Next: run ./{args.cli_name} help, ./{args.cli_name} preflight, and node --test apps/cli/test/*.test.mjs")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
