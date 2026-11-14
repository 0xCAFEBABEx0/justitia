import assert from "node:assert/strict";
import { test } from "node:test";
import {
  amendableTitles,
  amendedLawTitles,
  billHeadline,
  billsByLaw,
  billSteps,
  firstHouse,
  isoDate,
  pendingBills,
  type PendingBill,
} from "./bills.ts";
import type { LawSummary } from "../../scripts/extract/types.ts";

// The columns of gian.json that pendingBills reads, in the database's order (others omitted).
const HEADER = [
  "掲載回次", "キャプション", "種類", "提出回次", "番号", "議案件名", "審議状況", "経過情報URL", "本文情報URL", "議案種類",
  "議案提出者", "衆議院議案受理年月日", "衆議院付託年月日／衆議院付託委員会", "衆議院審査終了年月日／衆議院審査結果",
  "衆議院審議終了年月日／衆議院審議結果", "衆議院審議時賛成会派", "衆議院審議時反対会派", "参議院議案受理年月日",
  "参議院付託年月日／参議院付託委員会", "参議院審査終了年月日／参議院審査結果", "参議院審議終了年月日／参議院審議結果",
];
type Row = Partial<Record<(typeof HEADER)[number], string>>;
const row = (r: Row) => HEADER.map((h) => r[h] ?? "");

// 閣法 第222回国会 第15号 as of 2026-11-13: passed by the 衆議院, received by the 参議院.
const keishoku: Row = {
  掲載回次: "222", キャプション: "閣法の一覧", 提出回次: "222", 番号: "15", 議案件名: "警察官職務執行法の一部を改正する法律案",
  審議状況: "参議院で審議中", 経過情報URL: "https://example.jp/keika", 本文情報URL: "https://example.jp/honbun", 議案種類: "閣法",
  衆議院議案受理年月日: "令和 8年10月16日", "衆議院付託年月日／衆議院付託委員会": "令和 8年10月30日／内閣",
  "衆議院審査終了年月日／衆議院審査結果": "令和 8年11月 6日／可決", "衆議院審議終了年月日／衆議院審議結果": "令和 8年11月10日／可決",
  衆議院審議時賛成会派: "自由民主党・無所属の会; 中道", 衆議院審議時反対会派: "日本共産党",
  参議院議案受理年月日: "令和 8年11月10日", "参議院付託年月日／参議院付託委員会": "／",
  "参議院審査終了年月日／参議院審査結果": "／", "参議院審議終了年月日／参議院審議結果": "／",
};

test("isoDate reads Japanese era dates", () => {
  assert.equal(isoDate("令和 8年10月 6日"), "2026-10-06");
  assert.equal(isoDate("平成10年 3月 4日"), "1998-03-04");
  assert.equal(isoDate("令和元年 5月 1日"), "2019-05-01");
  assert.equal(isoDate(""), null);
  assert.equal(isoDate("／"), null);
});

