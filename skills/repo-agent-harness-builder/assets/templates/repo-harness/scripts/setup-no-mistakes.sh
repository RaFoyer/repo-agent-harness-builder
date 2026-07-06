#!/usr/bin/env sh
set -eu

usage() {
  echo "Usage: scripts/setup-no-mistakes.sh [--fork-url <url>] [--agent <agent>] [--check-only]"
  echo "Sets up the no-mistakes remote and verifies that status is initialized."
  echo "Agent choices: auto, codex, claude, rovodev, opencode, pi, copilot, or acp:<target>."
}

fork_url=""
agent=""
check_only=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --fork-url)
      shift
      if [ "$#" -eq 0 ]; then
        echo "error: --fork-url requires a value" >&2
        usage >&2
        exit 2
      fi
      fork_url="$1"
      ;;
    --fork-url=*)
      fork_url="${1#--fork-url=}"
      if [ -z "$fork_url" ]; then
        echo "error: --fork-url requires a value" >&2
        usage >&2
        exit 2
      fi
      ;;
    --agent)
      shift
      if [ "$#" -eq 0 ]; then
        echo "error: --agent requires a value" >&2
        usage >&2
        exit 2
      fi
      agent="$1"
      ;;
    --agent=*)
      agent="${1#--agent=}"
      if [ -z "$agent" ]; then
        echo "error: --agent requires a value" >&2
        usage >&2
        exit 2
      fi
      ;;
    --check-only)
      check_only=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "error: unexpected argument" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

tmp_status=""
tmp_config=""
cleanup() {
  if [ -n "$tmp_status" ]; then
    rm -f "$tmp_status"
  fi
  if [ -n "$tmp_config" ]; then
    rm -f "$tmp_config"
  fi
}
trap cleanup EXIT INT TERM

normalize_agent() {
  case "$1" in
    claude-code) echo "claude" ;;
    openai|gpt) echo "codex" ;;
    auto|claude|codex|rovodev|opencode|pi|copilot) echo "$1" ;;
    acp:*)
      acp_target="${1#acp:}"
      case "$acp_target" in
        [abcdefghijklmnopqrstuvwxyz0123456789]*)
          case "$acp_target" in
            *[!abcdefghijklmnopqrstuvwxyz0123456789._-]*) return 1 ;;
            *) echo "$1" ;;
          esac
          ;;
        *) return 1 ;;
      esac
      ;;
    *) return 1 ;;
  esac
}

agent_label() {
  case "$1" in
    acp:*) echo "acp:configured" ;;
    "") echo "unchanged" ;;
    *) echo "$1" ;;
  esac
}

if [ -n "$agent" ]; then
  if normalized_agent="$(normalize_agent "$agent")"; then
    agent="$normalized_agent"
  else
    echo "error: unsupported --agent value" >&2
    usage >&2
    exit 2
  fi
fi

print_repo_unavailable() {
  echo "no_mistakes_setup:"
  echo "  status: unavailable"
  echo "  available: false"
  echo "  initialized: false"
  echo "help[1]:"
  echo "  \"Run scripts/setup-no-mistakes.sh from the generated repository checkout\""
}

script_path="$0"
case "$script_path" in
  */*) ;;
  *)
    resolved_script_path="$(command -v "$script_path" 2>/dev/null || true)"
    case "$resolved_script_path" in
      */*) script_path="$resolved_script_path" ;;
    esac
    ;;
