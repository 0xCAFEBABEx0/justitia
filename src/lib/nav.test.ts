import { test } from "node:test";
import assert from "node:assert/strict";
import { currentGroup, isCurrent, NAV_GROUPS, type NavKey } from "./nav.ts";

test("every nav key belongs to exactly one group", () => {
  const keys: NavKey[] = ["laws", "new", "upcoming", "bills", "repealed", "timeline", "graph", "stats", "terms", "search", "about"];
  for (const k of keys) assert.equal(NAV_GROUPS.filter((g) => g.keys.includes(k)).length, 1, k);
  assert.equal(currentGroup("terms")?.id, "find");
  assert.equal(currentGroup("graph")?.id, "change");
  assert.equal(currentGroup(undefined), undefined);
});

test("menu links are site paths with a trailing slash, each listed once", () => {
  const hrefs = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href));
  assert.equal(new Set(hrefs).size, hrefs.length);
  for (const h of hrefs) assert.match(h, /^\/([a-z-]+\/)*(#[a-z]+)?$/, h);
});

test("isCurrent matches the page's path but never a #fragment link", () => {
  assert.equal(isCurrent("/stats/oldest/", "/stats/oldest/"), true);
  assert.equal(isCurrent("/stats/", "/stats/oldest/"), false);
  assert.equal(isCurrent("/browse/#category", "/browse/"), false);
});
