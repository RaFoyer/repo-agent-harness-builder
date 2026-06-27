import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "../config.mjs";

const DESIGN_PROTOCOL = "ops/protocols/DESIGN-SYSTEM.md";
const HARNESS_CHECKLIST = "ops/HARNESS-CHECKLIST.md";
const DESIGN_MANIFEST = "design-system/manifest.json";

function repoPath(relPath) {
  return path.join(CONFIG.repoRoot, relPath);
}

function hasFile(relPath) {
  return fs.existsSync(repoPath(relPath));
}

function renderDesignHelp() {
  return `${CONFIG.projectName} design commands

Usage:
  ./{{CLI_NAME}} design <command>

Commands:
  status   Show inactive design-system governance status and activation route
`;
}

function runStatus(_argv, io) {
  const hasManifest = hasFile(DESIGN_MANIFEST);
  io.stdout(`design system: ${hasManifest ? "source-discovered" : "inactive"}`);
  io.stdout(`protocol: ${DESIGN_PROTOCOL}`);
  io.stdout(`checklist: ${HARNESS_CHECKLIST}`);
  io.stdout(`source: ${hasManifest ? DESIGN_MANIFEST : "not configured"}`);
  io.stdout("activation: name owner, scope, canonical design authority, verification, and rollback before marking active");
  return 0;
}

export async function runDesign(argv = [], io) {
  const [command = "status", ...rest] = argv;
  switch (command) {
    case "help":
    case "--help":
    case "-h":
      io.stdout(renderDesignHelp());
      return 0;
    case "status":
      return runStatus(rest, io);
    default:
      io.stderr(`Unknown design command: ${command}`);
      io.stderr(`Run ./{{CLI_NAME}} design status for inactive module status.`);
      return 2;
  }
}
