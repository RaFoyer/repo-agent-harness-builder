#!/usr/bin/env sh
set -eu

usage() {
  echo "Usage: scripts/setup-no-mistakes.sh [--fork-url <url>] [--check-only]"
  echo "Sets up the no-mistakes remote and verifies that status is initialized."
}

fork_url=""
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
cleanup() {
  if [ -n "$tmp_status" ]; then
    rm -f "$tmp_status"
  fi
}
trap cleanup EXIT INT TERM

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
    gitdir_line="$(sed -n 's/^gitdir:[[:space:]]*//p' .git | sed -n '1p')"
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
  mkdir -p "$info_dir"
  if [ -f "$exclude_file" ] && grep -Fxq ".no-mistakes/" "$exclude_file"; then
    echo "present"
    return
  fi
  if [ -s "$exclude_file" ]; then
    last_char="$(tail -c 1 "$exclude_file" 2>/dev/null || true)"
    if [ "$last_char" != "" ]; then
      printf '\n' >>"$exclude_file"
    fi
  fi
  printf '.no-mistakes/\n' >>"$exclude_file"
  echo "added"
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
  echo "no_mistakes_setup:"
  echo "  status: ok"
  echo "  available: true"
  echo "  initialized: true"
  echo "  fork_url: $(if [ -n "$fork_url" ]; then echo provided; else echo omitted; fi)"
  echo "  local_exclude: $local_exclude"
  echo "help[1]:"
  echo "  \"Commit a feature branch, then run git push no-mistakes <branch-name>\""
  exit 0
fi

echo "no_mistakes_setup:"
echo "  status: failed"
echo "  available: true"
echo "  initialized: false"
echo "  fork_url: $(if [ -n "$fork_url" ]; then echo provided; else echo omitted; fi)"
echo "  init_exit_code: $init_status"
echo "help[2]:"
echo "  \"Run no-mistakes status locally for detailed diagnostics\""
echo "  \"Do not paste raw no-mistakes output into tickets or chat before reviewing it\""
exit 1
