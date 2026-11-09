import { test } from "node:test";
import assert from "node:assert/strict";
import type { Amendment, BlockChange } from "../../scripts/extract/types.ts";
import { amendmentDescription, amendmentStaticHtml, legacyAmendmentPath } from "./amendment.ts";

const block = (n: number): BlockChange =>
  ({
    key: `第${n}条`,
    heading: `第${n}条`,
    op: "modified",
    context: [],
    segments: [[0, "あ".repeat(1000)], [1, "い"]],
  }) as unknown as BlockChange;

const amendment = (blocks: number): Amendment =>
  ({
    key: "429AC0000000044_20200401",
    branch: "main",
    amendmentLawId: "429AC0000000044",
    amendmentLawNum: "平成二十九年法律第四十四号",
    title: "民法の一部を改正する法律",
    enforced: "2020-04-01",
    enforcedText: null,
    promulgated: "2017-06-02",
    skippedRevisions: [],
    files: [
      {
        lawId: "129AC0000000089",
        title: "民法",
        lawNum: "明治二十九年法律第八十九号",
        kind: "amended",
        additions: 1,
        deletions: 0,
        blocks: Array.from({ length: blocks }, (_, i) => block(i + 1)),
      },
    ],
  }) as unknown as Amendment;

test("amendmentStaticHtml renders every block that fits the budget", () => {
  const full = amendmentStaticHtml(amendment(5), 1_000_000);
  assert.equal(full.complete, true);
  assert.equal(full.html.match(/<section class="card/g)?.length, 5);
  assert.ok(!full.html.includes("data-rest"));

  const cut = amendmentStaticHtml(amendment(50), 40_000);
  assert.equal(cut.complete, false);
  const shown = cut.html.match(/<section class="card/g)?.length ?? 0;
  assert.ok(shown > 0 && shown < 50, `${shown} blocks shown`);
  assert.match(cut.html, new RegExp(`残り ${50 - shown} か所の差分を読み込んでいます`));
  assert.ok(new TextEncoder().encode(cut.html).length < 45_000);
});

test("amendmentDescription names the amending law and the day it came into force", () => {
  assert.equal(
    amendmentDescription(amendment(1)),
    "民法の一部を改正する法律（平成二十九年法律第四十四号）の2020年4月1日の施行で変わった条文を、改正前と改正後の新旧対照で見られます。",
  );
});

test("legacyAmendmentPath forwards /amendment/?k=<key> to the static page, keeping the fragment", () => {
  assert.equal(legacyAmendmentPath("?k=429AC0000000044_20200401", "#law-129AC0000000089"), "/amendment/429AC0000000044_20200401/#law-129AC0000000089");
  assert.equal(legacyAmendmentPath("?k=429AC0000000044_20200401", ""), "/amendment/429AC0000000044_20200401/");
  assert.equal(legacyAmendmentPath("", ""), null);
  assert.equal(legacyAmendmentPath("?k=../x", ""), null);
});
