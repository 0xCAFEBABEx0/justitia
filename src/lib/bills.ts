// Law bills (法律案) pending in the Diet, and the laws they would amend.
//
// scripts/bills.ts downloads the House of Representatives bill database that SmartNews Media Research
// Institute keeps (https://github.com/smartnews-smri/house-of-representatives, MIT, updated daily from
// the 衆議院 website) and writes the bills still under deliberation to <JUSTITIA_DATA>/bills.json. The
// law pages read that file at build time; without it they show no bills. Only the bills' metadata and
// links to the 衆議院 pages are used, never their text.
//
// A bill that amends existing laws is matched to them by its title alone (「X及びYの一部を改正する
// 法律案」); a bill for a new law, or one whose title does not name the laws it changes (整備法), is not
// shown on any law page.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { LawSummary } from "../../scripts/extract/types.ts";
import { laws } from "./data.ts";
import { DATA_DIR } from "./site.ts";

export const BILLS_SOURCE_URL = "https://github.com/smartnews-smri/house-of-representatives";
export const BILLS_SOURCE_NAME = "衆議院議案データベース";
export const BILLS_SOURCE_CREDIT = "スマートニュース メディア研究所";
/** The database is MIT-licensed; its notice is shown on the about page with a link to the licence. */
export const BILLS_LICENSE_URL = `${BILLS_SOURCE_URL}/blob/main/LICENSE`;
export const BILLS_COPYRIGHT = "Copyright (c) 2022 smartnews-smri";

export type BillKind = "閣法" | "衆法" | "参法";
export type House = "衆議院" | "参議院";

/** What one house has done with a bill so far; dates are YYYY-MM-DD. */
export interface HouseRecord {
  received: string | null;
  referred: string | null;
  committee: string | null; // 付託委員会 without 委員会, e.g. 法務, 消費者問題に関する特別
  reviewed: string | null; // 審査終了 (the committee's vote)
  reviewResult: string | null; // 可決, 修正, 否決, ...
  decided: string | null; // 審議終了 (the plenary's vote)
  decisionResult: string | null;
  /** 衆議院 only: the groups that voted for and against in the plenary. */
  for: string[];
  against: string[];
}

export interface PendingBill {
  kind: BillKind;
  session: number; // 提出回次
  /** The session the bill is listed in now: later than session for a bill carried over (継続審査). */
  listedSession: number;
  number: number;
  title: string;
  status: string; // 審議状況, e.g. 参議院で審議中, 衆議院で閉会中審査
  submitter: string; // 内閣, or the first member's name with 外N名
  keikaUrl: string | null; // 経過 on the 衆議院 website
  honbunUrl: string | null; // 本文 (and 修正案) on the 衆議院 website
  houses: Record<House, HouseRecord>;
}

export interface BillsFile {
  /** When the source data was last updated (YYYY-MM-DD, Japan). */
  updated: string;
  bills: PendingBill[];
}

const KINDS = new Set<string>(["閣法", "衆法", "参法"]);
const PENDING = /審議中|閉会中審査/;

/** 「令和 8年10月30日」 → 2026-10-30; null for anything else. */
export function isoDate(s: string | undefined): string | null {
  const m = /(令和|平成|昭和)\s*(元|\d+)年\s*(\d+)月\s*(\d+)日/.exec(s ?? "");
  if (!m) return null;
  const year = (m[2] === "元" ? 1 : Number(m[2])) + { 令和: 2018, 平成: 1988, 昭和: 1925 }[m[1] as "令和" | "平成" | "昭和"];
  return `${year}-${m[3].padStart(2, "0")}-${m[4].padStart(2, "0")}`;
}

/** 「令和 8年11月 6日／可決」 → [2026-11-06, 可決]. */
function dated(s: string | undefined): [string | null, string | null] {
  const [date, value] = (s ?? "").split("／");
  return [isoDate(date), value?.trim() || null];
}

