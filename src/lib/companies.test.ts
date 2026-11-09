import { test } from "node:test";
import assert from "node:assert/strict";
import { COMPANIES, companyMatcher } from "./companies.ts";

const titles = ["日本電信電話株式会社等に関する法律", "放送法", "高速道路株式会社法"];

test("companyMatcher ignores law titles and longer names", () => {
  const ntt = companyMatcher({ name: "日本電信電話株式会社" }, titles);
  assert.equal(ntt("日本電信電話株式会社は、"), true);
  assert.equal(ntt("日本電信電話株式会社等に関する法律（昭和五十九年法律第八十五号）第二条"), false);
  assert.equal(ntt("東日本電信電話株式会社及び西日本電信電話株式会社"), false);
  assert.equal(ntt("日本電信電話株式会社等に関する法律の規定により日本電信電話株式会社が"), true);
});

test("companyMatcher counts any name of a group", () => {
  const m = companyMatcher({ name: "東日本高速道路株式会社", also: ["阪神高速道路株式会社"] }, [...titles, "阪神高速道路株式会社に関する法律"]);
  assert.equal(m("阪神高速道路株式会社が管理する"), true);
  assert.equal(m("高速道路株式会社法"), false);
  assert.equal(m("阪神高速道路株式会社に関する法律"), false);
});

test("companyMatcher keeps a title that is the name itself", () => {
  const m = companyMatcher({ name: "日本国憲法" }, ["日本国憲法", "日本国憲法の改正手続に関する法律"]);
  assert.equal(m("日本国憲法第九十六条"), true);
  assert.equal(m("日本国憲法の改正手続に関する法律第一条"), false);
});

test("COMPANIES has no duplicate names", () => {
  const names = COMPANIES.flatMap((c) => [c.name, ...(c.also ?? [])]);
  assert.equal(new Set(names).size, names.length);
});
