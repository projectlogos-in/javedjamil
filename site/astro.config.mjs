// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  // GitHub Pages project page: projectlogos-in/javedjamil
  site: 'https://projectlogos-in.github.io',
  base: '/javedjamil',
  integrations: [
    sitemap({
      // exclude old-URL redirect stubs (noindex'd) and the WP tag/bio
      // redirect targets — they're served, just not meant to be indexed.
      filter: (page) => !/^https?:\/\/[^/]+\/javedjamil\/(\d{4}\/|tag\/|dr-javed-jamil\/)/.test(page),
    }),
  ],
});
