#!/usr/bin/env python3
"""Scaffold a safe personal-folder harness from bundled templates."""

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
TEMPLATE_ROOT = SKILL_DIR / "assets" / "templates" / "personal-harness"
CLI_RE = re.compile(r"[a-z][a-z0-9-]{0,39}")
ID_RE = re.compile(r"[a-z][a-z0-9-]{0,31}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Scaffold a personal-folder harness.")
    parser.add_argument("--target", default="~/Documents/Home Harness", help="Folder to create or update.")
    parser.add_argument("--project-name", default="Home Harness")
    parser.add_argument("--cli-name", default="homeh")
    parser.add_argument(
        "--managed-folder",
        action="append",
        default=[],
        metavar="ID=PATH",
        help="Add a human-confirmed managed folder. Repeat for multiple folders.",
    )
    parser.add_argument(
        "--off-limits",
        action="append",
        default=[],
        metavar="PATH",
        help="Add an excluded path or area that should not be scanned by default.",
    )
    parser.add_argument(
        "--allow-protected-managed-folder",
        action="store_true",
        help="Allow a specific protected managed folder after explicit human approval. Home and filesystem root are still refused.",
    )
    parser.add_argument("--force", action="store_true", help="Overwrite existing scaffold files.")
    return parser.parse_args()


def single_line(flag: str, value: str) -> None:
    if any(ch in value for ch in "\r\n\0"):
        raise SystemExit(f"{flag} must be a single-line value.")


def validate_args(args: argparse.Namespace) -> None:
    if not CLI_RE.fullmatch(args.cli_name):
        raise SystemExit("--cli-name must be lowercase letters, digits, or hyphens, and start with a letter.")
    single_line("--project-name", args.project_name)
    for value in args.managed_folder:
        single_line("--managed-folder", value)
        folder = parse_managed_folder(value)
        validate_managed_folder(folder["path"], args.allow_protected_managed_folder)
    for value in args.off_limits:
        single_line("--off-limits", value)


def parse_managed_folder(value: str) -> dict[str, str]:
    if "=" not in value:
        raise SystemExit("--managed-folder must use ID=PATH format.")
    folder_id, folder_path = value.split("=", 1)
    if not ID_RE.fullmatch(folder_id):
        raise SystemExit("--managed-folder ID must be lowercase letters, digits, or hyphens, and start with a letter.")
    if not folder_path.strip():
        raise SystemExit("--managed-folder PATH must not be empty.")
    return {"id": folder_id, "path": folder_path, "defaultMode": "metadata-only"}


def path_contains(parent: Path, child: Path) -> bool:
    try:
        child.relative_to(parent)
        return True
    except ValueError:
        return False


def is_unbounded_root(path: Path) -> bool:
    home = Path.home().resolve()
    return path in {Path("/").resolve(), home}


def is_protected_install_root(path: Path) -> bool:
    home = Path.home().resolve()
    protected = {Path("/").resolve(), home, (home / "Desktop").resolve(), (home / "Documents").resolve(), (home / "Downloads").resolve()}
    return path in protected


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


def is_sensitive_managed_path(path_text: str) -> bool:
    expanded = Path(path_text).expanduser().resolve()
    home = Path.home().resolve()
    if is_unbounded_root(expanded):
        return True
    sensitive_roots = [
        home / ".ssh",
        home / ".gnupg",
        home / ".config",
        home / "Library",
        home / "Pictures" / "Photos Library.photoslibrary",
    ]
    if path_contains(home, expanded):
        if any(part.startswith(".") for part in expanded.relative_to(home).parts):
            return True
    return any(path_contains(root.resolve(), expanded) or path_contains(expanded, root.resolve()) for root in sensitive_roots)


def validate_managed_folder(path_text: str, allow_protected: bool) -> None:
    expanded = Path(path_text).expanduser().resolve()
    if is_unbounded_root(expanded):
        raise SystemExit("Refusing to manage home or filesystem root. Choose specific folders such as ~/Documents and ~/Downloads.")
    if is_sensitive_managed_path(path_text) and not allow_protected:
        raise SystemExit(
            f"Refusing protected managed folder without explicit approval: {path_text}. "
            "Use --allow-protected-managed-folder only after the user confirms this exact scope."
        )


def validate_target(target: Path, allow_protected: bool) -> None:
    if is_protected_install_root(target):
        raise SystemExit(
            "Refusing to install directly into home, Desktop, Documents, Downloads, or filesystem root. "
            "Choose a harness subfolder such as ~/Documents/Home Harness."
        )
    if is_sensitive_target(target) and not allow_protected:
        raise SystemExit(
            f"Refusing protected install target without explicit approval: {target}. "
            "Use --allow-protected-managed-folder only after the user confirms this exact install location."
        )
    if target.exists() and not target.is_dir():
        raise SystemExit(f"Target exists but is not a directory: {target}")


