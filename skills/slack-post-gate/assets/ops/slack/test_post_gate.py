#!/usr/bin/env python3
"""Paired tests and deliberate falsification for the Slack post gate."""

from __future__ import annotations

import contextlib
import io
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


sys.path.insert(0, str(Path(__file__).resolve().parent))
import post  # noqa: E402


def finding_ids(findings):
    return {finding["id"] for finding in findings}


class FormattingTests(unittest.TestCase):
    def assert_caught(self, expected_id, text):
        self.assertIn(expected_id, finding_ids(post.formatting_findings(text)))

    def assert_clean(self, text):
        self.assertEqual([], post.formatting_findings(text))

    def test_bold_pair(self):
        self.assert_caught("markdown-bold", "This is **bold** text.")
        self.assert_clean("This is *bold* text.")

    def test_italic_pair(self):
        self.assert_caught("markdown-italic", "This is __italic__ text.")
        self.assert_clean("This is _italic_ text.")

    def test_strike_pair(self):
        self.assert_caught("markdown-strike", "This is ~~struck~~ text.")
        self.assert_clean("This is ~struck~ text.")

    def test_link_pair(self):
        self.assert_caught("markdown-link", "See [the runbook](https://example.com/x).")
        self.assert_clean("See <https://example.com/x|the runbook>.")

    def test_bullet_pair(self):
        self.assert_caught("markdown-bullet", "Items:\n- first\n- second")
        self.assert_clean("Items:\n• first\n• second")

    def test_heading_pair(self):
        self.assert_caught("markdown-heading", "## Status\nAll green.")
        self.assert_clean("*Status*\nAll green.")

    def test_table_and_fence(self):
        self.assert_caught("pipe-table", "| Layer | State |\n|---|---|")
        self.assert_caught("fence-language", "```python\nprint(1)\n```")
        self.assert_clean("```\nprint(1)\n```")

    def test_entities_pair(self):
        self.assert_caught("bare-ampersand", "Capture & publish use separate clocks.")
        self.assert_clean("Capture &amp; publish use separate clocks.")
        self.assert_caught("bare-less-than", "Fails when depth < 3.")
        self.assert_clean("Fails when depth &lt; 3.")

    def test_slack_tokens_are_clean(self):
        self.assert_clean("Handing to <@U01234567>.")
        self.assert_clean("See <https://example.com/a|the note>.")
        self.assert_clean("Lands <!date^1787255645^{date_short_pretty}|soon>.")

    def test_plaintext_mention_pair(self):
        self.assert_caught("plaintext-mention", "Handing to @owner.")
        self.assert_clean("Mail infra-admin@example.com if it recurs.")

    def test_code_is_exempt_from_formatting(self):
        self.assert_clean("Run `git diff --check` and `a && b`.")
        self.assert_clean("```\nif (a < b && c > d) { x[i](j); }\n```")

    def test_real_engineering_false_positive_regressions(self):
        messages = [
            "Failure is in services/api/__init__.py.",
            "Query was:\nSELECT\n  * FROM jobs;",
            "Run these commands:\n# restart worker\nkubectl rollout restart deploy/worker",
            "Upgrade robust==2.1.0 before deploy.",
            "Inspect src/**/generated/** before release.",
            "State transition: queued -> running.",
            "See <https://example.com/robust-guide|the guide>.",
            "Fails when depth > 3 in the tree.",
        ]
        for message in messages:
            with self.subTest(message=message):
                self.assert_clean(message)


