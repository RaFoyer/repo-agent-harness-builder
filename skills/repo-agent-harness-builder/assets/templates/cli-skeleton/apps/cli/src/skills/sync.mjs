import { CONFIG } from "../config.mjs";
import { rejectUnexpectedArgs, renderUsageError } from "../util/agent-output.mjs";

export async function runSkills(argv, io) {
  const [subcommand = "status", ...rest] = argv;

  if (subcommand === "status") {
    if (rejectUnexpectedArgs(rest, io, { command: "skills status", hints: [`Run ./${CONFIG.cliName} skills status`] })) return 2;
    io.stdout("No repo-owned skills are configured in the base skeleton.");
    io.stdout("If you add skills, sync only managed copies and refuse unmanaged local paths.");
    return 0;
  }

  if (subcommand === "sync") {
    if (rejectUnexpectedArgs(rest, io, { command: "skills sync", hints: [`Run ./${CONFIG.cliName} skills status`] })) return 2;
    renderUsageError(io, {
      code: "not-implemented",
      command: "skills sync",
      message: "Skill sync is not implemented in the base skeleton.",
      hints: ["Implement with explicit approval and managed-copy markers."]
    });
    return 2;
  }

  renderUsageError(io, {
    code: "unknown-skills-command",
    command: `skills ${subcommand}`,
    message: `Unknown skills command: ${subcommand}`,
    hints: [`Run ./${CONFIG.cliName} skills status`]
  });
  return 2;
}
