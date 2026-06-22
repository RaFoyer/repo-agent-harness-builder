#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SOURCE="$PACKAGE_ROOT/skill/repo-agent-harness-builder"
SKILLS_CLI_PACKAGE="${SKILLS_CLI_PACKAGE:-skills@1.5.12}"
YES=0
INSTALL_SCOPE=""
ALL_AGENTS=0
PROJECT_DIR=""
AGENTS=()

agent_skill_candidates() {
  local target_dir="$1"
  local agent="$2"
  case "$agent" in
    codex)
      printf '%s\n' \
        "$target_dir/.agents/skills/repo-agent-harness-builder/SKILL.md" \
        "$target_dir/.codex/skills/repo-agent-harness-builder/SKILL.md"
      ;;
    claude|claude-code)
      printf '%s\n' "$target_dir/.claude/skills/repo-agent-harness-builder/SKILL.md"
      ;;
    gemini|gemini-cli)
      printf '%s\n' "$target_dir/.gemini/skills/repo-agent-harness-builder/SKILL.md"
      ;;
    cursor)
      printf '%s\n' "$target_dir/.cursor/skills/repo-agent-harness-builder/SKILL.md"
      ;;
    kimi|kimi-cli)
      printf '%s\n' "$target_dir/.kimi/skills/repo-agent-harness-builder/SKILL.md"
      ;;
    *)
      local safe_agent
      safe_agent="$(printf '%s' "$agent" | tr -c 'A-Za-z0-9_.-' '-')"
      printf '%s\n' \
        "$target_dir/.$safe_agent/skills/repo-agent-harness-builder/SKILL.md" \
        "$target_dir/.agents/skills/repo-agent-harness-builder/SKILL.md"
      ;;
  esac
}

verify_project_install_for_candidates() {
  local target_dir="$1"
  shift
  local candidate
  for candidate in "$@"; do
    if [ -f "$candidate" ]; then
      echo "verified project install: $candidate"
      return 0
    fi
  done
  return 1
}

project_install_candidates() {
  local target_dir="$1"
  if [ "${#AGENTS[@]}" -gt 0 ]; then
    local agent
    for agent in "${AGENTS[@]}"; do
      agent_skill_candidates "$target_dir" "$agent"
    done
    return
  fi
  printf '%s\n' \
    "$target_dir/.agents/skills/repo-agent-harness-builder/SKILL.md" \
    "$target_dir/.codex/skills/repo-agent-harness-builder/SKILL.md" \
    "$target_dir/.claude/skills/repo-agent-harness-builder/SKILL.md" \
    "$target_dir/.gemini/skills/repo-agent-harness-builder/SKILL.md" \
    "$target_dir/.cursor/skills/repo-agent-harness-builder/SKILL.md" \
    "$target_dir/.kimi/skills/repo-agent-harness-builder/SKILL.md"
}

usage() {
  cat <<'EOF'
Usage: install-skill.sh [--yes] [--global|--project] [--project-dir PATH] [--agent NAME ...] [--all-agents]

Default mode is dry-run. The script prints the npx skills command it would run.

Options:
  --yes          Run the install command.
  --global       Install globally for the selected agent client(s).
  --project      Install into the current project instead of globally.
  --project-dir PATH
                 Project directory for --project installs. Defaults to cwd,
                 but the package root itself is refused.
  --agent NAME   Install for one agent client. Repeat for multiple clients.
                 Examples: codex, claude-code, gemini-cli, cursor.
  --all-agents   Install for every agent supported by the local skills installer.
  --help         Show this help.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --yes)
      YES=1
      shift
      ;;
    --global)
      INSTALL_SCOPE="global"
      shift
      ;;
    --agent)
      if [ "$#" -lt 2 ]; then
        echo "--agent requires a value" >&2
        exit 2
      fi
      AGENTS+=("$2")
      shift 2
      ;;
    --all-agents)
      ALL_AGENTS=1
      shift
      ;;
    --project)
      INSTALL_SCOPE="project"
      shift
      ;;
    --project-dir)
      if [ "$#" -lt 2 ]; then
        echo "--project-dir requires a value" >&2
        exit 2
      fi
      PROJECT_DIR="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [ ! -d "$SOURCE" ]; then
  echo "missing skill source: $SOURCE" >&2
  exit 1
fi

CMD=(npx -y "$SKILLS_CLI_PACKAGE" add "$SOURCE" --skill repo-agent-harness-builder --copy)
if [ "$INSTALL_SCOPE" = "global" ]; then
  CMD+=(-g)
fi
if [ "$ALL_AGENTS" -eq 1 ]; then
  CMD+=(--agent "*")
fi
if [ "${#AGENTS[@]}" -gt 0 ]; then
  for agent in "${AGENTS[@]}"; do
    CMD+=(--agent "$agent")
  done
fi
if [ "$YES" -eq 1 ]; then
  CMD+=(-y)
fi

echo "source: $SOURCE"
if [ "$INSTALL_SCOPE" = "project" ]; then
  TARGET_DIR="${PROJECT_DIR:-$PWD}"
  if [ ! -d "$TARGET_DIR" ]; then
    echo "project directory does not exist: $TARGET_DIR" >&2
    exit 1
  fi
  TARGET_DIR="$(cd "$TARGET_DIR" && pwd)"
  if [ "$TARGET_DIR" = "$PACKAGE_ROOT" ]; then
    echo "--project install target is the extracted package root. Pass --project-dir /path/to/your/repo-or-folder." >&2
    exit 2
  fi
  echo "project-dir: $TARGET_DIR"
fi
echo "installer: ${CMD[*]}"

if [ "$YES" -ne 1 ]; then
  echo "dry run only. Re-run with --yes to install."
  echo "Use --global or --project to choose the install scope."
  echo "Use --agent NAME to target a client, or --all-agents for every locally supported client."
  exit 0
fi

if [ -z "$INSTALL_SCOPE" ]; then
  echo "--yes requires --global or --project so the install scope is explicit." >&2
  exit 2
fi

if ! command -v npx >/dev/null 2>&1; then
  echo "npx is required for multi-agent skill installation. Install Node.js/npm or use the extracted skill files as reference material." >&2
  exit 1
fi

if [ "$INSTALL_SCOPE" = "project" ]; then
  (cd "$TARGET_DIR" && "${CMD[@]}")
  EXPECTED_PROJECT_SKILLS=()
  while IFS= read -r candidate; do
    EXPECTED_PROJECT_SKILLS+=("$candidate")
  done < <(project_install_candidates "$TARGET_DIR")
  if ! verify_project_install_for_candidates "$TARGET_DIR" "${EXPECTED_PROJECT_SKILLS[@]}"; then
    echo "installer exited successfully but expected project skill files were not found in the requested client-local skill location(s)." >&2
    printf 'Checked:\n' >&2
    printf '  %s\n' "${EXPECTED_PROJECT_SKILLS[@]}" >&2
    exit 1
  fi
else
  "${CMD[@]}"
fi
