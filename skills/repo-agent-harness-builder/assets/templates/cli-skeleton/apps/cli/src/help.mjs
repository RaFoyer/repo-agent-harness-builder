import { CONFIG } from "./config.mjs";
import { renderHelpBlock, toonString } from "./util/agent-output.mjs";

const HOME_COMMANDS = [
  ["preflight", "Run read-only session-start checks"],
  ["protocols", "List routed protocol files"],
  ["checklist", "Show harness module states"],
  ["doctor", "Check local prerequisites"],
  ["ergonomics status", "Audit agent-facing CLI ergonomics"],
  ["no-mistakes status", "Check branch-to-PR validation gate setup"],
  ["lavish status", "Check optional Lavish review-surface posture"],
  ["orchestration status", "Inspect structured project delegation posture"],
  ["github status", "Inspect repository-scoped GitHub authority profiles"],
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
  skills status        Inventory project-local skill ownership
  secrets help         Show value-safe secret handling commands
  connections status   Validate external-authority connection metadata
  connections plan     Show repo-owned connector profile inventory
  connections doctor   Check a connector profile without printing secrets
  connections auth-plan
                       Show read-only browser/CLI auth isolation plan
  connections env      Print value-safe config-root env or flag guidance
  github status        Validate repository-scoped GitHub profile contracts
  github plan          Show one GitHub profile's authority and isolation plan
  github run           Run classified gh-axi commands through an isolated profile
  orchestration status Summarize project-wide structured delegation
                       Use --example with status, validate, adapter-status, or taxonomy
                       to inspect only the tracked inactive contract
  orchestration instances
                       List named private orchestration instances
  orchestration init <name>
                       Create a private inactive instance from the tracked example
  orchestration migrate <name>
                       Copy a legacy tracked registry into a private instance
  orchestration adapter-status
                       Inspect Codex-native Firstmate adapter posture
  orchestration taxonomy
                       Preview presentation profiles and task-title grammar
  orchestration validate
                       Validate hierarchy, lifecycle, trust, and authority
  orchestration next   List dependency-eligible work across the project
  orchestration prompt <node-id>
                       Print an adapter-ready prompt for a configured node
  orchestration launch-spec <node-id>
                       Print a JSON task-creation contract for a client adapter
  orchestration hierarchy
                       Show the Boss/Manager/Worker responsibility model
  orchestration trust  Show the T0-T5 autonomy ladder
  goals status         List implementation goal-graph goals
  goals verify <id>    Check closeout evidence for one goal
  goals start-prompt <id>
                       Print a bounded prompt for a goal thread
  design status        Show design-system governance status
  ergonomics status    Audit agent-facing CLI ergonomics
  no-mistakes status   Check no-mistakes validation gate setup
  no-mistakes setup    Initialize no-mistakes and verify post-setup status
  lavish status        Show optional Lavish review-surface posture
  lavish update        Check lavish-axi updates; use --apply to mutate
  lavish tracker       Draft tracker updates from Lavish decisions
  self check           Check whether the harness can update safely

Safety posture:
  - preflight is read-only
  - secrets output is value-safe
  - no-mistakes wrappers summarize setup status without printing raw local paths
  - lavish tracker commands are proposal-first and never write to the tracker
  - lavish update defaults to --check; --apply is explicit
  - orchestration init/migrate only create private 0600 instance files; other orchestration commands inspect policy/state and emit launch material; client adapters create tasks
  - GitHub execution refuses ambient global auth, cross-repository targets, unclassified commands, and authority outside the selected profile or node
  - adapter-status performs local read-only feature and asset inspection; it never configures Codex or activates orchestration
  - write-capable operations should support dry-run first
  - command help, protocol docs, and tests must stay in sync
`;
}
