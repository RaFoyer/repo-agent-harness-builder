#!/usr/bin/env bash
# Optional client-hook adapter. This catches obvious raw Slack bot sends, but it
# is not the enforcement boundary. Bind the bot credential to post.py so other
# commands lack the capability even when this string check misses a route.
set -uo pipefail

payload=$(cat)
command=$(printf '%s' "$payload" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input", {}).get("command", ""))' 2>/dev/null)
normalized=$(printf '%s' "$command" | tr 'A-Z' 'a-z' | sed -e 's/%2e/./g' -e 's/[_.]//g')

case "$normalized" in
  *postmessage*)
    printf '%s\n' \
      'BLOCKED: this command appears to bypass the outbound Slack gate.' \
      '' \
      'Use the repository-owned gated poster with --check-only first.' \
      'The command-scoped credential profile, not this hook, is the durable control.' >&2
    exit 2
    ;;
esac

exit 0
