import fs from "node:fs";
import path from "node:path";

export function repositoryPath(repoRoot, relative) {
  if (typeof relative !== "string" || !relative || /[\\\x00-\x1f:]/.test(relative) || path.isAbsolute(relative)) throw new Error("unsafe-repository-path");
  const parts = relative.split("/");
  if (parts.some((part) => !part || [".", ".."].includes(part) || part.toLowerCase() === ".git")) throw new Error("unsafe-repository-path");
  return path.join(repoRoot, ...parts);
}

export function decodeRepositoryText(bytes) {
  return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
}

// Bounded reads never follow links. Callers turn filesystem errors into
// value-safe command errors instead of echoing absolute paths from Node.
export function readRepositoryFile(repoRoot, relative, maxBytes = 1_000_000) {
  const target = repositoryPath(repoRoot, relative);
  let current = repoRoot;
  const parts = relative.split("/");
  for (const part of parts.slice(0, -1)) {
    current = path.join(current, part);
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("unsafe-repository-path");
  }
  const stat = fs.lstatSync(target);
  if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1 || stat.size > maxBytes) throw new Error("unsafe-repository-file");
  const fd = fs.openSync(target, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const opened = fs.fstatSync(fd);
    if (opened.dev !== stat.dev || opened.ino !== stat.ino || opened.size > maxBytes) throw new Error("repository-file-changed");
    const bytes = Buffer.alloc(maxBytes + 1);
    let count = 0;
    while (count <= maxBytes) {
      const read = fs.readSync(fd, bytes, count, bytes.length - count, count);
      if (!read) break;
      count += read;
    }
    if (count > maxBytes) throw new Error("repository-file-too-large");
    return { bytes: bytes.subarray(0, count), stat, target };
  } finally {
    fs.closeSync(fd);
  }
}
