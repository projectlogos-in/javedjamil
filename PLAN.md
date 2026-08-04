# Dr. Javed Jamil — Site Rebuild Plan

Rebuild javedjamil.home.blog from scratch as a static Astro site, applying the
existing "Living Order" brand identity system, hosted on GitHub Pages.

Decisions locked in with the user (2026-08-05):
- **Stack:** Astro + Markdown/MDX content collections
- **Migration:** all ~356 existing posts, via the WordPress.com public REST API
- **Hosting:** GitHub Pages
- **Language:** English-only site; Urdu/Arabic appear as styled inline accents
  (name lockup, Qur'anic citations, Shayari verses) — no full i18n page trees

---

## 0. What already exists

- **Brand system** (`Design/Dr. Javed Jamil's Living Order/Javed Jamil Brand
  Identity.dc.html`) — fully specified: seal/logo (3 monogram routes, primary
  = Route C pure geometric seal), color tokens, type system, motif/pattern
  language, social templates, book cover system, voice/guardrails. This is
  the single source of truth for all visual decisions below — no new design
  exploration needed, only implementation.
- **19 book manuscripts** in `Books/*.docx` — matches the "nine titles" book
  system in the brand doc conceptually; real corpus is larger and will need
  domain-tagging (Health / Economics / Physics / Political Thought / Qur'anic
  Studies) per book.
- **Live site**: WordPress.com free blog (`home.blog`), nav = Home / Articles
  / Series / Shayari / Books / Bio. 356 posts back to ~2018 (content itself
  likely goes back further via reposts). Public REST API is live and
  unauthenticated at `public-api.wordpress.com/wp/v2/sites/javedjamil.home.blog/`
  — confirmed working, so migration is a scripted API pull, not HTML scraping.

## 1. Design tokens to extract (from the brand doc, verbatim)

**Color**
| Token | Hex | Use |
|---|---|---|
| `--ink` (Cosmic Ink) | `#0B1026` | primary dark ground |
| `--ink-deep` | `#070B1E` | panels on dark ground |
| `--graphite` | `#23232A` | body text on light |
| `--bone` | `#E7DFCE` | secondary panel |
| `--parchment` | `#F3EEE3` | reading ground |
| `--accent` (Vital Petrol) | `#0E6F62` | primary accent, "the pulse" |
| `--gold` (Manuscript Gold) | `#BE8A2C` | foil / ceremonial accent, swappable system-wide |

Domain key (book spines / tag coloring): Health `#0E6F62` · Economics
`#9C5A2E` · Physics `#3A5A7A` · Political Thought `#7A3741` · Qur'anic
Studies `#B5862E`.

Hard guardrails (never use): kelly/flag green, pharma mint, tech-gradient
blue, caduceus/stethoscope/cross/heartbeat icons, crescents/domes/minarets as
decoration, haloed portrait treatments.

**Type**
- Display: `Bodoni Moda` (headlines, pull quotes, drop caps)
- Body/UI: `IBM Plex Sans`
- Data/labels/eyebrows: `IBM Plex Mono`
- Urdu: `Noto Nastaliq Urdu` (raised baseline, ~1.15× Latin cap height)
- Arabic: `Amiri` (Qur'anic citations)

**Mark**
- Primary: Route C pure geometric seal (7 heaven-ticks, orbital arc + node,
  vital centre disc) — survives to 16px, this is the one used at UI scale.
- Ceremonial: Qur'an 67:3 ring-inscription variant — book covers, hero crest,
  certificates only, never below 28mm/legibility floor.
- Clear space = radius of the vital centre disc, all sides.

**Motif**: concentric circles struck from an off-frame centre + one orbital
arc/node + one life-rhythm line — parameterize as a reusable background SVG
component, not a repeating tile.

## 2. Information architecture

Merge the brand doc's proposed nav (Works / Ideas / Health Maximisation /
About) with the site's proven, already-tagged content taxonomy (Articles /
Series / Shayari / Books):

- **Home** — hero (seal + tagline + trilingual name), latest/featured essay,
  cross-links into Ideas, Health Maximisation, Works, About.
- **Ideas** (`/ideas/`) — long-form essays. Two content types under one
  section: standalone **Articles** and multi-part **Series** (part
  nav/prev-next, series landing page listing parts in order).
- **Health Maximisation** (`/health-maximisation/`) — a dedicated pillar page
  for the flagship theory (the "Dynamic Paradigm of Health"), pulling in
  related articles, series, and books by tag. Justifies its own nav slot per
  the brand doc's website mockup.
- **Shayari** (`/shayari/`) — Urdu poetry, distinct typographic template
  (centered, RTL verses, Nastaliq).
- **Lexicon** (`/lexicon/`) — glossary hub for coined terms (Health
  Maximisation, Economic Fundamentalism, Natural World Order, Grand Peace,
  Applied Islamics, etc.), each term links to its defining posts/books. Comes
  directly from brand doc section "09 — Ideas · The Lexicon."
- **Works** (`/books/`) — book library (shelf/grid using the spine-banding
  system), individual book detail pages (cover, domain band, synopsis,
  excerpt if available, where-to-read/buy link).
- **About** (`/about/`) — the existing long-form Bio content, restructured
  with headings; honors/timeline pulled out as a scannable list.