const groups = (s: string | undefined) => (s ?? "").split(";").map((g) => g.trim()).filter(Boolean);

/**
 * The law bills still in the Diet, from gian.json of the bill database: a header row, then one row per
 * bill and session (掲載回次). A bill carried over to a later session has a row for each, and only the
 * latest tells where it stands.
 */
export function pendingBills(rows: string[][]): PendingBill[] {
  const [header, ...data] = rows;
  const col = (name: string) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`gian.json has no column ${name}`);
    return i;
  };
  const c = {
    listed: col("掲載回次"),
    caption: col("キャプション"),
    kind: col("種類"),
    detailKind: col("議案種類"),
    session: col("提出回次"),
    number: col("番号"),
    title: col("議案件名"),
    status: col("審議状況"),
    keika: col("経過情報URL"),
    honbun: col("本文情報URL"),
    submitter: col("議案提出者"),
  };
  const house = (h: "衆議院" | "参議院") => ({
    received: col(`${h}議案受理年月日`),
    referred: col(`${h}付託年月日／${h}付託委員会`),
    reviewed: col(`${h}審査終了年月日／${h}審査結果`),
    decided: col(`${h}審議終了年月日／${h}審議結果`),
  });
  const shu = { ...house("衆議院"), for: col("衆議院審議時賛成会派"), against: col("衆議院審議時反対会派") };
  const san = house("参議院");

  // 種類 is empty for law bills; the table they are listed in (閣法の一覧) and the bill's own page say it.
  const kind = (r: string[]) => r[c.kind] || r[c.detailKind] || r[c.caption].replace(/の一覧$/, "");
  const latest = new Map<string, string[]>();
  // The date each house received a bill is on the row of the session it was submitted in; a carried-over
  // bill's later rows leave it empty.
  const received = new Map<string, Record<House, string | null>>();
  for (const r of data) {
    if (!KINDS.has(kind(r))) continue;
    const key = `${kind(r)}-${r[c.session]}-${r[c.number]}`;
    const seen = latest.get(key);
    if (!seen || Number(r[c.listed]) >= Number(seen[c.listed])) latest.set(key, r);
    const got = received.get(key) ?? { 衆議院: null, 参議院: null };
    got.衆議院 ??= isoDate(r[shu.received]);
    got.参議院 ??= isoDate(r[san.received]);
    received.set(key, got);
  }
  const record = (r: string[], h: typeof san, received: string | null, votes?: { for: number; against: number }): HouseRecord => {
    const [referred, committee] = dated(r[h.referred]);
    const [reviewed, reviewResult] = dated(r[h.reviewed]);
    const [decided, decisionResult] = dated(r[h.decided]);
    return {
      received,
      referred,
      committee,
      reviewed,
      reviewResult,
      decided,
      decisionResult,
      for: votes ? groups(r[votes.for]) : [],
      against: votes ? groups(r[votes.against]) : [],
    };
  };
  // Only bills listed in the latest session: one last listed as 閉会中審査 in an earlier session was
  // dropped since (a dissolution of the 衆議院 ends every pending bill).
  const session = Math.max(...data.map((r) => Number(r[c.listed])).filter(Number.isFinite));
  return [...latest.values()]
    .filter((r) => Number(r[c.listed]) === session && PENDING.test(r[c.status]))
    .map((r) => {
      const got = received.get(`${kind(r)}-${r[c.session]}-${r[c.number]}`)!;
      return {
        kind: kind(r) as BillKind,
        session: Number(r[c.session]),
        listedSession: Number(r[c.listed]),
        number: Number(r[c.number]),
        title: r[c.title].trim(),
        status: r[c.status].trim(),
        submitter: r[c.submitter].replace(/\u3000/g, " ").trim() || (kind(r) === "閣法" ? "内閣" : ""),
        keikaUrl: r[c.keika] || null,
        honbunUrl: r[c.honbun] || null,
        houses: { 衆議院: record(r, shu, got.衆議院, shu), 参議院: record(r, san, got.参議院) },
      };
    })
    .sort((a, b) => a.session - b.session || a.kind.localeCompare(b.kind) || a.number - b.number);
}

