// Imports the Mission Publications catalogue (25 titles, four movements,
// apparatus, forewords, house facts) into this site's content collections, and
// copies the real cover plates across. Mission Publications only ever published
// Dr. Jamil, so the two sites are one body of work; this folds the catalogue in
// rather than leaving it stranded on a second domain.
//
// Usage: node scripts/import-catalogue.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(__dirname, "..");
const MP = path.resolve(
  SITE,
  "../../Mission Publications/Mission Publications Website"
);

const BOOKS_DIR = path.join(SITE, "src/content/books");
const DATA_DIR = path.join(SITE, "src/data");
const COVERS_OUT = path.join(SITE, "public/covers");

const data = await import(pathToFileURL(path.join(MP, "src/data.mjs")).href);
const { BOOKS, SERIES, SERIES_ORDER, APPARATUS, FOREWORDS, HOUSE, FEATURED_SLUGS } = data;

// ---- covers ----
fs.mkdirSync(COVERS_OUT, { recursive: true });
const coversIn = path.join(MP, "assets/covers");
const copied = new Set();
if (fs.existsSync(coversIn)) {
  for (const file of fs.readdirSync(coversIn)) {
    if (!/\.(jpe?g|png|webp)$/i.test(file)) continue;
    fs.copyFileSync(path.join(coversIn, file), path.join(COVERS_OUT, file));
    copied.add(file.replace(/\.[^.]+$/, ""));
  }
}

// ---- books ----
fs.rmSync(BOOKS_DIR, { recursive: true, force: true });
fs.mkdirSync(BOOKS_DIR, { recursive: true });

const yaml = (v) => JSON.stringify(String(v));

let written = 0;
for (const book of BOOKS) {
  const ap = APPARATUS?.[book.slug];
  const cover = copied.has(book.slug) ? `covers/${book.slug}.jpg` : undefined;

  const fm = ["---"];
  fm.push(`title: ${yaml(book.title)}`);
  if (book.subtitle) fm.push(`subtitle: ${yaml(book.subtitle)}`);
  fm.push(`movement: ${yaml(book.series)}`);
  fm.push(`shelf: ${yaml(book.shelf)}`);
  fm.push(`year: ${yaml(book.year)}`);
  fm.push(`sortYear: ${book.sortYear}`);
  fm.push(`language: ${yaml(book.language)}`);
  fm.push(`synopsis: ${yaml(book.blurb)}`);
  if (book.foreword) fm.push(`foreword: ${yaml(book.foreword)}`);
  if (cover) fm.push(`cover: ${yaml(cover)}`);
  if (ap) {
    fm.push("apparatus:");
    if (ap.isbn) fm.push(`  isbn: ${yaml(ap.isbn)}`);
    if (ap.pages) fm.push(`  pages: ${ap.pages}`);
    if (ap.edition) fm.push(`  edition: ${yaml(ap.edition)}`);
    if (ap.price) fm.push(`  price: ${yaml(ap.price)}`);
    fm.push(`  kindle: ${Boolean(ap.kindle)}`);
    if (ap.amazon) fm.push(`  amazon: ${yaml(ap.amazon)}`);
  }
  fm.push(`order: ${written + 1}`);
  fm.push("---", "");

  // the long-form "about the book" copy becomes the page body
  const body = ap?.about ? `${ap.about}\n` : "";
  fs.writeFileSync(path.join(BOOKS_DIR, `${book.slug}.md`), fm.join("\n") + body);
  written++;
}

// ---- house data (movements, forewords, imprint) ----
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.writeFileSync(
  path.join(DATA_DIR, "house.json"),
  JSON.stringify(
    {
      movements: SERIES_ORDER.map((k) => ({ ...SERIES[k] })),
      movementOrder: SERIES_ORDER,
      forewords: FOREWORDS ?? [],
      featured: FEATURED_SLUGS ?? [],
      house: HOUSE ?? {},
    },
    null,
    2
  ) + "\n"
);

console.log(`Books written: ${written}`);
console.log(`Cover plates copied: ${copied.size}`);
console.log(`With apparatus: ${BOOKS.filter((b) => APPARATUS?.[b.slug]).length}`);
console.log(`Movements: ${SERIES_ORDER.join(", ")}`);
