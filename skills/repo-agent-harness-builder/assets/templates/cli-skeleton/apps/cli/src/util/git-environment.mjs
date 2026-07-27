import os from "node:os";

const GIT_TOPOLOGY_OVERRIDE_ENV = [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_COMMON_DIR",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_INDEX_FILE",
  "GIT_CEILING_DIRECTORIES",
  "GIT_DISCOVERY_ACROSS_FILESYSTEM"
];
const GIT_CONFIG_OVERRIDE_ENV = [
  "GIT_CONFIG",
  "GIT_CONFIG_GLOBAL",
  "GIT_CONFIG_SYSTEM",
  "GIT_CONFIG_NOSYSTEM",
  "GIT_CONFIG_PARAMETERS"
];

export function sanitizedGitEnvironment(sourceEnv = process.env) {
  const env = { ...sourceEnv };
  for (const name of GIT_TOPOLOGY_OVERRIDE_ENV) delete env[name];
  for (const name of GIT_CONFIG_OVERRIDE_ENV) delete env[name];
  for (const name of Object.keys(env)) {
    if (/^GIT_CONFIG_(?:COUNT|KEY_\d+|VALUE_\d+)$/.test(name)) delete env[name];
  }
  return env;
}

export function gitTopologyEnvironment(sourceEnv = process.env) {
  const env = sanitizedGitEnvironment(sourceEnv);
  env.GIT_CONFIG_NOSYSTEM = "1";
  env.GIT_CONFIG_GLOBAL = os.devNull;
  return env;
}
