import { CONFIG } from "../config.mjs";

export async function runContext(_argv, io) {
  io.stdout(`${CONFIG.projectName}`);
  io.stdout(`Repository: ${CONFIG.repoSlug}`);
  io.stdout(`Default branch: ${CONFIG.defaultBranch}`);
  io.stdout(`Tracker: ${CONFIG.trackerName}`);
  io.stdout("");
  io.stdout("Canonical entry points:");
  io.stdout("- AGENTS.md");
  io.stdout("- AGENTS-TOC.md");
  io.stdout(`- ${CONFIG.protocolDir}/`);
  io.stdout(`- ./${CONFIG.cliName} help`);
  return 0;
}
