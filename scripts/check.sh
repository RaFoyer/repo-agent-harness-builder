#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILL="$ROOT/skills/repo-agent-harness-builder"
TMP="$(mktemp -d)"
SKILLS_CLI_PACKAGE="${SKILLS_CLI_PACKAGE:-skills@1.5.12}"
trap 'rm -rf "$TMP"' EXIT

run_with_retries() {
  local attempt=1
  local max_attempts="${MAX_ATTEMPTS:-3}"
  local delay_seconds="${RETRY_DELAY_SECONDS:-2}"
  until "$@"; do
    if [ "$attempt" -ge "$max_attempts" ]; then
      return 1
    fi
    attempt=$((attempt + 1))
    sleep "$delay_seconds"
    delay_seconds=$((delay_seconds * 2))
  done
}

if [ "${PUBLIC_INSTALL_ONLY:-0}" = "1" ]; then
  echo "== public install discovery only =="
  PUBLIC_INSTALL_REPO="${PUBLIC_INSTALL_REPO:-RaFoyer/repo-agent-harness-builder}"
  run_with_retries npx -y "$SKILLS_CLI_PACKAGE" add "$PUBLIC_INSTALL_REPO" --skill repo-agent-harness-builder --agent codex --list
  echo "public install discovery passed"
  exit 0
fi

if [ "${SKIP_SKILLS_DISCOVERY:-0}" != "1" ]; then
  echo "== skill discovery =="
  run_with_retries npx -y "$SKILLS_CLI_PACKAGE" add "$ROOT" --skill repo-agent-harness-builder --agent codex --list >/dev/null
else
  echo "== skill discovery skipped =="
fi

if [ "${CHECK_PUBLIC_INSTALL:-0}" = "1" ]; then
  echo "== public install discovery =="
  PUBLIC_INSTALL_REPO="${PUBLIC_INSTALL_REPO:-RaFoyer/repo-agent-harness-builder}"
  run_with_retries npx -y "$SKILLS_CLI_PACKAGE" add "$PUBLIC_INSTALL_REPO" --skill repo-agent-harness-builder --agent codex --list
fi

echo "== python syntax =="
python3 -m py_compile \
  "$SKILL/scripts/build_reference_package.py" \
  "$SKILL/scripts/scaffold_harness.py" \
  "$SKILL/scripts/scaffold_personal_harness.py" \
  "$SKILL/scripts/verify_harness.py"
echo "== workflow guardrails =="
python3 - "$ROOT/.github/workflows/release.yml" <<'PY'
import sys
from pathlib import Path

text = Path(sys.argv[1]).read_text(encoding="utf-8")
required = [
    "generated_sha_from_existing_zip=1",
    'if [ "$generated_sha_from_existing_zip" != "1" ]; then',
    'missing_assets+=("existing-release-assets/$sha_name")',
]
missing = [item for item in required if item not in text]
if missing:
    raise SystemExit(f"release workflow partial-asset self-heal guard missing: {missing}")
PY
echo "== public discovery classifier =="
printf 'Failed to clone repository\n' > "$TMP/confirmed-discovery.out"
if [ "$(bash "$ROOT/scripts/classify-public-discovery.sh" "$TMP/confirmed-discovery.out")" != "confirmed_failure" ]; then
  echo "expected failed clone output to classify as confirmed_failure" >&2
  exit 1
fi
printf 'Could not find skill repo-agent-harness-builder\n' > "$TMP/missing-skill.out"
if [ "$(bash "$ROOT/scripts/classify-public-discovery.sh" "$TMP/missing-skill.out")" != "confirmed_failure" ]; then
  echo "expected missing skill output to classify as confirmed_failure" >&2
  exit 1
fi
printf 'Found 0 skills\n' > "$TMP/zero-skills.out"
if [ "$(bash "$ROOT/scripts/classify-public-discovery.sh" "$TMP/zero-skills.out")" != "confirmed_failure" ]; then
  echo "expected zero-skill output to classify as confirmed_failure" >&2
  exit 1
fi
printf 'npm ERR! 503 Service Unavailable\ncould not find package skills\n' > "$TMP/transient-discovery.out"
if [ "$(bash "$ROOT/scripts/classify-public-discovery.sh" "$TMP/transient-discovery.out")" != "transient" ]; then
  echo "expected npm/package outage output to classify as transient" >&2
  exit 1
fi
printf 'npm ERR! 503 Service Unavailable\nFailed to clone repository\n' > "$TMP/mixed-discovery.out"
if [ "$(bash "$ROOT/scripts/classify-public-discovery.sh" "$TMP/mixed-discovery.out")" != "confirmed_failure" ]; then
  echo "expected mixed transient and discovery-miss output to classify as confirmed_failure" >&2
  exit 1
fi
printf 'unrecognized public installer failure\n' > "$TMP/unrecognized-discovery.out"
if [ "$(bash "$ROOT/scripts/classify-public-discovery.sh" "$TMP/unrecognized-discovery.out")" != "unclassified" ]; then
  echo "expected unrecognized installer output to classify as unclassified" >&2
  exit 1
fi
if [ "$(bash "$ROOT/scripts/classify-public-discovery.sh" "$TMP/does-not-exist.out")" != "unclassified" ]; then
  echo "expected missing classifier output file to classify as unclassified" >&2
  exit 1
fi
if [ "$(bash "$ROOT/scripts/classify-public-discovery.sh" "$ROOT/tests/fixtures/public-discovery/repo-not-found.txt")" != "confirmed_failure" ]; then
  echo "expected captured missing repo transcript to classify as confirmed_failure" >&2
  exit 1
fi
find "$SKILL" -type d -name __pycache__ -prune -exec rm -rf {} +
python3 - "$SKILL/scripts/build_reference_package.py" <<'PY'
import importlib.util
import sys
from pathlib import Path

spec = importlib.util.spec_from_file_location("builder", Path(sys.argv[1]))
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)
assert builder.find_secret_indicators('token="' + 'xox' + 'b-1234567890-abcdefghi"')
assert builder.find_secret_indicators('credential="' + 'ya' + '29.real-looking-token-value-abcdefghijklmnopqrstuvwxyz"')
assert builder.find_secret_indicators('api_' + 'key="corp-test-key-9f8a2c7e6d5b4a3c"')
assert builder.find_secret_indicators('_' + 'authToken=' + 'npm_' + 'abcdefghijklmnopqrstuvwxyz')
assert builder.find_secret_indicators('mach' + 'ine example.com login user pass' + 'word super-secret')
assert builder.find_secret_indicators('DATABASE_URL=' + 'postgres://' + 'user:realpass@example.com/db')
assert builder.find_secret_indicators('dsn=' + 'mysql://' + 'user:realpass@example.com/db')
assert builder.find_secret_indicators('apitoken_blob="' + 'Hx9Qa7Lm2Pz8' + 'Rt5Nv3Cy6Kw1' + 'Bb4Uf0Sd9Je2' + 'Yg7Qm5' + '"')
assert builder.find_secret_indicators('secret_value="' + 'a1b2c3d4e5f6' + 'a7b8c9d0e1f2' + 'a3b4c5d6e7f8' + 'a9b0' + '"')
assert builder.find_secret_indicators('apitoken_blob="' + 'a1b2c3d4e5f6' + 'a7b8c9d0e1f2' + 'a3b4c5d6e7f8' + 'a9b0' + '"')
assert not builder.find_secret_indicators("evidenceTokens = row.split('|').map((part) => part.trim())")
assert builder.LOCAL_PATH_RE.search('artifact at ' + '/tmp/' + 'machine-specific-output')
assert builder.LOCAL_PATH_RE.search('artifact at ' + '/Volumes/' + 'DriveName/private-output')
assert builder.find_credential_ref_issues('"credential' + 'Refs": ["not-a-safe-' + 'reference-token"]')
assert not builder.find_credential_ref_issues('"credentialRefs": ["keychain:google-workspace-oauth"]')
PY
find "$SKILL" -type d -name __pycache__ -prune -exec rm -rf {} +

