import { test } from "node:test";
import assert from "node:assert/strict";
import { definitionsIn, lawDefinitions, referenceOf, shortLawNames, type DefinitionContext } from "./terms.ts";

const ctx: DefinitionContext = {
  lawTitles: new Set(["暴力団員による不当な行為の防止等に関する法律", "地方自治法", "法人税法", "独立行政法人通則法", "道路交通法"]),
  shortNames: new Map([["通則法", "独立行政法人通則法"]]),
};
const terms = (text: string) => definitionsIn(text, "本則|第二条", ctx).map((d) => [d.term, d.form, d.text]);

test("「X」とは、…をいう", () => {
  assert.deepEqual(terms("この法律において「児童」とは、満十八歳に満たない者をいう。"), [["児童", "toha", "満十八歳に満たない者をいう"]]);
  // をいい、 goes on to another definition
  assert.deepEqual(terms("この法律で「船員」とは、船舶に乗り組む者をいい、「船舶」とは、日本船舶をいう。"), [
    ["船員", "toha", "船舶に乗り組む者をいう"],
    ["船舶", "toha", "日本船舶をいう"],
  ]);
  // A sentence that ends before をいう is not a definition.
  assert.deepEqual(terms("「届出」とは、前条の届出であつて、期間内にしたもの。"), []);
});

test("bracketless definitions of older laws need この法律で", () => {
  assert.deepEqual(terms("この法律で、児童とは、満十八歳に満たない者をいい、児童を左のように分ける。"), [["児童", "toha", "満十八歳に満たない者をいう"]]);
  assert.deepEqual(terms("前条の規定とは、別に定める規定をいう。"), []);
});

test("（以下「X」という。） is a definition only by reference to another law", () => {
  assert.deepEqual(terms("暴力団員による不当な行為の防止等に関する法律（平成三年法律第七十七号）第二条第六号に規定する暴力団員（以下「暴力団員」という。）"), [
    ["暴力団員", "ika", "暴力団員による不当な行為の防止等に関する法律（平成三年法律第七十七号）第二条第六号に規定する暴力団員"],
  ]);
  const [d] = definitionsIn("地方自治法第二百五十二条の十九第一項の指定都市（以下「指定都市」という。）", "本則|第二条", ctx);
  assert.deepEqual(d.source, { law: "地方自治法", provision: "第二百五十二条の十九第一項" });
  // the parenthesis can hold the definition itself
  assert.deepEqual(terms("暴力団員（法第二条第六号に規定する暴力団員をいう。以下「暴力団員」という。）"), [["暴力団員", "ika", "法第二条第六号に規定する暴力団員をいう"]]);
});

test("short names are not definitions", () => {
  // of a phrase of the text
  assert.deepEqual(terms("国は、地域において事業を行う者（以下「事業者」という。）の協力を求める。"), []);
  assert.deepEqual(terms("事業者は、土地、建物その他の工作物（以下「土地等」という。）を"), []);
  // of what is done under an article of the law, or another law
  assert.deepEqual(terms("第三十三条第一項の登録（以下「登録」という。）"), []);
  assert.deepEqual(terms("道路交通法第百八条の四第一項の規定による指定（以下「指定」という。）"), []);
  // of a reference that does not name the law by its title (法 in an order is the law it carries out)
  assert.deepEqual(terms("法第二条第六号に規定する暴力団員（以下「暴力団員」という。）"), []);
  // of a law
  assert.deepEqual(terms("独立行政法人通則法（平成十一年法律第百三号。以下「通則法」という。）"), []);
  // of a body
  assert.deepEqual(terms("独立行政法人国立病院機構（以下「機構」という。）は、"), []);
});

test("referenceOf", () => {
  // words before the title of the law are not part of the reference
  assert.deepEqual(referenceOf("当該外国法人の法人税法第二条第十四号に規定する株主等", "株主等", ctx), {
    source: { law: "法人税法", provision: "第二条第十四号" },
    start: 7,
  });
  // a short name the law defines
  assert.deepEqual(referenceOf("通則法第二十九条第二項第一号に規定する中期目標の期間", "中期目標の期間", ctx)?.source, {
    law: "独立行政法人通則法",
    provision: "第二十九条第二項第一号",
  });
  // 同法: the law named before it
  assert.deepEqual(referenceOf("地方自治法第二百五十二条の十九第一項の指定都市及び同法第二百五十二条の二十二第一項の中核市", "中核市", ctx), {
    source: { law: "地方自治法", provision: "第二百五十二条の二十二第一項" },
    start: 25,
  });
  // the phrase must end with the term
  assert.equal(referenceOf("地方自治法第二百五十二条の十九第一項の指定都市の区域", "区域", ctx), undefined);
});

test("shortLawNames", () => {
  assert.deepEqual(
    [...shortLawNames(["独立行政法人通則法（平成十一年法律第百三号。以下「通則法」という。）第二条", "機構（以下「機構」という。）"], ctx.lawTitles)],
    [["通則法", "独立行政法人通則法"]],
  );
});

