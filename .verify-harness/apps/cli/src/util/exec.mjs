import { spawnSync } from "node:child_process";
export { redactSecrets } from "./secrets.mjs";
import { redactSecrets } from "./secrets.mjs";

export function runCommand(command, args = [], options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"]
  });

  return {
    ok: result.status === 0,
    status: result.status ?? 1,
    stdout: redactSecrets(result.stdout || ""),
    stderr: redactSecrets(result.stderr || "")
  };
}

export function commandExists(command) {
  const result = spawnSync(command, ["--version"], {
    encoding: "utf-8",
    stdio: ["ignore", "ignore", "ignore"]
  });
  return !result.error;
}
