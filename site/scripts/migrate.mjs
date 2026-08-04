// One-time migration: pulls all posts from the WordPress.com public REST API
// for javedjamil.home.blog and writes them into src/content/{posts,shayari}
// as Markdown, plus a redirects.json mapping old /YYYY/MM/DD/slug/ URLs to
// the new site structure. Safe to re-run (idempotent — overwrites by slug).
//
// Usage: node scripts/migrate.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import TurndownService from "turndown";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = path.resolve(__dirname, "..");
const API = "https://public-api.wordpress.com/wp/v2/sites/javedjamil.home.blog";

const POSTS_DIR = path.join(SITE_ROOT, "src/content/posts");
const SHAYARI_DIR = path.join(SITE_ROOT, "src/content/shayari");
const DATA_DIR = path.join(SITE_ROOT, "src/data");

fs.mkdirSync(POSTS_DIR, { recursive: true });
fs.mkdirSync(SHAYARI_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });

// ---------- fetch helpers ----------

async function fetchWithRetry(url, retries = 5) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
      if (attempt === retries) throw new Error(`Fetch failed ${url}: ${res.status}`);
    } catch (err) {
      if (attempt === retries) throw err;
    }
    const backoff = attempt * 2000;
    console.log(`  retry ${attempt}/${retries} for ${url} in ${backoff}ms...`);
    await new Promise((r) => setTimeout(r, backoff));
  }
}

async function fetchAllPages(endpoint, perPage = 100) {
  const results = [];
  let page = 1;
  let totalPages = 1;
  do {
    const url = `${API}${endpoint}${endpoint.includes("?") ? "&" : "?"}per_page=${perPage}&page=${page}`;
    const res = await fetchWithRetry(url);
    const batch = await res.json();
    results.push(...batch);
    totalPages = Number(res.headers.get("X-WP-TotalPages") ?? "1");
    console.log(`  page ${page}/${totalPages} (${batch.length} items)`);
    page++;
  } while (page <= totalPages);
  return results;
}

// ---------- entity decoding ----------

const NAMED_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  ndash: "–",
  mdash: "—",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
};

function decodeEntities(str) {
  if (!str) return "";
  return str
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp|hellip|ndash|mdash|lsquo|rsquo|ldquo|rdquo);/g, (_, name) => NAMED_ENTITIES[name] ?? `&${name};`);
}

function stripTags(html) {
  return decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

// ---------- turndown (HTML -> Markdown) ----------

const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
turndown.keep(["iframe"]);
// WP wraps YouTube embeds in a <figure>/<span> combo; unwrap the wrapper divs/spans
// but keep the iframe itself so PostLayout's `.post__body :global(iframe)` styling applies.
turndown.addRule("stripEmbedWrapper", {
  filter: (node) => node.nodeName === "DIV" || (node.nodeName === "SPAN" && node.getAttribute?.("class")?.includes("embed-youtube")),
  replacement: (content) => content,
});

function htmlToMarkdown(html) {
  return turndown.turndown(html ?? "").trim();
}

// ---------- series name/part parsing ----------

const SERIES_PATTERNS = [
  /^(.*?)\s*\|\s*Episode\s*(\d+)\s*$/i,
  /^(.*?)\s*[-–—]\s*Episode\s*(\d+)\s*$/i,
  /^(.*?)\s+Episode\s+(\d+)\s*$/i,
  /^(.*?)\s*[-–—]\s*(\d+)\s*$/,
  /^(.*?)\s*[Pp]art\s*(\d+)\s*$/,
];

function parseSeries(title) {
  for (const re of SERIES_PATTERNS) {
    const m = title.match(re);
    if (m) {
      const name = m[1].trim().replace(/[-–—:|]+$/, "").trim();
      const part = Number(m[2]);
      if (name && Number.isFinite(part)) return { name, part };
    }
  }
  return { name: title.trim(), part: 1 };
}

// ---------- slug ----------

function slugify(input) {
  return input
    .toLowerCase()
    .trim()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ---------- frontmatter ----------

function fm(fields) {
  const lines = ["---"];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    } else if (typeof value === "number" || typeof value === "boolean") {
      lines.push(`${key}: ${value}`);
    } else {
      lines.push(`${key}: ${JSON.stringify(String(value))}`);
    }
  }
  lines.push("---", "");
  return lines.join("\n");
}

// ---------- main ----------

