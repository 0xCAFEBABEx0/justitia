import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { collectNewLaws } from "./new-laws.ts";
import { collectRepealedLaws } from "./repealed-laws.ts";
import { DATA_DIR } from "./site.ts";
function readJson(...parts) {
    return JSON.parse(readFileSync(join(DATA_DIR, ...parts), "utf8"));
}
let lawsCache = null;
export function laws() {
    return (lawsCache ??= readJson("laws.json"));
}
/**
 * Laws that get a page. JUSTITIA_ONLY_LAWS (comma-separated IDs) limits this for quick builds;
 * links to other laws then point at pages that were not built.
 */
export function pageLaws() {
    const only = process.env.JUSTITIA_ONLY_LAWS;
    if (!only)
        return laws();
    const ids = new Set(only.split(",").map((s) => s.trim()));
    return laws().filter((l) => ids.has(l.id));
}
export function law(id) {
    return readJson("laws", `${id}.json`);
}
export function meta() {
    return readJson("meta.json");
}
/** The date (YYYY-MM-DD) in Japan at a time, such as meta().generatedAt. */
export function jstDate(time) {
    return new Date(new Date(time).getTime() + 9 * 3600_000).toISOString().slice(0, 10); // JST has no daylight saving
}
/**
 * Today's date (YYYY-MM-DD) in Japan, when the site is built. Pages use it, not meta().generatedAt,
 * to tell enforced amendments from upcoming ones: a build can reuse data extracted days before.
 */
export function buildDate() {
    return jstDate(new Date());
}
/**
 * Changes only when a file the pages fetch changes; the pages put it on their data URLs (see
 * src/scripts/data-url.ts and scripts/extract/data-version.ts). Output from before it existed falls
 * back to the generation time.
 */
export function dataVersion() {
    const m = meta();
    return m.dataVersion ?? m.generatedAt.replace(/[^0-9]/g, "");
}
let yearsCache = null;
/** Years that have a timeline file, oldest first; "undetermined" last. */
export function timelineYears() {
    if (yearsCache)
        return yearsCache;
    const dir = join(DATA_DIR, "timeline");
    const years = existsSync(dir) ? readdirSync(dir).map((f) => f.replace(/\.json$/, "")) : [];
    return (yearsCache = years.sort((a, b) => (a === "undetermined" ? 1 : b === "undetermined" ? -1 : a.localeCompare(b))));
}
export function timeline(year) {
    return readJson("timeline", `${year}.json`);
}
/**
 * Amendments that get a static page (/amendment/<key>/): all of them, or with JUSTITIA_ONLY_LAWS, those that
 * change one of the listed laws.
 */
export function pageAmendments() {
    const all = timelineYears().flatMap((y) => timeline(y));
    const only = process.env.JUSTITIA_ONLY_LAWS;
    if (!only)
        return all;
    const ids = new Set(only.split(",").map((s) => s.trim()));
    return all.filter((a) => a.laws.some((l) => ids.has(l.id)));
}
/** One amendment with its diffs (amendments/<key>.json, the file the amendment page fetches). */
export function amendment(key) {
    return readJson("amendments", `${key}.json`);
}
let newLawsCache = null;
/** Every newly enacted law (see src/lib/new-laws.ts), newest first. */
export function newLaws() {
    return (newLawsCache ??= collectNewLaws(timelineYears().flatMap((y) => timeline(y)), new Map(laws().map((l) => [l.id, l])), TYPE_ORDER));
}
let repealedLawsCache = null;
/** Every repealed law (see src/lib/repealed-laws.ts), newest repeal first. */
export function repealedLaws() {
    return (repealedLawsCache ??= collectRepealedLaws(timelineYears().flatMap((y) => timeline(y)), new Map(laws().map((l) => [l.id, l])), TYPE_ORDER));
}
let repealedByIdCache = null;
/** The repeal of a law, if it is repealed and houritsu records how. */
export function repealOf(id) {
    return (repealedByIdCache ??= new Map(repealedLaws().map((l) => [l.id, l]))).get(id);
}
// Labels ------------------------------------------------------------------------------
export const TYPE_LABELS = {
    constitution: "憲法",
    act: "法律",
    "cabinet-order": "政令",
    "imperial-order": "勅令",
    "ministerial-ordinance": "府省令",
    rule: "規則",
};
export const TYPE_ORDER = Object.keys(TYPE_LABELS);
export function typeLabel(dir) {
    return TYPE_LABELS[dir] ?? dir;
}
export const KIND_LABELS = {
    enacted: "制定",
    coverage_start: "収録開始",
    amended: "改正",
    repealed: "廃止",
};
export const STATUS_LABELS = {
    in_force: "現行",
    repealed: "廃止",
    upcoming_only: "未施行",
};
/** 五十音の行. Laws are grouped by the first kana of their reading. */
export const KANA_ROWS = [
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
export function kanaRow(l) {
    const c = (l.kana ?? "").trim().charAt(0);
    if (!c)
        return OTHER_ROW;
    // Katakana to hiragana.
    const h = c >= "ァ" && c <= "ヶ" ? String.fromCharCode(c.charCodeAt(0) - 0x60) : c;
    return KANA_ROWS.find((r) => r.chars.includes(h))?.row ?? OTHER_ROW;
}
/** "2026-11-02" → "2026年11月2日" */
export function jpDate(iso) {
    if (!iso)
        return "未定";
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m)
        return iso;
    return `${m[1]}年${Number(m[2])}月${Number(m[3])}日`;
}
export function lawUrl(id) {
    return `/laws/${id}/`;
}
export function amendmentUrl(key) {
    return `/amendment/${encodeURIComponent(key)}/`;
}
export function categorySlug(category) {
    return encodeURIComponent(category);
}
