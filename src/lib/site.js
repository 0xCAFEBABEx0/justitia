// Build-time settings, from environment variables.
//
//   JUSTITIA_DATA      output of the extractor (default: ./data)
//   JUSTITIA_HOURITSU  houritsu clone, for the current law texts (default: ./houritsu)
//   PUBLIC_DATA_BASE   URL the browser fetches amendments/<key>.json from
//                      (default: /data, which `npm run preview` serves from JUSTITIA_DATA;
//                      in production https://data.anisotro.pics)
import { resolve } from "node:path";
export const DATA_DIR = resolve(process.env.JUSTITIA_DATA ?? "data");
export const HOURITSU_DIR = resolve(process.env.JUSTITIA_HOURITSU ?? "houritsu");
export const DATA_BASE = (process.env.PUBLIC_DATA_BASE ?? "/data").replace(/\/$/, "");
export { SITE_NAME, SITE_TAGLINE } from "./site-name.ts";
export const SOURCE_REPO = "https://github.com/Kohei-Wada/houritsu";
// Licenses of the data the site is built from (shown in the footer and on the about page).
// houritsu is CC BY 4.0; its source, e-Gov 法令検索, is under the Public Data License 1.0.
export const DATA_LICENSE_URL = "https://creativecommons.org/licenses/by/4.0/deed.ja";
export const PDL_URL = "https://www.digital.go.jp/resources/open_data/public_data_license_v1.0";
// The site's own source code (AGPL-3.0-only). The footer links to it, as AGPL section 13 asks of a
// program that users interact with over a network. Link text must not show the project name.
export const CODE_REPO = "https://github.com/0xCAFEBABEx0/justitia";
export const CODE_LICENSE_URL = "https://www.gnu.org/licenses/agpl-3.0.html";