class ContentTests(unittest.TestCase):
    def setUp(self):
        self.config = {
            "contentPolicy": {
                "rules": [
                    {
                        "id": "internal-reference",
                        "pattern": r"\bINTERNAL-[0-9]{6}\b",
                        "reason": "internal references stay out",
                    }
                ]
            }
        }

    def test_configured_rule_pair(self):
        self.assertIn(
            "internal-reference",
            finding_ids(post.content_findings("Run INTERNAL-123456 failed.", self.config)),
        )
        self.assertEqual([], post.content_findings("The scheduled run failed.", self.config))

    def test_secret_in_code_is_still_blocked(self):
        sample = "xox" + "b-1234567890-abcdefghij"
        findings = post.content_findings(f"`{sample}`", self.config)
        self.assertIn("slack-credential", finding_ids(findings))

    def test_ordinary_code_is_clean(self):
        self.assertEqual([], post.content_findings("`result = client.run()`", self.config))

    def test_secret_in_block_payload_is_blocked(self):
        sample = "xox" + "b-1234567890-abcdefghij"
        blocks = [{"type": "section", "text": {"type": "mrkdwn", "text": sample}}]
        with mock.patch.object(post, "classify", return_value=("pass", [])):
            hard, _judgment = post.evaluate("Fallback text.", blocks, {}, self.config)
        self.assertIn("slack-credential", finding_ids(hard))

    def test_unicode_rule_applies_to_block_text(self):
        config = {"contentPolicy": {"rules": [{"id": "private-name", "pattern": "José", "reason": "private"}]}}
        blocks = [{"type": "section", "text": {"type": "mrkdwn", "text": "José reviewed it."}}]
        with mock.patch.object(post, "classify", return_value=("pass", [])):
            hard, _judgment = post.evaluate("Public fallback.", blocks, {}, config)
        self.assertIn("private-name", finding_ids(hard))


class StyleTests(unittest.TestCase):
    def setUp(self):
        self.config = {"stylePolicy": {"allowedDashLinePatterns": []}}

    def assert_caught(self, expected_id, text, config=None):
        self.assertIn(expected_id, finding_ids(post.style_findings(text, config or self.config)))

    def test_style_pairs(self):
        self.assert_caught("style-curly-quotes", "It’s done.")
        self.assertEqual([], post.style_findings("It's done.", self.config))
        self.assert_caught("style-dash", "The run finished — finally.")
        self.assertEqual([], post.style_findings("The run finished. Finally.", self.config))
        self.assert_caught("style-word-delve", "We should delve into the data.")
        self.assertEqual([], post.style_findings("We should inspect the data.", self.config))
        self.assert_caught("style-filler", "Fixed. I hope this helps!")
        self.assertEqual([], post.style_findings("Fixed the parser.", self.config))

    def test_package_and_url_false_positives(self):
        self.assertEqual([], post.style_findings("Upgrade robust==2.1.0.", self.config))
        self.assertEqual([], post.style_findings("See https://example.com/robust-guide.", self.config))

    def test_position_aware_dash_allowance(self):
        config = {"stylePolicy": {"allowedDashLinePatterns": [r"[^—]+ — [^—]+"]}}
        self.assertEqual([], post.style_findings("Release — owner action", config))
        self.assert_caught("style-dash", "The release — despite delays — shipped.", config)