echo "== public tree scan =="
python3 "$ROOT/scripts/scan-public-tree.py"
python3 - "$ROOT/scripts/scan-public-tree.py" <<'PY'
import importlib.util
import sys
from pathlib import Path

spec = importlib.util.spec_from_file_location("public_scan", Path(sys.argv[1]))
public_scan = importlib.util.module_from_spec(spec)
spec.loader.exec_module(public_scan)
assert ".key" in public_scan.FORBIDDEN_SUFFIXES
PY

echo "== orchestration loop prompt contracts =="
python3 - "$SKILL/assets/templates" <<'PY'
import sys
from pathlib import Path

root = Path(sys.argv[1])
manager_paths = [
    root / "goal-graph" / "MANAGER-THREAD-PROMPT.txt",
    root / "onboarding-package" / "skills" / "goal-graph-loop" / "assets" / "manager-thread-prompt.txt",
    root / "repo-harness" / "docs" / "templates" / "goal-graph" / "manager-thread-prompt.txt",
]
manager_prompts = [path.read_text(encoding="utf-8") for path in manager_paths]
expected_closeout = (
    "Mark the Manager terminal only after every owned node is terminal; a blocked Worker "
    "must first be explicitly reconciled to completed, cancelled, or superseded"
)
if any(expected_closeout not in prompt for prompt in manager_prompts):
    raise SystemExit("Manager prompt closeout must require terminal child reconciliation")
if any("Run its recurring goal-graph loop" not in prompt for prompt in manager_prompts):
    raise SystemExit("Manager prompts must assign the recurring goal-graph loop")
if any("Reconstruct ticket movements and Git/PR evidence" not in prompt for prompt in manager_prompts):
    raise SystemExit("Manager prompts must reconstruct evidence before replacing work")
if len(set(manager_prompts)) != 1:
    raise SystemExit("Manager prompt mirrors have drifted")

role_prompts = {
    "Boss": [
        root / "orchestration" / "BOSS-PROMPT.txt",
        root / "repo-harness" / "docs" / "templates" / "orchestration" / "boss-prompt.txt",
    ],
    "Manager": [
        root / "orchestration" / "MANAGER-PROMPT.txt",
        root / "repo-harness" / "docs" / "templates" / "orchestration" / "manager-prompt.txt",
    ],
    "Worker": [
        root / "orchestration" / "WORKER-PROMPT.txt",
        root / "repo-harness" / "docs" / "templates" / "orchestration" / "worker-prompt.txt",
    ],
}
role_contracts = {
    "Boss": "Run the recurring portfolio loop",
    "Manager": "Run the recurring workstream loop",
    "Worker": "Run the bounded execution loop",
}
for role, paths in role_prompts.items():
    prompts = [path.read_text(encoding="utf-8") for path in paths]
    if any(role_contracts[role] not in prompt for prompt in prompts):
        raise SystemExit(f"{role} prompt must declare loop ownership")
    if len(set(prompts)) != 1:
        raise SystemExit(f"{role} prompt mirrors have drifted")
PY

echo "== package build =="
python3 "$SKILL/scripts/build_reference_package.py" --out-dir "$TMP/out" --allow-missing-provenance >/dev/null
python3 "$SKILL/scripts/build_reference_package.py" --out-dir "$TMP/out-deterministic-a" --allow-missing-provenance >/dev/null
python3 "$SKILL/scripts/build_reference_package.py" --out-dir "$TMP/out-deterministic-b" --allow-missing-provenance >/dev/null
if ! cmp -s "$TMP/out-deterministic-a/repo-agent-harness-reference.zip" "$TMP/out-deterministic-b/repo-agent-harness-reference.zip"; then
  echo "expected repeated package builds from the same source to be byte-identical" >&2
  exit 1
fi
if python3 "$SKILL/scripts/build_reference_package.py" --out-dir "$TMP/out" --zip-name "../bad.zip" --allow-missing-provenance >"$TMP/bad-zip.out" 2>"$TMP/bad-zip.err"; then
  cat "$TMP/bad-zip.out"
  echo "expected unsafe --zip-name to fail" >&2
  exit 1
fi
python3 - "$TMP/out/repo-agent-harness-reference.zip" <<'PY'
import json
import sys
import zipfile
from pathlib import Path

zip_path = Path(sys.argv[1])
with zipfile.ZipFile(zip_path) as archive:
    names = archive.namelist()
    bad = [name for name in names if name.startswith("/") or ".." in Path(name).parts]
    if bad:
        raise SystemExit(f"unsafe zip paths: {bad}")
    manifest = json.loads(archive.read("repo-agent-harness-reference/MANIFEST.json"))
    if manifest.get("containsSecrets") is not False:
        raise SystemExit("manifest must declare containsSecrets=false")
    required = [
        "repo-agent-harness-reference/START-HERE.md",
        "repo-agent-harness-reference/AGENT-HANDOFF.md",
        "repo-agent-harness-reference/references/AGENT-CLIENTS-AND-SKILL-INSTALL.md",
        "repo-agent-harness-reference/skill/repo-agent-harness-builder/SKILL.md",
        "repo-agent-harness-reference/skills/project-orchestration/SKILL.md",
        "repo-agent-harness-reference/skills/goal-graph-loop/SKILL.md",
        "repo-agent-harness-reference/skills/goal-chain-loop/SKILL.md",
        "repo-agent-harness-reference/skills/codex-native-firstmate/SKILL.md",
        "repo-agent-harness-reference/skill/repo-agent-harness-builder/assets/templates/client-adapters/codex-native-firstmate/repo-root/.codex/agents/firstmate-boss.toml",
        "repo-agent-harness-reference/skill/repo-agent-harness-builder/assets/templates/client-adapters/codex-native-firstmate/repo-root/.codex/agents/firstmate-manager.toml",
        "repo-agent-harness-reference/skill/repo-agent-harness-builder/assets/templates/client-adapters/codex-native-firstmate/repo-root/.codex/agents/firstmate-worker.toml",
    ]
    missing = [name for name in required if name not in names]
    if missing:
        raise SystemExit(f"missing package entries: {missing}")
PY
python3 - "$TMP/out/repo-agent-harness-reference.zip" "$TMP/extracted" <<'PY'
import sys
import zipfile
from pathlib import Path

zip_path = Path(sys.argv[1])
extract_dir = Path(sys.argv[2])
with zipfile.ZipFile(zip_path) as archive:
    for info in archive.infolist():
        parts = Path(info.filename).parts
        if info.filename.startswith("/") or ".." in parts:
            raise SystemExit(f"unsafe zip entry: {info.filename}")
    archive.extractall(extract_dir)
    for info in archive.infolist():
        mode = (info.external_attr >> 16) & 0o777
        if mode:
            path = extract_dir / info.filename
            if path.exists():
                path.chmod(mode)
PY
python3 "$SKILL/assets/templates/onboarding-package/scripts/verify-package.py" \
  --root "$TMP/extracted/repo-agent-harness-reference" \
  --allow-missing-provenance
