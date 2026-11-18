// The Worker Previews build (JUSTITIA_PREVIEW=1, set by .github/workflows/preview.yml): the site as served at
// https://preview.www.anisotro.pics/ behind Cloudflare Access (infra/README.md, "Previews"). Production builds
// leave JUSTITIA_PREVIEW unset (PREVIEW in src/lib/site.ts). This module also runs in the browser.
//
// - Search engines are kept out: Cloudflare adds X-Robots-Tag only to Previews on workers.dev, not on a Custom
//   Domain, so the build appends a rule for every path to dist/_headers (astro.config.mjs).
// - No static amendment pages (/amendment/<key>/): in production the amendment Workers serve them through Workers
//   routes on the apex, which a Preview does not have, and with them the Preview would pass the 20,000 files that
//   one Worker version may hold. They are also two thirds of the build. Instead the Preview's 404 page renders the
//   amendment in the browser from the data in R2, with the branch's own src/scripts/amendment.ts.

/** The _headers rule that keeps every response of a Preview out of search results. */
export const PREVIEW_HEADERS_RULE = "/*\n  X-Robots-Tag: noindex, nofollow\n";

/** The site's _headers file with PREVIEW_HEADERS_RULE added at the end. */
export function withPreviewHeaders(headers: string): string {
  const body = headers.replace(/\s*$/, "");
  return body ? `${body}\n${PREVIEW_HEADERS_RULE}` : PREVIEW_HEADERS_RULE;
}

/**
 * The amendment key of a static amendment page's path (/amendment/<key>/), or null. Keys are an amending law ID
 * and a date or "undetermined", joined by "_", with "-2", "-3"... when several commits share both (amendmentKey in
 * scripts/extract/index.ts), so anything else is not an amendment page.
 */
export function amendmentKeyOfPath(pathname: string): string | null {
  return /^\/amendment\/([0-9A-Za-z]+_(?:[0-9]{8}|undetermined)(?:-[0-9]+)?)\/$/.exec(pathname)?.[1] ?? null;
}
