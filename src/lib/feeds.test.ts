import assert from "node:assert/strict";
import { test } from "node:test";
import type { AmendmentSummary, LawSummary } from "../../scripts/extract/types.ts";
import { byCategory, byLaw, calendarEvents, feedUrl, foldLine, icsCalendar, icsText, lawNames } from "./feeds.ts";

function amendment(over: Partial<AmendmentSummary>): AmendmentSummary {
  return {
    key: "508AC0000000045_20270623",
    branch: "upcoming",
    amendmentLawNum: "令和八年法律第四十五号",
    title: "民法等の一部を改正する法律",
    enforced: "2027-06-23",
    promulgated: "2026-06-24",
    laws: [{ id: "129AC0000000089", title: "民法", kind: "amended" }],
    additions: 1,
    deletions: 1,
    ...over,
  };
}

test("icsText escapes what RFC 5545 asks for", () => {
  assert.equal(icsText("a\\b;c,d\ne"), "a\\\\b\\;c\\,d\\ne");
});

test("foldLine keeps lines within 75 octets and never splits a character", () => {
  const line = `SUMMARY:${"施行".repeat(40)}`;
  const folded = foldLine(line);
  const parts = folded.split("\r\n");
  assert.ok(parts.length > 1);
  for (const p of parts) assert.ok(new TextEncoder().encode(p).length <= 75, p);
  assert.equal(parts.map((p, i) => (i ? p.slice(1) : p)).join(""), line);
  assert.equal(foldLine("SHORT:x"), "SHORT:x");
});

test("calendarEvents keeps the past year and the future, oldest first, and drops undetermined dates", () => {
  const list = [
    amendment({ key: "c", enforced: "2027-01-01" }),
    amendment({ key: "a", enforced: "2025-11-08" }),
    amendment({ key: "old", enforced: "2025-11-06" }),
    amendment({ key: "none", enforced: null }),
    amendment({ key: "b", enforced: "2026-11-09" }),
  ];
  assert.deepEqual(calendarEvents(list, "2026-11-09").map((a) => a.key), ["a", "b", "c"]);
});

test("icsCalendar writes all-day events with CRLF lines and a stable DTSTAMP", () => {
  const ics = icsCalendar({ name: "民法の施行日", description: "説明", amendments: [amendment({})], lawId: "129AC0000000089", today: "2026-11-09" });
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n"));
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  assert.ok(!/[^\r]\n/.test(ics), "every line ends in CRLF");
  const unfolded = ics.replace(/\r\n /g, "");
  assert.match(unfolded, /\r\nDTSTART;VALUE=DATE:20270623\r\nDTEND;VALUE=DATE:20270624\r\n/);
  assert.match(unfolded, /\r\nDTSTAMP:20260624T000000Z\r\n/);
  assert.match(unfolded, /\r\nUID:508AC0000000045_20270623-129AC0000000089@anisotro\.pics\r\n/);
  assert.match(unfolded, /\r\nSUMMARY:施行：民法等の一部を改正する法律\r\n/);
  assert.match(unfolded, /\r\nURL:https:\/\/anisotro\.pics\/amendment\/\?k=508AC0000000045_20270623#law-129AC0000000089\r\n/);
  assert.match(unfolded, /施行：2027年6月23日（予定）/);
  assert.match(unfolded, /\r\nX-WR-CALNAME:民法の施行日\r\n/);
  // The same input gives the same file, whenever it is made.
  assert.equal(ics, icsCalendar({ name: "民法の施行日", description: "説明", amendments: [amendment({})], lawId: "129AC0000000089", today: "2026-11-09" }));
});

test("byLaw and byCategory group amendments by the laws they change", () => {
  const a = amendment({ key: "a", laws: [{ id: "L1", title: "甲法", kind: "amended" }, { id: "L2", title: "乙法", kind: "amended" }] });
  const b = amendment({ key: "b", laws: [{ id: "L2", title: "乙法", kind: "amended" }] });
  assert.deepEqual([...byLaw([a, b])].map(([k, v]) => [k, v.map((x) => x.key)]), [["L1", ["a"]], ["L2", ["a", "b"]]]);
  const laws = new Map<string, LawSummary>([
    ["L1", { category: "民事" } as LawSummary],
    ["L2", { category: "民事" } as LawSummary],
  ]);
  assert.deepEqual([...byCategory([a, b], laws)].map(([k, v]) => [k, v.map((x) => x.key)]), [["民事", ["a", "b"]]]);
});

test("lawNames shortens long lists", () => {
  const laws = Array.from({ length: 7 }, (_, i) => ({ id: `L${i}`, title: `法${i}`, kind: "amended" as const }));
  assert.equal(lawNames(amendment({ laws })), "法0、法1、法2、法3、法4ほか 2 法令");
});

test("feedUrl encodes the file name", () => {
  assert.equal(feedUrl("https://data.anisotro.pics/", "category-民事.ics"), "https://data.anisotro.pics/feeds/category-%E6%B0%91%E4%BA%8B.ics");
  assert.equal(feedUrl("/data", "all.ics"), "/data/feeds/all.ics");
});
