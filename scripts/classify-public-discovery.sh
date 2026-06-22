#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "usage: classify-public-discovery.sh OUTPUT_FILE" >&2
  exit 2
fi

output_file="$1"
if [ ! -f "$output_file" ]; then
  echo "unclassified"
  exit 0
fi

if grep -Eiq "repository not found|failed to clone repository|authentication failed|found[[:space:]]+0[[:space:]]+skills?|no skills found|selected[[:space:]]+0[[:space:]]+skills?|could not find (skill|repository|source)" "$output_file"; then
  echo "confirmed_failure"
elif grep -Eiq "EAI_AGAIN|ECONNRESET|ETIMEDOUT|ENOTFOUND|EHOSTUNREACH|ECONNREFUSED|HTTP[[:space:]]*(429|5[0-9][0-9])|[[:space:]](429|502|503|504)[[:space:]]|rate limit|too many requests|service unavailable|bad gateway|gateway timeout|temporar(y|ily) unavailable|temporary failure|timed out|timeout|network error|connection reset|connection refused|DNS" "$output_file"; then
  echo "transient"
else
  echo "unclassified"
fi
