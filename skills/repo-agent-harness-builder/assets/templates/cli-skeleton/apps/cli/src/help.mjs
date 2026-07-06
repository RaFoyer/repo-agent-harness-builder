import { CONFIG } from "./config.mjs";
import { renderHelpBlock, toonString } from "./util/agent-output.mjs";

const HOME_COMMANDS = [
  ["preflight", "Run read-only session-start checks"],
  ["protocols", "List routed protocol files"],
  ["checklist", "Show harness module states"],
  ["doctor", "Check local prerequisites"],
  ["ergonomics status", "Audit agent-facing CLI ergonomics"],
  ["verify --dry-run", "Preview the verification sequence"],
  ["help", "Show the concise command reference"]
];

export function renderHome() {
  const commandRows = HOME_COMMANDS.map(([command, purpose]) => `  ${toonString(command)},${toonString(purpose)}`).join("\n");
  const hints = renderHelpBlock([
    `Run ./${CONFIG.cliName} preflight before broad edits`,
    `Run ./${CONFIG.cliName} protocols to choose a task protocol`,
    `Run ./${CONFIG.cliName} help for all commands`
  ]);

  return `bin: ${toonString(`./${CONFIG.cliName}`)}
description: ${toonString(`Operate the ${CONFIG.projectName} repository harness`)}
repo:
  name: ${toonString(CONFIG.projectName)}
  slug: ${toonString(CONFIG.repoSlug)}
  default_branch: ${toonString(CONFIG.defaultBranch)}
  tracker: ${toonString(CONFIG.trackerName)}
commands[${HOME_COMMANDS.length}]{command,purpose}:
${commandRows}
${hints}
`;
}

export function renderHelp() {
  return `${CONFIG.projectName} repo CLI

Usage:
  ./{{CLI_NAME}} <command> [options]

Core commands:
  help                 Show this help text
  context              Print repo facts and canonical entry points
  checklist            Print harness setup checklist status model
  protocols            List agent protocol files
  doctor               Check local prerequisites
  preflight            Run read-only fresh-session checks
  verify [--dry-run]   Run the harness verification sequence
  precommit [--all]    Run local content and documentation gates
  precommit install-hook
                       Install the harness-managed git pre-commit hook
  precommit hook-status
                       Report whether the harness-managed hook is installed
  qa status            Show browser/UI QA readiness without running tests
  qa plan              Print QA lane and evidence guidance
  qa artifacts         List common browser QA artifact locations
  qa no-masking        Detect deterministic E2E route mocking/bypass patterns
  skills status        Report repo-owned skill status
  secrets help         Show value-safe secret handling commands
  connections status   Validate external-authority connection metadata
  connections plan     Show repo-owned connector profile inventory
  connections doctor   Check a connector profile without printing secrets
  goals status         List implementation goal-chain goals
  goals verify <id>    Check closeout evidence for one goal
  goals start-prompt <id>
                       Print a bounded prompt for a goal thread
  design status        Show design-system governance status
  ergonomics status    Audit agent-facing CLI ergonomics
  self check           Check whether the harness can update safely

Safety posture:
  - preflight is read-only
  - secrets output is value-safe
  - write-capable operations should support dry-run first
  - command help, protocol docs, and tests must stay in sync
`;
}
