// Repealed laws (廃止された法令), found in the timeline: a law whose file is deleted from houritsu's
// main branch (FileChangeKind "repealed"). houritsu has repeals from 2017 on only: laws repealed before
// e-Gov's data begins are not in it at all.

import type { AmendmentSummary, LawRevision, LawSummary } from "../../scripts/extract/types.ts";
import { amendmentLawIdOf } from "./new-laws.ts";

/**
 * How a law was repealed:
 * - "new_law": by a new law coming into force, often one that replaces it (新しい法令の施行に伴う廃止).
 *   The amending law is then a law in houritsu: it comes into force with this commit or, when it comes
 *   into force in stages, with an earlier one;
 * - "repeal_law": by a law made to repeal it, such as 「〜を廃止する省令」 (廃止のための法令);
 * - "other": by an amending law, mostly through its 附則 (改正法令の附則などによる廃止).
 */
export type RepealWay = "new_law" | "repeal_law" | "other";

export const REPEAL_WAYS: readonly RepealWay[] = ["new_law", "repeal_law", "other"];

export const REPEAL_WAY_LABELS: Record<RepealWay, string> = {
  new_law: "新しい法令の施行に伴う廃止",
  repeal_law: "廃止のための法令",
  other: "改正法令の附則などによる廃止",
};

export interface RepealedLaw {
  id: string;
  title: string;
  /** 法令番号 of the repealed law. */
  num: string;
  /** Directory under laws/ (act, cabinet-order, ...), as in LawSummary.dir. */
  dir: string;
  /** Enforcement date of the repeal. */
  enforced: string | null;
  promulgated: string | null;
  /** Key of the amendment that repeals the law. */
  amendment: string;
  amendmentTitle: string;
  amendmentLawNum: string;
  way: RepealWay;
  /** The new law whose coming into force repeals this one ("new_law"). */
  newLaw: { id: string; title: string } | null;
  /** Other laws the same amendment repeals. */
  alsoRepeals: number;
}

/**
 * Every law repealed on main and still repealed, newest repeal first (undetermined dates last), and on
 * one day in the order of `typeOrder` (directories under laws/), then by title. A law repealed, added
 * again and repealed again is listed once, at its last repeal.
 */
export function collectRepealedLaws(
  amendments: Iterable<AmendmentSummary>,
  lawsById: Map<string, Pick<LawSummary, "title" | "num" | "dir" | "status">>,
  typeOrder: readonly string[] = [],
): RepealedLaw[] {
  const typeRank = (dir: string): number => {
    const i = typeOrder.indexOf(dir);
    return i < 0 ? typeOrder.length : i;
  };
  const found = new Map<string, RepealedLaw>();
  for (const a of amendments) {
    if (a.branch !== "main") continue;
    const repealed = a.laws.filter((l) => l.kind === "repealed");
    if (repealed.length === 0) continue;
    const amendingId = amendmentLawIdOf(a.key);
    // houritsu has a file for the amending law only when it is a law of its own (a new law), not
    // just a set of amendments; one enacted in this very commit may be missing from lawsById.
    const enacted = a.laws.find((l) => l.kind === "enacted" && l.id === amendingId);
    const amending = lawsById.get(amendingId) ?? enacted;
    for (const l of repealed) {
      const summary = lawsById.get(l.id);
      if (summary && summary.status !== "repealed") continue; // in force again
      const prev = found.get(l.id);
      if (prev && (prev.enforced ?? "") > (a.enforced ?? "")) continue;
      const newLaw = amending && amendingId !== l.id ? { id: amendingId, title: amending.title } : null;
      found.set(l.id, {
        id: l.id,
        title: summary?.title || l.title,
        num: summary?.num ?? "",
        dir: summary?.dir ?? "",
        enforced: a.enforced,
        promulgated: a.promulgated,
        amendment: a.key,
        amendmentTitle: a.title,
        amendmentLawNum: a.amendmentLawNum,
        way: newLaw ? "new_law" : /廃止/.test(a.title) ? "repeal_law" : "other",
        newLaw,
        alsoRepeals: repealed.length - 1,
      });
    }
  }
  return [...found.values()].sort(
    (x, y) =>
      (y.enforced ?? "").localeCompare(x.enforced ?? "") ||
      typeRank(x.dir) - typeRank(y.dir) ||
      x.title.localeCompare(y.title, "ja"),
  );
}

/** The year of a repeal, or "undetermined". */
export function repealYear(l: Pick<RepealedLaw, "enforced">): string {
  return l.enforced?.slice(0, 4) ?? "undetermined";
}

/**
 * The amendment key of the last text in force before a law's repeal (for /versions/?at=), or null
 * when houritsu has no text before it.
 */
export function lastTextBeforeRepeal(revisions: readonly LawRevision[]): string | null {
  const main = revisions.filter((r) => r.branch === "main");
  const at = main.findLastIndex((r) => r.kind === "repealed");
  return at > 0 ? main[at - 1].amendment : null;
}
