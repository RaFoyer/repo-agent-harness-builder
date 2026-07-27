import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "../config.mjs";
import { rejectUnexpectedArgs, renderHelpBlock, renderUsageError, toonString } from "../util/agent-output.mjs";

function protocolStatus(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const match = content.match(/^status:\s*([A-Za-z-]+)/m);
  return match ? match[1] : "unknown";
}

export async function listProtocols(argv, io) {
  if (rejectUnexpectedArgs(argv, io, { command: "protocols", hints: [`Run ./${CONFIG.cliName} protocols`] })) return 2;
  const dir = path.join(CONFIG.repoRoot, CONFIG.protocolDir);
  if (!fs.existsSync(dir)) {
    renderUsageError(io, {
      code: "missing-protocol-directory",
      command: "protocols",
      message: `Missing protocol directory: ${CONFIG.protocolDir}`,
      hints: [`Run ./${CONFIG.cliName} preflight`]
    });
    return 1;
  }

  const files = fs.readdirSync(dir).filter((file) => file.endsWith(".md")).sort();
  io.stdout(`count: ${files.length}`);
  if (!files.length) {
    io.stdout("protocols[0]{path,status}:");
    io.stdout("message: \"No protocol files found\"");
    io.stdout(renderHelpBlock([`Add protocol files under ${CONFIG.protocolDir}/`]));
    return 0;
  }
  io.stdout(`protocols[${files.length}]{path,status}:`);
  for (const file of files) {
    const filePath = path.join(dir, file);
    io.stdout(`  ${toonString(`${CONFIG.protocolDir}/${file}`)},${toonString(protocolStatus(filePath))}`);
  }
  io.stdout(renderHelpBlock([`Read AGENTS-TOC.md to choose the right protocol`]));
  return 0;
}
