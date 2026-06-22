#!/usr/bin/env bash
set -euo pipefail

PACKAGE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${1:-$(dirname "$PACKAGE_ROOT")/dist}"
BUILDER="$PACKAGE_ROOT/skill/repo-agent-harness-builder/scripts/build_reference_package.py"

mkdir -p "$OUT_DIR"

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required so the package builder can run manifest, path, and secret-safety checks." >&2
  exit 1
fi

if [ ! -f "$BUILDER" ]; then
  echo "missing package builder: $BUILDER" >&2
  exit 1
fi

exec python3 "$BUILDER" --out-dir "$OUT_DIR"