class BlockKitTests(unittest.TestCase):
    def test_visible_text_reaches_formatting_style_and_classifier(self):
        blocks = [
            {"type": "section", "fields": [{"type": "mrkdwn", "text": "**bold** crucial field"}]},
            {"type": "header", "text": {"type": "plain_text", "text": "Header news"}},
            {"type": "context", "elements": [{"type": "mrkdwn", "text": "Context news"}]},
            {"type": "rich_text", "elements": [{"type": "rich_text_section", "elements": [{"type": "text", "text": "Rich news"}]}]},
            {"type": "table", "rows": [[{"type": "raw_text", "text": "Table news"}]]},
            {"type": "data_visualization", "title": "Chart news", "chart": {"axis_config": {"categories": ["Level news"]}, "series": [{"name": "Series news", "data": [{"label": "Level news", "value": 1}]}]}},
        ]
        with mock.patch.object(post, "classify", return_value=("pass", [])) as classify:
            hard, judgment = post.evaluate("Fallback.", blocks, {}, {"contentPolicy": {"rules": []}})
        self.assertIn("block-markdown-bold", finding_ids(hard))
        self.assertIn("style-word-crucial", finding_ids(judgment))
        draft = classify.call_args.args[0]
        for value in ("bold", "Header news", "Context news", "Rich news", "Table news", "Chart news", "Series news", "Level news"):
            self.assertIn(value, draft)

    def test_plain_text_and_code_respect_text_type(self):
        blocks = [
            {"type": "header", "text": {"type": "plain_text", "text": "A & B < C"}},
            {"type": "rich_text", "elements": [{"type": "rich_text_preformatted", "elements": [{"type": "text", "text": "a < b && c > d"}]}]},
        ]
        self.assertEqual([], post.block_findings(blocks))
        with mock.patch.object(post, "classify", return_value=("pass", [])):
            hard, judgment = post.evaluate("Ready.", blocks, {}, {"contentPolicy": {"rules": []}})
        self.assertEqual([], hard)
        self.assertEqual([], judgment)

    def test_unknown_block_is_refused(self):
        self.assertIn("unsupported-block", finding_ids(post.block_findings([{"type": "video", "title": "Private news"}])))

    def test_button_is_refused(self):
        blocks = [{"type": "actions", "elements": [{"type": "button", "text": {"type": "plain_text", "text": "Approve"}}]}]
        self.assertIn("button-without-interactivity", finding_ids(post.block_findings(blocks)))

    def test_valid_table(self):
        blocks = [
            {
                "type": "table",
                "rows": [
                    [{"type": "raw_text", "text": "Level"}, {"type": "raw_text", "text": "Count"}],
                    [{"type": "raw_text", "text": "L1"}, {"type": "raw_text", "text": "449"}],
                ],
            }
        ]
        self.assertEqual([], post.block_findings(blocks))

    def test_invalid_table_cell_and_dimensions(self):
        raw_number = [{"type": "table", "rows": [[{"type": "raw_number", "text": "449"}]]}]
        self.assertIn("table-raw-number", finding_ids(post.block_findings(raw_number)))
        too_wide = [{"type": "table", "rows": [[{"type": "raw_text", "text": "c"}] * 21]}]
        self.assertIn("table-columns", finding_ids(post.block_findings(too_wide)))

    def test_limits(self):
        self.assertIn("blocks-count", finding_ids(post.block_findings([{"type": "divider"}] * 51)))
        section = [{"type": "section", "text": {"type": "mrkdwn", "text": "x" * 3001}}]
        self.assertIn("section-length", finding_ids(post.block_findings(section)))

    def test_chart_validation(self):
        bad_title = [{"type": "data_visualization", "title": {"type": "plain_text", "text": "X"}, "chart": {}}]
        self.assertIn("chart-title", finding_ids(post.block_findings(bad_title)))
        mismatch = [
            {
                "type": "data_visualization",
                "title": "Levels",
                "chart": {
                    "series": [{"name": "Count", "data": [{"label": "L9", "value": 1}]}],
                    "axis_config": {"categories": ["L1"]},
                },
            }
        ]
        self.assertIn("chart-label", finding_ids(post.block_findings(mismatch)))


