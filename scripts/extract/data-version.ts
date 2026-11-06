// The data version: a hash of every file the pages fetch in the browser from the data domain
// (amendments/, laws/ and history/; see src/scripts/data-url.ts).
//
// The pages put it in the query string of those requests (?v=), which is part of the data
// domain's cache key. Because it is a hash of the files' content, it changes only when one of them
// changes: a rebuild that produces the same data keeps the cached copies, and a rebuild that
// changes any file gives every page fresh URLs, so a page never mixes files from two builds.

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export const FETCHED_DIRS = ["amendments", "laws", "history"] as const;

export async function dataVersion(outDir: string): Promise<string> {
  const hash = createHash("sha256");
  for (const dir of FETCHED_DIRS) {
    // Plain code-unit order, so the hash does not depend on the locale.
    const names = (await readdir(join(outDir, dir))).sort();
    for (const name of names) {
      const body = await readFile(join(outDir, dir, name));
      hash.update(`${dir}/${name}\0${body.length}\0`);
      hash.update(body);
    }
  }
  return hash.digest("hex").slice(0, 16);
}