bash "$TMP/extracted/repo-agent-harness-reference/scripts/verify-bootstrap.sh" --mode reference-only --allow-missing-provenance >"$TMP/verify-bootstrap-reference-only.out"
cp -R "$TMP/extracted/repo-agent-harness-reference" "$TMP/extracted-unsafe-refs"
python3 - "$TMP/extracted-unsafe-refs" <<'PY'
import hashlib
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
target = root / "references" / "OPTIONAL-CONNECTORS.md"
target.write_text(
    target.read_text(encoding="utf-8")
    + "\n\n```json\n"
    + '{"credential' + 'Refs": ["not-a-safe-' + 'reference-token"]}'
    + "\n```\n",
    encoding="utf-8",
)
manifest_path = root / "MANIFEST.json"
manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
for entry in manifest["files"]:
    if entry["path"] == "references/OPTIONAL-CONNECTORS.md":
        data = target.read_bytes()
        entry["bytes"] = len(data)
        entry["sha256"] = hashlib.sha256(data).hexdigest()
        break
manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
PY
if python3 "$TMP/extracted-unsafe-refs/scripts/verify-package.py" \
  --root "$TMP/extracted-unsafe-refs" \
  --allow-missing-provenance >"$TMP/unsafe-refs.out" 2>"$TMP/unsafe-refs.err"; then
  cat "$TMP/unsafe-refs.out"
  echo "expected verifier to reject unsafe credentialRefs even with matching manifest hashes" >&2
  exit 1
fi

echo "== archive installer =="
bash "$TMP/extracted/repo-agent-harness-reference/scripts/install-skill.sh" >"$TMP/install-skill-dry-run.out"
if (cd "$TMP/extracted/repo-agent-harness-reference" && bash scripts/install-skill.sh --yes --project --agent codex >"$TMP/install-skill-package-root.out" 2>"$TMP/install-skill-package-root.err"); then
  cat "$TMP/install-skill-package-root.out"
  echo "expected project install from package root to fail" >&2
  exit 1
fi
mkdir -p "$TMP/stale-target/.agents/skills/repo-agent-harness-builder" "$TMP/fake-bin"
printf '# stale unrelated install\n' > "$TMP/stale-target/.agents/skills/repo-agent-harness-builder/SKILL.md"
cat > "$TMP/fake-bin/npx" <<'SH'
#!/usr/bin/env sh
exit 0
SH
chmod +x "$TMP/fake-bin/npx"
if (
  cd "$TMP/stale-target"
  PATH="$TMP/fake-bin:$PATH" bash "$TMP/extracted/repo-agent-harness-reference/scripts/install-skill.sh" --yes --project --agent claude-code >"$TMP/stale-install.out" 2>"$TMP/stale-install.err"
); then
  cat "$TMP/stale-install.out"
  echo "expected stale unrelated project skill dir not to verify requested claude-code install" >&2
  exit 1
fi
if [ "${SKIP_SKILLS_DISCOVERY:-0}" != "1" ] && [ "${SKIP_ARCHIVE_PROJECT_INSTALL:-0}" != "1" ]; then
  mkdir -p "$TMP/install-target" "$TMP/home" "$TMP/npm-cache"
  (
    cd "$TMP/install-target"
    HOME="$TMP/home" npm_config_cache="$TMP/npm-cache" npm_config_update_notifier=false \
      bash "$TMP/extracted/repo-agent-harness-reference/scripts/install-skill.sh" --yes --project --agent codex >"$TMP/install-skill-project.out"
  )
  INSTALLED_SKILL="$TMP/install-target/.agents/skills/repo-agent-harness-builder"
  if [ ! -f "$INSTALLED_SKILL/SKILL.md" ] || [ ! -f "$INSTALLED_SKILL/references/agent-agnostic-distribution.md" ]; then
    cat "$TMP/install-skill-project.out"
    echo "archive installer exited successfully but expected skill files were not installed at $INSTALLED_SKILL" >&2
    exit 1
  fi
else
  echo "archive installer project install skipped"
fi

echo "== generated repo harness =="
python3 "$SKILL/scripts/scaffold_harness.py" \
  --target "$TMP/generated-repo" \
  --project-name "Generated Repo" \
  --repo-slug "example/generated-repo" \
  --cli-name harness \
  --allow-non-git >/dev/null
python3 "$SKILL/scripts/verify_harness.py" \
  --target "$TMP/generated-repo" \
  --cli-name harness \
  --run-tests
for required_path in \
  "ops/protocols/AGENT-ORCHESTRATION.md" \
  "ops/protocols/GOAL-GRAPH.md" \
  "ops/protocols/CODEX-NATIVE-FIRSTMATE.md" \
  "ops/orchestration.example.json" \
  ".codex/config.firstmate.example.toml" \
  ".codex/agents/firstmate-boss.toml" \
  ".codex/agents/firstmate-manager.toml" \
  ".codex/agents/firstmate-worker.toml" \
  "apps/cli/src/orchestration/index.mjs"; do
  damaged="$TMP/generated-repo-missing-${required_path//\//__}"
  cp -R "$TMP/generated-repo" "$damaged"
  rm "$damaged/$required_path"
  if python3 "$SKILL/scripts/verify_harness.py" --target "$damaged" --cli-name harness; then
    echo "expected verifier to reject missing $required_path" >&2
    exit 1
  fi
done

damaged="$TMP/generated-repo-invalid-task-pin-policy"
cp -R "$TMP/generated-repo" "$damaged"
python3 - "$damaged/docs/templates/orchestration/codex-native-firstmate-adapter.example.json" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
data = json.loads(path.read_text(encoding="utf-8"))
data["retention"]["pinWorkers"] = True
path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
PY
if python3 "$SKILL/scripts/verify_harness.py" --target "$damaged" --cli-name harness; then
  echo "expected verifier to reject a task pin policy that pins Workers" >&2
  exit 1
fi

echo "== downstream fleet skill ownership boundary =="
downstream_without_fleet_skills="$TMP/generated-repo-without-fleet-skill-copies"
cp -R "$TMP/generated-repo" "$downstream_without_fleet_skills"
for fleet_skill in project-orchestration goal-graph-loop goal-chain-loop codex-native-firstmate; do
  rm -r "$downstream_without_fleet_skills/.agents/skills/$fleet_skill"
done
python3 "$SKILL/scripts/verify_harness.py" \
  --target "$downstream_without_fleet_skills" \
  --cli-name harness

echo "== orchestration example verifier boundaries =="
REPO_ORCHESTRATION_OPERATOR='../../invalid' \
REPO_ORCHESTRATION_INSTANCE='../invalid-instance' \
  python3 "$SKILL/scripts/verify_harness.py" \
    --target "$TMP/generated-repo" \
    --cli-name harness

damaged="$TMP/generated-repo-active-orchestration-example"
cp -R "$TMP/generated-repo" "$damaged"
python3 - "$damaged/ops/orchestration.example.json" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
registry = json.loads(path.read_text(encoding="utf-8"))
registry["status"] = "active"
path.write_text(json.dumps(registry, indent=2) + "\n", encoding="utf-8")
PY
if python3 "$SKILL/scripts/verify_harness.py" --target "$damaged" --cli-name harness; then
  echo "expected verifier to reject an active tracked orchestration example" >&2
  exit 1
fi

damaged="$TMP/generated-repo-unsafe-control-loop-policy"
cp -R "$TMP/generated-repo" "$damaged"
python3 - "$damaged/ops/orchestration.example.json" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
registry = json.loads(path.read_text(encoding="utf-8"))
registry["controlLoopPolicy"]["quietActivityCountsAsProgress"] = True
registry["controlLoopPolicy"]["sharedRuntimeRecovery"]["requirePreActionCompare"] = False
path.write_text(json.dumps(registry, indent=2) + "\n", encoding="utf-8")
PY
if python3 "$SKILL/scripts/verify_harness.py" --target "$damaged" --cli-name harness; then
  echo "expected verifier to reject unsafe anti-stagnation and shared-runtime recovery policy" >&2
  exit 1
fi

