import assert from "node:assert/strict";
import { test } from "node:test";
import { blockScope, citationHeading, citationText, shareToolsHtml, shareUrl, titledText } from "./share.ts";

const URL_ = "https://anisotro.pics/laws/129AC0000000089/#本則|第九十条";

test("shareUrl encodes the title and the URL", () => {
  assert.equal(
    shareUrl("x", "民法 第九十条", URL_),
    `https://x.com/intent/tweet?text=${encodeURIComponent("民法 第九十条")}&url=${encodeURIComponent(URL_)}`,
  );
  assert.equal(shareUrl("line", "民法", URL_), `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(URL_)}`);
  const mail = shareUrl("mail", "民法 & 商法", URL_);
  assert.ok(mail.startsWith("mailto:?subject=%E6%B0%91%E6%B3%95%20%26%20"));
  assert.ok(mail.includes(`&body=${encodeURIComponent(`民法 & 商法\n${URL_}`)}`));
});

test("titledText puts the site name after the title", () => {
  assert.equal(titledText("民法", "https://anisotro.pics/laws/x/"), "民法 | Anisotropics\nhttps://anisotro.pics/laws/x/");
});

test("blockScope names the 附則 a block belongs to, and nothing for the main provisions", () => {
  assert.equal(blockScope("本則|第九十条"), "");
  assert.equal(blockScope("附　則（昭和二二年四月一六日法律第六一号）|第一条"), "附則（昭和二二年四月一六日法律第六一号）");
  assert.equal(blockScope("附　則|"), "附則");
  assert.equal(blockScope(""), "");
});

test("citationHeading reads like a citation in a memo", () => {
  assert.equal(
    citationHeading({ law: "民法", num: "明治二十九年法律第八十九号", key: "本則|第九十条", heading: "第九十条（公序良俗）" }),
    "民法（明治二十九年法律第八十九号）第九十条（公序良俗）",
  );
  assert.equal(
    citationHeading({ law: "民法", key: "附　則（昭和二二年四月一六日法律第六一号）|第一条", heading: "第一条" }),
    "民法附則（昭和二二年四月一六日法律第六一号）第一条",
  );
});

test("citationText tidies the body and says where the text came from", () => {
  const text = citationText({
    law: "民法",
    num: "明治二十九年法律第八十九号",
    key: "本則|第九十条",
    heading: "第九十条（公序良俗）",
    body: "\n  公の秩序又は善良の風俗に反する法律行為は、無効とする。  \n\n\n\n",
    asOf: "2026年11月8日時点の現行条文",
    url: URL_,
  });
  assert.equal(
    text,
    [
      "民法（明治二十九年法律第八十九号）第九十条（公序良俗）",
      "公の秩序又は善良の風俗に反する法律行為は、無効とする。",
      "",
      `出典：Anisotropics（2026年11月8日時点の現行条文）${URL_}`,
      "※自動生成した非公式のテキストです。正式な条文は e-Gov 法令検索で確認してください。",
    ].join("\n"),
  );
});

test("shareToolsHtml is hidden in print and holds every action the script handles", () => {
  const html = shareToolsHtml("ml-auto");
  assert.match(html, /print:hidden ml-auto/);
  for (const attr of ['data-share-copy="url"', 'data-share-copy="titled"', 'data-share-to="mail"', 'data-share-to="x"', 'data-share-to="line"', "data-share-native", "data-print"]) {
    assert.ok(html.includes(attr), attr);
  }
});