- Footer: social links (Facebook, Twitter/X), email, RSS, sitemap, colophon
  (credits the brand system).

Tag/category archive pages generated per WordPress tag for continuity of
inbound links.

## 3. Astro content collections & templates

**Collections** (`src/content/`):
- `posts` — frontmatter: `title, date, type(article|series), seriesName,
  seriesPart, tags[], excerpt, originalSlug, originalUrl`
- `shayari` — `title, date, tags[]`
- `books` — `title, domain, color, synopsis, coverAssets, sourceFile,
  externalLink?`
- `lexicon` — `term, category, definition(md), relatedPosts[], relatedBooks[]`

**Templates/layouts**:
- `BaseLayout` — nav, footer, SEO head, JSON-LD, OG/Twitter card generation
  using the social card templates from the brand doc
- `PostLayout` — long-form reading layout (drop cap, mono metadata line,
  pull-quote block) per brand doc section 10
- `SeriesIndexLayout` / part navigation
- `ShayariLayout` — centered, RTL-aware
- `BookIndexLayout` (shelf/spine grid) / `BookLayout` (cover + domain band +
  synopsis)
- `LexiconIndexLayout` (term cards) / `LexiconTermLayout`
- `HealthMaximisationLayout` — custom pillar-page template
- `AboutLayout`
- `TagArchiveLayout`
- 404

**Shared components**: `<Seal variant="geometric|ceremonial" size mode="light|dark|mono|foil">`,
`<CosmicMotif>` (parameterized background SVG), `<QuoteCard>`, `<StatCard>`,
`<BookSpine>`, `<LexiconCard>`, `<Button variant="solid|outline">`,
trilingual name lockup component.

## 4. Content migration pipeline

1. **Pull** — script against `public-api.wordpress.com/wp/v2/sites/javedjamil.home.blog/`:
   `posts` (356, paginate `per_page=100`), `pages`, `tags`, `categories`,
   `media` (for embedded image URLs referenced in content). Cache raw JSON
   locally before transforming (idempotent re-runs).
2. **Classify** — map each post to `article` / `series` (+ part number
   parsed from title, e.g. "Episode 3", "-1") / `shayari` by existing tags
   (`articles`, `series`, `shayari`, `books`).
3. **Transform** — WP block HTML → Markdown/MDX (rehype/remark pipeline),
   preserving YouTube embeds as an MDX shortcode component, downloading
   inline images into `src/assets/` (or `public/`) and rewriting `src`.
4. **Slugs/redirects** — preserve original `/YYYY/MM/DD/slug/` paths as
   redirect stubs (or 301-equivalent meta-refresh, since GitHub Pages has no
   server-side redirect config without a `_redirects`-style workaround —
   plan: generate static redirect HTML pages) pointing to new URLs, so old
   links/search results don't 404.
5. **Books** — cross-reference `Books/*.docx` against the live site's Books
   tag/posts; extract title + assign domain color; docx → plain synopsis
   text (pull first paragraph or write short synopses manually where the
   docx is the full manuscript, not back-cover copy).
6. **Bio/About** — hand-clean the Bio page content into structured
   Markdown with real headings (it's presently one long unstructured page).

## 5. Build & deploy

- Astro project scaffold, Tailwind (or plain CSS with the token file) for
  styling — token file mirrors section 1 exactly.
- GitHub repo (currently no git repo in this directory — will `git init`).
  GitHub Actions workflow: build on push to `main`, deploy to `gh-pages` /
  Pages environment.
- `astro.config` `site`/`base` set for the eventual GitHub Pages URL
  (`username.github.io/repo` or a custom domain via `CNAME` — confirm which
  before first deploy).
- RSS feed (`@astrojs/rss`), `sitemap.xml`, `robots.txt`.
- Lighthouse/perf pass, accessibility pass (RTL runs, contrast on the ink/
  parchment pairs — the brand doc's own contrast choices should already
  pass but verify at implementation).

## 6. Phased execution

1. **Scaffold & tokens** — Astro init, git init, design tokens (CSS vars +
   fonts), `<Seal>` + `<CosmicMotif>` components, base layout/nav/footer.
   Deploy an empty shell to GitHub Pages early to de-risk hosting config.
2. **Templates** — build every layout in §3 against a handful of hand-written
   sample entries per collection (not yet migrated content) — validates the
   design system translates to real templates before the big migration
   script runs.
3. **Migration script** — build + run the pipeline in §4 against the live
   API; spot-check a sample across post types (article, series part, shayari,
   image-heavy post, YouTube-embed post) before running on all 356.
4. **Books & Lexicon** — hand-curate book synopses/domain tags and lexicon
   term entries (this is editorial work, not scriptable).
5. **About page rewrite** — restructure Bio content.
6. **QA pass** — broken-link check, redirect check for a sample of old URLs,
   RTL rendering check, mobile check, social card preview check.
7. **Launch** — final deploy, confirm domain/DNS if a custom domain is used.

---

## Open items to confirm before/at Phase 1

- GitHub Pages target: a `username.github.io` project page, or a custom
  domain (the brand doc's mockups use `javedjamil.com`)?
- Repo name/location — create fresh repo here, or does one already exist
  under the user's GitHub account to push to?