customized="$TMP/generated-repo-custom-control-loop-budgets"
cp -R "$TMP/generated-repo" "$customized"
python3 - "$customized/ops/orchestration.example.json" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
registry = json.loads(path.read_text(encoding="utf-8"))
registry["controlLoopPolicy"]["maxUnchangedChecks"] = 5
registry["controlLoopPolicy"]["maxSameFailureRetries"] = 2
path.write_text(json.dumps(registry, indent=2) + "\n", encoding="utf-8")
PY
python3 "$SKILL/scripts/verify_harness.py" --target "$customized" --cli-name harness

damaged="$TMP/generated-repo-unbounded-control-loop-budgets"
cp -R "$TMP/generated-repo" "$damaged"
python3 - "$damaged/ops/orchestration.example.json" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
registry = json.loads(path.read_text(encoding="utf-8"))
registry["controlLoopPolicy"]["maxUnchangedChecks"] = 101
registry["controlLoopPolicy"]["maxSameFailureRetries"] = 21
registry["controlLoopPolicy"]["maxControlIntervalSeconds"] = 604800
path.write_text(json.dumps(registry, indent=2) + "\n", encoding="utf-8")
PY
if python3 "$SKILL/scripts/verify_harness.py" --target "$damaged" --cli-name harness; then
  echo "expected verifier to reject unbounded control-loop budgets" >&2
  exit 1
fi

damaged="$TMP/generated-repo-identity-orchestration-example"
cp -R "$TMP/generated-repo" "$damaged"
python3 - "$damaged/ops/orchestration.example.json" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
registry = json.loads(path.read_text(encoding="utf-8"))
registry["developerIdentity"] = {"taskId": "task-local-only"}
path.write_text(json.dumps(registry, indent=2) + "\n", encoding="utf-8")
PY
if python3 "$SKILL/scripts/verify_harness.py" --target "$damaged" --cli-name harness; then
  echo "expected verifier to reject runtime or identity fields in the tracked orchestration example" >&2
  exit 1
fi

logical_graph="$TMP/generated-repo-schema-v5-logical-policy-graph"
cp -R "$TMP/generated-repo" "$logical_graph"
python3 - "$logical_graph/ops/orchestration.example.json" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
registry = json.loads(path.read_text(encoding="utf-8"))
authority = {
    "allowedReads": ["repository"],
    "allowedWrites": [],
    "allowedExternalActions": [],
    "approvalGates": ["merge"],
    "canDelegate": False,
    "maxActiveChildren": 0,
    "stopConditions": ["authority-gap"],
}
registry["nodes"] = [
    {
        "id": "boss",
        "role": "boss",
        "workRef": "PORTFOLIO",
        "workKind": "portfolio-governance",
        "governingProtocols": ["AGENT-ORCHESTRATION"],
        "label": "Project control plane",
        "title": "Generated Repo - Boss",
        "parentId": None,
        "dependencies": [],
        "state": "queued",
        "objective": "Own portfolio reconciliation without claiming a live task.",
        "trustLevel": "T1",
        "authority": authority,
        "parentBindingMode": "task",
    },
    {
        "id": "manager-feature",
        "role": "manager",
        "workRef": "FEATURE",
        "workKind": "feature",
        "governingProtocols": ["AGENT-ORCHESTRATION", "GOAL-GRAPH"],
        "requiredSkills": ["example-project-skill"],
        "label": "Feature workstream",
        "title": "Generated Repo - Manager - FEATURE Feature workstream",
        "parentId": "boss",
        "dependencies": [],
        "state": "queued",
        "objective": "Own the logical feature workstream without materialization.",
        "completionProfile": {
            "type": "repository-merge",
            "requiredEvidence": ["merged pull request"],
        },
        "trustLevel": "T1",
        "authority": authority,
        "parentBindingMode": "logical",
    },
]
path.write_text(json.dumps(registry, indent=2) + "\n", encoding="utf-8")
PY
python3 "$SKILL/scripts/verify_harness.py" \
  --target "$logical_graph" \
  --cli-name harness \
  --run-tests

for live_node_case in task-identity trust-grant signature-reservation active-lifecycle unsupported-identity nested-completion-evidence nested-signature nested-trust-grant nested-reservation; do
  damaged="$TMP/generated-repo-schema-v5-live-node-$live_node_case"
  cp -R "$logical_graph" "$damaged"
  python3 - "$damaged/ops/orchestration.example.json" "$live_node_case" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
case = sys.argv[2]
registry = json.loads(path.read_text(encoding="utf-8"))
node = next(node for node in registry["nodes"] if node["id"] == "manager-feature")
if case == "task-identity":
    node["taskId"] = "task-live-only"
elif case == "trust-grant":
    node["trustApproval"] = {
        "approvedBy": "developer-local",
        "approvedAt": "2026-07-23",
        "evidence": ["local-only"],
    }
elif case == "signature-reservation":
    node["launchReservation"] = {"signature": "local-only"}
elif case == "active-lifecycle":
    node["state"] = "working"
    node["nextAction"] = "Continue live work."
elif case == "nested-completion-evidence":
    node["completionProfile"]["completionEvidence"] = ["local-only"]
elif case == "nested-signature":
    node["completionProfile"]["signature"] = "local-only"
elif case == "nested-trust-grant":
    node["authority"]["trustApproval"] = {"approvedBy": "developer-local"}
elif case == "nested-reservation":
    node["authority"]["launchReservation"] = {"key": "local-only"}
else:
    node["developerIdentity"] = {"taskId": "task-local-only"}
path.write_text(json.dumps(registry, indent=2) + "\n", encoding="utf-8")
PY
  if python3 "$SKILL/scripts/verify_harness.py" --target "$damaged" --cli-name harness; then
    echo "expected verifier to reject schema-v5 live node case $live_node_case" >&2
    exit 1
  fi
done

damaged="$TMP/generated-repo-custom-orchestration-policy"
cp -R "$TMP/generated-repo" "$damaged"
python3 - "$damaged/ops/orchestration.example.json" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
registry = json.loads(path.read_text(encoding="utf-8"))
registry["extensions"] = {
    "example.generated-repo": {
        "kind": "tracked-policy",
        "schemaVersion": 1,
        "policy": {"releasePolicy": {"requiresApproval": True}}
    }
}
path.write_text(json.dumps(registry, indent=2) + "\n", encoding="utf-8")
PY
python3 "$SKILL/scripts/verify_harness.py" --target "$damaged" --cli-name harness

for runtime_field in taskId task_id externalTaskId TaskID taskRef threadRef taskIdentifier threadIdentifier status operator instance ownerRef rootRef authority approvalGates; do
  damaged="$TMP/generated-repo-$runtime_field-orchestration-extension"
  cp -R "$TMP/generated-repo" "$damaged"
  python3 - "$damaged/ops/orchestration.example.json" "$runtime_field" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
runtime_field = sys.argv[2]
registry = json.loads(path.read_text(encoding="utf-8"))
registry["extensions"] = {
    "example.generated-repo": {
        "kind": "tracked-policy",
        "schemaVersion": 1,
        "policy": {runtime_field: "runtime-local-only"}
    }
}
path.write_text(json.dumps(registry, indent=2) + "\n", encoding="utf-8")
PY
  if python3 "$SKILL/scripts/verify_harness.py" --target "$damaged" --cli-name harness; then
    echo "expected verifier to reject runtime fields in an orchestration extension" >&2
    exit 1
  fi
done

for invalid_extension_case in namespace envelope runtime_reference; do
  damaged="$TMP/generated-repo-invalid-extension-$invalid_extension_case"
  cp -R "$TMP/generated-repo" "$damaged"
  python3 - "$damaged/ops/orchestration.example.json" "$invalid_extension_case" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
