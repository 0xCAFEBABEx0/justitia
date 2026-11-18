// How scripts/search-index.ts splits the laws into shards, and which shards it can take unchanged from the previous
// index instead of indexing them again.
//
// A shard is a run of laws in ID order. A new index keeps the previous index's split (the first law ID of each
// shard, `starts` in shards.json) as long as every shard stays under MAX_SHARD_BYTES of law HTML, so that a change to
// a few laws changes only the shards that hold them: a shard whose input hash (`inputs` in shards.json) is the same
// as one of the previous index's is copied from it. When a shard grows past the limit (or there is no previous
// index), the laws are split again from scratch, and every shard whose laws moved is indexed again.

import { createHash } from "node:crypto";

/** Law HTML per shard when splitting from scratch: about 5 GB of indexer memory and one minute each. */
export const SHARD_BYTES = 45_000_000;
/** How far a kept shard may grow before the laws are split again (about 6.5 GB of indexer memory). */
export const MAX_SHARD_BYTES = 60_000_000;

export interface IndexedLaw {
  id: string;
  /** Bytes of the law's indexed HTML. */
  bytes: number;
  /** Hash of everything indexed for the law (title, number, law text). */
  hash: string;
}

/** What shards.json records about the shards it lists (older ones have neither field). */
export interface PreviousShards {
  starts?: string[];
  inputs?: string[];
}

export interface ShardPlan {
  /** The law IDs of each shard, in order. */
  shards: string[][];
  /** The first law ID of each shard. */
  starts: string[];
  /** The input hash of each shard: `common` and its laws. */
  inputs: string[];
  /** For each shard, the number of the previous index's shard with the same input, or -1 to index it. */
  reuse: number[];
  /** The input hash of the whole index. */
  input: string;
}

/** Splits laws (in ID order) from scratch into shards of about SHARD_BYTES. */
export function splitFresh(laws: IndexedLaw[]): string[][] {
  const shards: string[][] = [[]];
  let bytes = 0;
  for (const law of laws) {
    if (bytes + law.bytes > SHARD_BYTES && shards[shards.length - 1].length) {
      shards.push([]);
      bytes = 0;
    }
    shards[shards.length - 1].push(law.id);
    bytes += law.bytes;
  }
  return shards;
}

/**
 * Splits laws (in ID order) at the given first IDs: each law goes to the last shard that starts at or before it (laws
 * before the first start go to the first shard). Returns null when a shard would be empty or over MAX_SHARD_BYTES.
 */
export function splitAt(laws: IndexedLaw[], starts: string[]): string[][] | null {
  if (!starts.length) return null;
  const shards: string[][] = starts.map(() => []);
  const bytes = starts.map(() => 0);
  let k = 0;
  for (const law of laws) {
    while (k + 1 < starts.length && law.id >= starts[k + 1]) k++;
    shards[k].push(law.id);
    bytes[k] += law.bytes;
  }
  if (shards.some((s) => !s.length) || bytes.some((b) => b > MAX_SHARD_BYTES)) return null;
  return shards;
}

/**
 * Plans the index: the previous split when it still fits, otherwise a fresh one; each shard's input hash; and which
 * previous shards can be reused. `common` is hashed into every shard (the indexer's code, the Pagefind version).
 * `maxShards` keeps only the first shards (for trying out the index on part of the laws).
 */
export function planShards(laws: IndexedLaw[], common: string, previous: PreviousShards | null, maxShards?: number): ShardPlan {
  const byId = new Map(laws.map((l) => [l.id, l]));
  let shards = (previous?.starts && splitAt(laws, previous.starts)) || splitFresh(laws);
  if (maxShards) shards = shards.slice(0, maxShards);
  const inputs = shards.map((ids) => {
    const h = createHash("sha256").update(common);
    for (const id of ids) h.update(`\0${id}\0${byId.get(id)!.hash}`);
    return h.digest("hex").slice(0, 16);
  });
  const before = previous?.inputs ?? [];
  const input = createHash("sha256").update(`${maxShards ?? ""}\0${inputs.join("\0")}`).digest("hex").slice(0, 16);
  return { shards, starts: shards.map((s) => s[0]), inputs, reuse: inputs.map((h) => before.indexOf(h)), input };
}
