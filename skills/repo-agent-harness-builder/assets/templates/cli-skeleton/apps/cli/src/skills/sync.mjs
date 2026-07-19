import { CONFIG } from "../config.mjs";
import { rejectUnexpectedArgs, renderUsageError } from "../util/agent-output.mjs";

const PROJECT_LOCAL_SKILLS = ["project-orchestration", "goal-graph-loop", "goal-chain-loop", "codex-native-firstmate"];
const SHARED_FLEET_SKILLS = ["repo-agent-harness-builder", ...PROJECT_LOCAL_SKILLS];

function skillInventory() {
  return PROJECT_LOCAL_SKILLS.map((name) => ({ name, path: `.agents/skills/${name}` }));
}

export async function runSkills(argv, io) {
  const [subcommand = "status", ...rest] = argv;

  if (subcommand === "status") {
    if (rejectUnexpectedArgs(rest, io, { command: "skills status", hints: [`Run ./${CONFIG.cliName} skills status`] })) return 2;
    io.stdout("Project-local skill inventory (not sync targets):");
    for (const skill of skillInventory()) io.stdout(`- ${skill.name}: ${skill.path}`);
    io.stdout(`Reserved shared fleet names: ${SHARED_FLEET_SKILLS.join(", ")}`);
    io.stdout("skills sync is disabled in the base skeleton; it never writes, links, replaces, backs up, or archives skills.");
    io.stdout("A repository-specific sync command must sync only project-owned names, refuse shared fleet names and unmanaged paths, and archive displaced copies outside discoverable skills directories.");
    return 0;
  }

  if (subcommand === "sync") {
    if (rejectUnexpectedArgs(rest, io, { command: "skills sync", hints: [`Run ./${CONFIG.cliName} skills status`] })) return 2;
    renderUsageError(io, {
      code: "not-implemented",
      command: "skills sync",
      message: "Skill sync is disabled because the base skeleton has no project-owned sync allowlist.",
      details: [
        `Reserved shared fleet names: ${SHARED_FLEET_SKILLS.join(", ")}`,
        "No files, links, backups, or archives were changed."
      ],
      hints: ["Implement only after defining project-owned names, managed-copy markers, symlink checks, explicit approval, and non-discoverable archives."]
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
