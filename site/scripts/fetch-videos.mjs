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

const CHANNEL_ID = "UCPtmlR5z2olepmeLM8K-3iw"; // youtube.com/@DiscoverIman
const FEED = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;

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

const videos = xml
  .split("<entry>")
  .slice(1)
  .map((block) => {
    const id = pick(block, "yt:videoId");
    const description = pick(block, "media:description");
    return {
      id,
      title: pick(block, "title"),
      published: pick(block, "published").slice(0, 10),
      // hqdefault is the safest thumbnail size — always present, 480x360
      thumb: attr(block, "media:thumbnail", "url") || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      // trim to a card-sized blurb; the full text lives on YouTube
      blurb: description.split("\n").find((l) => l.trim().length > 40)?.trim().slice(0, 260) ?? "",
    };
  })
  .filter((v) => v.id && v.title);

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.writeFileSync(
  path.join(DATA_DIR, "videos.json"),
  JSON.stringify({ channelId: CHANNEL_ID, handle: "DiscoverIman", fetched: new Date().toISOString().slice(0, 10), videos }, null, 2) + "\n"
);

console.log(`Wrote ${videos.length} videos to src/data/videos.json`);
