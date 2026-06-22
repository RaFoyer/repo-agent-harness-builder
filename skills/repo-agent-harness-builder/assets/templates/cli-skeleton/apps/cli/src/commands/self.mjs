export async function runSelf(argv, io) {
  const subcommand = argv[0] || "check";

  if (subcommand === "check") {
    io.stdout("Harness self-check is read-only in the base skeleton.");
    io.stdout("Add repo-specific update logic only with dirty-worktree and branch guards.");
    return 0;
  }

  if (subcommand === "update") {
    io.stderr("Self update is not implemented in the base skeleton.");
    io.stderr("Implement update with explicit approval, clean-worktree checks, and tests.");
    return 2;
  }

  io.stderr(`Unknown self command: ${subcommand}`);
  return 2;
}
