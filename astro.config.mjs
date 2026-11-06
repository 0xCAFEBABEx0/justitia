// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

// Pages left out of the sitemap: the amendment and versions pages show nothing without their
// query string (?k=..., ?law=...), and the 404 page is not a page to visit.
const NOT_IN_SITEMAP = ["/amendment/", "/versions/", "/404/"];

export default defineConfig({
  site: "https://anisotro.pics",
  output: "static",
  trailingSlash: "always",
  build: { format: "directory", concurrency: 4 },
  integrations: [sitemap({ filter: (page) => !NOT_IN_SITEMAP.includes(new URL(page).pathname) })],
  vite: { build: { chunkSizeWarningLimit: 2000 } },
});
