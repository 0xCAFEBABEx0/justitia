import assert from "node:assert/strict";
import { test } from "node:test";
import type { AmendmentSummary, LawSummary } from "../../scripts/extract/types.ts";
import { byCategory, byLaw, calendarEvents, feedItems, RSS_MAX_ITEMS, feedUrl, foldLine, icsCalendar, icsText, lawNames, rfc822, rssFeed, xmlText } from "./feeds.ts";

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
  assert.match(unfolded, /\r\nURL:https:\/\/anisotro\.pics\/amendment\/508AC0000000045_20270623\/#law-129AC0000000089\r\n/);
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

test("xmlText escapes markup", () => {
  assert.equal(xmlText(`a&b<c>"d"`), "a&amp;b&lt;c&gt;&quot;d&quot;");
});

test("rfc822 writes midnight in Japan with the right weekday", () => {
  assert.equal(rfc822("2026-06-24"), "Wed, 24 Jun 2026 00:00:00 +0900");
  assert.equal(rfc822("2027-01-01"), "Fri, 01 Jan 2027 00:00:00 +0900");
});

test("feedItems gives promulgations and entries into force of the past year, newest first", () => {
  const today = "2026-11-08";
  const items = feedItems(
    [
      amendment({ key: "b", promulgated: "2026-11-08", enforced: "2027-04-01" }),
      amendment({ key: "a", promulgated: "2026-04-01", enforced: "2026-11-08" }),
      amendment({ key: "old", promulgated: "2025-01-01", enforced: "2025-11-06" }),
      amendment({ key: "edge", promulgated: "2025-11-07", enforced: null }),
      amendment({ key: "same", promulgated: "2026-05-01", enforced: "2026-05-01" }),
    ],
    today,
  );
  assert.deepEqual(
    items.map((i) => `${i.amendment.key}:${i.kind}:${i.day}`),
    ["a:enforced:2026-11-08", "b:promulgated:2026-11-08", "same:enforced:2026-05-01", "a:promulgated:2026-04-01", "edge:promulgated:2025-11-07"],
  );
});

test("rssFeed writes valid, escaped, deterministic RSS", () => {
  const feed = {
    name: "民法の改正（Anisotropics）",
    description: "説明 & <注記>",
    pageUrl: "https://anisotro.pics/laws/129AC0000000089/",
    selfUrl: "https://data.anisotro.pics/feeds/law-129AC0000000089.xml",
    amendments: [amendment({ title: "A & B <改正>", promulgated: "2026-06-24", enforced: "2027-06-23" })],
    lawId: "129AC0000000089",
    today: "2026-11-08",
  };
  const xml = rssFeed(feed);
  assert.equal(xml, rssFeed(feed));
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"'));
  assert.ok(xml.includes("<description>説明 &amp; &lt;注記&gt;</description>"));
  assert.ok(xml.includes('<atom:link href="https://data.anisotro.pics/feeds/law-129AC0000000089.xml" rel="self"'));
  assert.ok(xml.includes("<lastBuildDate>Wed, 24 Jun 2026 00:00:00 +0900</lastBuildDate>"));
  assert.equal(xml.match(/<item>/g)?.length, 1);
  assert.ok(xml.includes("<title>公布：A &amp; B &lt;改正&gt;（2027年6月23日施行予定）</title>"));
  // The description is HTML inside XML: the title is escaped twice, the line breaks once.
  assert.ok(xml.includes("A &amp;amp; B &amp;lt;改正&amp;gt;"));
  assert.ok(xml.includes("&lt;br&gt;"));
  assert.ok(xml.includes('<guid isPermaLink="false">508AC0000000045_20270623-129AC0000000089-promulgated@anisotro.pics</guid>'));
  assert.ok(xml.includes("<link>https://anisotro.pics/amendment/508AC0000000045_20270623/#law-129AC0000000089</link>"));
});

test("rssFeed leaves out lastBuildDate when there is no item", () => {
  const xml = rssFeed({ name: "n", description: "d", pageUrl: "p", selfUrl: "s", amendments: [], today: "2026-11-08" });
  assert.ok(!xml.includes("<lastBuildDate>"));
  assert.ok(!xml.includes("<item>"));
});

test("rssFeed gives one item to an amendment in force on the day it is promulgated", () => {
  const xml = rssFeed({
    name: "n", description: "d", pageUrl: "p", selfUrl: "s", today: "2026-11-08",
    amendments: [amendment({ promulgated: "2026-05-01", enforced: "2026-05-01" })],
  });
  assert.equal(xml.match(/<item>/g)?.length, 1);
  assert.ok(xml.includes("<title>公布・施行：民法等の一部を改正する法律</title>"));
});

test("feedItems keeps at most RSS_MAX_ITEMS, but never cuts a day", () => {
  const today = "2026-11-08";
  const many = (day: string, n: number, prefix: string) =>
    Array.from({ length: n }, (_, i) => amendment({ key: `${prefix}${String(i).padStart(4, "0")}`, promulgated: null, enforced: day }));
  const items = feedItems([...many("2026-11-01", RSS_MAX_ITEMS - 10, "a"), ...many("2026-10-01", 20, "b"), ...many("2026-09-01", 5, "c")], today);
  // The 1 October day is cut into by the limit, so it is kept whole; 1 September goes.
  assert.equal(items.length, RSS_MAX_ITEMS + 10);
  assert.ok(items.every((i) => i.day >= "2026-10-01"));
  assert.equal(feedItems(many("2026-11-01", 50, "d"), today).length, 50);
});
