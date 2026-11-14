// The generated summary at the top of a law page and the laws it cites and is cited by: text and links that only
// this site has, so that the first screen of a law page is not just the text e-Gov also shows. Built at build
// time from laws.json, the law's revisions and the citation scan (scanLaws in stats.ts).

/** A piece of the summary: text, or a link. */
export interface SummaryPart {
  text: string;
  href?: string;
}

export interface LawSummaryFacts {
  /** The name to call the law by (listTitle). */
  name: string;
  num: string;
  /** 法律, 政令, 府省令 and so on. */
  type: string;
  /** The day the law came into force, written out (jpDate), when houritsu records its enactment. */
  enforced: string | null;
  /** Amendments in force that houritsu records (amendmentsInForce in stats.ts). */
  amendments: number;
  /** The last amendment in force by another law, with the day it came into force written out. */
  latest: { enforced: string; title: string; href: string } | null;
  /** e-Gov says the law has never been amended. */
  unamended: boolean;
  /** Amendments promulgated but not in force yet. */
  upcoming: number;
  /** Bills in the Diet that would amend the law. */
  bills: number;
  /** Laws in force that cite this law, and that this law cites. */
  citedBy: number;
  cites: number;
  /** Defined terms that have a page on /terms/. */
  terms: number;
}

const n = (x: number) => x.toLocaleString("ja-JP");

/**
 * The summary of a law in force, in sentences such as 「民法は、明治二十九年法律第八十九号の法律です。」. Each
 * count links to the part of the page that lists what it counts.
 */
export function lawSummary(f: LawSummaryFacts): SummaryPart[] {
  const parts: SummaryPart[] = [];
  const text = (t: string) => parts.push({ text: t });
  const link = (t: string, href: string) => parts.push({ text: t, href });
  if (/第[〇一二三四五六七八九十百千]+号$/.test(f.num) && f.name !== f.num) {
    text(`${f.name}は、${f.num}の${f.type}です。`);
    if (f.enforced) text(`${f.enforced}に施行されました。`);
  } else {
    // 日本国憲法's number is 昭和二十一年憲法, which reads badly as 「昭和二十一年憲法の憲法」.
    text(f.enforced ? `${f.name}は、${f.enforced}に施行された${f.type}です。` : `${f.name}は${f.type}です。`);
  }
  if (f.latest) {
    // houritsu's history of most laws starts in the 2000s, so the count is of the amendments recorded here, not of
    // every amendment since the law was made.
    text(`このサイトで見られる改正は ${n(f.amendments)} 件で、最後の改正は${f.latest.enforced}施行の`);
    link(f.latest.title, f.latest.href);
    text("です。");
  } else if (f.amendments > 0) {
    text(`このサイトで見られる改正は ${n(f.amendments)} 件です。`);
  } else if (f.unamended) {
    text("制定されてから一度も改正されていません。");
  }
  if (f.upcoming > 0) text(`まだ施行されていない改正が ${n(f.upcoming)} 件あります。`);
  if (f.bills > 0) {
    text("国会で");
    link(`審議中の改正案が ${n(f.bills)} 件`, "#bills");
    text("あります。");
  }
  if (f.cites > 0 || f.citedBy > 0) {
    text(`この${f.type}は `);
    if (f.cites > 0) {
      link(`${n(f.cites)} 件の法令を引用`, "#cites");
      text(f.citedBy > 0 ? "し、" : "しています。");
    }
    if (f.citedBy > 0) {
      link(`${n(f.citedBy)} 件の法令から引用`, "#cited-by");
      text("されています。");
    }
  }
  if (f.terms > 0) {
    text("ほかの法令でも定義されている");
    link(`用語を ${n(f.terms)} 語`, "#terms");
    text("定義しています。");
  }
  return parts;
}

export interface CitationLaw {
  id: string;
  title: string;
  num: string;
  dir: string;
}

/**
 * The laws to list out of those that cite a law or that it cites: the constitution and Acts first (in the order of
 * typeOrder), the most cited first within a type, then by ID.
 */
export function topCitations<T extends CitationLaw>(
  ids: readonly string[],
  byId: ReadonlyMap<string, T>,
  citedCount: (id: string) => number,
  typeOrder: readonly string[],
  limit: number,
): T[] {
  const rank = (l: T) => {
    const i = typeOrder.indexOf(l.dir);
    return i < 0 ? typeOrder.length : i;
  };
  return ids
    .map((id) => byId.get(id))
    .filter((l): l is T => l !== undefined)
    .sort((a, b) => rank(a) - rank(b) || citedCount(b.id) - citedCount(a.id) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, limit);
}
