export async function runSkills(argv, io) {
  const subcommand = argv[0] || "status";

  if (subcommand === "status") {
    io.stdout("No repo-owned skills are configured in the base skeleton.");
    io.stdout("If you add skills, sync only managed copies and refuse unmanaged local paths.");
    return 0;
  }

  if (subcommand === "sync") {
    io.stderr("Skill sync is not implemented in the base skeleton.");
    io.stderr("Implement with explicit approval and managed-copy markers.");
    return 2;
  }

  io.stderr(`Unknown skills command: ${subcommand}`);
  return 2;
}
