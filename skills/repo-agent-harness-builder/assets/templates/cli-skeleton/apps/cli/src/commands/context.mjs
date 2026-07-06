import { CONFIG } from "../config.mjs";
import { rejectUnexpectedArgs, renderHelpBlock, toonString } from "../util/agent-output.mjs";

export async function runContext(argv, io) {
  if (rejectUnexpectedArgs(argv, io, { command: "context", hints: [`Run ./${CONFIG.cliName} context`] })) return 2;
  io.stdout("context:");
  io.stdout(`  project: ${toonString(CONFIG.projectName)}`);
  io.stdout(`  repository: ${toonString(CONFIG.repoSlug)}`);
  io.stdout(`  default_branch: ${toonString(CONFIG.defaultBranch)}`);
  io.stdout(`  tracker: ${toonString(CONFIG.trackerName)}`);
  io.stdout("entry_points[4]{path,purpose}:");
  io.stdout(`  "AGENTS.md","Root agent instructions"`);
  io.stdout(`  "AGENTS-TOC.md","Task-to-protocol router"`);
  io.stdout(`  ${toonString(`${CONFIG.protocolDir}/`)},"Protocol directory"`);
  io.stdout(`  ${toonString(`./${CONFIG.cliName} help`)},"Command catalog"`);
  io.stdout(renderHelpBlock([`Run ./${CONFIG.cliName} preflight before broad edits`]));
  return 0;
}
