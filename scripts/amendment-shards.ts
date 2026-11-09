// The static amendment pages (/amendment/<key>/) are served by three assets-only Workers besides the main Worker
// `justitia`, because a Worker version holds at most 20,000 files on the Workers Free plan and there are more than
// 23,000 amendments. Each Worker answers a Workers route under anisotro.pics/amendment/ (infra/terraform/envs/prod/
// amendments.tf); routes take precedence over the main Worker's Custom Domain, and the most specific route wins.
//
// A key starts with the amending law's ID, whose first three characters are the era and year it was promulgated in
// (4 = Heisei, 501 = Reiwa 1). Older eras do not grow; the newest Worker takes every key no other route matches.

export interface Shard {
  /** Worker name; its Wrangler config is wrangler.<name>.jsonc. */
  name: string;
  /** Route path prefixes after /amendment/ (each becomes a route anisotro.pics/amendment/<prefix>*). */
  prefixes: string[];
}

export const SHARDS: Shard[] = [
  { name: "justitia-amendments-1", prefixes: ["0", "1", "2", "3", "4"] }, // Meiji to Heisei
  { name: "justitia-amendments-2", prefixes: ["501", "502", "503", "504"] }, // Reiwa 1-4
  { name: "justitia-amendments-3", prefixes: [""] }, // everything else: Reiwa 5 on, and the /amendment/ page itself
];

/**
 * A Worker version holds at most 20,000 files (Workers Free). The split fails at this many, leaving room for a
 * year or two of new keys before a new Worker has to take the newest years.
 */
export const MAX_FILES_PER_WORKER = 18_000;

/** The Worker serving /amendment/<key>/: the one with the longest matching prefix, as Workers routes choose. */
export function shardOf(key: string): Shard {
  let best: Shard | undefined;
  let bestLength = -1;
  for (const s of SHARDS) {
    for (const p of s.prefixes) {
      if (key.startsWith(p) && p.length > bestLength) {
        best = s;
        bestLength = p.length;
      }
    }
  }
  return best!;
}
