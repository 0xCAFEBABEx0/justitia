import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  AmendmentSummary,
  FileChangeKind,
  LawDetail,
  LawSummary,
  Meta,
} from "../../scripts/extract/types.ts";
import { collectNewLaws, type NewLaw } from "./new-laws.ts";
import { DATA_DIR } from "./site.ts";

export type { AmendmentSummary, FileChangeKind, LawDetail, LawSummary, Meta, NewLaw };

function readJson<T>(...parts: string[]): T {
  return JSON.parse(readFileSync(join(DATA_DIR, ...parts), "utf8")) as T;
}

let lawsCache: LawSummary[] | null = null;
export function laws(): LawSummary[] {
  return (lawsCache ??= readJson<LawSummary[]>("laws.json"));
}

/**
 * Laws that get a page. JUSTITIA_ONLY_LAWS (comma-separated IDs) limits this for quick builds;
 * links to other laws then point at pages that were not built.
 */
export function pageLaws(): LawSummary[] {
  const only = process.env.JUSTITIA_ONLY_LAWS;
  if (!only) return laws();
  const ids = new Set(only.split(",").map((s) => s.trim()));
  return laws().filter((l) => ids.has(l.id));
}

export function law(id: string): LawDetail {
  return readJson<LawDetail>("laws", `${id}.json`);
}

export function meta(): Meta {
  return readJson<Meta>("meta.json");
}

/** The date (YYYY-MM-DD) in Japan at a time, such as meta().generatedAt. */
export function jstDate(time: string | Date): string {
  return new Date(new Date(time).getTime() + 9 * 3600_000).toISOString().slice(0, 10); // JST has no daylight saving
}

/**
 * Today's date (YYYY-MM-DD) in Japan, when the site is built. Pages use it, not meta().generatedAt,
 * to tell enforced amendments from upcoming ones: a build can reuse data extracted days before.
 */
export function buildDate(): string {
  return jstDate(new Date());
}

/**
 * Changes only when a file the pages fetch changes; the pages put it on their data URLs (see
 * src/scripts/data-url.ts and scripts/extract/data-version.ts). Output from before it existed falls
 * back to the generation time.
 */
export function dataVersion(): string {
  const m = meta();
  return m.dataVersion ?? m.generatedAt.replace(/[^0-9]/g, "");
}

let yearsCache: string[] | null = null;
/** Years that have a timeline file, oldest first; "undetermined" last. */
export function timelineYears(): string[] {
  if (yearsCache) return yearsCache;
  const dir = join(DATA_DIR, "timeline");
  const years = existsSync(dir) ? readdirSync(dir).map((f) => f.replace(/\.json$/, "")) : [];
  return (yearsCache = years.sort((a, b) => (a === "undetermined" ? 1 : b === "undetermined" ? -1 : a.localeCompare(b))));
}

export function timeline(year: string): AmendmentSummary[] {
  return readJson<AmendmentSummary[]>("timeline", `${year}.json`);
}

let newLawsCache: NewLaw[] | null = null;
/** Every newly enacted law (see src/lib/new-laws.ts), newest first. */
export function newLaws(): NewLaw[] {
  return (newLawsCache ??= collectNewLaws(
    timelineYears().flatMap((y) => timeline(y)),
    new Map(laws().map((l) => [l.id, l])),
    TYPE_ORDER,
  ));
}

// Labels ------------------------------------------------------------------------------

export const TYPE_LABELS: Record<string, string> = {
  constitution: "憲法",
  act: "法律",
  "cabinet-order": "政令",
  "imperial-order": "勅令",
  "ministerial-ordinance": "府省令",
  rule: "規則",
};
export const TYPE_ORDER = Object.keys(TYPE_LABELS);

export function typeLabel(dir: string): string {
  return TYPE_LABELS[dir] ?? dir;
}

export const KIND_LABELS: Record<FileChangeKind, string> = {
  enacted: "制定",
  coverage_start: "収録開始",
  amended: "改正",
  repealed: "廃止",
};

export const STATUS_LABELS: Record<LawSummary["status"], string> = {
  in_force: "現行",
  repealed: "廃止",
  upcoming_only: "未施行",
};

/** 五十音の行. Laws are grouped by the first kana of their reading. */
export const KANA_ROWS: { row: string; chars: string }[] = [
  { row: "あ", chars: "あいうえおぁぃぅぇぉゔ" },
  { row: "か", chars: "かきくけこがぎぐげご" },
  { row: "さ", chars: "さしすせそざじずぜぞ" },
  { row: "た", chars: "たちつてとだぢづでどっ" },
  { row: "な", chars: "なにぬねの" },
  { row: "は", chars: "はひふへほばびぶべぼぱぴぷぺぽ" },
  { row: "ま", chars: "まみむめも" },
  { row: "や", chars: "やゆよゃゅょ" },
  { row: "ら", chars: "らりるれろ" },
  { row: "わ", chars: "わをん" },
];
export const OTHER_ROW = "他";

export function kanaRow(l: LawSummary): string {
  const c = (l.kana ?? "").trim().charAt(0);
  if (!c) return OTHER_ROW;
  // Katakana to hiragana.
  const h = c >= "ァ" && c <= "ヶ" ? String.fromCharCode(c.charCodeAt(0) - 0x60) : c;
  return KANA_ROWS.find((r) => r.chars.includes(h))?.row ?? OTHER_ROW;
}

/** "2026-11-02" → "2026年11月2日" */
export function jpDate(iso: string | null | undefined): string {
  if (!iso) return "未定";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${m[1]}年${Number(m[2])}月${Number(m[3])}日`;
}

export function lawUrl(id: string): string {
  return `/laws/${id}/`;
}

export function amendmentUrl(key: string): string {
  return `/amendment/?k=${encodeURIComponent(key)}`;
}

export function categorySlug(category: string): string {
  return encodeURIComponent(category);
}