def substitutions(args: argparse.Namespace) -> dict[str, str]:
    return {
        "{{PROJECT_NAME}}": args.project_name,
        "{{CLI_NAME}}": args.cli_name,
        "{{REVIEW_DATE}}": date.today().isoformat(),
    }


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


def destination_for(source: Path, target: Path, cli_name: str) -> Path:
    rel = source.relative_to(TEMPLATE_ROOT)
    dest = target / rel
    if dest.name == "homeh.template":
        return dest.with_name(cli_name)
    if dest.name.endswith(".template"):
        return dest.with_name(dest.name[: -len(".template")])
    return dest


def collect_tree(target: Path, mapping: dict[str, str], cli_name: str) -> list[tuple[Path, Path, str]]:
    planned: list[tuple[Path, Path, str]] = []
    for source in sorted(TEMPLATE_ROOT.rglob("*")):
        if source.is_dir():
            continue
        dest = destination_for(source, target, cli_name)
        planned.append((source, dest, render(source.read_text(encoding="utf-8"), mapping)))
    return planned


def plan_writes(entries: list[tuple[Path, Path, str]], force: bool) -> list[tuple[Path, str]]:
    conflicts: list[Path] = []
    parent_conflicts: list[Path] = []
    for _source, dest, _content in entries:
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
    if parent_conflicts:
        sample = "\n".join(f"- {path}" for path in sorted(set(parent_conflicts))[:10])
        extra = "" if len(set(parent_conflicts)) <= 10 else f"\n... and {len(set(parent_conflicts)) - 10} more"
        raise SystemExit(f"Refusing to scaffold because parent paths are not directories. No files were written.\n{sample}{extra}")
    if conflicts:
        sample = "\n".join(f"- {path}" for path in conflicts[:10])
        extra = "" if len(conflicts) <= 10 else f"\n... and {len(conflicts) - 10} more"
        raise SystemExit(f"Refusing to overwrite existing files without --force. No files were written.\n{sample}{extra}")
    return [(dest, content) for _source, dest, content in entries]


class WriteTransaction:
    def __init__(self) -> None:
        self.backup_dir = Path(tempfile.mkdtemp(prefix="personal-harness-scaffold-backup-"))
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


def customize_scopes(target: Path, managed_folders: list[str], off_limits: list[str], allow_protected: bool, transaction: WriteTransaction) -> None:
    scopes_path = target / "config" / "scopes.json"
    data = json.loads(scopes_path.read_text(encoding="utf-8"))
    if managed_folders:
        folders = [parse_managed_folder(value) for value in managed_folders]
        data["managedFolders"] = folders
        data["scopeConfirmed"] = True
        if allow_protected:
            approved = data.setdefault("approvedProtectedManagedFolders", [])
            for folder in folders:
                if is_sensitive_managed_path(folder["path"]) and folder["path"] not in approved:
                    approved.append(folder["path"])
    if off_limits:
        existing = data.setdefault("excludedPaths", [])
        for value in off_limits:
            if value not in existing:
                existing.append(value)
    transaction.write_text(scopes_path, json.dumps(data, indent=2) + "\n")


def ensure_state_dirs(target: Path, transaction: WriteTransaction) -> None:
    for rel in [
        "state/inventories",
        "state/plans",
        "state/receipts",
        "state/quarantine",
        "state/undo",
        "reports",
    ]:
        transaction.mkdir(target / rel)


def make_executable(path: Path) -> None:
    mode = path.stat().st_mode
    path.chmod(mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


def make_entrypoints_executable(target: Path, cli_name: str, transaction: WriteTransaction) -> None:
    for candidate in [target / cli_name, *target.glob("*.command")]:
        transaction.chmod_executable(candidate)


def main() -> int:
    args = parse_args()
    validate_args(args)
    target = Path(args.target).expanduser().resolve()
    validate_target(target, args.allow_protected_managed_folder)
    planned = plan_writes(collect_tree(target, substitutions(args), args.cli_name), args.force)

    transaction = WriteTransaction()
    try:
        transaction.mkdir(target)
        written = write_planned(planned, transaction)
        customize_scopes(target, args.managed_folder, args.off_limits, args.allow_protected_managed_folder, transaction)
        ensure_state_dirs(target, transaction)
        make_entrypoints_executable(target, args.cli_name, transaction)
        transaction.commit()
    except BaseException:
        transaction.rollback()
        raise

    print(f"Scaffolded {len(written)} files into {target}")
    if args.managed_folder:
        print(f"Next: run ./{args.cli_name} help, ./{args.cli_name} preflight, and ./{args.cli_name} inventory scan")
    else:
        print(f"Next: add confirmed managed folders with --managed-folder ID=PATH or edit config/scopes.json, then run ./{args.cli_name} preflight")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
