// Crawls the built dist/ output and verifies every internal href/src
// resolves to a real file. Run after `npm run build`.
//
// Usage: node scripts/check-links.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, "..", "dist");
const BASE = "/javedjamil";

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith(".html")) out.push(full);
  }
  return out;
}

function resolveTarget(href) {
  // strip hash/query
  const clean = href.split("#")[0].split("?")[0];
  if (!clean.startsWith(BASE)) return null; // external or root-relative outside base
  let rel = clean.slice(BASE.length) || "/";
  if (rel.endsWith("/")) rel += "index.html";
  else if (!path.extname(rel)) rel += "/index.html";
  return path.join(DIST, rel);
}

const files = walk(DIST);
let checked = 0;
let broken = 0;
const brokenList = [];

for (const file of files) {
  const html = fs.readFileSync(file, "utf8");
  const matches = [...html.matchAll(/(?:href|src)="([^"]+)"/g)];
  for (const [, href] of matches) {
    if (!href.startsWith("/javedjamil")) continue;
    checked++;
    const target = resolveTarget(href);
    if (!target) continue;
    if (!fs.existsSync(target)) {
      broken++;
      brokenList.push({ file: path.relative(DIST, file), href });
    }
  }
}

console.log(`Checked ${checked} internal links across ${files.length} pages.`);
if (broken) {
  console.log(`\nBROKEN (${broken}):`);
  for (const b of brokenList.slice(0, 100)) {
    console.log(`  ${b.file} -> ${b.href}`);
  }
  process.exit(1);
} else {
  console.log("No broken internal links found.");
}
