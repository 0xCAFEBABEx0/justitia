// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";

// Pages left out of the sitemap: the amendment and versions pages show nothing without their
// query string (?k=..., ?law=...), and the 404 page is not a page to visit.
const NOT_IN_SITEMAP = ["/amendment/", "/versions/", "/404/"];

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
  integrations: [sitemap({ filter: (page) => !NOT_IN_SITEMAP.includes(new URL(page).pathname) })],
  vite: { plugins: [woff2Only(), tailwindcss()], build: { chunkSizeWarningLimit: 2000 } },
});
