#!/usr/bin/env bash
set -euo pipefail

mode="scaffold"
provenance_args=()
while [ "$#" -gt 0 ]; do
  case "$1" in
    --mode)
      mode="${2:-}"
      shift 2
      ;;
    --reference-only|--inspect-only)
      mode="reference-only"
      shift
      ;;
    --allow-missing-provenance)
      provenance_args=(--allow-missing-provenance)
      shift
      ;;
    *)
      echo "unknown option: $1" >&2
      echo "usage: scripts/verify-bootstrap.sh [--mode scaffold|repository|personal-folder|reference-only]" >&2
      exit 2
      ;;
  esac
done

missing=0
if [ "$mode" != "reference-only" ]; then
  for tool in node; do
    if ! command -v "$tool" >/dev/null 2>&1; then
      echo "missing required tool for $mode mode: $tool" >&2
      missing=1
    fi
  done
else
  if ! command -v node >/dev/null 2>&1; then
    echo "reference-only mode: node not found; generated CLI execution will be unavailable"
  fi
fi

if [ "$mode" = "repository" ] && ! command -v git >/dev/null 2>&1; then
  echo "missing required tool for $mode mode: git" >&2
  missing=1
fi

if ! command -v unzip >/dev/null 2>&1 && ! command -v python3 >/dev/null 2>&1; then
  echo "missing archive tool: install unzip or python3" >&2
  missing=1
fi

if [ "$missing" -ne 0 ]; then
  exit 1
fi

echo "bootstrap prerequisites found"

if [ -f "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/MANIFEST.json" ] && command -v python3 >/dev/null 2>&1; then
  python3 "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/verify-package.py" --root "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)" "${provenance_args[@]}"
fi

if command -v git >/dev/null 2>&1; then
  echo "repository mode: git found"
else
  echo "repository mode: git not found; personal-folder mode can still continue"
fi

if command -v gh >/dev/null 2>&1; then
  echo "GitHub helper found"
else
  echo "GitHub helper not found; only needed for GitHub workflows"
fi
