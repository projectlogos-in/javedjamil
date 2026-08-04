import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import { base } from "../lib/base";

export async function GET(context) {
  const posts = await getCollection("posts", ({ data }) => !data.draft);
  const sorted = posts.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());

  return rss({
    title: "Dr. Javed Jamil",
    description: "Essays and series by Dr. Javed Jamil — physician, Islamic scholar, and originator of Applied Islamics.",
    site: new URL(base, context.site),
    trailingSlash: true,
    items: sorted.map((post) => ({
      title: post.data.title,
      description: post.data.excerpt,
      pubDate: post.data.date,
      link: `${base}ideas/${post.id}/`,
    })),
  });
}
