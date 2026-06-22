import { CONFIG } from "./config.mjs";

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
  precommit [--all]    Run local content and documentation gates
  precommit install-hook
                       Install the harness-managed git pre-commit hook
  precommit hook-status
                       Report whether the harness-managed hook is installed
  skills status        Report repo-owned skill status
  secrets help         Show value-safe secret handling commands
  connections status   Validate external-authority connection metadata
  self check           Check whether the harness can update safely

Safety posture:
  - preflight is read-only
  - secrets output is value-safe
  - write-capable operations should support dry-run first
  - command help, protocol docs, and tests must stay in sync
`;
}
