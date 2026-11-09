// Statistics over all laws for the /stats/ pages, computed at build time from the extracted data
// (laws.json and laws/<id>.json). Nothing here is fetched by the browser.

import { law as loadLaw, laws, type LawDetail, type LawSummary } from "./data.ts";
import { isStaged } from "./new-laws.ts";

/** The eras of e-Gov law IDs: the first digit of an ID is the era of the law's number. */
export const ERAS = [
  { code: "1", name: "明治", start: 1868 },
  { code: "2", name: "大正", start: 1912 },
  { code: "3", name: "昭和", start: 1926 },
  { code: "4", name: "平成", start: 1989 },
  { code: "5", name: "令和", start: 2019 },
] as const;
export type EraName = (typeof ERAS)[number]["name"];

export interface LawYear {
  era: EraName;
  /** Year within the era (元年 = 1). */
  eraYear: number;
  /** Western calendar year. */
  year: number;
}

/**
 * The year of a law's number (法令番号), read from its e-Gov law ID: era digit, then the year in the
 * era, e.g. "140AC0000000045" (刑法, 明治四十年法律第四十五号) → 明治40年 = 1907. That is the year the
 * law was made (promulgated), not the year it came into force. Null for an ID of another shape.
 */
export function lawYear(id: string): LawYear | null {
  const m = /^([1-5])(\d{2})/.exec(id);
  if (!m) return null;
  const era = ERAS.find((e) => e.code === m[1])!;
  const eraYear = Number(m[2]);
  if (eraYear < 1) return null;
  return { era: era.name, eraYear, year: era.start + eraYear - 1 };
}

/** "明治40年（1907年）", with 元年 for the first year. */
export function lawYearLabel(y: LawYear): string {
  return `${y.era}${y.eraYear === 1 ? "元" : y.eraYear}年（${y.year}年）`;
}

/**
 * True when e-Gov records no amendment of the law's current text: the frontmatter's
 * `amendment.law_id` is null, or "" (as for 日本国憲法). This is "never amended since it was made"
 * according to e-Gov; houritsu's own history is no use here, as it mostly starts in the 2000s.
 */
export function isUnamended(frontmatter: Record<string, unknown>): boolean {
  const a = frontmatter.amendment;
  if (!a || typeof a !== "object") return false;
  const id = (a as Record<string, unknown>).law_id;
  return id === null || id === "";
}

/**
 * The name of a law to show in lists. Laws without an official title (題名) get their number as the
 * title, with the name commonly used for them in （）, as in
 * 「明治三十二年法律第四十号（失火ノ責任ニ関スル法律）」: lists show the name in （） alone, since the
 * number is shown next to it anyway.
 */
export function listTitle(title: string, num: string): string {
  const prefix = `${num}（`;
  return title.startsWith(prefix) && title.endsWith("）") ? title.slice(prefix.length, -1) : title;
}

export interface StatLaw {
  id: string;
  title: string;
  num: string;
  dir: string;
  year: LawYear | null;
  /** No amendment of the current text according to e-Gov (see isUnamended). */
  unamended: boolean;
  /** Amendments in force recorded in houritsu (mostly since the 2000s); 段階施行 is not counted. */
  amendments: number;
  /** Of those, the ones that came into force in the year up to the data's date. */
  amendmentsLastYear: number;
  upcomingCount: number;
}

/** The day one year before an ISO date (YYYY-MM-DD); 29 February goes to 1 March. */
export function yearBefore(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

/** The stats of one law in force. `today` bounds the amendments of the last year. */
export function statLaw(detail: LawDetail, today: string): StatLaw {
  const since = yearBefore(today);
  const inForce = detail.revisions.filter((r) => r.branch === "main");
  // The first revision is the law's enactment or the start of houritsu's coverage, and a later part
  // of a new law coming into force (段階施行) is not an amendment.
  const amendments = inForce.slice(1).filter((r) => !isStaged(r.kind, detail.id, r.amendmentLawId));
  return {
    id: detail.id,
    title: listTitle(detail.title, detail.num),
    num: detail.num,
    dir: detail.dir,
    year: lawYear(detail.id),
    unamended: isUnamended(detail.frontmatter),
    amendments: amendments.length,
    amendmentsLastYear: amendments.filter((r) => r.enforced && r.enforced > since && r.enforced <= today).length,
    upcomingCount: detail.upcomingCount,
  };
}

let cache: { today: string; laws: StatLaw[] } | null = null;
/** Every law in force, in the order of laws.json. Reads every laws/<id>.json once per build. */
export function statLaws(today: string): StatLaw[] {
  if (cache?.today === today) return cache.laws;
  const list = laws()
    .filter((l: LawSummary) => l.status === "in_force")
    .map((l) => statLaw(loadLaw(l.id), today));
  cache = { today, laws: list };
  return list;
}

/** Oldest first: by the year of the law's number, then by law ID (type and number within the year). */
export function byAge(a: StatLaw, b: StatLaw): number {
  return (a.year?.year ?? 9999) - (b.year?.year ?? 9999) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** Years since a law was made, as of `today` (YYYY-MM-DD). */
export function yearsSince(y: LawYear | null, today: string): number | null {
  return y ? Number(today.slice(0, 4)) - y.year : null;
}
