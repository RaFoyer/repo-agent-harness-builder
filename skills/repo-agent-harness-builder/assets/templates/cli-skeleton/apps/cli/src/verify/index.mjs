import { runChecklist } from "../commands/checklist.mjs";
import { runDoctor } from "../commands/doctor.mjs";
import { listProtocols } from "../commands/protocols.mjs";
import { CONFIG } from "../config.mjs";
import { runConnections } from "../connections/index.mjs";
import { runGoals } from "../goals/index.mjs";
import { runOrchestration } from "../orchestration/index.mjs";
import { runErgonomics } from "../ergonomics/index.mjs";
import { runNoMistakes } from "../no-mistakes/index.mjs";
import { runLavish } from "../lavish/index.mjs";
import { runPrecommit } from "../precommit/checklist.mjs";
import { runPreflight } from "../preflight/session.mjs";
import { runQa } from "../qa/index.mjs";
import { hasFlag } from "../util/args.mjs";
import { rejectUnexpectedArgs } from "../util/agent-output.mjs";

const VERIFY_STEPS = [
  { name: "doctor", run: (io) => runDoctor([], io) },
  { name: "preflight", run: (io) => runPreflight([], io) },
  { name: "checklist", run: (io) => runChecklist([], io) },
  { name: "protocols", run: (io) => listProtocols([], io) },
  { name: "connections status", run: (io) => runConnections(["status"], io) },
  { name: "orchestration status --example", run: (io) => runOrchestration(["status", "--example"], io) },
  { name: "goals status", run: (io) => runGoals(["status"], io) },
  { name: "ergonomics status", run: (io) => runErgonomics(["status"], io) },
  { name: "no-mistakes status", run: (io) => runNoMistakes(["status"], io) },
  { name: "lavish status", run: (io) => runLavish(["status"], io) },
  { name: "qa status", run: (io) => runQa(["status"], io) },
  { name: "qa no-masking", run: (io) => runQa(["no-masking"], io) },
  { name: "precommit --all", run: (io) => runPrecommit(["--all"], io) }
];

export async function runVerify(argv, io) {
  if (rejectUnexpectedArgs(argv, io, { command: "verify", allowedFlags: ["--dry-run"], hints: [`Run ./${CONFIG.cliName} verify --dry-run`] })) return 2;

  if (hasFlag(argv, "--help") || hasFlag(argv, "-h")) {
    io.stdout("Usage: ./{{CLI_NAME}} verify [--dry-run]");
    io.stdout("Runs the harness verification sequence and stops after all checks report.");
    return 0;
  }

  if (hasFlag(argv, "--dry-run")) {
    io.stdout("Verify would run:");
    for (const step of VERIFY_STEPS) io.stdout(`- ${step.name}`);
    return 0;
  }

  let failed = false;
  for (const step of VERIFY_STEPS) {
    io.stdout("");
    io.stdout(`== ${step.name} ==`);
    const code = await step.run(io);
    if (code !== 0) failed = true;
  }

  if (failed) {
    io.stderr("Verify found blockers or failed checks.");
    return 1;
  }
  io.stdout("Verify checks passed.");
  return 0;
}
