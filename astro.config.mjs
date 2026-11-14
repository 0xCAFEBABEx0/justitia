// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { buildDate, laws, pageAmendments } from "./src/lib/data.ts";
import { amendmentIndexable, amendmentLastmod, lawLastmod } from "./src/lib/seo.ts";

// Pages left out of the sitemap: the amendment and versions pages show nothing without their
// query string (?k=..., ?law=...), and the 404 page is not a page to visit.
const NOT_IN_SITEMAP = ["/amendment/", "/versions/", "/404/"];
// The static amendment pages, /amendment/<key>/ (served by the amendment Workers, see README).
const AMENDMENT_PAGE = /^\/amendment\/[^/]+\/$/;
// The pages of defined terms, /terms/<用語>/ (the list at /terms/ stays with the other pages).
const TERM_PAGE = /^\/terms\/[^/]+\/$/;

/**
 * Law pages get a lastmod (the day the text last changed, see lawLastmod) and their own sitemap
 * file, sitemap-laws-0.xml; the amendment pages are in sitemap-amendments-0.xml (lastmod: the day the
 * amendment came into force, or was promulgated while it is not in force yet, see amendmentLastmod),
 * except the noindex ones that only enacted or first recorded laws (amendmentIndexable); the term
 * pages are in sitemap-terms-0.xml and the other pages in sitemap-pages-0.xml. sitemap-index.xml,
 * the file submitted to Search Console, lists them with the latest lastmod of each.
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
/** @type {Map<string, { indexable: boolean, lastmod: string | undefined }> | null} */
let amendmentFacts = null;
/** @param {string} pathname */
function amendmentFact(pathname) {
  if (!AMENDMENT_PAGE.test(pathname)) return undefined;
  if (!amendmentFacts) {
    const today = buildDate();
    amendmentFacts = new Map(
      pageAmendments().map((a) => [
        a.key,
        { indexable: amendmentIndexable(a.laws), lastmod: amendmentLastmod(a.enforced, a.promulgated, today) },
      ]),
    );
  }
  return amendmentFacts.get(decodeURIComponent(pathname.split("/")[2]));
}
/** @param {import("@astrojs/sitemap").SitemapItem} item */
function amendmentPage(item) {
  const pathname = new URL(item.url).pathname;
  if (!AMENDMENT_PAGE.test(pathname)) return undefined;
  const lastmod = amendmentFact(pathname)?.lastmod;
  return lastmod ? { ...item, lastmod } : item;
}
/**
 * Pages in no sitemap: NOT_IN_SITEMAP, and the noindex amendment pages.
 * @param {string} page
 */
function inSitemap(page) {
  const pathname = new URL(page).pathname;
  if (NOT_IN_SITEMAP.includes(pathname)) return false;
  return amendmentFact(pathname)?.indexable !== false;
}

/** @param {import("@astrojs/sitemap").SitemapItem} item */
function termPage(item) {
  return TERM_PAGE.test(new URL(item.url).pathname) ? item : undefined;
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
      filter: inSitemap,
      chunks: { laws: lawPage, amendments: amendmentPage, terms: termPage },
    }),
  ],
  vite: { plugins: [woff2Only(), tailwindcss()], build: { chunkSizeWarningLimit: 2000 } },
});
