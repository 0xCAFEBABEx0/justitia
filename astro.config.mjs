// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { buildDate, laws } from "./src/lib/data.ts";
import { lawLastmod } from "./src/lib/seo.ts";

// Pages left out of the sitemap: the amendment and versions pages show nothing without their
// query string (?k=..., ?law=...), and the 404 page is not a page to visit.
const NOT_IN_SITEMAP = ["/amendment/", "/versions/", "/404/"];
// The static amendment pages, /amendment/<key>/ (served by the amendment Workers, see README).
const AMENDMENT_PAGE = /^\/amendment\/[^/]+\/$/;

/**
 * Law pages get a lastmod (the day the text last changed, see lawLastmod) and their own sitemap
 * file, sitemap-laws-0.xml; the amendment pages are in sitemap-amendments-0.xml (no lastmod: an
 * amendment page changes only when houritsu corrects old text) and the other pages in
 * sitemap-pages-0.xml. sitemap-index.xml, the file submitted to Search Console, lists them with the
 * latest lastmod of each.
 * @type {Map<string, string | undefined> | null}
 */
let lawDates = null;
/** @param {import("@astrojs/sitemap").SitemapItem} item */
function lawPage(item) {
  const id = /^\/laws\/([^/]+)\/$/.exec(new URL(item.url).pathname)?.[1];
  if (!id) return undefined;
  if (!lawDates) {
    const today = buildDate();
    lawDates = new Map(laws().map((l) => [l.id, lawLastmod(l.lastAmended, today)]));
  }
  const lastmod = lawDates.get(id);
  return lastmod ? { ...item, lastmod } : item;
}
/** @param {import("@astrojs/sitemap").SitemapItem} item */
function amendmentPage(item) {
  return AMENDMENT_PAGE.test(new URL(item.url).pathname) ? item : undefined;
}

/**
 * Fontsource's CSS lists a WOFF file next to each WOFF2 file. Every browser the site supports
 * reads WOFF2, so the WOFF sources are dropped: otherwise Vite copies about 250 font files that
 * are never downloaded into dist/ (Workers static assets allow 20,000 files).
 * @returns {import("vite").Plugin}
 */
function woff2Only() {
  return {
    name: "woff2-only",
    enforce: "pre",
    transform(code, id) {
      if (!/[\\/]@fontsource[\\/][^?]+\.css$/.test(id)) return null;
      return { code: code.replace(/,\s*url\([^)]+\.woff\) format\(['"]woff['"]\)/g, ""), map: null };
    },
  };
}

export default defineConfig({
  site: "https://anisotro.pics",
  output: "static",
  trailingSlash: "always",
  build: { format: "directory", concurrency: 4 },
  integrations: [
    sitemap({
      filter: (page) => !NOT_IN_SITEMAP.includes(new URL(page).pathname),
      chunks: { laws: lawPage, amendments: amendmentPage },
    }),
  ],
  vite: { plugins: [woff2Only(), tailwindcss()], build: { chunkSizeWarningLimit: 2000 } },
});
