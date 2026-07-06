import { redactSecrets } from "../util/exec.mjs";
import { CONFIG } from "../config.mjs";
import { rejectUnexpectedArgs, renderUsageError } from "../util/agent-output.mjs";

export async function runSecrets(argv, io) {
  const [subcommand = "help", ...rest] = argv;

  if (subcommand === "help") {
    if (rejectUnexpectedArgs(rest, io, { command: "secrets help", hints: [`Run ./${CONFIG.cliName} secrets help`] })) return 2;
    io.stdout("Secret commands are value-safe.");
    io.stdout("Available skeleton commands:");
    io.stdout("  secrets help    Show this help");
    io.stdout("  secrets doctor  Explain how to add repo-specific checks");
    return 0;
  }

  if (subcommand === "doctor") {
    if (rejectUnexpectedArgs(rest, io, { command: "secrets doctor", hints: [`Run ./${CONFIG.cliName} secrets doctor`] })) return 2;
    io.stdout("Add repo-specific secret-store checks here.");
    io.stdout("Print names, booleans, paths, and counts only. Never print values.");
    return 0;
  }

  if (subcommand === "redact-demo") {
    io.stdout(redactSecrets(argv.slice(1).join(" ")));
    return 0;
  }

  renderUsageError(io, {
    code: "unknown-secrets-command",
    command: `secrets ${subcommand}`,
    message: `Unknown secrets command: ${subcommand}`,
    hints: [`Run ./${CONFIG.cliName} secrets help`]
  });
  return 2;
}
