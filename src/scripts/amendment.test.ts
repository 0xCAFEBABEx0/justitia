import { test } from "node:test";
import assert from "node:assert/strict";
import type { Amendment, BlockChange } from "../../scripts/extract/types.ts";
import { amendmentDescription, amendmentStaticHtml, egovRevisionUrl, graphUrl, legacyAmendmentPath, type AmendmentLinks } from "./amendment.ts";

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

test("egovRevisionUrl opens the law at a revision on e-Gov, only for a revision ID of that law", () => {
  assert.equal(
    egovRevisionUrl("413M60000080001", "413M60000080001_20261102_508M60000080030"),
    "https://laws.e-gov.go.jp/law/413M60000080001/20261102_508M60000080030",
  );
  // e-Gov's date for an undetermined revision, and the ID of an original text.
  assert.equal(
    egovRevisionUrl("335AC0000000036", "335AC0000000036_21171231_428AC0000000108"),
    "https://laws.e-gov.go.jp/law/335AC0000000036/21171231_428AC0000000108",
  );
  assert.equal(
    egovRevisionUrl("417CO0000000299", "417CO0000000299_20051001_000000000000000"),
    "https://laws.e-gov.go.jp/law/417CO0000000299/20051001_000000000000000",
  );
  assert.equal(egovRevisionUrl("413M60000080001", undefined), null);
  assert.equal(egovRevisionUrl("413M60000080001", "129AC0000000089_20200401_429AC0000000044"), null);
  assert.equal(egovRevisionUrl("413M60000080001", "413M60000080001_x\"><script>"), null);
});

test("each changed law links its text, the whole-text comparison and both e-Gov revisions", () => {
  const a = amendment(1);
  const links: AmendmentLinks = {
    laws: {
      "129AC0000000089": {
        before: "129AC0000000089_20190701_430AC0000000072",
        after: "129AC0000000089_20200401_429AC0000000044",
        from: "430AC0000000072_20190701",
      },
    },
  };
  const { html } = amendmentStaticHtml(a, 1_000_000, links);
  assert.ok(html.includes('href="/versions/?law=129AC0000000089&amp;at=429AC0000000044_20200401">改正後の条文</a>'));
  assert.ok(
    html.includes('href="/versions/?law=129AC0000000089&amp;from=430AC0000000072_20190701&amp;at=429AC0000000044_20200401">改正前と全文で比較</a>'),
  );
  assert.ok(html.includes('href="https://laws.e-gov.go.jp/law/129AC0000000089/20190701_430AC0000000072">e-Gov（改正前）</a>'));
  assert.ok(html.includes('href="https://laws.e-gov.go.jp/law/129AC0000000089/20200401_429AC0000000044">e-Gov（改正後）</a>'));
  assert.ok(html.includes('href="/graph/?laws=129AC0000000089">改正のグラフ</a>'));
  assert.ok(!html.includes("この法令だけ印刷"));

  // Without the law data (the page rendered from the amendment file alone), only what the amendment file gives.
  const bare = amendmentStaticHtml(a, 1_000_000).html;
  assert.ok(bare.includes("改正後の条文") && !bare.includes("全文で比較") && !bare.includes("e-Gov（"));
});

test("a repeal gets no e-Gov link, and the graph takes the laws given or the laws changed", () => {
  const a = amendment(0);
  a.files = [
    { ...a.files[0], kind: "repealed", blocks: undefined },
    { ...a.files[0], lawId: "140AC0000000045", title: "刑法", kind: "amended" },
  ];
  const html = amendmentStaticHtml(a, 1_000_000, {
    laws: { "129AC0000000089": { before: "129AC0000000089_20190701_430AC0000000072", from: "430AC0000000072_20190701" } },
  }).html;
  assert.ok(!html.includes("e-Gov（"));
  assert.ok(html.includes('data-print-law="law-129AC0000000089"'));
  assert.equal(graphUrl(a), "/graph/?laws=129AC0000000089,140AC0000000045");
  assert.equal(graphUrl(a, { laws: {}, graph: ["129AC0000000089", "140AC0000000045", "129AC0000000089"] }), "/graph/?laws=129AC0000000089,140AC0000000045");
  a.files = Array.from({ length: 20 }, (_, i) => ({ ...a.files[1], lawId: `L${i}` }));
  assert.equal(graphUrl(a).split(",").length, 12);
});