async function main() {
  console.log("Fetching tags...");
  const tags = await fetchAllPages("/tags");
  const tagById = new Map(tags.map((t) => [t.id, t.slug]));
  console.log(`  ${tags.length} tags`);

  console.log("Fetching posts...");
  const posts = await fetchAllPages("/posts", 25);
  console.log(`  ${posts.length} posts`);

  const redirects = [];
  let articleCount = 0;
  let seriesCount = 0;
  let shayariCount = 0;
  const skippedSlugs = [];

  for (const post of posts) {
    const tagSlugs = (post.tags ?? []).map((id) => tagById.get(id)).filter(Boolean);
    const isShayari = tagSlugs.includes("shayari");
    const isSeries = tagSlugs.includes("series");

    const title = decodeEntities(post.title.rendered);
    const excerpt = stripTags(post.excerpt?.rendered ?? "");
    const body = htmlToMarkdown(post.content.rendered);
    // WP sometimes stores slugs pre-percent-encoded (non-Latin titles it
    // couldn't romanize) — decode so we get one consistent literal slug.
    let rawSlug = post.slug || slugify(title);
    try {
      rawSlug = decodeURIComponent(rawSlug);
    } catch {
      // malformed escape sequence — keep as-is
    }
    const slug = rawSlug;

    const isHealthMax = /dynamic paradigm of health|health maximisation|health maximization/i.test(title + " " + body);
    const displayTags = tagSlugs.filter((t) => t !== "shayari" && t !== "series" && t !== "articles");
    if (isHealthMax && !displayTags.includes("health-maximisation")) displayTags.push("health-maximisation");

    const d = new Date(post.date);
    const oldPath = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${slug}`;

    if (!title || !body) {
      skippedSlugs.push(slug);
      continue;
    }

    if (isShayari) {
      shayariCount++;
      const frontmatter = fm({
        title,
        date: post.date.slice(0, 10),
        tags: displayTags,
        originalSlug: slug,
        originalUrl: post.link,
      });
      fs.writeFileSync(path.join(SHAYARI_DIR, `${slug}.md`), frontmatter + body + "\n");
      redirects.push({ oldPath, newPath: `shayari/${slug}` });
      continue;
    }

    if (isSeries) {
      seriesCount++;
      const { name, part } = parseSeries(title);
      const frontmatter = fm({
        title,
        date: post.date.slice(0, 10),
        type: "series",
        seriesName: name,
        seriesPart: part,
        tags: displayTags,
        excerpt: excerpt.slice(0, 300),
        originalSlug: slug,
        originalUrl: post.link,
      });
      fs.writeFileSync(path.join(POSTS_DIR, `${slug}.md`), frontmatter + body + "\n");
      redirects.push({ oldPath, newPath: `ideas/${slug}` });
      continue;
    }

    articleCount++;
    const frontmatter = fm({
      title,
      date: post.date.slice(0, 10),
      type: "article",
      tags: displayTags,
      excerpt: excerpt.slice(0, 300),
      originalSlug: slug,
      originalUrl: post.link,
    });
    fs.writeFileSync(path.join(POSTS_DIR, `${slug}.md`), frontmatter + body + "\n");
    redirects.push({ oldPath, newPath: `ideas/${slug}` });
  }

  // known old tag-archive URLs -> closest new section
  const tagRedirects = [
    { oldPath: "tag/articles", newPath: "ideas" },
    { oldPath: "tag/series", newPath: "ideas" },
    { oldPath: "tag/shayari", newPath: "shayari" },
    { oldPath: "tag/books", newPath: "books" },
    { oldPath: "dr-javed-jamil", newPath: "about" },
  ];

  // Astro's [...oldPath] rest-param matching gets unreliable with non-ASCII
  // path segments (percent-encoding round-trip mismatches) — these are rare
  // (a handful of transliterated-Urdu slugs); drop them rather than fight
  // routing edge cases for single-digit inbound links.
  const allRedirects = [...redirects, ...tagRedirects];
  const asciiRedirects = allRedirects.filter((r) => /^[\x00-\x7F]*$/.test(r.oldPath));
  const droppedRedirects = allRedirects.length - asciiRedirects.length;

  fs.writeFileSync(path.join(DATA_DIR, "redirects.json"), JSON.stringify(asciiRedirects, null, 2) + "\n");

  console.log("\nDone.");
  console.log(`  articles: ${articleCount}`);
  console.log(`  series parts: ${seriesCount}`);
  console.log(`  shayari: ${shayariCount}`);
  console.log(`  redirects written: ${asciiRedirects.length} (dropped ${droppedRedirects} non-ASCII slugs)`);
  if (skippedSlugs.length) {
    console.log(`  skipped (empty title/body): ${skippedSlugs.length}`);
    console.log(`    ${skippedSlugs.join(", ")}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
