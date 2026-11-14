import { test } from "node:test";
import assert from "node:assert/strict";
import { articleLabel, definitionGroups, qualifiers, termUrl, type Term, type TermLaw } from "./term-index.ts";

test("articleLabel", () => {
  assert.equal(articleLabel("本則|第二条"), "第二条");
  assert.equal(articleLabel("本則|第一章|第二条の三#2"), "第二条の三");
});

test("termUrl encodes the term", () => {
  assert.equal(termUrl("児童"), "/terms/%E5%85%90%E7%AB%A5/");
});

test("definitionGroups groups laws by the wording of the definition", () => {
  const law = (id: string, text: string, items?: string[]): TermLaw => ({
    id,
    title: id,
    dir: "act",
    def: { term: "児童", form: "toha", text, block: "本則|第二条", ...(items ? { items } : {}) },
    href: `/laws/${id}/`,
    article: "第二条",
  });
  const t: Term = {
    term: "児童",
    acts: 4,
    laws: [law("a", "十八歳未満の者をいう"), law("b", "二十歳未満の者をいう"), law("c", "十八歳未満の者をいう"), law("d", "十八歳未満の者をいう", ["一 x"])],
  };
  assert.deepEqual(
    definitionGroups(t).map((g) => g.laws.map((l) => l.id)),
    [["a", "c"], ["b"], ["d"]],
  );
});

test("qualifiers: what a reference adds in parentheses, without the law number or a short name", () => {
  assert.equal(qualifiers("法人税法（昭和四十年法律第三十四号）第二条第四号に規定する外国法人"), "");
  assert.equal(qualifiers("栄養士法（昭和二十二年法律第二百四十五号。以下「法」という。）第五条の三第四号に規定する学校"), "");
  assert.equal(qualifiers("道路運送車両法（以下「法」という。）第二条第二項に規定する自動車"), "");
  assert.equal(qualifiers("法人税法第二条第四号に規定する外国法人（公益法人等を除く。）をいう"), "公益法人等を除く。");
});

test("definitionGroups groups references to the same provision, but not across a qualification", () => {
  const source = { law: "法人税法", provision: "第二条第四号" };
  const law = (id: string, text: string): TermLaw => ({ id, title: id, dir: "act", def: { term: "外国法人", form: "ika", text, block: "本則|第二条" }, href: `/laws/${id}/`, article: "第二条", source });
  const t: Term = {
    term: "外国法人",
    acts: 3,
    laws: [
      law("a", "法人税法（昭和四十年法律第三十四号）第二条第四号に規定する外国法人"),
      law("b", "法人税法第二条第四号に規定する外国法人（公益法人等を除く。）"),
      law("c", "法人税法第二条第四号に規定する外国法人"),
    ],
  };
  assert.deepEqual(
    definitionGroups(t).map((g) => g.laws.map((l) => l.id)),
    [["a", "c"], ["b"]],
  );
});