class ClassifierTests(unittest.TestCase):
    def setUp(self):
        self.contract = {
            "audience": "Product and engineering leads",
            "allowedGenres": ["decision"],
            "excludedSubjects": ["debug narrative"],
        }
        self.config = {
            "classifierCommand": ["classifier"],
            "classifierTimeoutSeconds": 10,
        }

    @mock.patch.object(post.subprocess, "run")
    def test_known_good_classifier_runs_and_passes(self, run):
        run.return_value = mock.Mock(returncode=0, stdout='{"verdict":"pass","reasons":[]}', stderr="")
        verdict, reasons = post.classify("Parser fixed.", self.contract, self.config)
        self.assertEqual(("pass", []), (verdict, reasons))
        payload = json.loads(run.call_args.kwargs["input"])
        self.assertEqual("Product and engineering leads", payload["audience"])
        self.assertEqual("Parser fixed.", payload["draft"])
        self.assertNotIn("shell", run.call_args.kwargs)

    @mock.patch.object(post.subprocess, "run")
    def test_classifier_failure_is_an_error(self, run):
        run.return_value = mock.Mock(returncode=1, stdout="", stderr="failed")
        verdict, reasons = post.classify("Parser fixed.", self.contract, self.config)
        self.assertEqual("error", verdict)
        self.assertTrue(reasons)

    @mock.patch.object(post.subprocess, "run")
    def test_invalid_json_fails_closed(self, run):
        run.return_value = mock.Mock(returncode=0, stdout="not json", stderr="")
        verdict, _ = post.classify("Parser fixed.", self.contract, self.config)
        self.assertEqual("error", verdict)

    def test_unconfigured_classifier_fails_closed(self):
        verdict, reasons = post.classify("Parser fixed.", self.contract, {"classifierCommand": []})
        self.assertEqual("error", verdict)
        self.assertTrue(reasons)

    @mock.patch.object(post.subprocess, "run")
    def test_classifier_child_does_not_receive_bot_credential(self, run):
        run.return_value = mock.Mock(returncode=0, stdout='{"verdict":"pass","reasons":[]}', stderr="")
        config = {**self.config, "botCredentialRef": "env:SLACK_BOT_TOKEN"}
        with mock.patch.dict(os.environ, {"SLACK_BOT_TOKEN": "test-only-secret", "CLASSIFIER_SETTING": "retained"}):
            self.assertEqual("pass", post.classify("Ready.", self.contract, config)[0])
        self.assertNotIn("SLACK_BOT_TOKEN", run.call_args.kwargs["env"])
        self.assertEqual("retained", run.call_args.kwargs["env"]["CLASSIFIER_SETTING"])

    @mock.patch.object(post.subprocess, "run")
    def test_git_audit_child_does_not_receive_bot_credential(self, run):
        run.return_value = mock.Mock(returncode=1, stdout="", stderr="")
        with tempfile.TemporaryDirectory() as temp_dir, mock.patch.dict(os.environ, {"SLACK_BOT_TOKEN": "test-only-secret"}):
            post.audit_path(Path(temp_dir), "env:SLACK_BOT_TOKEN")
        self.assertNotIn("SLACK_BOT_TOKEN", run.call_args.kwargs["env"])

    def test_send_retains_bot_credential_at_transport(self):
        with mock.patch.dict(os.environ, {"SLACK_BOT_TOKEN": "test-only-secret"}), mock.patch.object(
            post.urllib.request, "urlopen", return_value=io.BytesIO(b'{"ok":true,"ts":"1.2"}')
        ) as urlopen:
            result = post.send("C123", "", "Ready.", None, {"botCredentialRef": "env:SLACK_BOT_TOKEN"})
        self.assertTrue(result["ok"])
        self.assertEqual("Bearer test-only-secret", urlopen.call_args.args[0].get_header("Authorization"))


