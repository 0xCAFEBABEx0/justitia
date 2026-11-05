import type { AmendmentSummary, RelatedLaw } from "./types.ts";

/** Amendments that touch more laws than this (整備法 and the like) say little about relations. */
const MAX_LAWS_PER_AMENDMENT = 40;
const RELATED_LIMIT = 12;

/**
 * For each law, the laws most often changed by the same amending law, with how many
 * amendments they shared.
 */
export function computeRelated(summaries: AmendmentSummary[]): Map<string, RelatedLaw[]> {
  const counts = new Map<string, Map<string, number>>();
  const titles = new Map<string, string>();
  for (const a of summaries) {
    if (a.laws.length < 2 || a.laws.length > MAX_LAWS_PER_AMENDMENT) continue;
    for (const l of a.laws) titles.set(l.id, l.title);
    for (const x of a.laws) {
      let m = counts.get(x.id);
      if (!m) counts.set(x.id, (m = new Map()));
      for (const y of a.laws) if (y.id !== x.id) m.set(y.id, (m.get(y.id) ?? 0) + 1);
    }
  }
  const out = new Map<string, RelatedLaw[]>();
  for (const [id, m] of counts) {
    out.set(
      id,
      [...m]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, RELATED_LIMIT)
        .map(([rid, count]) => ({ id: rid, title: titles.get(rid) ?? rid, count })),
    );
  }
  return out;
}
