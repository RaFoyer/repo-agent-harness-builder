import { redactSecrets } from "../util/exec.mjs";

export async function runSecrets(argv, io) {
  const subcommand = argv[0] || "help";

  if (subcommand === "help") {
    io.stdout("Secret commands are value-safe.");
    io.stdout("Available skeleton commands:");
    io.stdout("  secrets help    Show this help");
    io.stdout("  secrets doctor  Explain how to add repo-specific checks");
    return 0;
  }

  if (subcommand === "doctor") {
    io.stdout("Add repo-specific secret-store checks here.");
    io.stdout("Print names, booleans, paths, and counts only. Never print values.");
    return 0;
  }

  if (subcommand === "redact-demo") {
    io.stdout(redactSecrets(argv.slice(1).join(" ")));
    return 0;
  }

  io.stderr(`Unknown secrets command: ${subcommand}`);
  return 2;
}
