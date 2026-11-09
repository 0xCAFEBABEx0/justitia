import { test } from "node:test";
import assert from "node:assert/strict";
import { articleLabel, definitionGroups, termUrl, type Term, type TermLaw } from "./term-index.ts";

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