/**
 * The laws a bill amends, by its title: 「X及びYの一部を改正する法律案」 → [X, Y]. Law titles themselves
 * contain 及び and 、, so the part before 「の一部を改正する」 is read as a run of known titles joined by
 * 及び, 並びに or 、. An empty list means the title does not say (a new law, or a 整備法).
 */
export function amendedLawTitles(billTitle: string, titles: readonly string[]): string[] {
  const m = /^(.+?)の一部を改正する(等の)?法律案$/.exec(billTitle);
  if (!m) return [];
  const named = m[1].replace(/等$/, "");
  const longestFirst = [...titles].sort((a, b) => b.length - a.length);
  const found: string[] = [];
  let at = 0;
  while (at < named.length) {
    const t = longestFirst.find((t) => named.startsWith(t, at));
    if (!t) break;
    found.push(t);
    at += t.length;
    const joint = /^(及び|並びに|、)/.exec(named.slice(at));
    if (joint) at += joint[0].length;
    else if (at < named.length) break;
  }
  if (at >= named.length && found.length > 0) return found;
  // 「現行の衆議院選挙制度の見直しのための公職選挙法の一部を改正する等の法律案」: a purpose, then one law.
  const last = longestFirst.find((t) => named.endsWith(`の${t}`));
  return last ? [last] : [];
}

/** Titles of the laws a bill can amend, each naming one law: titles shared by two laws in force are left out. */
export function amendableTitles(laws: readonly LawSummary[]): Map<string, string> {
  const ids = new Map<string, string[]>();
  for (const l of laws) {
    if (l.dir !== "act" || l.status === "repealed") continue;
    ids.set(l.title, [...(ids.get(l.title) ?? []), l.id]);
  }
  return new Map([...ids].filter(([, v]) => v.length === 1).map(([t, [id]]) => [t, id]));
}

/** Pending bills by the ID of each law they amend. */
export function billsByLaw(bills: readonly PendingBill[], titles: Map<string, string>): Map<string, PendingBill[]> {
  const known = [...titles.keys()];
  const out = new Map<string, PendingBill[]>();
  for (const b of bills) {
    for (const t of amendedLawTitles(b.title, known)) {
      const id = titles.get(t)!;
      out.set(id, [...(out.get(id) ?? []), b]);
    }
  }
  return out;
}

/** The house a bill was sent to first: 参議院 for 参法 and the cabinet bills submitted there first. */
export function firstHouse(b: PendingBill): House {
  const shu = b.houses.衆議院.received;
  const san = b.houses.参議院.received;
  if (b.kind === "参法" || (san && (!shu || san < shu))) return "参議院";
  return "衆議院";
}

export interface BillStep {
  date: string | null;
  text: string;
  note?: string;
  state: "done" | "current" | "todo";
}

const RESULT_LABELS: Record<string, string> = { 可決: "可決", 修正: "修正して可決", 否決: "否決", 併合修正: "併合修正" };
const resultLabel = (r: string) => RESULT_LABELS[r] ?? r;
const PASSED = new Set(["可決", "修正"]);

