// @ts-check
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://anisotro.pics",
  output: "static",
  trailingSlash: "always",
  build: { format: "directory", concurrency: 4 },
  vite: { build: { chunkSizeWarningLimit: 2000 } },
});
