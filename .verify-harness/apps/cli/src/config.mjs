import { fileURLToPath } from "node:url";
import path from "node:path";

const cliDir = path.dirname(fileURLToPath(import.meta.url));

export const CONFIG = {
  projectName: "Verification Harness",
  repoSlug: "example/verification-harness",
  cliName: "verify-harness",
  defaultBranch: "main",
  integrationBranch: "main",
  integrationRemote: "origin",
  trackerName: "the canonical tracker",
  trackerIssuePattern: "",
  requiredGoalCloseoutFields: ["Issues?", "Residual risks"],
  ergonomicsWarningBudget: 0,
  repoRoot: path.resolve(cliDir, "../../.."),
  protocolDir: "ops/protocols",
  requiredProtocols: [
    "PROTOCOL-TAXONOMY.md",
    "DOCUMENT-LIFECYCLE.md",
    "DOCUMENT-QUALITY.md",
    "AGENT-CLI-ERGONOMICS.md",
    "CLI-INTERFACE.md",
    "LAVISH-REVIEW.md",
    "SOURCE-OF-TRUTH.md",
    "PRIVILEGED-DOCUMENTS.md",
    "EXTERNAL-SYSTEMS.md",
    "CONNECTOR-AUTH-PROFILES.md",
    "GITHUB-AUTHORITY.md",
    "NO-MISTAKES-GATE.md",
    "AGENT-ORCHESTRATION.md",
    "ORCHESTRATION-REPORTING.md",
    "GOAL-GRAPH.md",
    "CODEX-NATIVE-FIRSTMATE.md",
    "SESSION-PREFLIGHT.md",
    "PRE-COMMIT.md"
  ]
};

export function setRepoRootForTests(repoRoot) {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("setRepoRootForTests is only available under NODE_ENV=test");
  }
  CONFIG.repoRoot = path.resolve(repoRoot);
}