class GateTests(unittest.TestCase):
    def setUp(self):
        self.config = {
            "classifierCommand": ["classifier"],
            "classifierTimeoutSeconds": 10,
            "contentPolicy": {"rules": []},
            "stylePolicy": {"allowedDashLinePatterns": []},
        }
        self.contract = {
            "audience": "Engineering leads",
            "allowedGenres": ["status"],
            "excludedSubjects": ["debug narrative"],
        }

    @mock.patch.object(post, "classify", return_value=("pass", []))
    def test_known_good_message_passes_every_checker(self, classify):
        hard, judgment = post.evaluate("Sweep clean. Nothing new, nothing posted.", None, self.contract, self.config)
        self.assertEqual([], hard)
        self.assertEqual([], judgment)
        classify.assert_called_once()

    @mock.patch.object(post, "classify", return_value=("error", ["offline"]))
    def test_classifier_error_blocks_even_with_override(self, _classify):
        hard, judgment = post.evaluate("Sweep clean.", None, self.contract, self.config)
        self.assertIn("classifier-error", finding_ids(hard))
        self.assertEqual("BLOCKED", post.gate_decision(hard, judgment, True))

    def test_classifier_failure_modes_block_and_valid_fail_can_be_overridden(self):
        failures = [
            OSError("missing"),
            post.subprocess.TimeoutExpired("classifier", 1),
            mock.Mock(returncode=1, stdout="", stderr="failed"),
            mock.Mock(returncode=0, stdout="invalid", stderr=""),
            mock.Mock(returncode=0, stdout='{"verdict":"pass","reasons":["unexpected"]}', stderr=""),
        ]
        for result in failures:
            with self.subTest(result=result), mock.patch.object(post.subprocess, "run", side_effect=result if isinstance(result, Exception) else None, return_value=None if isinstance(result, Exception) else result):
                hard, judgment = post.evaluate("Ready.", None, self.contract, self.config)
                self.assertIn("classifier-error", finding_ids(hard))
                self.assertEqual("BLOCKED", post.gate_decision(hard, judgment, True))
        with mock.patch.object(post.subprocess, "run", return_value=mock.Mock(returncode=0, stdout='{"verdict":"fail","reasons":["wrong room"]}', stderr="")):
            hard, judgment = post.evaluate("Ready.", None, self.contract, self.config)
        self.assertEqual([], hard)
        self.assertIn("classifier-fail", finding_ids(judgment))
        self.assertEqual("OVERRIDDEN", post.gate_decision(hard, judgment, True))

    def test_audit_accepts_reason_code_and_rejects_free_text(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            audit_file = Path(temp_dir) / "audit.jsonl"
            with mock.patch.object(post, "audit_path", return_value=audit_file):
                with self.assertRaises(ValueError):
                    post.write_audit("OVERRIDDEN", "C123", "Draft", [], "xoxb-1234567890-abcdefghij")
                post.write_audit("OVERRIDDEN", "C123", "Draft", [], "classifier-false-positive")
            event = json.loads(audit_file.read_text(encoding="utf-8"))
            self.assertEqual("classifier-false-positive", event["overrideReason"])
            self.assertNotIn("xoxb-1234567890-abcdefghij", audit_file.read_text(encoding="utf-8"))

    @mock.patch.object(post, "classify", return_value=("pass", []))
    def test_hard_and_judgment_findings_stay_separate(self, _classify):
        hard, judgment = post.evaluate("This is **crucial**.", None, self.contract, self.config)
        self.assertIn("markdown-bold", finding_ids(hard))
        self.assertIn("style-word-crucial", finding_ids(judgment))

    def test_override_applies_only_to_judgment(self):
        hard = [{"id": "content", "reason": "forbidden"}]
        judgment = [{"id": "style", "reason": "wording"}]
        self.assertEqual("BLOCKED", post.gate_decision(hard, judgment, True))
        self.assertEqual("BLOCKED", post.gate_decision([], judgment, False))
        self.assertEqual("OVERRIDDEN", post.gate_decision([], judgment, True))
        self.assertEqual("PASSED", post.gate_decision([], [], False))

    def test_check_only_entrypoint_returns_pass_and_runs_classifier(self):
        config = {
            "status": "inactive",
            "botCredentialRef": "env:SLACK_BOT_TOKEN",
            "classifierCommand": ["classifier"],
            "classifierTimeoutSeconds": 10,
            "channels": {"C_REPLACE_ME": self.contract},
            "contentPolicy": {"rules": []},
            "stylePolicy": {"allowedDashLinePatterns": []},
        }
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = root / "post-gate.json"
            text_path = root / "draft.txt"
            config_path.write_text(json.dumps(config), encoding="utf-8")
            text_path.write_text("Sweep clean. Nothing new, nothing posted.", encoding="utf-8")
            argv = [
                "post.py",
                "--config",
                str(config_path),
                "--channel",
                "C_REPLACE_ME",
                "--text-file",
                str(text_path),
                "--check-only",
            ]
            with mock.patch.object(sys, "argv", argv), mock.patch.object(
                post, "classify", return_value=("pass", [])
            ) as classify, mock.patch.object(post, "write_audit") as audit:
                with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                    self.assertEqual(0, post.main())
            classify.assert_called_once()
            audit.assert_called_once()

    def test_inactive_entrypoint_never_sends(self):
        config = {
            "status": "inactive",
            "botCredentialRef": "env:SLACK_BOT_TOKEN",
            "classifierCommand": ["classifier"],
            "classifierTimeoutSeconds": 10,
            "channels": {"C_REPLACE_ME": self.contract},
            "contentPolicy": {"rules": []},
            "stylePolicy": {"allowedDashLinePatterns": []},
        }
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = root / "post-gate.json"
            text_path = root / "draft.txt"
            config_path.write_text(json.dumps(config), encoding="utf-8")
            text_path.write_text("Sweep clean.", encoding="utf-8")
            argv = [
                "post.py",
                "--config",
                str(config_path),
                "--channel",
                "C_REPLACE_ME",
                "--text-file",
                str(text_path),
            ]
            with mock.patch.object(sys, "argv", argv), mock.patch.object(
                post, "classify", return_value=("pass", [])
            ), mock.patch.object(post, "write_audit"), mock.patch.object(post, "send") as send:
                with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                    self.assertEqual(2, post.main())
            send.assert_not_called()


class ConfigTests(unittest.TestCase):
    def test_example_config_is_structurally_valid(self):
        example = Path(__file__).with_name("post-gate.example.json")
        config = post.load_config(example)
        self.assertEqual("inactive", config["status"])

    def test_active_config_requires_classifier_and_policy(self):
        example = Path(__file__).with_name("post-gate.example.json")
        config = json.loads(example.read_text(encoding="utf-8"))
        config["status"] = "active"
        with mock.patch.object(Path, "read_text", return_value=json.dumps(config)):
            with self.assertRaisesRegex(ValueError, "classifierCommand"):
                post.load_config(example)

    def test_active_config_rejects_placeholder_channel(self):
        example = Path(__file__).with_name("post-gate.example.json")
        config = json.loads(example.read_text(encoding="utf-8"))
        config["status"] = "active"
        config["classifierCommand"] = ["classifier"]
        with mock.patch.object(Path, "read_text", return_value=json.dumps(config)):
            with self.assertRaisesRegex(ValueError, "Slack channel ID"):
                post.load_config(example)


def run_suite() -> unittest.result.TestResult:
    suite = unittest.defaultTestLoader.loadTestsFromModule(sys.modules[__name__])
    return unittest.TextTestRunner(verbosity=2).run(suite)


def run_falsification() -> int:
    original = post.formatting_findings

    def disabled_bold_rule(text):
        return [finding for finding in original(text) if finding["id"] != "markdown-bold"]

    post.formatting_findings = disabled_bold_rule
    suite = unittest.TestSuite([FormattingTests("test_bold_pair")])
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    post.formatting_findings = original
    if result.wasSuccessful():
        print("FALSIFICATION FAILED: the suite passed with markdown-bold disabled", file=sys.stderr)
        return 1
    print("FALSIFICATION PASSED: disabling markdown-bold caused the paired test to fail")
    return 0


if __name__ == "__main__":
    if "--falsify" in sys.argv:
        raise SystemExit(run_falsification())
    result = run_suite()
    raise SystemExit(0 if result.wasSuccessful() else 1)
