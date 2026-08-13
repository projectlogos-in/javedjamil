// Pulls Dr. Jamil's videos from the IMAN YouTube channel into a JSON file the
// site reads at build time.
//
// Two sources, chosen automatically:
//   · YOUTUBE_API_KEY set  → the Data API, which returns the COMPLETE archive
//   · no key               → the public RSS feed, latest 15 uploads only
//
// The key is only ever needed on the machine that runs this script. The output
// (src/data/videos.json) is committed, so the CI build never sees a credential
// and GitHub needs no secret. Re-run this locally whenever the channel posts.
//
// Usage:
//   node scripts/fetch-videos.mjs            # RSS fallback
//   YOUTUBE_API_KEY=… node scripts/fetch-videos.mjs
//   (or put the key in site/.env.local, which is gitignored)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(__dirname, "..");
const DATA_DIR = path.join(SITE, "src/data");
const BOOKS_DIR = path.join(SITE, "src/content/books");

const CHANNEL_ID = "UCPtmlR5z2olepmeLM8K-3iw"; // youtube.com/@DiscoverIman
const HANDLE = "DiscoverIman";

// ---------------- key ----------------

function readKey() {
  if (process.env.YOUTUBE_API_KEY) return process.env.YOUTUBE_API_KEY.trim();
  const envFile = path.join(SITE, ".env.local");
  if (fs.existsSync(envFile)) {
    const m = fs.readFileSync(envFile, "utf8").match(/^\s*YOUTUBE_API_KEY\s*=\s*(.+)$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  return null;
}

const API_KEY = readKey();

// ---------------- attribution ----------------

/*
  The IMAN channel carries other scholars too, so the archive has to be
  filtered down to Dr. Jamil's own material.
*/
const NAME = /javed\s*jam[ie]l/i;

// A title crediting someone else — "| Dr. Zafarul Islam Khan", "by Prof. X" —
// settles it, even if his name appears further down the description.
const CREDIT =
  /(?:\||—|-|:|\bby\b|\bwith\b|\bft\.?\b|\bfeaturing\b)\s*(?:Dr\.?|Prof\.?|Maulana|Mufti|Shaikh|Sheikh|Imam)\s+([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,3})/g;

const STOPWORDS = /\b(?:a|an|the|of|and|in|on|for|to|is|its|holy|dr|prof)\b/g;

/*
  Reduce a string to comparable bare letters: fold diacritics (the catalogue
  sets "Qurʾān" with a modifier letter and a macron while the hashtags spell it
  "Quran"), split camelCase so "#SystematicStudyOfQuran" becomes words, and
  drop the articles that vary between a title and the way a video cites it.
*/
function bare(s) {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’ʾʿʼ]/g, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(STOPWORDS, " ")
    .replace(/[^a-z0-9]+/g, "");
}

/** his own works, so excerpt/series videos that never name him still count */
function canonSignals() {
  const out = new Set();
  if (fs.existsSync(BOOKS_DIR)) {
    for (const file of fs.readdirSync(BOOKS_DIR)) {
      if (!file.endsWith(".md")) continue;
      const title = fs
        .readFileSync(path.join(BOOKS_DIR, file), "utf8")
        .match(/^title:\s*"(.+)"$/m)?.[1];
      if (!title) continue;
      const sig = bare(title);
      // short titles are too generic to attribute on their own
      if (sig.length >= 12) out.add(sig);
    }
  }
  out.add(bare("Applied Islamics"));
  return out;
}

const CANON = canonSignals();

function attribute(title, description) {
  const hay = `${title}\n${description}`;

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

// ---------------- helpers ----------------

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'" };
const decode = (s = "") =>
  s
    .replace(/&#(\d+);/g, (_, c) => String.fromCodePoint(Number(c)))
    .replace(/&(amp|lt|gt|quot|apos|#39);/g, (_, n) => ENTITIES[n] ?? `&${n};`);

const blurbOf = (description) =>
  description.split("\n").find((l) => l.trim().length > 40)?.trim().slice(0, 260) ?? "";

/** PT1H2M3S → "1:02:03" */
function humanDuration(iso) {
  if (!iso) return null;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return null;
  const [h, mi, s] = [Number(m[1] || 0), Number(m[2] || 0), Number(m[3] || 0)];
  const pad = (n) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(mi)}:${pad(s)}` : `${mi}:${pad(s)}`;
}

async function getJson(url) {
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok) {
    const reason = body?.error?.errors?.[0]?.reason ?? res.status;
    const message = body?.error?.message ?? "";
    throw new Error(`YouTube API ${res.status} (${reason})${message ? `: ${message}` : ""}`);
  }
  return body;
}

// ---------------- sources ----------------

async function fromApi(key) {
  const API = "https://www.googleapis.com/youtube/v3";

  const channel = await getJson(`${API}/channels?part=contentDetails&id=${CHANNEL_ID}&key=${key}`);
  const uploads = channel.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) throw new Error(`No uploads playlist for channel ${CHANNEL_ID}`);

  const items = [];
  let pageToken = "";
  do {
    const page = await getJson(
      `${API}/playlistItems?part=snippet,contentDetails&playlistId=${uploads}&maxResults=50` +
        `&pageToken=${pageToken}&key=${key}`
    );
    items.push(...(page.items ?? []));
    pageToken = page.nextPageToken ?? "";
    process.stdout.write(`\r  fetched ${items.length} entries…`);
  } while (pageToken);
  process.stdout.write("\n");

  // durations come from videos.list, batched 50 at a time (1 quota unit each)
  const durations = new Map();
  const ids = items.map((i) => i.contentDetails?.videoId).filter(Boolean);
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50).join(",");
    const page = await getJson(`${API}/videos?part=contentDetails&id=${batch}&key=${key}`);
    for (const v of page.items ?? []) durations.set(v.id, v.contentDetails?.duration);
  }

  return items
    .map((item) => {
      const s = item.snippet ?? {};
      const id = item.contentDetails?.videoId;
      const t = s.thumbnails ?? {};
      return {
        id,
        title: s.title ?? "",
        description: s.description ?? "",
        published: (item.contentDetails?.videoPublishedAt ?? s.publishedAt ?? "").slice(0, 10),
        thumb: (t.maxres ?? t.standard ?? t.high ?? t.medium ?? {}).url ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        duration: humanDuration(durations.get(id)),
      };
    })
    .filter((v) => v.id && v.title && v.title !== "Private video" && v.title !== "Deleted video");
}

async function fromRss() {
  const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!res.ok) throw new Error(`Feed fetch failed: ${res.status}`);
  const xml = await res.text();

  const pick = (block, tag) => {
    const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
    return m ? decode(m[1].trim()) : "";
  };
  const attr = (block, tag, name) => {
    const m = block.match(new RegExp(`<${tag}[^>]*\\s${name}="([^"]*)"`));
    return m ? m[1] : "";
  };

  return xml
    .split("<entry>")
    .slice(1)
    .map((block) => {
      const id = pick(block, "yt:videoId");
      return {
        id,
        title: pick(block, "title"),
        description: pick(block, "media:description"),
        published: pick(block, "published").slice(0, 10),
        thumb: attr(block, "media:thumbnail", "url") || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        duration: null,
      };
    })
    .filter((v) => v.id && v.title);
}

// ---------------- main ----------------

const source = API_KEY ? "Data API (full archive)" : "RSS feed (latest 15 only)";
console.log(`Source: ${source}`);

const entries = API_KEY ? await fromApi(API_KEY) : await fromRss();

const dropped = [];
const kept = entries.filter((v) => {
  const verdict = attribute(v.title, v.description);
  if (!verdict.keep) dropped.push({ title: v.title, why: verdict.why });
  return verdict.keep;
});

const videos = kept
  .map(({ description, ...v }) => ({ ...v, blurb: blurbOf(description) }))
  .sort((a, b) => (a.published < b.published ? 1 : -1));

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.writeFileSync(
  path.join(DATA_DIR, "videos.json"),
  JSON.stringify(
    {
      channelId: CHANNEL_ID,
      handle: HANDLE,
      source: API_KEY ? "api" : "rss",
      complete: Boolean(API_KEY),
      fetched: new Date().toISOString().slice(0, 10),
      videos,
    },
    null,
    2
  ) + "\n"
);

console.log(`Kept ${videos.length} of ${entries.length} — src/data/videos.json`);
if (dropped.length) {
  console.log(`\nExcluded ${dropped.length} (not Dr. Jamil's):`);
  for (const d of dropped) console.log(`  · ${d.title.slice(0, 76)}  — ${d.why}`);
}
if (!API_KEY) {
  console.log(
    "\nNo YOUTUBE_API_KEY — this is the 15-item RSS window, not the full archive." +
      "\nAdd the key to site/.env.local and re-run to pull everything."
  );
}
