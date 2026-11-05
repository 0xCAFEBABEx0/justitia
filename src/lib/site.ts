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

export const SITE_NAME = "justitia";
export const SOURCE_REPO = "https://github.com/Kohei-Wada/houritsu";