test("pendingBills keeps the law bills under deliberation in the latest session", () => {
  const bills = pendingBills([
    HEADER,
    row(keishoku),
    // The same bill's row from when it was only in the 衆議院 is not the latest.
    row({ ...keishoku, 掲載回次: "221", 審議状況: "衆議院で審議中" }),
    // Carried over from session 221: the date the 衆議院 received it is on the row of session 221 only.
    row({ 掲載回次: "222", キャプション: "衆法の一覧", 提出回次: "221", 番号: "21", 議案件名: "刑事訴訟法の一部を改正する法律案", 審議状況: "衆議院で審議中", 議案提出者: "山田\u3000太郎君外三名", "衆議院付託年月日／衆議院付託委員会": "令和 8年10月 5日／法務" }),
    row({ 掲載回次: "221", キャプション: "衆法の一覧", 提出回次: "221", 番号: "21", 議案件名: "刑事訴訟法の一部を改正する法律案", 審議状況: "衆議院で閉会中審査", 衆議院議案受理年月日: "令和 8年 6月23日", "衆議院付託年月日／衆議院付託委員会": "令和 8年 7月23日／法務", "衆議院審議終了年月日／衆議院審議結果": "／閉会中審査" }),
    // Last listed in an earlier session: dropped since.
    row({ 掲載回次: "212", キャプション: "衆法の一覧", 提出回次: "212", 番号: "1", 議案件名: "古い法律案", 審議状況: "衆議院で閉会中審査" }),
    row({ 掲載回次: "222", キャプション: "閣法の一覧", 提出回次: "222", 番号: "2", 議案件名: "成立した法律案", 審議状況: "成立" }),
    row({ 掲載回次: "222", キャプション: "決算その他", 種類: "決算", 提出回次: "222", 番号: "", 議案件名: "決算", 審議状況: "衆議院で審議中" }),
  ]);
  assert.deepEqual(bills.map((b) => [b.kind, b.session, b.number, b.status, b.submitter]), [
    ["衆法", 221, 21, "衆議院で審議中", "山田 太郎君外三名"],
    ["閣法", 222, 15, "参議院で審議中", "内閣"],
  ]);
  assert.deepEqual(billSteps(bills[0]), [
    { date: "2026-06-23", text: "議員が衆議院に提出", state: "done" },
    { date: null, text: "第222回国会に継続", state: "done" },
    { date: null, text: "衆議院で審議中", note: "法務委員会で審査中", state: "current" },
    { date: null, text: "参議院での審議", state: "todo" },
    { date: null, text: "成立・公布", state: "todo" },
  ]);
  assert.deepEqual(billHeadline(bills[0]), { date: "2026-06-23", text: "提出" });
  const b = bills[1];
  assert.deepEqual(b.houses.衆議院, {
    received: "2026-10-16", referred: "2026-10-30", committee: "内閣", reviewed: "2026-11-06", reviewResult: "可決",
    decided: "2026-11-10", decisionResult: "可決", for: ["自由民主党・無所属の会", "中道"], against: ["日本共産党"],
  });
  assert.equal(b.houses.参議院.received, "2026-11-10");
  assert.equal(b.houses.参議院.referred, null);
  assert.equal(b.keikaUrl, "https://example.jp/keika");
});

test("pendingBills fails loudly when the database renames a column", () => {
  assert.throws(() => pendingBills([HEADER.filter((h) => h !== "審議状況"), []]), /審議状況/);
});

const TITLES = [
  "刑事訴訟法",
  "組織的な犯罪の処罰及び犯罪収益の規制等に関する法律",
  "商法",
  "国際海上物品運送法",
  "公職選挙法",
  "公立学校の学校医、学校歯科医及び学校薬剤師の公務災害補償に関する法律",
  "地方税法",
];

test("amendedLawTitles reads the laws a bill amends from its title", () => {
  assert.deepEqual(amendedLawTitles("刑事訴訟法の一部を改正する法律案", TITLES), ["刑事訴訟法"]);
  assert.deepEqual(amendedLawTitles("商法及び国際海上物品運送法の一部を改正する法律案", TITLES), ["商法", "国際海上物品運送法"]);
  // Titles that themselves contain 及び and 、.
  assert.deepEqual(amendedLawTitles("組織的な犯罪の処罰及び犯罪収益の規制等に関する法律及び刑事訴訟法の一部を改正する法律案", TITLES), [
    "組織的な犯罪の処罰及び犯罪収益の規制等に関する法律",
    "刑事訴訟法",
  ]);
  assert.deepEqual(amendedLawTitles("公立学校の学校医、学校歯科医及び学校薬剤師の公務災害補償に関する法律の一部を改正する法律案", TITLES), [
    "公立学校の学校医、学校歯科医及び学校薬剤師の公務災害補償に関する法律",
  ]);
  // 「X等の一部を改正する法律案」 names X and amends others too.
  assert.deepEqual(amendedLawTitles("地方税法等の一部を改正する法律案", TITLES), ["地方税法"]);
  assert.deepEqual(amendedLawTitles("現行の衆議院選挙制度の見直しのための公職選挙法の一部を改正する等の法律案", TITLES), ["公職選挙法"]);
});

