import { test } from "node:test";
import assert from "node:assert/strict";
import { llmsTxt } from "./llms-txt.ts";
import { NAV_GROUPS } from "./nav.ts";
import { SITE_NAME, SOURCE_REPO } from "./site.ts";

const text = llmsTxt({ site: "https://anisotro.pics", updated: "2026年11月15日", lawsInForce: 9405 });

test("llms.txt starts with the site name and a one-line summary, as llmstxt.org asks", () => {
  const lines = text.split("\n");
  assert.equal(lines[0], `# ${SITE_NAME}`);
  assert.equal(lines[1], "");
  assert.match(lines[2], /^> \S/);
  assert.equal(text.match(/^# /gm)?.length, 1);
});

test("llms.txt links every page of the find, change and stats menus with absolute URLs", () => {
  for (const g of NAV_GROUPS.filter((g) => g.id !== "about")) {
    for (const i of g.items) assert.ok(text.includes(`[${i.label}](https://anisotro.pics${i.href})`), i.href);
  }
  for (const [, url] of text.matchAll(/\]\(([^)]+)\)/g)) assert.match(url, /^https:\/\//);
});

test("llms.txt keeps the attribution, the licenses and the disclaimer", () => {
  assert.match(text, /^## 出典とライセンス$/m);
  assert.ok(text.includes("出典：e-Gov 法令検索（https://laws.e-gov.go.jp/）、PDL1.0"));
  assert.ok(text.includes(`houritsu（${SOURCE_REPO}、CC BY 4.0）`));
  assert.ok(text.includes("AGPL"));
  assert.ok(text.includes("誤りを含むことがあります"));
  assert.ok(text.includes("一切の責任を負いません（https://anisotro.pics/about/#disclaimer）"));
  assert.ok(text.includes("現行の法令 9,405 件"));
});

test("llms.txt never shows the project's internal name", () => {
  // The source code link is the repository URL, as in the footer; no other mention is allowed.
  assert.equal(text.replaceAll("github.com/0xCAFEBABEx0/justitia", "").toLowerCase().includes("justitia"), false);
});
