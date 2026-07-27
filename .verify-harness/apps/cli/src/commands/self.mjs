import { CONFIG } from "../config.mjs";
import { rejectUnexpectedArgs, renderUsageError } from "../util/agent-output.mjs";

export async function runSelf(argv, io) {
  const [subcommand = "check", ...rest] = argv;

  if (subcommand === "check") {
    if (rejectUnexpectedArgs(rest, io, { command: "self check", hints: [`Run ./${CONFIG.cliName} self check`] })) return 2;
    io.stdout("Harness self-check is read-only in the base skeleton.");
    io.stdout("Add repo-specific update logic only with dirty-worktree and branch guards.");
    return 0;
  }

  if (subcommand === "update") {
    if (rejectUnexpectedArgs(rest, io, { command: "self update", hints: [`Run ./${CONFIG.cliName} self check`] })) return 2;
    renderUsageError(io, {
      code: "not-implemented",
      command: "self update",
      message: "Self update is not implemented in the base skeleton.",
      hints: ["Implement update with explicit approval, clean-worktree checks, and tests."]
    });
    return 2;
  }

  renderUsageError(io, {
    code: "unknown-self-command",
    command: `self ${subcommand}`,
    message: `Unknown self command: ${subcommand}`,
    hints: [`Run ./${CONFIG.cliName} self check`]
  });
  return 2;
}