esac
case "$script_path" in
  */*) ;;
  *)
    print_repo_unavailable
    exit 1
    ;;
esac
script_dir="$(dirname "$script_path")"
if ! repo_root="$(CDPATH= cd "$script_dir/.." 2>/dev/null && pwd -P)"; then
  print_repo_unavailable
  exit 1
fi
if ! cd "$repo_root" 2>/dev/null; then
  print_repo_unavailable
  exit 1
fi

print_unavailable() {
  echo "no_mistakes_setup:"
  echo "  status: unavailable"
  echo "  available: false"
  echo "  initialized: false"
  echo "help[2]:"
  echo "  \"Install no-mistakes, then rerun scripts/setup-no-mistakes.sh\""
  echo "  \"Run ./{{CLI_NAME}} no-mistakes status for a value-safe summary\""
}

is_initialized() {
  if no-mistakes status >"$tmp_status" 2>&1; then
    status_code=0
  else
    status_code=$?
  fi
  if grep -Eiq "not initialized|no-mistakes init|run .*init|not in a git repository|not a git repository|no git repository|missing remote|no remote|not configured" "$tmp_status"; then
    return 1
  fi
  [ "$status_code" -eq 0 ] && grep -Eq "^[[:space:]]*gate:[[:space:]]*[^[:space:]]+" "$tmp_status"
}

ensure_local_exclude() {
  if [ -d ".git" ]; then
    info_dir=".git/info"
  elif [ -f ".git" ]; then
    gitdir_line="$(sed -n 's/^gitdir:[[:space:]]*//p' .git 2>/dev/null | sed -n '1p')"
    if [ -z "$gitdir_line" ]; then
      echo "unavailable"
      return
    fi
    case "$gitdir_line" in
      /*) info_dir="$gitdir_line/info" ;;
      *) info_dir="$gitdir_line/info" ;;
    esac
  else
    echo "unavailable"
    return
  fi
  exclude_file="$info_dir/exclude"
  if ! mkdir -p "$info_dir" 2>/dev/null; then
    echo "unavailable"
    return
  fi
  if [ -f "$exclude_file" ]; then
    if grep -Fxq ".no-mistakes/" "$exclude_file" 2>/dev/null; then
      echo "present"
      return
    fi
  fi
  if [ -s "$exclude_file" ]; then
    last_char="$(tail -c 1 "$exclude_file" 2>/dev/null || true)"
    if [ "$last_char" != "" ]; then
      if ! printf '\n' >>"$exclude_file" 2>/dev/null; then
        echo "unavailable"
        return
      fi
    fi
  fi
  if ! printf '.no-mistakes/\n' >>"$exclude_file" 2>/dev/null; then
    echo "unavailable"
    return
  fi
  echo "added"
}

write_agent_config() {
  if [ -z "$agent" ]; then
    echo "unchanged"
    return
  fi
  if [ -n "${NM_HOME:-}" ]; then
    nm_home="$NM_HOME"
  elif [ -n "${HOME:-}" ]; then
    nm_home="$HOME/.no-mistakes"
  else
    echo "unavailable"
    return
  fi
  config_file="$nm_home/config.yaml"
  config_dir="$(dirname "$config_file")"
  if ! mkdir -p "$config_dir" 2>/dev/null; then
    echo "unavailable"
    return
  fi
  chmod 700 "$config_dir" 2>/dev/null || true
  if ! tmp_config="$(mktemp 2>/dev/null)"; then
    echo "unavailable"
    return
  fi
  if [ -f "$config_file" ]; then
    if ! awk -v agent="$agent" '
      BEGIN { wrote = 0 }
      /^[[:space:]]*agent[[:space:]]*:/ && wrote == 0 {
        print "agent: " agent
        wrote = 1
        next
      }
      { print }
      END {
        if (wrote == 0) print "agent: " agent
      }
    ' "$config_file" >"$tmp_config" 2>/dev/null; then
      rm -f "$tmp_config"
      tmp_config=""
      echo "unavailable"
      return
    fi
  else
    if ! printf 'agent: %s\n' "$agent" >"$tmp_config" 2>/dev/null; then
      rm -f "$tmp_config"
      tmp_config=""
      echo "unavailable"
      return
    fi
  fi
  if ! mv "$tmp_config" "$config_file" 2>/dev/null; then
    rm -f "$tmp_config"
    tmp_config=""
    echo "unavailable"
    return
  fi
  tmp_config=""
  chmod 600 "$config_file" 2>/dev/null || true
  echo "updated"
}

if ! command -v no-mistakes >/dev/null 2>&1; then
  print_unavailable
  exit 1
fi

if ! tmp_status="$(mktemp 2>/dev/null)"; then
  echo "no_mistakes_setup:"
  echo "  status: temp-unavailable"
  echo "  available: true"
  echo "  initialized: false"
  echo "help[1]:"
  echo "  \"Install mktemp or run ./{{CLI_NAME}} no-mistakes status for a value-safe summary\""
  exit 1
fi

if [ "$check_only" -eq 1 ]; then
  if is_initialized; then
    echo "no_mistakes_setup:"
    echo "  status: initialized"
    echo "  available: true"
    echo "  initialized: true"
    exit 0
  fi
  echo "no_mistakes_setup:"
  echo "  status: not-initialized"
  echo "  available: true"
  echo "  initialized: false"
  echo "help[1]:"
  echo "  \"Run scripts/setup-no-mistakes.sh to initialize the no-mistakes remote\""
  exit 1
fi

if [ -n "$fork_url" ]; then
  if no-mistakes init --fork-url "$fork_url" >/dev/null 2>&1; then
    init_status=0
  else
    init_status=$?
  fi
else
  if no-mistakes init >/dev/null 2>&1; then
    init_status=0
  else
    init_status=$?
  fi
fi

if [ "$init_status" -eq 0 ] && is_initialized; then
  local_exclude="$(ensure_local_exclude)"
  agent_config="$(write_agent_config)"
  setup_status="ok"
  exit_status=0
  if [ -n "$agent" ] && [ "$agent_config" != "updated" ]; then
    setup_status="agent-config-failed"
    exit_status=1
  fi
  echo "no_mistakes_setup:"
  echo "  status: $setup_status"
  echo "  available: true"
  echo "  initialized: true"
  echo "  fork_url: $(if [ -n "$fork_url" ]; then echo provided; else echo omitted; fi)"
  echo "  agent_config: $agent_config"
  echo "  agent: $(agent_label "$agent")"
  echo "  local_exclude: $local_exclude"
  if [ "$exit_status" -eq 0 ]; then
    echo "help[2]:"
    echo "  \"Commit a feature branch, then run git push no-mistakes <branch-name>\""
    echo "  \"Pass --agent codex, --agent claude, or --agent auto only when you want to pin local no-mistakes behavior\""
  else
    echo "help[2]:"
    echo "  \"Check user-local no-mistakes config permissions, then rerun setup with --agent\""
    echo "  \"Rerun setup without --agent only if you want to keep the existing or default agent\""
  fi
  exit "$exit_status"
fi

echo "no_mistakes_setup:"
echo "  status: failed"
echo "  available: true"
echo "  initialized: false"
echo "  fork_url: $(if [ -n "$fork_url" ]; then echo provided; else echo omitted; fi)"
echo "  agent_config: unchanged"
echo "  agent: unchanged"
echo "  init_exit_code: $init_status"
echo "help[2]:"
echo "  \"Run no-mistakes status locally for detailed diagnostics\""
echo "  \"Do not paste raw no-mistakes output into tickets or chat before reviewing it\""
exit 1
