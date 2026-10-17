#!/usr/bin/env node
/** Run trusted, precompiled project SSR code. This is not a sandbox or a TSX compiler.
 * Module contract: renderPreviews() -> { css, previews: [{ name, width, html }] }.
 * Preserve the real CSS intact. Static output is not interactive/browser proof.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const safePath = (relative) => {
  if (typeof relative !== "string" || !relative || path.isAbsolute(relative) || /[\\\x00-\x1f:]/.test(relative)) throw new Error("invalid repository path");
  const parts = relative.split("/");
  if (parts.some((part) => !part || part === "." || part === ".." || part.toLowerCase() === ".git")) throw new Error("invalid repository path");
  let current = root;
  for (const part of parts) {
    current = path.join(current, part);
    try { if (fs.lstatSync(current).isSymbolicLink()) throw new Error("symlink path refused"); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  return current;
};

try {
  const [input, output, ...extra] = process.argv.slice(2);
  if (!input || !output || extra.length || !/\.(?:mjs|js|cjs)$/.test(input) || !output.startsWith("artifacts/design/")) throw new Error("usage: node scripts/design/render-previews.mjs <compiled-module.mjs> <artifacts/design/new-run>");
  const inputPath = safePath(input);
  const out = safePath(output);
  if (!fs.statSync(inputPath).isFile() || fs.existsSync(out)) throw new Error("input must be a file and output must not exist");
  // Importing repository code can execute arbitrary code. Review it before invoking this command.
  const module = await import(pathToFileURL(inputPath).href);
  const result = await module.renderPreviews();
  if (typeof result?.css !== "string" || !result.css.trim() || Buffer.byteLength(result.css) > 2_000_000
    || !Array.isArray(result.previews) || !result.previews.length || result.previews.length > 100) throw new Error("invalid render result");
  const names = new Set();
  let bytes = Buffer.byteLength(result.css);
  for (const preview of result.previews) {
    if (typeof preview?.name !== "string" || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(preview.name) || names.has(preview.name)
      || !Number.isInteger(preview.width) || preview.width < 240 || preview.width > 4096 || typeof preview.html !== "string" || !preview.html.trim()) throw new Error("invalid preview");
    names.add(preview.name);
    bytes += Buffer.byteLength(preview.html);
  }
  if (bytes > 10_000_000) throw new Error("render budget exceeded");
  safePath(output);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.mkdirSync(out); // Exclusive directory creation; never replace an earlier artifact run.
  fs.writeFileSync(path.join(out, "styles.css"), result.css, { flag: "wx" });
  for (const preview of result.previews) {
    const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="./styles.css"><title>${preview.name}</title><body style="margin:0"><main style="width:${preview.width}px">${preview.html}</main></body></html>\n`;
    fs.writeFileSync(path.join(out, `${preview.name}.html`), html, { flag: "wx" });
  }
  process.stdout.write(`${JSON.stringify({ output, previews: [...names], css: "preserved", fidelity: "static-only", browserVerificationRequired: true })}\n`);
} catch {
  process.stderr.write("Design render failed. Check trusted input, unique preview names, widths, budget and a new repository-local output path.\n");
  process.exitCode = 1;
}
