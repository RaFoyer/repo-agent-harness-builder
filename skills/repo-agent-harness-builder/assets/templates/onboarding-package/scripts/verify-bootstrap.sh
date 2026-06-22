#!/usr/bin/env bash
set -euo pipefail

missing=0
for tool in node; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "missing required tool: $tool" >&2
    missing=1
  fi
done

if ! command -v unzip >/dev/null 2>&1 && ! command -v python3 >/dev/null 2>&1; then
  echo "missing archive tool: install unzip or python3" >&2
  missing=1
fi

if [ "$missing" -ne 0 ]; then
  exit 1
fi

echo "bootstrap prerequisites found"

if [ -f "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/MANIFEST.json" ] && command -v python3 >/dev/null 2>&1; then
  python3 "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/verify-package.py" --root "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
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