invalid_case = sys.argv[2]
registry = json.loads(path.read_text(encoding="utf-8"))
namespace = "not-namespaced" if invalid_case == "namespace" else "example.generated-repo"
extension = {
    "kind": "tracked-policy",
    "schemaVersion": 1,
    "policy": {"releasePolicy": {"requiresApproval": True}}
}
if invalid_case == "envelope":
    extension["runtimeConfig"] = {"enabled": True}
elif invalid_case == "runtime_reference":
    extension["policy"]["workReference"] = "codex://tasks/local-runtime-task"
registry["extensions"] = {namespace: extension}
path.write_text(json.dumps(registry, indent=2) + "\n", encoding="utf-8")
PY
  if python3 "$SKILL/scripts/verify_harness.py" --target "$damaged" --cli-name harness; then
    echo "expected verifier to reject invalid orchestration extension case $invalid_extension_case" >&2
    exit 1
  fi
done

damaged="$TMP/generated-repo-task-root-orchestration-example"
cp -R "$TMP/generated-repo" "$damaged"
python3 - "$damaged/ops/orchestration.example.json" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
registry = json.loads(path.read_text(encoding="utf-8"))
registry["scope"]["rootRef"] = "task-local-root"
path.write_text(json.dumps(registry, indent=2) + "\n", encoding="utf-8")
PY
if python3 "$SKILL/scripts/verify_harness.py" --target "$damaged" --cli-name harness; then
  echo "expected verifier to reject a task identity in the tracked orchestration example root" >&2
  exit 1
fi

damaged="$TMP/generated-repo-directory-orchestration-example"
cp -R "$TMP/generated-repo" "$damaged"
rm "$damaged/ops/orchestration.example.json"
mkdir "$damaged/ops/orchestration.example.json"
if python3 "$SKILL/scripts/verify_harness.py" --target "$damaged" --cli-name harness; then
  echo "expected verifier to reject a directory in place of the tracked orchestration example" >&2
  exit 1
fi

damaged="$TMP/generated-repo-symlink-orchestration-example"
cp -R "$TMP/generated-repo" "$damaged"
mv "$damaged/ops/orchestration.example.json" "$damaged/ops/orchestration.example.target.json"
ln -s "orchestration.example.target.json" "$damaged/ops/orchestration.example.json"
if python3 "$SKILL/scripts/verify_harness.py" --target "$damaged" --cli-name harness; then
  echo "expected verifier to reject a symlinked tracked orchestration example" >&2
  exit 1
fi

damaged="$TMP/generated-repo-symlinked-ops-orchestration-example"
cp -R "$TMP/generated-repo" "$damaged"
mv "$damaged/ops" "$damaged/redirected-ops"
ln -s "redirected-ops" "$damaged/ops"
if python3 "$SKILL/scripts/verify_harness.py" --target "$damaged" --cli-name harness; then
  echo "expected verifier to reject a tracked orchestration example behind a symlinked directory" >&2
  exit 1
fi

damaged="$TMP/generated-repo-schema-v3-orchestration-example"
cp -R "$TMP/generated-repo" "$damaged"
python3 - "$damaged/ops/orchestration.example.json" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
registry = json.loads(path.read_text(encoding="utf-8"))
registry["schemaVersion"] = 3
for field in ["coordinationMode", "rootControl", "bindingAttestation", "clientAdapter", "controlLoopPolicy", "ownerDirectives"]:
    registry.pop(field, None)
registry["scope"].pop("ownerRef", None)
path.write_text(json.dumps(registry, indent=2) + "\n", encoding="utf-8")
PY
python3 "$SKILL/scripts/verify_harness.py" --target "$damaged" --cli-name harness

for private_field in clientAdapter bindingAttestation ownerRef; do
  damaged="$TMP/generated-repo-schema-v3-private-$private_field"
  cp -R "$TMP/generated-repo" "$damaged"
  python3 - "$damaged/ops/orchestration.example.json" "$private_field" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
private_field = sys.argv[2]
registry = json.loads(path.read_text(encoding="utf-8"))
registry["schemaVersion"] = 3
for field in ["coordinationMode", "rootControl", "bindingAttestation", "clientAdapter", "controlLoopPolicy", "ownerDirectives"]:
    registry.pop(field, None)
registry["scope"].pop("ownerRef", None)
if private_field == "clientAdapter":
    registry[private_field] = {"profile": "private-adapter"}
elif private_field == "bindingAttestation":
    registry[private_field] = {"keyId": "private-attestor"}
else:
    registry["scope"][private_field] = "private-owner"
path.write_text(json.dumps(registry, indent=2) + "\n", encoding="utf-8")
PY
  if python3 "$SKILL/scripts/verify_harness.py" --target "$damaged" --cli-name harness; then
    echo "expected verifier to reject private $private_field state in a schema-v3 tracked example" >&2
    exit 1
  fi
done

damaged="$TMP/generated-repo-invalid-schema-type"
cp -R "$TMP/generated-repo" "$damaged"
python3 - "$damaged/ops/orchestration.example.json" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
registry = json.loads(path.read_text(encoding="utf-8"))
registry["schemaVersion"] = {"invalid": True}
path.write_text(json.dumps(registry, indent=2) + "\n", encoding="utf-8")
PY
if python3 "$SKILL/scripts/verify_harness.py" --target "$damaged" --cli-name harness \
  >"$TMP/invalid-schema-type.out" 2>"$TMP/invalid-schema-type.err"; then
  echo "expected verifier to reject a non-scalar orchestration schema version" >&2
  exit 1
fi
if grep -q "Traceback" "$TMP/invalid-schema-type.err"; then
  cat "$TMP/invalid-schema-type.err" >&2
  echo "expected verifier to contain invalid schema-version types without a traceback" >&2
  exit 1
fi

mkdir -p "$TMP/firstmate-profile-collision/.codex/agents"
printf 'name = "boss"\n' > "$TMP/firstmate-profile-collision/.codex/agents/boss.toml"
python3 "$SKILL/scripts/scaffold_harness.py" \
  --target "$TMP/firstmate-profile-collision" \
  --project-name "Firstmate Profile Collision" \
  --repo-slug "example/firstmate-profile-collision" \
  --cli-name harness \
  --allow-non-git >/dev/null
if ! grep -q 'name = "boss"' "$TMP/firstmate-profile-collision/.codex/agents/boss.toml"; then
  echo "expected scaffold to preserve generic Codex boss profile" >&2
  exit 1
fi
for profile in firstmate-boss firstmate-manager firstmate-worker; do
  if [ ! -f "$TMP/firstmate-profile-collision/.codex/agents/$profile.toml" ]; then
    echo "expected scaffold to install namespaced Firstmate profile: $profile" >&2
    exit 1
  fi
done
mkdir -p "$TMP/fake-no-mistakes-bin"
cat > "$TMP/fake-no-mistakes-bin/no-mistakes" <<'SH'
#!/usr/bin/env sh
case "$1" in
  --version)
    echo "no-mistakes version v9.9.9"
    ;;
  status)
    echo "not in a git repository"
    ;;
  init)
    echo "not in a git repository" >&2
    exit 1
    ;;
  *)
    exit 2
    ;;
esac
SH
chmod +x "$TMP/fake-no-mistakes-bin/no-mistakes"
(
  cd "$TMP/generated-repo"
  PATH="$TMP/fake-no-mistakes-bin:$PATH" ./harness no-mistakes status >"$TMP/no-mistakes-status-non-git.out"
)
if ! grep -q "initialized: false" "$TMP/no-mistakes-status-non-git.out" || ! grep -q "repo_state: not-ready" "$TMP/no-mistakes-status-non-git.out"; then
  cat "$TMP/no-mistakes-status-non-git.out"
  echo "no-mistakes status should fail closed for non-git success output" >&2
  exit 1
