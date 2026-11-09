// Statistics over all laws for the /stats/ pages, computed at build time from the extracted data
// (laws.json and laws/<id>.json). Nothing here is fetched by the browser.

import { law as loadLaw, laws, type LawDetail, type LawSummary } from "./data.ts";
import { splitBlocks } from "../../scripts/extract/blocks.ts";
import { readLawFile } from "./lawtext.ts";
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
  /** Enforcement date (YYYY-MM-DD) of the latest amendment according to e-Gov; null when never amended. */
  lastAmended: string | null;
  /** Amendments in force recorded in houritsu (mostly since the 2000s); 段階施行 is not counted. */
  amendments: number;
  /** Of those, the ones that came into force in the year up to the data's date. */
  amendmentsLastYear: number;
  upcomingCount: number;
}

/** The enforcement date e-Gov records for the latest amendment, or null for a law never amended. */
export function lastAmended(frontmatter: Record<string, unknown>): string | null {
  if (isUnamended(frontmatter)) return null;
  const a = frontmatter.amendment as Record<string, unknown> | null | undefined;
  const d = a?.enforced;
  return typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
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
  // The enactment and a later part of a new law coming into force (段階施行) are not amendments. The
  // first revision houritsu has can also be an amendment by another law (収録開始, coverage_start),
  // which counts.
  const amendments = inForce.filter((r) => r.kind !== "enacted" && !isStaged(r.kind, detail.id, r.amendmentLawId));
  return {
    id: detail.id,
    title: listTitle(detail.title, detail.num),
    num: detail.num,
    dir: detail.dir,
    year: lawYear(detail.id),
    unamended: isUnamended(detail.frontmatter),
    lastAmended: lastAmended(detail.frontmatter),
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

const NUMERALS = "〇一二三四五六七八九";
/** A kanji numeral as used in article numbers (三百二十四 → 324). */
export function kanjiNumber(s: string): number {
  let total = 0;
  let digit = 0;
  for (const ch of s) {
    const d = NUMERALS.indexOf(ch);
    if (d >= 0) digit = digit * 10 + d;
    else {
      const unit = ch === "十" ? 10 : ch === "百" ? 100 : ch === "千" ? 1000 : 0;
      if (!unit) continue;
      total += (digit || 1) * unit;
      digit = 0;
    }
  }
  return total + digit;
}

const ARTICLE_HEADING = /^第([〇一二三四五六七八九十百千]+)条((?:の[〇一二三四五六七八九十百千]+)*)(?:(から|及び)第([〇一二三四五六七八九十百千]+)条((?:の[〇一二三四五六七八九十百千]+)*)(?:まで)?)?/;

/**
 * How many articles a heading stands for: 第三条から第五条まで is three, 第十二条及び第十三条 two.
 * 0 for a heading that is not an article.
 */
export function articleSpan(heading: string): number {
  const m = ARTICLE_HEADING.exec(heading);
  if (!m) return 0;
  const [, fromNum, fromBranch, joiner, toNum, toBranch] = m;
  if (!joiner) return 1;
  if (joiner === "及び") return 2;
  const [from, to] = [kanjiNumber(fromNum), kanjiNumber(toNum)];
  // 第六百九十九条から第七百条の五十まで: 第六百九十九条, 第七百条 and 第七百条の二 to の五十
  if (from !== to) return to > from ? to - from + 1 + (toBranch ? lastBranch(toBranch) - 1 : 0) : 1;
  // 第三条の二から第三条の五まで
  const [a, b] = [fromBranch ? lastBranch(fromBranch) : 1, toBranch ? lastBranch(toBranch) : 1];
  return b > a ? b - a + 1 : 1;
}

/** The last branch number of "の二の三" (3). */
function lastBranch(branch: string): number {
  return kanjiNumber(branch.split("の").pop() ?? "");
}

/**
 * How many of the articles a heading stands for have a branch number: 第三条の二 is one,
 * 第三条の二から第三条の五まで four, 第三条から第三条の三まで two (第三条 has none). In a range across
 * article numbers, the branches of the last article up to the end are counted (第三条から第五条の三まで:
 * two); branches of the articles in between are not in the heading, so they are not.
 */
export function branchedSpan(heading: string): number {
  const m = ARTICLE_HEADING.exec(heading);
  if (!m) return 0;
  const [, fromNum, fromBranch, joiner, toNum, toBranch] = m;
  if (joiner !== "から") return (fromBranch ? 1 : 0) + (joiner && toBranch ? 1 : 0);
  if (kanjiNumber(fromNum) !== kanjiNumber(toNum)) return (fromBranch ? 1 : 0) + (toBranch ? lastBranch(toBranch) - 1 : 0);
  return articleSpan(heading) - (fromBranch ? 0 : 1);
}

export interface TextStats {
  /** Characters of the text as shown, without the title, whitespace and markup. */
  chars: number;
  /** Articles in the main provisions (本則), counting each article a range heading stands for. */
  articles: number;
  /** Of those, articles whose whole text is 削除. */
  deleted: number;
  /** Of those, articles with a branch number (第三条の二). */
  branched: number;
  /** The main provisions are written with katakana (文語体), like 失火ノ責任ニ関スル法律. */
  katakana: boolean;
}

const KANJI = "\\u4E00-\\u9FFF\\u3005";
const KATAKANA_PARTICLE = new RegExp(`[${KANJI}][ノニヲハヘトモ](?=[${KANJI}])`, "g");
const HIRAGANA_PARTICLE = new RegExp(`[${KANJI}][のにをはへとも](?=[${KANJI}])`, "g");

/** Visible characters of a markdown line: no tags, list markers or whitespace. Counts code points, not UTF-16 units. */
function visible(text: string): number {
  const s = text.replace(/<[^>]*>/g, "").replace(/^\s*- /gm, "").replace(/\s/g, "");
  return s.length - (s.match(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g)?.length ?? 0);
}

/**
 * Measures the text of a law from its blocks (scripts/extract/blocks.ts). Katakana is told from
 * the particles between kanji: 条ノ規定ハ against 条の規定は, in the main provisions only, since
 * supplementary provisions of later amending laws are in hiragana.
 */
export function measureBlocks(blocks: { key: string; level: number; heading: string; text: string }[]): TextStats {
  let chars = 0;
  let articles = 0;
  let deleted = 0;
  let branched = 0;
  let kata = 0;
  let hira = 0;
  for (const b of blocks) {
    if (b.level === 1) {
      // Text under the title: the 制定文, or the whole of a law without articles (失火ノ責任ニ関スル法律).
      chars += visible(b.text);
      kata += b.text.match(KATAKANA_PARTICLE)?.length ?? 0;
      hira += b.text.match(HIRAGANA_PARTICLE)?.length ?? 0;
      continue;
    }
    chars += visible(b.heading) + visible(b.text);
    if (!b.key.startsWith("本則|")) continue;
    kata += b.text.match(KATAKANA_PARTICLE)?.length ?? 0;
    hira += b.text.match(HIRAGANA_PARTICLE)?.length ?? 0;
    const span = b.level > 0 ? articleSpan(b.heading) : 0;
    if (!span) continue;
    articles += span;
    if (/^削除\s*$/.test(b.text.trim())) deleted += span;
    branched += branchedSpan(b.heading);
  }
  return { chars, articles, deleted, branched, katakana: kata > hira };
}

let textCache: Map<string, TextStats> | null = null;
/**
 * The text stats of every law in force, by law ID, measured from the houritsu clone once per build
 * (about 10 seconds for all laws). Laws missing from the clone, as in a partial local build, are
 * left out.
 */
export function textStats(): Map<string, TextStats> {
  if (textCache) return textCache;
  const map = new Map<string, TextStats>();
  for (const l of laws()) {
    if (l.status !== "in_force") continue;
    const doc = readLawFile(l.path);
    if (doc) map.set(l.id, measureBlocks(splitBlocks(doc.body)));
  }
  textCache = map;
  return map;
}