test("X（…をいう。以下同じ。）", () => {
  assert.deepEqual(terms("国は、暴力団員（暴力団員による不当な行為の防止等に関する法律第二条第六号に規定する暴力団員をいう。以下同じ。）を"), [
    ["暴力団員", "paren", "暴力団員による不当な行為の防止等に関する法律第二条第六号に規定する暴力団員をいう"],
  ]);
  // a noun after a modifier is not the defined phrase
  assert.deepEqual(terms("その他の施設（別に定める施設をいう。以下同じ。）"), []);
});

test("items of a definition that refers to them", () => {
  const [d] = definitionsIn("この法律において「中小企業者」とは、次の各号のいずれかに該当する者をいう。\n\n- 一 会社\n\n- 二 個人\n\n次の文。", "本則|第二条");
  assert.deepEqual(d.items, ["一 会社", "二 個人"]);
  // nested items are kept, with the items after them
  const [n] = definitionsIn("この法律において「事業者」とは、次に掲げる者をいう。\n\n- 一 次のいずれかに該当する会社\n\n  - イ 株式会社\n\n  - ロ 合同会社\n\n- 二 個人", "本則|第二条");
  assert.deepEqual(n.items, ["一 次のいずれかに該当する会社", "  イ 株式会社", "  ロ 合同会社", "二 個人"]);
  // a definition in an item takes the items below it, not the items after it
  const inItem = definitionsIn("- 一 「事業者」とは、次に掲げる者をいう。\n\n  - イ 会社\n\n  - ロ 個人\n\n- 二 「消費者」とは、個人をいう。", "本則|第二条");
  assert.deepEqual(inItem.map((d) => [d.term, d.items]), [["事業者", ["イ 会社", "ロ 個人"]], ["消費者", undefined]]);
  // without its items (too many to show, or none found) a definition is left out
  const many = Array.from({ length: 31 }, (_, i) => `- ${"一二三四五六七八九"[i % 9]} 者${i}`).join("\n\n");
  assert.deepEqual(definitionsIn(`この法律において「事業者」とは、次に掲げる者をいう。\n\n${many}`, "本則|第二条"), []);
  assert.deepEqual(definitionsIn("この法律において「事業者」とは、次に掲げる者をいう。\n\n２ 次の項。", "本則|第二条"), []);
  // and so is one in parentheses, which never takes the items
  assert.deepEqual(terms("次に掲げる者（以下「事業者」という。）は、届出をしなければならない。\n\n- 一 会社"), []);
  assert.deepEqual(terms("国は、事業者（次に掲げる者をいう。以下同じ。）を\n\n- 一 会社"), []);
});

test("markup other than ruby is taken out; the marker of an item too", () => {
  assert.deepEqual(terms("<td>ロ　「燃料体」とは、発電用原子炉に燃料として使用する物をいう。</td>"), [["燃料体", "toha", "発電用原子炉に燃料として使用する物をいう"]]);
  assert.deepEqual(terms("「災害」とは、暴風、<ruby>洪<rt>こう</rt></ruby>水をいう。"), [["災害", "toha", "暴風、<ruby>洪<rt>こう</rt></ruby>水をいう"]]);
});

test("lawDefinitions keeps one definition a term, from the main provisions, preferring とは", () => {
  const defs = lawDefinitions([
    { key: "題名", level: 1, text: "" },
    { key: "本則|第一条", level: 3, text: "事業者（事業を行う者をいう。以下同じ。）" },
    { key: "本則|第二条", level: 3, text: "この法律において「事業者」とは、事業を営む者をいう。" },
    { key: "附則|第一条", level: 3, text: "この法律において「施行日」とは、公布の日をいう。" },
  ]);
  assert.deepEqual(defs.map((d) => [d.term, d.form, d.block]), [["事業者", "toha", "本則|第二条"]]);
});

test("items of a glossary article", () => {
  const text = [
    "この法律において、次の各号に掲げる用語の意義は、当該各号に定めるところによる。",
    "",
    "- 一 会社 株式会社、合名会社、合資会社又は合同会社をいう。",
    "",
    "- 三の二 子会社等 次のいずれかに該当する者をいう。",
    "",
    "  - イ 子会社",
    "",
    "  - ロ 会社以外の者",
    "",
    "    - （１） 組合",
    "",
    "  - ハ 個人",
    "",
    "- 四 公告方法 会社が公告をする方法",
  ].join("\n");
  const defs = definitionsIn(text, "本則|第二条");
  assert.deepEqual(defs.map((d) => [d.term, d.form, d.text, d.items]), [
    ["会社", "item", "株式会社、合名会社、合資会社又は合同会社をいう", undefined],
    ["子会社等", "item", "次のいずれかに該当する者をいう", ["イ 子会社", "ロ 会社以外の者", "  （１） 組合", "ハ 個人"]],
  ]);
});