fi
if (
  cd "$TMP/generated-repo"
  PATH="$TMP/fake-no-mistakes-bin:$PATH" ./harness no-mistakes setup >"$TMP/no-mistakes-setup-non-git.out"
); then
  cat "$TMP/no-mistakes-setup-non-git.out"
  echo "no-mistakes setup should fail for non-git output" >&2
  exit 1
fi
if ! grep -q "initialized: false" "$TMP/no-mistakes-setup-non-git.out" || ! grep -q "post_check: fail" "$TMP/no-mistakes-setup-non-git.out"; then
  cat "$TMP/no-mistakes-setup-non-git.out"
  echo "no-mistakes setup should report failed post-check for non-git output" >&2
  exit 1
fi
if (
  cd "$TMP/generated-repo"
  PATH="$TMP/fake-no-mistakes-bin:$PATH" scripts/setup-no-mistakes.sh --check-only >"$TMP/no-mistakes-script-check-non-git.out"
); then
  cat "$TMP/no-mistakes-script-check-non-git.out"
  echo "setup-no-mistakes --check-only should fail for non-git output" >&2
  exit 1
fi
if ! grep -q "initialized: false" "$TMP/no-mistakes-script-check-non-git.out"; then
  cat "$TMP/no-mistakes-script-check-non-git.out"
  echo "setup-no-mistakes --check-only should report initialized false" >&2
  exit 1
fi
mkdir -p "$TMP/fake-no-mistakes-ok-bin" "$TMP/no-mistakes-home"
cat > "$TMP/fake-no-mistakes-ok-bin/no-mistakes" <<'SH'
#!/usr/bin/env sh
case "$1" in
  --version)
    echo "no-mistakes version v9.9.9"
    ;;
  status)
    echo "gate: configured"
    echo "daemon running"
    ;;
  init)
    echo "initialized"
    ;;
  axi)
    echo "current_branch: RA/generated-check"
    ;;
  *)
    exit 2
    ;;
esac
SH
chmod +x "$TMP/fake-no-mistakes-ok-bin/no-mistakes"
mkdir -p "$TMP/fake-no-mistakes-cwd-bin" "$TMP/no-mistakes-cwd-home"
cat > "$TMP/fake-no-mistakes-cwd-bin/no-mistakes" <<'SH'
#!/usr/bin/env sh
printf '%s %s\n' "$1" "$(pwd)" >> "$NO_MISTAKES_CWD_LOG"
case "$1" in
  --version)
    echo "no-mistakes version v9.9.9"
    ;;
  status)
    echo "gate: configured"
    echo "daemon running"
    ;;
  init)
    echo "initialized"
    ;;
  axi)
    echo "current_branch: RA/generated-check"
    ;;
  *)
    exit 2
    ;;
esac
SH
chmod +x "$TMP/fake-no-mistakes-cwd-bin/no-mistakes"
mkdir -p "$TMP/caller-repo"
git -C "$TMP/caller-repo" init -q
: > "$TMP/no-mistakes-cwd.log"
(
  cd "$TMP/caller-repo"
  HOME="$TMP/no-mistakes-cwd-home/user-home" NM_HOME="$TMP/no-mistakes-cwd-home" \
    NO_MISTAKES_CWD_LOG="$TMP/no-mistakes-cwd.log" PATH="$TMP/fake-no-mistakes-cwd-bin:$PATH" \
    "$TMP/generated-repo/scripts/setup-no-mistakes.sh" >"$TMP/no-mistakes-script-cwd.out"
)
if grep -Fq "$TMP/caller-repo" "$TMP/no-mistakes-cwd.log"; then
  cat "$TMP/no-mistakes-cwd.log"
  echo "setup-no-mistakes should run no-mistakes from the generated repo root" >&2
  exit 1
fi
if ! grep -Fq "$TMP/generated-repo" "$TMP/no-mistakes-cwd.log"; then
  cat "$TMP/no-mistakes-cwd.log"
  echo "setup-no-mistakes did not run no-mistakes from the generated repo root" >&2
  exit 1
fi
if [ -f "$TMP/caller-repo/.git/info/exclude" ] && grep -q "^.no-mistakes/$" "$TMP/caller-repo/.git/info/exclude"; then
  cat "$TMP/caller-repo/.git/info/exclude"
  echo "setup-no-mistakes should not edit the caller repo local exclude" >&2
  exit 1
fi
(
  cd "$TMP/generated-repo"
  HOME="$TMP/no-mistakes-home/user-home" NM_HOME="$TMP/no-mistakes-home" PATH="$TMP/fake-no-mistakes-ok-bin:$PATH" \
    scripts/setup-no-mistakes.sh --agent codex >"$TMP/no-mistakes-script-agent.out"
)
if ! grep -q "agent_config: updated" "$TMP/no-mistakes-script-agent.out" || ! grep -q "agent: codex" "$TMP/no-mistakes-script-agent.out"; then
  cat "$TMP/no-mistakes-script-agent.out"
  echo "setup-no-mistakes should report explicit agent pinning" >&2
  exit 1
fi
if ! grep -q "^agent: codex$" "$TMP/no-mistakes-home/config.yaml"; then
  cat "$TMP/no-mistakes-home/config.yaml"
  echo "setup-no-mistakes should write requested user-local no-mistakes agent" >&2
  exit 1
fi
printf 'not a directory\n' > "$TMP/no-mistakes-agent-blocked-home"
if (
  cd "$TMP/generated-repo"
  HOME="$TMP/no-mistakes-agent-blocked-user-home" NM_HOME="$TMP/no-mistakes-agent-blocked-home" PATH="$TMP/fake-no-mistakes-ok-bin:$PATH" \
    scripts/setup-no-mistakes.sh --agent codex >"$TMP/no-mistakes-script-agent-blocked.out" 2>"$TMP/no-mistakes-script-agent-blocked.err"
); then
  cat "$TMP/no-mistakes-script-agent-blocked.out"
  echo "setup-no-mistakes should fail when explicit agent pinning cannot be written" >&2
  exit 1
fi
if ! grep -q "status: agent-config-failed" "$TMP/no-mistakes-script-agent-blocked.out" || ! grep -q "agent_config: unavailable" "$TMP/no-mistakes-script-agent-blocked.out"; then
  cat "$TMP/no-mistakes-script-agent-blocked.out"
  echo "setup-no-mistakes should report explicit agent pin write failure" >&2
  exit 1
fi
if [ -s "$TMP/no-mistakes-script-agent-blocked.err" ]; then
  cat "$TMP/no-mistakes-script-agent-blocked.err"
  echo "setup-no-mistakes should suppress raw agent config file errors" >&2
  exit 1
fi
mkdir -p "$TMP/no-mistakes-config-dir-home/config.yaml"
if (
  cd "$TMP/generated-repo"
  HOME="$TMP/no-mistakes-config-dir-user-home" NM_HOME="$TMP/no-mistakes-config-dir-home" PATH="$TMP/fake-no-mistakes-ok-bin:$PATH" \
    scripts/setup-no-mistakes.sh --agent codex >"$TMP/no-mistakes-script-config-dir.out" 2>"$TMP/no-mistakes-script-config-dir.err"
); then
  cat "$TMP/no-mistakes-script-config-dir.out"
  echo "setup-no-mistakes should fail when config.yaml is a directory" >&2
  exit 1
fi
if ! grep -q "status: agent-config-failed" "$TMP/no-mistakes-script-config-dir.out" || ! grep -q "agent_config: unavailable" "$TMP/no-mistakes-script-config-dir.out"; then
  cat "$TMP/no-mistakes-script-config-dir.out"
  echo "setup-no-mistakes should report config.yaml directory as unavailable" >&2
  exit 1
