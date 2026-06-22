import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "../config.mjs";

function protocolStatus(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const match = content.match(/^status:\s*([A-Za-z-]+)/m);
  return match ? match[1] : "unknown";
}

export async function listProtocols(_argv, io) {
  const dir = path.join(CONFIG.repoRoot, CONFIG.protocolDir);
  if (!fs.existsSync(dir)) {
    io.stderr(`Missing protocol directory: ${CONFIG.protocolDir}`);
    return 1;
  }

  const files = fs.readdirSync(dir).filter((file) => file.endsWith(".md")).sort();
  io.stdout("Agent protocols:");
  for (const file of files) {
    const filePath = path.join(dir, file);
    io.stdout(`- ${CONFIG.protocolDir}/${file} (${protocolStatus(filePath)})`);
  }
  return 0;
}
