import { fileURLToPath } from "node:url";
import path from "node:path";

const cliDir = path.dirname(fileURLToPath(import.meta.url));

export const CONFIG = {
  projectName: {{PROJECT_NAME_JSON}},
  repoSlug: {{REPO_SLUG_JSON}},
  cliName: "{{CLI_NAME}}",
  defaultBranch: {{DEFAULT_BRANCH_JSON}},
  integrationBranch: {{DEFAULT_BRANCH_JSON}},
  integrationRemote: "origin",
  trackerName: {{TRACKER_NAME_JSON}},
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
    "NO-MISTAKES-GATE.md",
    "AGENT-ORCHESTRATION.md",
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