fi
if [ -s "$TMP/no-mistakes-script-config-dir.err" ]; then
  cat "$TMP/no-mistakes-script-config-dir.err"
  echo "setup-no-mistakes should suppress config.yaml directory errors" >&2
  exit 1
fi
if ! rmdir "$TMP/no-mistakes-config-dir-home/config.yaml" 2>/dev/null; then
  find "$TMP/no-mistakes-config-dir-home/config.yaml" -mindepth 1 -print
  echo "setup-no-mistakes should not move config files into config.yaml directories" >&2
  exit 1
fi
if (
  cd "$TMP/generated-repo"
  HOME="$TMP/no-mistakes-invalid-home/user-home" NM_HOME="$TMP/no-mistakes-invalid-home" PATH="$TMP/fake-no-mistakes-ok-bin:$PATH" \
    scripts/setup-no-mistakes.sh --agent acp: >"$TMP/no-mistakes-script-invalid-acp.out" 2>"$TMP/no-mistakes-script-invalid-acp.err"
); then
  cat "$TMP/no-mistakes-script-invalid-acp.out"
  echo "setup-no-mistakes should reject empty ACP agent targets" >&2
  exit 1
fi
if ! grep -q "unsupported --agent value" "$TMP/no-mistakes-script-invalid-acp.err"; then
  cat "$TMP/no-mistakes-script-invalid-acp.err"
  echo "setup-no-mistakes should report unsupported empty ACP agent targets" >&2
  exit 1
fi
mkdir -p "$TMP/no-mistakes-acp-home"
(
  cd "$TMP/generated-repo"
  HOME="$TMP/no-mistakes-acp-home/user-home" NM_HOME="$TMP/no-mistakes-acp-home" PATH="$TMP/fake-no-mistakes-ok-bin:$PATH" \
    scripts/setup-no-mistakes.sh --agent acp:local-agent_1.2 >"$TMP/no-mistakes-script-acp-agent.out"
)
if ! grep -q "agent_config: updated" "$TMP/no-mistakes-script-acp-agent.out" || ! grep -q "agent: acp:configured" "$TMP/no-mistakes-script-acp-agent.out"; then
  cat "$TMP/no-mistakes-script-acp-agent.out"
  echo "setup-no-mistakes should report explicit ACP agent pinning" >&2
  exit 1
fi
if ! grep -q "^agent: acp:local-agent_1.2$" "$TMP/no-mistakes-acp-home/config.yaml"; then
  cat "$TMP/no-mistakes-acp-home/config.yaml"
  echo "setup-no-mistakes should write requested ACP no-mistakes agent" >&2
  exit 1
fi
printf 'not a directory\n' > "$TMP/generated-repo/blocked-gitdir"
printf 'gitdir: blocked-gitdir\n' > "$TMP/generated-repo/.git"
mkdir -p "$TMP/no-mistakes-blocked-home"
(
  cd "$TMP/generated-repo"
  HOME="$TMP/no-mistakes-blocked-home/user-home" NM_HOME="$TMP/no-mistakes-blocked-home" PATH="$TMP/fake-no-mistakes-ok-bin:$PATH" \
    scripts/setup-no-mistakes.sh >"$TMP/no-mistakes-script-blocked-exclude.out" 2>"$TMP/no-mistakes-script-blocked-exclude.err"
)
if ! grep -q "local_exclude: unavailable" "$TMP/no-mistakes-script-blocked-exclude.out"; then
  cat "$TMP/no-mistakes-script-blocked-exclude.out"
  echo "setup-no-mistakes should degrade local exclude write failures" >&2
  exit 1
fi
if [ -s "$TMP/no-mistakes-script-blocked-exclude.err" ]; then
  cat "$TMP/no-mistakes-script-blocked-exclude.err"
  echo "setup-no-mistakes should suppress raw local exclude file errors" >&2
  exit 1
fi
python3 "$SKILL/scripts/scaffold_harness.py" \
  --target "$TMP/generated-weird" \
  --project-name 'Generated "Repo" `quote` ${notEval}' \
  --repo-slug "example/generated-weird" \
  --cli-name weird \
  --allow-non-git >/dev/null
