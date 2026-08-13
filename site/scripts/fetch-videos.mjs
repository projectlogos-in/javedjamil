// Pulls the latest videos from the IMAN YouTube channel into a JSON file the
// site reads at build time. The channel's public RSS feed is used rather than
// the Data API so the build needs no key and no quota — the tradeoff is that
// the feed only carries the most recent 15 uploads. If the full archive is
// ever needed, swap this for the Data API's playlistItems endpoint.
//
// Usage: node scripts/fetch-videos.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "..", "src/data");
const BOOKS_DIR = path.resolve(__dirname, "..", "src/content/books");

const CHANNEL_ID = "UCPtmlR5z2olepmeLM8K-3iw"; // youtube.com/@DiscoverIman
const FEED = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;

// The IMAN channel carries other scholars too, so the feed has to be filtered
// down to Dr. Jamil's own material.
const NAME = /javed\s*jam[ie]l/i;

// A title that credits someone else — "| Dr. Zafarul Islam Khan", "by Prof. X"
// — settles it, even if his name appears further down the description.
const CREDIT = /(?:\||—|-|:|\bby\b|\bwith\b|\bft\.?\b|\bfeaturing\b)\s*(?:Dr\.?|Prof\.?|Maulana|Mufti|Shaikh|Sheikh|Imam)\s+([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,3})/g;

/*
  Reduce a string to comparable bare letters: split camelCase so hashtags like
  "#SystematicStudyOfQuran" become words, then drop the articles and
  prepositions that vary between a book's title and the way a video cites it
  ("A Systematic Study of the Holy Qur'an" vs "#SystematicStudyOfQuran").
*/
const STOPWORDS = /\b(?:a|an|the|of|and|in|on|for|to|is|its|holy|dr|prof)\b/g;

function bare(s) {
  return (
    s
      // the catalogue sets "Qurʾān" with a modifier letter and a macron; the
      // hashtags spell it "Quran". Fold both to the same letters first, or the
      // comparison silently loses the vowels.
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/['’ʾʿʼ]/g, "")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .toLowerCase()
      .replace(STOPWORDS, " ")
      .replace(/[^a-z0-9]+/g, "")
  );
}

/** his own works, so excerpt/series videos that never name him still count */
function canonSignals() {
  const out = new Set();
  if (!fs.existsSync(BOOKS_DIR)) return out;
  for (const file of fs.readdirSync(BOOKS_DIR)) {
    if (!file.endsWith(".md")) continue;
    const fm = fs.readFileSync(path.join(BOOKS_DIR, file), "utf8");
    const title = fm.match(/^title:\s*"(.+)"$/m)?.[1];
    if (!title) continue;
    const sig = bare(title);
    // short titles are too generic to attribute on their own
    if (sig.length >= 12) out.add(sig);
  }
  out.add(bare("Applied Islamics"));
  return out;
}

const CANON = canonSignals();

function isJamil(title, description) {
  const hay = `${title}\n${description}`;

  // someone else is credited in the title → not his
  for (const m of title.matchAll(CREDIT)) {
    if (!NAME.test(m[1])) return { keep: false, why: `credited to ${m[1].trim()}` };
  }

  if (NAME.test(hay)) return { keep: true, why: "named" };

  const hayBare = bare(hay);
  for (const sig of CANON) {
    if (hayBare.includes(sig)) return { keep: true, why: "cites his work" };
  }

  return { keep: false, why: "no attribution to Dr. Jamil" };
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'" };

function decode(s = "") {
  return s
    .replace(/&#(\d+);/g, (_, c) => String.fromCodePoint(Number(c)))
    .replace(/&(amp|lt|gt|quot|apos|#39);/g, (_, n) => ENTITIES[n] ?? `&${n};`);
}

function pick(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return m ? decode(m[1].trim()) : "";
}

function attr(block, tag, name) {
  const m = block.match(new RegExp(`<${tag}[^>]*\\s${name}="([^"]*)"`));
  return m ? m[1] : "";
}

const res = await fetch(FEED, { headers: { "User-Agent": "Mozilla/5.0" } });
if (!res.ok) throw new Error(`Feed fetch failed: ${res.status}`);
const xml = await res.text();

const entries = xml
  .split("<entry>")
  .slice(1)
  .map((block) => {
    const id = pick(block, "yt:videoId");
    const description = pick(block, "media:description");
    return {
      id,
      title: pick(block, "title"),
      description,
      published: pick(block, "published").slice(0, 10),
      // hqdefault is the safest thumbnail size — always present, 480x360
      thumb: attr(block, "media:thumbnail", "url") || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      // trim to a card-sized blurb; the full text lives on YouTube
      blurb: description.split("\n").find((l) => l.trim().length > 40)?.trim().slice(0, 260) ?? "",
    };
  })
  .filter((v) => v.id && v.title);

const dropped = [];
const videos = entries.filter((v) => {
  const verdict = isJamil(v.title, v.description);
  if (!verdict.keep) dropped.push({ title: v.title, why: verdict.why });
  return verdict.keep;
});

// the description was only needed for the attribution test
videos.forEach((v) => delete v.description);

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.writeFileSync(
  path.join(DATA_DIR, "videos.json"),
  JSON.stringify({ channelId: CHANNEL_ID, handle: "DiscoverIman", fetched: new Date().toISOString().slice(0, 10), videos }, null, 2) + "\n"
);

console.log(`Kept ${videos.length} of ${entries.length} — src/data/videos.json`);
if (dropped.length) {
  console.log(`\nExcluded ${dropped.length} (not Dr. Jamil's):`);
  for (const d of dropped) console.log(`  · ${d.title.slice(0, 78)}  — ${d.why}`);
}
