import assert from "node:assert/strict";
import { test } from "node:test";
import { byAge, isUnamended, lawYear, lawYearLabel, listTitle, statLaw, yearBefore, yearsSince, type StatLaw } from "./stats.ts";
import type { LawDetail, LawRevision } from "../../scripts/extract/types.ts";

test("lawYear reads the era and year from a law ID", () => {
  assert.deepEqual(lawYear("140AC0000000045"), { era: "明治", eraYear: 40, year: 1907 });
  assert.deepEqual(lawYear("106DF0000000065"), { era: "明治", eraYear: 6, year: 1873 });
  assert.deepEqual(lawYear("321CONSTITUTION"), { era: "昭和", eraYear: 21, year: 1946 });
  assert.deepEqual(lawYear("401AC0000000001"), { era: "平成", eraYear: 1, year: 1989 });
  assert.deepEqual(lawYear("508AC0000000045"), { era: "令和", eraYear: 8, year: 2026 });
  assert.equal(lawYear("600AC0000000001"), null);
  assert.equal(lawYear("100AC0000000001"), null);
});

test("lawYearLabel writes 元年 for the first year of an era", () => {
  assert.equal(lawYearLabel({ era: "明治", eraYear: 40, year: 1907 }), "明治40年（1907年）");
  assert.equal(lawYearLabel({ era: "令和", eraYear: 1, year: 2019 }), "令和元年（2019年）");
});

test("isUnamended is true when e-Gov names no amending law", () => {
  assert.equal(isUnamended({ amendment: { law_id: null, enforced: "1947-10-27" } }), true);
  assert.equal(isUnamended({ amendment: { law_id: "" } }), true); // 日本国憲法
  assert.equal(isUnamended({ amendment: { law_id: "508AC0000000045" } }), false);
  assert.equal(isUnamended({}), false);
  assert.equal(isUnamended({ amendment: null }), false);
});

test("listTitle drops the number from a title made of the number and a name", () => {
  assert.equal(listTitle("明治三十二年法律第四十号（失火ノ責任ニ関スル法律）", "明治三十二年法律第四十号"), "失火ノ責任ニ関スル法律");
  assert.equal(listTitle("国家賠償法", "昭和二十二年法律第百二十五号"), "国家賠償法");
  assert.equal(listTitle("明治三十二年法律第四十号", "明治三十二年法律第四十号"), "明治三十二年法律第四十号");
});

test("yearBefore and yearsSince", () => {
  assert.equal(yearBefore("2026-11-09"), "2025-11-09");
  assert.equal(yearBefore("2028-02-29"), "2027-03-01");
  assert.equal(yearsSince({ era: "明治", eraYear: 6, year: 1873 }, "2026-11-09"), 153);
  assert.equal(yearsSince(null, "2026-11-09"), null);
});

const revision = (enforced: string | null, kind: LawRevision["kind"], amendmentLawId: string, branch: "main" | "upcoming" = "main") =>
  ({ amendment: `${amendmentLawId}_x`, branch, enforced, kind, amendmentLawId }) as LawRevision;

test("statLaw counts amendments in force, leaving out the enactment and 段階施行", () => {
  const detail = {
    id: "506AC0000000001",
    title: "テスト法",
    num: "令和六年法律第一号",
    dir: "act",
    upcomingCount: 1,
    frontmatter: { amendment: { law_id: "507AC0000000009" } },
    revisions: [
      revision("2024-04-01", "enacted", "506AC0000000001"),
      revision("2025-04-01", "amended", "506AC0000000001"), // 段階施行
      revision("2025-10-01", "amended", "507AC0000000002"),
      revision("2026-06-01", "amended", "507AC0000000009"),
      revision("2027-04-01", "amended", "508AC0000000003", "upcoming"),
    ],
  } as unknown as LawDetail;
  const s = statLaw(detail, "2026-11-09");
  assert.equal(s.amendments, 2);
  assert.equal(s.amendmentsLastYear, 1);
  assert.equal(s.unamended, false);
  assert.deepEqual(s.year, { era: "令和", eraYear: 6, year: 2024 });
});

test("statLaw counts a first revision that is an amendment by another law (収録開始)", () => {
  const detail = {
    id: "415AC0000000057",
    title: "個人情報の保護に関する法律",
    num: "平成十五年法律第五十七号",
    dir: "act",
    upcomingCount: 0,
    frontmatter: { amendment: { law_id: "505AC0000000047" } },
    revisions: [revision("2017-05-30", "coverage_start", "427AC0000000065"), revision("2022-04-01", "amended", "502AC0000000044")],
  } as unknown as LawDetail;
  assert.equal(statLaw(detail, "2026-11-09").amendments, 2);
});

test("byAge sorts by year, then by ID, unknown years last", () => {
  const s = (id: string) => ({ id, year: lawYear(id) }) as StatLaw;
  const sorted = [s("322AC0000000125"), s("XYZ"), s("132AC1000000040"), s("106DF0000000065"), s("132AC0000000015")].sort(byAge);
  assert.deepEqual(sorted.map((x) => x.id), ["106DF0000000065", "132AC0000000015", "132AC1000000040", "322AC0000000125", "XYZ"]);
});
