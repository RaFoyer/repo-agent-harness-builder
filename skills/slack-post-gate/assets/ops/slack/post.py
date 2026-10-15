#!/usr/bin/env python3
"""Fail-closed outbound Slack bot gate.

This is an inactive reference implementation. Configure a repository-owned
channel contract and bind bot credential injection to this command before use.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SECTION_CHAR_LIMIT = 3000
MAX_BLOCKS = 50
TABLE_MAX_ROWS = 100
TABLE_MAX_COLS = 20
TABLE_AGGREGATE_CHARS = 10000
OVERRIDE_REASONS = {
    "classifier-false-positive",
    "style-exception",
    "audience-exception",
    "urgent-operational-need",
}

SLACK_MARKUP_ATOM = re.compile(
    r"<(?:[@#!][^<>|]+|https?://[^<>|]+|mailto:[^<>|]+)(?:\|[^<>]*)?>"
)
HTML_ENTITY = re.compile(r"&(?:amp|lt|gt|#\d+);")

BUILTIN_CONTENT_RULES = [
    (
        "private-key-block",
        re.compile(r"-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----", re.I),
        "private key material is forbidden",
    ),
    (
        "slack-credential",
        re.compile(r"\bxox[baprs]-[A-Za-z0-9-]{10,}\b"),
        "Slack credential material is forbidden",
    ),
    (
        "github-credential",
        re.compile(r"\b(?:ghp_[A-Za-z0-9_]{8,}|github_pat_[A-Za-z0-9_]{16,})\b"),
        "GitHub credential material is forbidden",
    ),
    (
        "cloud-access-key",
        re.compile(r"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b"),
        "cloud credential material is forbidden",
    ),
    (
        "credential-assignment",
        re.compile(
            r"\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|client[_-]?secret)"
            r"\s*[:=]\s*['\"]?[A-Za-z0-9_+./=-]{16,}",
            re.I,
        ),
        "credential-like assignment is forbidden",
    ),
]

BANNED_STYLE_WORDS = [
    "crucial",
    "delve",
    "foster",
    "fostering",
    "garner",
    "holistic",
    "intricate",
    "interplay",
    "leverage",
    "myriad",
    "paradigm",
    "pivotal",
    "plethora",
    "robust",
    "seamless",
    "showcase",
    "tapestry",
    "testament",
    "underscore",
    "underscores",
    "utilize",
    "vibrant",
]

BANNED_STYLE_PHRASES = [
    "a testament to",
    "at the end of the day",
    "certainly!",
    "due to the fact that",
    "evolving landscape",
    "great question",
    "i hope this helps",
    "in order to",
    "in today's",
    "it is important to note",
    "it is not just",
    "it's not just",
    "let me know if",
    "needless to say",
    "of course!",
    "serves as",
    "stands as",
    "you're absolutely right",
]


def strip_code_spans(text: str) -> str:
    """Blank fenced and inline code while preserving line positions."""
    text = re.sub(r"```.*?```", lambda match: " " * len(match.group(0)), text, flags=re.S)
    return re.sub(r"`[^`\n]*`", lambda match: " " * len(match.group(0)), text)


def formatting_findings(text: str, mrkdwn: bool = True) -> list[dict[str, str]]:
    """Return Slack mrkdwn findings without inspecting literal code."""
    findings: list[dict[str, str]] = []
    prose = strip_code_spans(text)

    boldable = re.sub(r"(?:\*\*/|/\*\*)", "  ", prose)
    if re.search(r"\*\*[^*\n]+\*\*", boldable):
        findings.append({"id": "markdown-bold", "reason": "mrkdwn bold uses single asterisks"})
    if re.search(r"(?<![\w/])__[^_\n]+__(?![\w./])", prose):
        findings.append({"id": "markdown-italic", "reason": "mrkdwn italic uses single underscores"})
    if re.search(r"~~[^~\n]+~~", prose):
        findings.append({"id": "markdown-strike", "reason": "mrkdwn strike uses single tildes"})
    if re.search(r"\[[^\]\n]+\]\([^)\n]+\)", prose):
        findings.append({"id": "markdown-link", "reason": "mrkdwn links use <url|label>"})
    if re.search(r"^\s*[-+]\s+\S", prose, re.M):
        findings.append({"id": "markdown-bullet", "reason": "mrkdwn has no dash bullet syntax"})
    if re.search(r"^\s*#{2,6}\s", prose, re.M):
        findings.append({"id": "markdown-heading", "reason": "mrkdwn has no heading syntax"})
    if re.search(r"^\s*\|.*\|\s*$", prose, re.M):
        findings.append({"id": "pipe-table", "reason": "pipe tables render as literal text"})
    if mrkdwn and re.search(r"```[A-Za-z]", text):
        findings.append({"id": "fence-language", "reason": "mrkdwn prints code-fence language tags"})

    if not mrkdwn:
        return findings

    without_markup = SLACK_MARKUP_ATOM.sub(" ", prose)
    without_markup = re.sub(r"https?://\S+", " ", without_markup)
    without_entities = HTML_ENTITY.sub(" ", without_markup)
    if re.search(r"&(?!(?:amp|lt|gt|#\d+);)", without_entities):
        findings.append({"id": "bare-ampersand", "reason": "escape bare ampersands as &amp;"})
    if "<" in without_entities:
        findings.append({"id": "bare-less-than", "reason": "escape bare less-than signs as &lt;"})
    if re.search(r"(?<![<\w])@[A-Za-z][\w.-]*", without_markup):
        findings.append({"id": "plaintext-mention", "reason": "plaintext @name does not notify a Slack user"})

    return findings


def visible_block_text(blocks: Any) -> list[tuple[str, str]]:
    """Collect text Slack renders from supported Block Kit structures."""
    if not isinstance(blocks, list):
        return []
    visible: list[tuple[str, str]] = []

    def add(value: Any, kind: str = "plain_text") -> None:
        if isinstance(value, str):
            visible.append((value, kind))
        elif isinstance(value, dict) and isinstance(value.get("text"), str):
            visible.append((value["text"], value.get("type", kind)))

    def rich(elements: Any, parent: str = "rich_text") -> None:
        if not isinstance(elements, list):
            return
        for element in elements:
            if not isinstance(element, dict):
                continue
            kind = element.get("type")
            if isinstance(kind, str) and kind in {"text", "link", "emoji", "user", "channel", "usergroup", "broadcast"}:
                add(element.get("text") or element.get("url") or element.get("name"), parent)
            rich(element.get("elements"), "code" if kind == "rich_text_preformatted" else parent)

    for block in blocks:
        if not isinstance(block, dict):
            continue
        kind = block.get("type")
        if kind == "section":
            add(block.get("text"))
            for field in block.get("fields") if isinstance(block.get("fields"), list) else []:
                add(field)
            accessory = block.get("accessory")
            if isinstance(accessory, dict):
                add(accessory.get("alt_text"))
        elif kind == "header":
            add(block.get("text"))
        elif kind == "context":
            for element in block.get("elements") if isinstance(block.get("elements"), list) else []:
                add(element)
                if isinstance(element, dict):
                    add(element.get("alt_text"))
        elif kind == "rich_text":
            rich(block.get("elements"))
        elif kind == "table":
            for row in block.get("rows") if isinstance(block.get("rows"), list) else []:
                if isinstance(row, list):
                    for cell in row:
                        add(cell, "raw_text")
        elif kind == "data_visualization":
            add(block.get("title"))
            chart = block.get("chart")
            if isinstance(chart, dict):
                axis = chart.get("axis_config")
                if isinstance(axis, dict):
                    for category in axis.get("categories") if isinstance(axis.get("categories"), list) else []:
                        add(category)
                for series in chart.get("series") if isinstance(chart.get("series"), list) else []:
                    if isinstance(series, dict):
                        add(series.get("name"))
                        for point in series.get("data") if isinstance(series.get("data"), list) else []:
                            if isinstance(point, dict):
                                add(point.get("label"))
        elif kind == "image":
            add(block.get("alt_text"))
            add(block.get("title"))
    return visible


def block_findings(blocks: Any) -> list[dict[str, str]]:
    """Validate high-risk Block Kit constraints used by the reference gate."""
    findings: list[dict[str, str]] = []
    if not isinstance(blocks, list):
        return [{"id": "blocks-type", "reason": "blocks must be a JSON list"}]
    if len(blocks) > MAX_BLOCKS:
        findings.append({"id": "blocks-count", "reason": f"block count exceeds {MAX_BLOCKS}"})

    table_chars = 0
    for index, block in enumerate(blocks):
        if not isinstance(block, dict):
            findings.append({"id": "block-type", "reason": f"block {index} is not an object"})
            continue

        compact = json.dumps(block, separators=(",", ":"))
        kind = block.get("type")
        if not isinstance(kind, str) or kind not in {"section", "header", "context", "rich_text", "table", "data_visualization", "image", "divider"}:
            findings.append({"id": "unsupported-block", "reason": f"block {index} has an unsupported type"})
        if kind == "actions" or kind == "button" or '"type":"button"' in compact:
            findings.append(
                {
                    "id": "button-without-interactivity",
                    "reason": f"block {index} contains a button without a proven interaction handler",
                }
            )

        if kind == "section":
            text_object = block.get("text") or {}
            body = text_object.get("text", "") if isinstance(text_object, dict) else ""
            if not isinstance(body, str):
                body = ""
            if len(body) > SECTION_CHAR_LIMIT:
                findings.append(
                    {"id": "section-length", "reason": f"section block {index} exceeds {SECTION_CHAR_LIMIT} characters"}
                )

        if kind == "table":
            rows = block.get("rows") or []
            if not isinstance(rows, list):
                findings.append({"id": "table-rows-type", "reason": f"table block {index} rows must be a list"})
                rows = []
            if len(rows) > TABLE_MAX_ROWS:
                findings.append({"id": "table-rows", "reason": f"table block {index} exceeds {TABLE_MAX_ROWS} rows"})
            for row in rows:
                if not isinstance(row, list):
                    findings.append({"id": "table-row-type", "reason": f"table block {index} contains a non-list row"})
                    continue
                if len(row) > TABLE_MAX_COLS:
                    findings.append(
                        {"id": "table-columns", "reason": f"table block {index} exceeds {TABLE_MAX_COLS} columns"}
                    )
                for cell in row:
                    if not isinstance(cell, dict):
                        findings.append({"id": "table-cell-type", "reason": f"table block {index} contains a non-object cell"})
                        continue
                    if cell.get("type") == "raw_number":
                        findings.append(
                            {"id": "table-raw-number", "reason": "raw_number is not a valid Slack table cell type"}
                        )
                    table_chars += len(str(cell.get("text", "")))

        if kind == "data_visualization":
            if isinstance(block.get("title"), dict):
                findings.append({"id": "chart-title", "reason": f"chart block {index} title must be a plain string"})
            chart = block.get("chart") or {}
            if isinstance(chart, dict):
                axis = chart.get("axis_config") or {}
                categories = axis.get("categories") or [] if isinstance(axis, dict) else []
                for series in chart.get("series") or []:
                    if not isinstance(series, dict):
                        continue
                    for point in series.get("data") or []:
                        if isinstance(point, dict) and categories and point.get("label") not in categories:
                            findings.append(
                                {
                                    "id": "chart-label",
                                    "reason": f"chart block {index} data label is absent from axis categories",
                                }
                            )

    for body, kind in visible_block_text(blocks):
        if kind == "code":
            continue
        for finding in formatting_findings(body, mrkdwn=kind == "mrkdwn"):
            findings.append({"id": f"block-{finding['id']}", "reason": finding["reason"]})

    if table_chars > TABLE_AGGREGATE_CHARS:
        findings.append(
            {"id": "table-aggregate-length", "reason": f"table content exceeds {TABLE_AGGREGATE_CHARS} characters"}
        )
    return findings


def payload_subject(text: str, blocks: Any) -> str:
    """Build a stable representation for content checks and audit digests."""
    if blocks is None:
        return text
    return text + "\n" + json.dumps(blocks, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def content_findings(text: str, config: dict[str, Any]) -> list[dict[str, str]]:
    """Scan raw text for built-in and repository-owned forbidden content."""
    findings: list[dict[str, str]] = []
    for rule_id, pattern, reason in BUILTIN_CONTENT_RULES:
        if pattern.search(text):
            findings.append({"id": rule_id, "reason": reason})

    policy = config.get("contentPolicy") or {}
    for rule in policy.get("rules") or []:
        try:
            pattern = re.compile(rule["pattern"], re.I)
        except (KeyError, TypeError, re.error) as error:
            findings.append({"id": "invalid-content-rule", "reason": f"invalid content policy rule: {error}"})
            continue
        if pattern.search(text):
            findings.append(
                {
                    "id": str(rule.get("id") or "configured-content-rule"),
                    "reason": str(rule.get("reason") or "configured content policy blocked this draft"),
                }
            )
    return findings


def style_findings(text: str, config: dict[str, Any]) -> list[dict[str, str]]:
    """Return overrideable mechanical prose findings."""
    findings: list[dict[str, str]] = []
    prose = SLACK_MARKUP_ATOM.sub(" ", strip_code_spans(text))
    prose = re.sub(r"https?://\S+", " ", prose)
    low = prose.lower()

    for word in BANNED_STYLE_WORDS:
        if re.search(rf"\b{re.escape(word)}\b(?![=@/.-])", low):
            findings.append({"id": f"style-word-{word}", "reason": f"house-style vocabulary: {word}"})
    for phrase in BANNED_STYLE_PHRASES:
        if phrase in low:
            findings.append({"id": "style-filler", "reason": f"filler or chatbot phrase: {phrase}"})

    if re.search(r"[‘’“”]", prose):
        findings.append({"id": "style-curly-quotes", "reason": "use straight quotes"})

    allowed_patterns = (config.get("stylePolicy") or {}).get("allowedDashLinePatterns") or []
    for line in prose.splitlines():
        if "—" not in line and "–" not in line:
            continue
        allowed = False
        for raw_pattern in allowed_patterns:
            try:
                if re.fullmatch(str(raw_pattern), line):
                    allowed = True
                    break
            except re.error:
                findings.append({"id": "invalid-style-rule", "reason": "invalid allowed dash line pattern"})
                allowed = True
                break
        if not allowed:
            findings.append({"id": "style-dash", "reason": "em or en dash is outside the configured house style"})
            break

    return findings


def load_config(path: Path) -> dict[str, Any]:
    try:
        config = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f"cannot read gate config: {error}") from error
    if not isinstance(config, dict):
        raise ValueError("gate config must be a JSON object")
    if config.get("status") not in {"active", "inactive"}:
        raise ValueError("config status must be active or inactive")
    ref = config.get("botCredentialRef")
    if not isinstance(ref, str) or not re.fullmatch(r"env:[A-Z][A-Z0-9_]*", ref):
        raise ValueError("botCredentialRef must be an env: reference, never a secret value")
    channels = config.get("channels")
    if not isinstance(channels, dict) or not channels:
        raise ValueError("config must define at least one channel contract")
    if config["status"] == "active":
        command = config.get("classifierCommand")
        if not isinstance(command, list) or not command or not all(isinstance(part, str) and part for part in command):
            raise ValueError("active config requires a classifierCommand argv array")
        rules = (config.get("contentPolicy") or {}).get("rules")
        if not isinstance(rules, list) or not rules:
            raise ValueError("active config requires repository-owned content policy rules")
        for channel, contract in channels.items():
            if not re.fullmatch(r"[CGD][A-Z0-9]{8,}", str(channel)):
                raise ValueError(f"active config channel {channel} must be a Slack channel ID")
            if not isinstance(contract, dict):
                raise ValueError(f"channel {channel} contract must be an object")
            audience = contract.get("audience")
            if not isinstance(audience, str) or not audience.strip() or audience.startswith("Name the least technical"):
                raise ValueError(f"channel {channel} requires a named audience")
            genres = contract.get("allowedGenres")
            if not isinstance(genres, list) or not genres or not all(isinstance(item, str) and item for item in genres):
                raise ValueError(f"channel {channel} requires at least one allowed genre")
            excluded = contract.get("excludedSubjects")
            if not isinstance(excluded, list) or not all(isinstance(item, str) and item for item in excluded):
                raise ValueError(f"channel {channel} excludedSubjects must be a string list")
    return config


def classifier_input(text: str, channel_contract: dict[str, Any]) -> dict[str, Any]:
    return {
        "audience": channel_contract.get("audience", ""),
        "allowedGenres": channel_contract.get("allowedGenres", []),
        "excludedSubjects": channel_contract.get("excludedSubjects", []),
        "draft": text,
    }


def child_environment(credential_ref: str) -> dict[str, str]:
    environment = os.environ.copy()
    if credential_ref.startswith("env:"):
        environment.pop(credential_ref.removeprefix("env:"), None)
    return environment


def classify(text: str, channel_contract: dict[str, Any], config: dict[str, Any]) -> tuple[str, list[str]]:
    """Run the configured classifier without a shell and validate strict JSON."""
    command = config.get("classifierCommand")
    if not isinstance(command, list) or not command or not all(isinstance(part, str) and part for part in command):
        return "error", ["classifier command is not configured"]
    timeout = config.get("classifierTimeoutSeconds", 45)
    if not isinstance(timeout, int) or timeout < 1 or timeout > 300:
        return "error", ["classifier timeout must be an integer from 1 to 300 seconds"]

    try:
        result = subprocess.run(
            command,
            input=json.dumps(classifier_input(text, channel_contract)),
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
            env=child_environment(str(config.get("botCredentialRef") or "")),
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        return "error", [f"classifier unavailable: {error}"]
    if result.returncode != 0:
        return "error", [f"classifier exited with status {result.returncode}"]
    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError:
        return "error", ["classifier returned invalid JSON"]
    if not isinstance(payload, dict) or payload.get("verdict") not in {"pass", "fail"}:
        return "error", ["classifier returned an invalid verdict"]
    reasons = payload.get("reasons")
    if not isinstance(reasons, list) or not all(isinstance(reason, str) for reason in reasons):
        return "error", ["classifier returned invalid reasons"]
    if payload["verdict"] == "pass" and reasons:
        return "error", ["classifier pass verdict must have no reasons"]
    if payload["verdict"] == "fail" and not reasons:
        return "error", ["classifier fail verdict must name a reason"]
    return payload["verdict"], reasons


def evaluate(
    text: str,
    blocks: Any,
    channel_contract: dict[str, Any],
    config: dict[str, Any],
) -> tuple[list[dict[str, str]], list[dict[str, str]]]:
    hard = content_findings(payload_subject(text, blocks), config) + formatting_findings(text)
    if blocks is not None:
        hard += block_findings(blocks)
    block_text = visible_block_text(blocks)
    review_text = "\n".join([text, *(body for body, _kind in block_text)])
    style_text = "\n".join([text, *(body for body, kind in block_text if kind != "code")])
    judgment = style_findings(style_text, config)
    verdict, reasons = classify(review_text, channel_contract, config)
    if verdict == "error":
        hard.extend(
            {"id": "classifier-error", "reason": reason}
            for reason in reasons or ["classifier did not return a valid verdict"]
        )
    elif verdict == "fail":
        judgment.extend(
            {"id": "classifier-fail", "reason": reason}
            for reason in reasons or ["classifier rejected the draft"]
        )
    elif verdict != "pass":
        hard.append({"id": "classifier-error", "reason": "classifier returned an unknown verdict"})
    return hard, judgment


def gate_decision(
    hard: list[dict[str, str]],
    judgment: list[dict[str, str]],
    override_judgment: bool,
) -> str:
    if hard or (judgment and not override_judgment):
        return "BLOCKED"
    if judgment:
        return "OVERRIDDEN"
    return "PASSED"


def audit_path(start: Path | None = None, credential_ref: str = "") -> Path:
    working_dir = (start or Path.cwd()).resolve()
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--git-common-dir"],
            cwd=working_dir,
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
            env=child_environment(credential_ref),
        )
    except (OSError, subprocess.TimeoutExpired):
        result = None
    if result and result.returncode == 0 and result.stdout.strip():
        base = Path(result.stdout.strip())
        if not base.is_absolute():
            base = working_dir / base
        return base.resolve() / "slack-post-gate" / "audit.jsonl"
    return working_dir / ".agent-state" / "slack-post-gate" / "audit.jsonl"


def write_audit(
    decision: str,
    channel: str,
    text: str,
    findings: list[dict[str, str]],
    override_reason: str = "",
    start: Path | None = None,
    credential_ref: str = "",
) -> None:
    if override_reason and override_reason not in OVERRIDE_REASONS:
        raise ValueError("override reason must be a predefined reason code")
    path = audit_path(start, credential_ref)
    path.parent.mkdir(parents=True, exist_ok=True)
    event = {
        "timestamp": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "decision": decision,
        "channel": channel,
        "findingIds": [finding["id"] for finding in findings],
        "draftBytes": len(text.encode("utf-8")),
        "draftSha256": hashlib.sha256(text.encode("utf-8")).hexdigest(),
    }
    if override_reason:
        event["overrideReason"] = override_reason
    line = (json.dumps(event, separators=(",", ":")) + "\n").encode("utf-8")
    descriptor = os.open(path, os.O_APPEND | os.O_CREAT | os.O_WRONLY, 0o600)
    try:
        written = os.write(descriptor, line)
        if written != len(line):
            raise OSError("short audit write")
    finally:
        os.close(descriptor)


def send(channel: str, thread_ts: str, text: str, blocks: Any, config: dict[str, Any]) -> dict[str, Any]:
    ref = str(config["botCredentialRef"])
    env_name = ref.removeprefix("env:")
    bot_auth = os.environ.get(env_name, "")
    if not bot_auth:
        raise RuntimeError(f"{env_name} is absent; run through the approved command-scoped credential profile")

    payload: dict[str, Any] = {
        "channel": channel,
        "text": text,
        "unfurl_links": False,
        "unfurl_media": False,
    }
    if blocks is not None:
        payload["blocks"] = blocks
    if thread_ts:
        payload["thread_ts"] = thread_ts
    headers = {"Content-Type": "application/json; charset=utf-8"}
    auth_header_name = "Author" + "ization"
    headers[auth_header_name] = "Bearer " + bot_auth
    request = urllib.request.Request(
        "https://slack.com/api/chat.postMessage",
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            result = json.load(response)
    except (urllib.error.URLError, OSError, TimeoutError) as error:
        raise RuntimeError(f"Slack send failed: {error}") from error
    if not isinstance(result, dict):
        raise RuntimeError("Slack returned a non-object response")
    return result


def read_json(path: str) -> Any:
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f"cannot read JSON file {path}: {error}") from error


def print_findings(title: str, findings: list[dict[str, str]]) -> None:
    if not findings:
        return
    print(title)
    for finding in findings:
        print(f"  - {finding['id']}: {finding['reason']}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    parser.add_argument("--channel", required=True)
    parser.add_argument("--thread-ts", default="")
    parser.add_argument("--text-file", required=True)
    parser.add_argument("--blocks-file")
    parser.add_argument("--check-only", action="store_true")
    parser.add_argument("--override-judgment", action="store_true")
    parser.add_argument("--override-reason", choices=sorted(OVERRIDE_REASONS), default="")
    args = parser.parse_args()
    config_dir = Path(args.config).resolve().parent

    if args.override_judgment != bool(args.override_reason.strip()):
        parser.error("--override-judgment and a non-empty --override-reason must be supplied together")

    try:
        config = load_config(Path(args.config))
        text = Path(args.text_file).read_text(encoding="utf-8").strip()
        blocks = read_json(args.blocks_file) if args.blocks_file else None
    except (OSError, ValueError) as error:
        print(f"BLOCKED: {error}", file=sys.stderr)
        return 2
    if not text:
        print("BLOCKED: refusing an empty message", file=sys.stderr)
        return 2
    if args.thread_ts and not re.fullmatch(r"\d+\.\d+", args.thread_ts):
        print("BLOCKED: --thread-ts must use Slack's numeric timestamp form", file=sys.stderr)
        return 2

    channel_contract = config["channels"].get(args.channel)
    if not isinstance(channel_contract, dict):
        print("BLOCKED: channel is not allowlisted in the gate config", file=sys.stderr)
        return 2

    hard, judgment = evaluate(text, blocks, channel_contract, config)
    all_findings = hard + judgment
    audit_subject = payload_subject(text, blocks)
    decision = gate_decision(hard, judgment, args.override_judgment)
    if decision == "BLOCKED":
        try:
            write_audit("BLOCKED", args.channel, audit_subject, all_findings, start=config_dir, credential_ref=config["botCredentialRef"])
        except OSError as error:
            print(f"BLOCKED: audit write failed: {error}", file=sys.stderr)
        print("BLOCKED. Nothing was sent.")
        print_findings("Blocking findings:", hard)
        print_findings("Style or audience findings:", judgment)
        if hard and args.override_judgment:
            print("The judgment override cannot bypass content, formatting, or classifier errors.")
        return 2

    if not args.check_only and config.get("status") != "active":
        try:
            write_audit("BLOCKED_INACTIVE", args.channel, audit_subject, [], start=config_dir, credential_ref=config["botCredentialRef"])
        except OSError as error:
            print(f"BLOCKED: audit write failed: {error}", file=sys.stderr)
        print("BLOCKED: gate config is inactive; no message was sent", file=sys.stderr)
        return 2
    try:
        write_audit(decision, args.channel, audit_subject, judgment, args.override_reason.strip(), start=config_dir, credential_ref=config["botCredentialRef"])
    except OSError as error:
        print(f"BLOCKED: pre-send audit write failed: {error}", file=sys.stderr)
        return 2

    if args.check_only:
        print(f"{decision}. Gate ran without sending (--check-only).")
        print_findings("Overridden judgment findings:", judgment)
        return 0
    try:
        result = send(args.channel, args.thread_ts, text, blocks, config)
    except RuntimeError as error:
        try:
            write_audit("SEND_FAILED", args.channel, audit_subject, [{"id": "transport-error", "reason": str(error)}], start=config_dir, credential_ref=config["botCredentialRef"])
        except OSError:
            pass
        print(str(error), file=sys.stderr)
        return 1
    if not result.get("ok"):
        error_name = str(result.get("error") or "unknown_error")
        try:
            write_audit("SEND_FAILED", args.channel, audit_subject, [{"id": "slack-error", "reason": error_name}], start=config_dir, credential_ref=config["botCredentialRef"])
        except OSError:
            pass
        print(f"Slack rejected the send: {error_name}", file=sys.stderr)
        return 1

    try:
        write_audit("SENT", args.channel, audit_subject, [], start=config_dir, credential_ref=config["botCredentialRef"])
    except OSError as error:
        print(f"SENT, but the delivery audit write failed: {error}. Do not retry.", file=sys.stderr)
        return 3
    print(f"SENT. ts={result.get('ts', 'unknown')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
