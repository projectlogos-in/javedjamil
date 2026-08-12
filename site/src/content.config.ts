import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const posts = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/posts" }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    type: z.enum(["article", "series"]),
    seriesName: z.string().optional(),
    seriesPart: z.number().optional(),
    tags: z.array(z.string()).default([]),
    excerpt: z.string().optional(),
    originalSlug: z.string().optional(),
    originalUrl: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

const shayari = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/shayari" }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    tags: z.array(z.string()).default([]),
    originalSlug: z.string().optional(),
    originalUrl: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

const books = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/books" }),
  schema: z.object({
    title: z.string(),
    subtitle: z.string().optional(),
    /** which of the four movements of the canon this title belongs to */
    movement: z.enum(["recovery", "diagnosis", "reconstruction", "foundations"]),
    /** house shelfmark, e.g. "II·1" */
    shelf: z.string(),
    year: z.string(),
    sortYear: z.number(),
    language: z.string().default("English"),
    synopsis: z.string(),
    foreword: z.string().optional(),
    /** path under public/, e.g. "covers/slug.jpg" — absent titles fall back
        to the typographic house cover */
    cover: z.string().optional(),
    apparatus: z
      .object({
        isbn: z.string().optional(),
        pages: z.number().optional(),
        edition: z.string().optional(),
        price: z.string().optional(),
        kindle: z.boolean().default(false),
        amazon: z.string().optional(),
      })
      .optional(),
    order: z.number().default(0),
  }),
});

const lexicon = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/lexicon" }),
  schema: z.object({
    term: z.string(),
    category: z.string().optional(),
    relatedPosts: z.array(z.string()).default([]),
    relatedBooks: z.array(z.string()).default([]),
  }),
});

export const collections = { posts, shayari, books, lexicon };
