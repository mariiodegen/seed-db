import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

// https://astro.build/config - Deployed via GitHub Pages Actions
export default defineConfig({
  site: process.env.SITE_URL || 'https://mariiodegen.github.io',
  base: process.env.BASE_PATH !== undefined ? process.env.BASE_PATH : '/seed-db',
  integrations: [tailwind()],
});