test("amendedLawTitles names nothing for new laws and unknown laws", () => {
  assert.deepEqual(amendedLawTitles("法人等の実質的支配者に係る情報の把握等に関する法律案", TITLES), []);
  assert.deepEqual(amendedLawTitles("法人等の実質的支配者に係る情報の把握等に関する法律の施行に伴う関係法律の整備等に関する法律案", TITLES), []);
  assert.deepEqual(amendedLawTitles("未知の法律の一部を改正する法律案", TITLES), []);
  // One unknown law in the list: none is guessed.
  assert.deepEqual(amendedLawTitles("商法及び未知の法律の一部を改正する法律案", TITLES), []);
});

test("amendableTitles keeps acts in force whose title names one law", () => {
  const law = (id: string, title: string, dir = "act", status: LawSummary["status"] = "in_force") => ({ id, title, dir, status }) as LawSummary;
  const titles = amendableTitles([
    law("1", "刑事訴訟法"),
    law("2", "商法"),
    law("3", "商法"),
    law("4", "旧法", "act", "repealed"),
    law("5", "施行令", "cabinet-order"),
    law("6", "未施行法", "act", "upcoming_only"),
  ]);
  assert.deepEqual([...titles], [["刑事訴訟法", "1"], ["未施行法", "6"]]);
  const [bill] = pendingBills([HEADER, row({ ...keishoku, 議案件名: "刑事訴訟法の一部を改正する法律案" })]);
  assert.deepEqual([...billsByLaw([bill], titles).keys()], ["1"]);
});

test("billSteps shows what was done, where the bill is and what is left", () => {
  const [b] = pendingBills([HEADER, row(keishoku)]);
  assert.equal(firstHouse(b), "衆議院");
  assert.deepEqual(billSteps(b), [
    { date: "2026-10-16", text: "内閣が衆議院に提出", state: "done" },
    { date: "2026-11-06", text: "衆議院 内閣委員会で可決", state: "done" },
    { date: "2026-11-10", text: "衆議院 本会議で可決", note: "反対：日本共産党", state: "done" },
    { date: null, text: "参議院で審議中", note: "委員会への付託待ち", state: "current" },
    { date: null, text: "成立・公布", state: "todo" },
  ]);
  assert.deepEqual(billHeadline(b), { date: "2026-11-10", text: "衆議院を通過" });
});

test("billSteps for a bill still in the first house, modified in committee", () => {
  const [b] = pendingBills([
    HEADER,
    row({
      ...keishoku, 審議状況: "衆議院で審議中", "衆議院審査終了年月日／衆議院審査結果": "令和 8年11月 6日／修正",
      "衆議院審議終了年月日／衆議院審議結果": "／", 衆議院審議時賛成会派: "", 衆議院審議時反対会派: "", 参議院議案受理年月日: "",
    }),
  ]);
  assert.deepEqual(billSteps(b).slice(1), [
    { date: "2026-11-06", text: "衆議院 内閣委員会で修正して可決", state: "done" },
    { date: null, text: "衆議院で審議中", note: "本会議での採決待ち", state: "current" },
    { date: null, text: "参議院での審議", state: "todo" },
    { date: null, text: "成立・公布", state: "todo" },
  ]);
  assert.deepEqual(billHeadline(b), { date: "2026-11-06", text: "衆議院の委員会で修正して可決" });
});

test("a 参法 starts in the 参議院", () => {
  const b: PendingBill = {
    ...pendingBills([HEADER, row(keishoku)])[0],
    kind: "参法",
    houses: {
      衆議院: { received: null, referred: null, committee: null, reviewed: null, reviewResult: null, decided: null, decisionResult: null, for: [], against: [] },
      参議院: { received: "2026-11-04", referred: "2026-11-05", committee: "財政金融", reviewed: null, reviewResult: null, decided: null, decisionResult: null, for: [], against: [] },
    },
  };
  assert.equal(firstHouse(b), "参議院");
  assert.deepEqual(billSteps(b), [
    { date: "2026-11-04", text: "議員が参議院に提出", state: "done" },
    { date: null, text: "参議院で審議中", note: "財政金融委員会で審査中", state: "current" },
    { date: null, text: "衆議院での審議", state: "todo" },
    { date: null, text: "成立・公布", state: "todo" },
  ]);
  assert.deepEqual(billHeadline(b), { date: "2026-11-04", text: "提出" });
});
