// The source version: a hash of everything the extractor reads from houritsu, and the time that
// content last changed (the data date the pages show, `updatedAt` in meta.json).
//
// houritsu rewrites its history almost every day (often only to change its README in the root
// commit, or to correct an old revision), so its commit SHAs change without the laws changing.
// The hash leaves the SHAs out: it covers each commit's branch, author, date and message, and the
// paths and blob ids (which are content hashes) of the law files it changed. Two runs over the
// same content get the same source version, whatever the SHAs, and so keep the same data date.
//
// It is not the data version (data-version.ts), a hash of the extractor's output: that one also
// changes with the extractor, and a diff that runs into its time limit can come out differently
// from one run to the next.

import { createHash } from "node:crypto";
import type { RawCommit } from "./git.ts";
import type { Branch } from "./types.ts";

export function sourceVersion(commits: Iterable<readonly [RawCommit, Branch]>): string {
  const hash = createHash("sha256");
  for (const [c, branch] of commits) {
    hash.update(`${branch}\0${c.author}\0${c.date}\0${c.body.length}\0`);
    hash.update(c.body);
    for (const ch of c.changes) hash.update(`\0${ch.status}\0${ch.oldBlob ?? ""}\0${ch.newBlob ?? ""}\0${ch.path}`);
    hash.update("\x1e");
  }
  return hash.digest("hex").slice(0, 16);
}

/**
 * The data date of this run: the published one when the published data was extracted from the same
 * content, else now. `published` is "<source version> <updated at>", as the upload records it in
 * the second line of _publish/data-version.txt (scripts/upload-data.sh); it is empty or missing when
 * there is nothing published, or the published data is older than the source version.
 */
export function updatedAt(published: string | undefined, source: string, now: string): string {
  const [version, time] = (published ?? "").trim().split(/\s+/);
  if (version !== source || !time || Number.isNaN(Date.parse(time))) return now;
  return new Date(time).toISOString();
}