/** The steps a bill has taken, the one it is at, and those left, for the timeline on law pages. */
export function billSteps(b: PendingBill): BillStep[] {
  const first = firstHouse(b);
  const second: House = first === "衆議院" ? "参議院" : "衆議院";
  const submitter = b.kind === "閣法" ? "内閣" : "議員";
  const steps: BillStep[] = [{ date: b.houses[first].received, text: `${submitter}が${first}に提出`, state: "done" }];
  if (b.listedSession > b.session) steps.push({ date: null, text: `第${b.listedSession}回国会に継続`, state: "done" });
  let current: House | null = null;
  for (const h of [first, second]) {
    const r = b.houses[h];
    if (r.reviewed && r.reviewResult) steps.push({ date: r.reviewed, text: `${h} ${r.committee ?? ""}委員会で${resultLabel(r.reviewResult)}`, state: "done" });
    if (r.decided && r.decisionResult && PASSED.has(r.decisionResult)) {
      steps.push({
        date: r.decided,
        text: `${h} 本会議で${resultLabel(r.decisionResult)}`,
        note: r.against.length > 0 ? `反対：${r.against.join("、")}` : r.for.length > 0 ? "全会一致" : undefined,
        state: "done",
      });
      continue;
    }
    current = h;
    const note = r.reviewed
      ? "本会議での採決待ち"
      : r.referred
        ? `${r.committee ?? ""}委員会で審査中`
        : r.received
          ? "委員会への付託待ち"
          : undefined;
    steps.push({ date: null, text: /閉会中審査/.test(b.status) ? `${h}で閉会中審査` : `${h}で審議中`, note, state: "current" });
    break;
  }
  if (current === first) steps.push({ date: null, text: `${second}での審議`, state: "todo" });
  steps.push({ date: null, text: "成立・公布", state: "todo" });
  return steps;
}

/** The latest step done, for the line above a bill: 「衆議院を通過」 once a house has passed it. */
export function billHeadline(b: PendingBill): { date: string | null; text: string } {
  const first = firstHouse(b);
  const second: House = first === "衆議院" ? "参議院" : "衆議院";
  let latest = { date: b.houses[first].received, text: "提出" };
  // Same order as billSteps: the second house counts only once the first has passed the bill.
  for (const h of [first, second]) {
    const r = b.houses[h];
    if (r.reviewed && r.reviewResult) latest = { date: r.reviewed, text: `${h}の委員会で${resultLabel(r.reviewResult)}` };
    if (!(r.decided && r.decisionResult && PASSED.has(r.decisionResult))) break;
    latest = { date: r.decided, text: `${h}を通過` };
  }
  return latest;
}

/** 閣法 第222回国会 第15号 */
export const billName = (b: PendingBill) => `${b.kind} 第${b.session}回国会 第${b.number}号`;

let fileCache: BillsFile | null | undefined;
/** <JUSTITIA_DATA>/bills.json, or null when scripts/bills.ts has not written it. */
export function billsFile(): BillsFile | null {
  if (fileCache !== undefined) return fileCache;
  const path = join(DATA_DIR, "bills.json");
  return (fileCache = existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as BillsFile) : null);
}

let byLawCache: Map<string, PendingBill[]> | null = null;
/** The pending bills that amend a law, cabinet bills first. */
export function pendingBillsOf(lawId: string): PendingBill[] {
  byLawCache ??= billsByLaw(billsFile()?.bills ?? [], amendableTitles(laws()));
  const order: Record<BillKind, number> = { 閣法: 0, 衆法: 1, 参法: 2 };
  return [...(byLawCache.get(lawId) ?? [])].sort((a, b) => order[a.kind] - order[b.kind] || b.session - a.session || a.number - b.number);
}

let titlesCache: Map<string, string> | null = null;
/** The laws a bill amends, as far as its title tells (see amendedLawTitles); empty for a new law or a 整備法. */
export function lawsAmendedBy(b: PendingBill): { id: string; title: string }[] {
  titlesCache ??= amendableTitles(laws());
  const titles = titlesCache;
  return amendedLawTitles(b.title, [...titles.keys()]).map((title) => ({ id: titles.get(title)!, title }));
}

export type BillStage = "passed" | "first";

/** Whether a bill has passed the house it was sent to first, and which house that was, for /bills/. */
export function billStage(b: PendingBill): { stage: BillStage; house: House } {
  const house = firstHouse(b);
  const r = b.houses[house];
  return { stage: r.decided && r.decisionResult && PASSED.has(r.decisionResult) ? "passed" : "first", house };
}