(cd "$TMP/generated-weird" && ./weird help >/dev/null && node --test apps/cli/test/*.test.mjs >/dev/null)

mkdir -p "$TMP/symlinked-skill-root" "$TMP/external-skill-root"
ln -s "$TMP/external-skill-root" "$TMP/symlinked-skill-root/.agents"
if python3 "$SKILL/scripts/scaffold_harness.py" \
  --target "$TMP/symlinked-skill-root" \
  --project-name "Symlinked Skill Root" \
  --repo-slug "example/symlinked-skill-root" \
  --cli-name symlinkh \
  --allow-non-git \
  --force >"$TMP/symlinked-skill-root.out" 2>"$TMP/symlinked-skill-root.err"; then
  cat "$TMP/symlinked-skill-root.out"
  echo "expected scaffold to refuse a symlinked project skill root" >&2
  exit 1
fi
if [ -e "$TMP/external-skill-root/skills" ]; then
  echo "scaffold must not write through a symlinked project skill root" >&2
  exit 1
fi

python3 "$SKILL/scripts/scaffold_harness.py" \
  --target "$TMP/recoverable-skill-replacement" \
  --project-name "Recoverable Skill Replacement" \
  --repo-slug "example/recoverable-skill-replacement" \
  --cli-name recoveryh \
  --allow-non-git >/dev/null
printf 'custom project skill content\n' > "$TMP/recoverable-skill-replacement/.agents/skills/project-orchestration/CUSTOM.md"
python3 "$SKILL/scripts/scaffold_harness.py" \
  --target "$TMP/recoverable-skill-replacement" \
  --project-name "Recoverable Skill Replacement" \
  --repo-slug "example/recoverable-skill-replacement" \
  --cli-name recoveryh \
  --allow-non-git \
  --force >"$TMP/recoverable-skill-replacement.out"
if [ -e "$TMP/recoverable-skill-replacement/.agents/skills/project-orchestration/CUSTOM.md" ]; then
  echo "forced scaffold must replace, not retain, displaced project skill content" >&2
  exit 1
fi
ARCHIVED_CUSTOM_SKILL="$(find "$TMP/recoverable-skill-replacement/.harness-archives/skills/repo-agent-harness-builder" -type f -name CUSTOM.md -print -quit)"
if [ -z "$ARCHIVED_CUSTOM_SKILL" ] || ! grep -q 'custom project skill content' "$ARCHIVED_CUSTOM_SKILL"; then
  echo "forced scaffold must retain displaced project skill content in a non-discoverable archive" >&2
  exit 1
fi

mkdir -p "$TMP/conflict-repo"
printf 'existing\n' > "$TMP/conflict-repo/AGENTS.md"
if python3 "$SKILL/scripts/scaffold_harness.py" \
  --target "$TMP/conflict-repo" \
  --project-name "Conflict Repo" \
  --repo-slug "example/conflict" \
  --cli-name conflict \
  --allow-non-git >"$TMP/conflict-scaffold.out" 2>"$TMP/conflict-scaffold.err"; then
  cat "$TMP/conflict-scaffold.out"
  echo "expected scaffold conflict to fail" >&2
  exit 1
fi
if [ -e "$TMP/conflict-repo/ops/HARNESS-CHECKLIST.md" ] || [ -e "$TMP/conflict-repo/conflict" ]; then
  echo "scaffold conflict should not write partial harness files" >&2
  exit 1
fi

mkdir -p "$TMP/parent-conflict-repo"
printf 'not a directory\n' > "$TMP/parent-conflict-repo/ops"
if python3 "$SKILL/scripts/scaffold_harness.py" \
  --target "$TMP/parent-conflict-repo" \
  --project-name "Parent Conflict Repo" \
  --repo-slug "example/parent-conflict" \
  --cli-name parenth \
  --allow-non-git >"$TMP/parent-conflict-scaffold.out" 2>"$TMP/parent-conflict-scaffold.err"; then
  cat "$TMP/parent-conflict-scaffold.out"
  echo "expected scaffold parent-path conflict to fail" >&2
  exit 1
fi
if [ -e "$TMP/parent-conflict-repo/AGENTS.md" ] || [ -e "$TMP/parent-conflict-repo/parenth" ]; then
  echo "scaffold parent-path conflict should not write partial harness files" >&2
  exit 1
fi

mkdir -p "$TMP/package-merge"
cat > "$TMP/package-merge/package.json" <<'JSON'
{
  "name": "existing-app",
  "scripts": {
    "build": "echo build"
  },
  "dependencies": {
    "left-pad": "1.3.0"
  }
}
JSON
python3 "$SKILL/scripts/scaffold_harness.py" \
  --target "$TMP/package-merge" \
  --project-name "Package Merge" \
  --repo-slug "example/package-merge" \
  --cli-name mergeh \
  --allow-non-git \
  --force >/dev/null
node - "$TMP/package-merge/package.json" <<'NODE'
const fs = require("node:fs");
const pkg = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (pkg.name !== "existing-app") throw new Error("existing package name was not preserved");
if (pkg.scripts.build !== "echo build") throw new Error("existing build script was not preserved");
if (pkg.scripts["test:cli"] !== "node --test apps/cli/test/*.test.mjs") throw new Error("test:cli script was not merged");
if (pkg.dependencies["left-pad"] !== "1.3.0") throw new Error("dependencies were not preserved");
NODE

if python3 "$SKILL/scripts/scaffold_harness.py" \
  --target "$HOME/.ssh/repo-harness-test" \
  --project-name "Bad Target" \
  --repo-slug "example/bad" \
  --cli-name bad \
  --allow-non-git >"$TMP/protected-repo.out" 2>"$TMP/protected-repo.err"; then
  cat "$TMP/protected-repo.out"
  echo "expected protected repo scaffold target to fail" >&2
  exit 1
fi

echo "== personal harness scope guard =="
python3 "$SKILL/scripts/scaffold_personal_harness.py" \
  --target "$TMP/personal" \
  --project-name "Personal Harness" \
  --cli-name homeh >/dev/null
node - "$TMP/personal/config/scopes.json" <<'NODE'
const fs = require("node:fs");
const path = process.argv[2];
const data = JSON.parse(fs.readFileSync(path, "utf8"));
data.scopeConfirmed = true;
data.managedFolders = [{ id: "ssh", path: "~/.ssh", defaultMode: "metadata-only" }];
fs.writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
NODE
if (cd "$TMP/personal" && ./homeh preflight >"$TMP/homeh-preflight.out" 2>"$TMP/homeh-preflight.err"); then
  cat "$TMP/homeh-preflight.out"
  cat "$TMP/homeh-preflight.err" >&2
  echo "expected protected personal scope to fail" >&2
  exit 1
fi
if grep -R "last_reviewed: YYYY-MM-DD" "$TMP/personal" >"$TMP/personal-date-placeholders.out"; then
  cat "$TMP/personal-date-placeholders.out"
  echo "generated personal harness should not contain review-date placeholders" >&2
  exit 1
fi

mkdir -p "$TMP/managed-folder" "$TMP/symlink-target"
printf 'hello\n' > "$TMP/managed-folder/note.txt"
ln -s "$TMP/symlink-target" "$TMP/managed-folder/linked-target"
python3 "$SKILL/scripts/scaffold_personal_harness.py" \
  --target "$TMP/personal-scoped" \
  --project-name "Personal Scoped" \
  --cli-name scoped \
  --managed-folder "managed=$TMP/managed-folder" >/dev/null
(cd "$TMP/personal-scoped" && ./scoped preflight >/dev/null && ./scoped inventory scan >"$TMP/scoped-inventory.out")
if ! grep -R '"reason": "symlink-not-followed"' "$TMP/personal-scoped/state/inventories" >/dev/null; then
  echo "personal inventory should record and skip symlinked entries" >&2
  exit 1
fi

mkdir -p "$TMP/managed-exclusions/private"
printf 'public\n' > "$TMP/managed-exclusions/keep.txt"
printf 'private\n' > "$TMP/managed-exclusions/private/secret.txt"
python3 "$SKILL/scripts/scaffold_personal_harness.py" \
  --target "$TMP/personal-exclusions" \
  --project-name "Personal Exclusions" \
  --cli-name excludeh \
  --managed-folder "docs=$TMP/managed-exclusions" \
  --off-limits "$TMP/managed-exclusions/private" >/dev/null
(cd "$TMP/personal-exclusions" && ./excludeh preflight >/dev/null && ./excludeh inventory scan >"$TMP/excludeh-inventory.out")
if ! grep -R '"reason": "excluded-path"' "$TMP/personal-exclusions/state/inventories" >/dev/null; then
  echo "personal inventory should record and skip excluded paths" >&2
  exit 1
fi
if grep -R 'secret.txt' "$TMP/personal-exclusions/state/inventories" >/dev/null; then
  echo "personal inventory should not inspect files inside excluded paths" >&2
  exit 1
fi

mkdir -p "$TMP/personal-conflict"
printf 'existing\n' > "$TMP/personal-conflict/AGENTS.md"
if python3 "$SKILL/scripts/scaffold_personal_harness.py" \
  --target "$TMP/personal-conflict" \
  --project-name "Conflict Personal" \
  --cli-name conflicth >"$TMP/personal-conflict.out" 2>"$TMP/personal-conflict.err"; then
  cat "$TMP/personal-conflict.out"
  echo "expected personal scaffold conflict to fail" >&2
  exit 1
fi
if [ -e "$TMP/personal-conflict/config/scopes.json" ] || [ -e "$TMP/personal-conflict/conflicth" ]; then
  echo "personal scaffold conflict should not write partial harness files" >&2
  exit 1
fi

mkdir -p "$TMP/personal-parent-conflict"
printf 'not a directory\n' > "$TMP/personal-parent-conflict/config"
if python3 "$SKILL/scripts/scaffold_personal_harness.py" \
  --target "$TMP/personal-parent-conflict" \
  --project-name "Personal Parent Conflict" \
  --cli-name parentfiles >"$TMP/personal-parent-conflict.out" 2>"$TMP/personal-parent-conflict.err"; then
  cat "$TMP/personal-parent-conflict.out"
  echo "expected personal scaffold parent-path conflict to fail" >&2
  exit 1
fi
if [ -e "$TMP/personal-parent-conflict/AGENTS.md" ] || [ -e "$TMP/personal-parent-conflict/parentfiles" ]; then
  echo "personal scaffold parent-path conflict should not write partial harness files" >&2
  exit 1
fi

python3 "$SKILL/scripts/scaffold_personal_harness.py" \
  --target "$TMP/personal-custom" \
  --project-name "Personal Custom" \
  --cli-name files >/dev/null
if (cd "$TMP/personal-custom" && ./files inventory report | grep -q './homeh'); then
  echo "custom personal CLI should not mention ./homeh" >&2
  exit 1
fi
if python3 "$SKILL/scripts/scaffold_personal_harness.py" \
  --target "$HOME/.ssh/personal-harness-test" \
  --project-name "Bad Personal Target" \
  --cli-name badhome >"$TMP/protected-personal.out" 2>"$TMP/protected-personal.err"; then
  cat "$TMP/protected-personal.out"
  echo "expected protected personal scaffold target to fail" >&2
  exit 1
fi

echo "all checks passed"
