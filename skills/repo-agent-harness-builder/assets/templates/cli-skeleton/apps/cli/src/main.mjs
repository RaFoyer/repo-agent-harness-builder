import { renderHelp } from "./help.mjs";
import { runContext } from "./commands/context.mjs";
import { runDoctor } from "./commands/doctor.mjs";
import { listProtocols } from "./commands/protocols.mjs";
import { runSelf } from "./commands/self.mjs";
import { runChecklist } from "./commands/checklist.mjs";
import { runPreflight } from "./preflight/session.mjs";
import { runPrecommit } from "./precommit/checklist.mjs";
import { runSkills } from "./skills/sync.mjs";
import { runSecrets } from "./secrets/index.mjs";
import { runConnections } from "./connections/index.mjs";
import { runQa } from "./qa/index.mjs";
import { runVerify } from "./verify/index.mjs";
import { runGoals } from "./goals/index.mjs";
import { runDesign } from "./design/index.mjs";

export const defaultIO = {
  stdout: (line = "") => console.log(line),
  stderr: (line = "") => console.error(line)
};

// Keep dispatch intentionally small. Command modules own behavior, safety
// checks, and tests; this file only routes the first argument.
export async function main(argv = [], io = defaultIO) {
  const [command = "help", ...rest] = argv;

  switch (command) {
    case "help":
    case "--help":
    case "-h":
      io.stdout(renderHelp());
      return 0;
    case "context":
      return runContext(rest, io);
    case "doctor":
      return runDoctor(rest, io);
    case "checklist":
      return runChecklist(rest, io);
    case "protocols":
      return listProtocols(rest, io);
    case "preflight":
      return runPreflight(rest, io);
    case "verify":
      return runVerify(rest, io);
    case "precommit":
      return runPrecommit(rest, io);
    case "qa":
      return runQa(rest, io);
    case "skills":
      return runSkills(rest, io);
    case "secrets":
      return runSecrets(rest, io);
    case "connections":
      return runConnections(rest, io);
    case "goals":
      return runGoals(rest, io);
    case "design":
      return runDesign(rest, io);
    case "self":
      return runSelf(rest, io);
    default:
      io.stderr(`Unknown command: ${command}`);
      io.stderr(`Run ./{{CLI_NAME}} help for available commands.`);
      return 2;
  }
}
