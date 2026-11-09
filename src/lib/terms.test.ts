import { test } from "node:test";
import assert from "node:assert/strict";
import { definitionsIn, lawDefinitions } from "./terms.ts";

const terms = (text: string) => definitionsIn(text, "本則|第二条").map((d) => [d.term, d.form, d.text]);

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

test("（以下「X」という。）", () => {
  assert.deepEqual(terms("国は、地域において事業を行う者（以下「事業者」という。）の協力を求める。"), [["事業者", "ika", "地域において事業を行う者"]]);
  // a 、 before 又は does not end the phrase
  assert.deepEqual(terms("労働者が組織し、又は加入する団体（以下「労働団体」という。）"), [["労働団体", "ika", "労働者が組織し、又は加入する団体"]]);
  // nor does one between the nouns of an enumeration
  assert.deepEqual(terms("事業者は、土地、建物その他の工作物（以下「土地等」という。）を"), [["土地等", "ika", "土地、建物その他の工作物"]]);
  assert.deepEqual(terms("この場合において、国、地方公共団体及び事業者（以下「国等」という。）は"), [["国等", "ika", "国、地方公共団体及び事業者"]]);
  // the parenthesis can hold the definition itself
  assert.deepEqual(terms("暴力団員（法第二条第六号に規定する暴力団員をいう。以下「暴力団員」という。）"), [["暴力団員", "ika", "法第二条第六号に規定する暴力団員をいう"]]);
});

test("short names are not definitions", () => {
  // of a law
  assert.deepEqual(terms("独立行政法人通則法（平成十一年法律第百三号。以下「通則法」という。）"), []);
  // of a body: the term ends the name it shortens
  assert.deepEqual(terms("独立行政法人国立病院機構（以下「機構」という。）は、"), []);
  assert.deepEqual(terms("労働者が組織する労働組合（以下「組合」という。）"), []);
  // but a definition by reference ends with the term too
  assert.deepEqual(terms("第二条第六号に規定する暴力団員（以下「暴力団員」という。）"), [["暴力団員", "ika", "第二条第六号に規定する暴力団員"]]);
  // a phrase that leans on the text before it
  assert.deepEqual(terms("同項の期間（以下「指定の有効期間」という。）"), []);
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
  assert.deepEqual(terms("<td>ロ　発電用原子炉に燃料として使用する物（以下「燃料体」という。）</td>"), [["燃料体", "ika", "発電用原子炉に燃料として使用する物"]]);
  assert.deepEqual(terms("「災害」とは、暴風、<ruby>洪<rt>こう</rt></ruby>水をいう。"), [["災害", "toha", "暴風、<ruby>洪<rt>こう</rt></ruby>水をいう"]]);
});

test("lawDefinitions keeps one definition a term, from the main provisions, preferring とは", () => {
  const defs = lawDefinitions([
    { key: "題名", level: 1, text: "" },
    { key: "本則|第一条", level: 3, text: "事業を行う者（以下「事業者」という。）" },
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
