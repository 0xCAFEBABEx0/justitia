import assert from "node:assert/strict";
import { test } from "node:test";
import { lawSummary, topCitations, type LawSummaryFacts } from "./law-summary.ts";

const base: LawSummaryFacts = {
  name: "民法",
  num: "明治二十九年法律第八十九号",
  type: "法律",
  enforced: "1898年7月16日",
  amendments: 31,
  latest: { enforced: "2026年4月1日", title: "民法等の一部を改正する法律", href: "/amendment/506AC0000000033_20260401/#law-129AC0000000089" },
  unamended: false,
  upcoming: 5,
  bills: 0,
  citedBy: 1234,
  cites: 12,
  terms: 45,
};

const plain = (parts: { text: string }[]) => parts.map((p) => p.text).join("");

test("lawSummary writes the facts of a law in sentences", () => {
  assert.equal(
    plain(lawSummary(base)),
    "民法は、明治二十九年法律第八十九号の法律です。1898年7月16日に施行されました。" +
      "これまでに 31 件改正され、最後の改正は2026年4月1日施行の民法等の一部を改正する法律です。" +
      "まだ施行されていない改正が 5 件あります。" +
      "この法律は 12 の法令を引用し、1,234 の法令から引用されています。" +
      "ほかの法令でも定義されている用語を 45 語定義しています。",
  );
});

test("lawSummary leaves out a law number that is not 第…号", () => {
  const facts = { ...base, name: "日本国憲法", num: "昭和二十一年憲法", type: "憲法", enforced: "1947年5月3日", amendments: 0, latest: null, unamended: true, upcoming: 0, citedBy: 0, cites: 0, terms: 0 };
  assert.equal(plain(lawSummary(facts)), "日本国憲法は、1947年5月3日に施行された憲法です。制定されてから一度も改正されていません。");
});

test("lawSummary links the last amendment and each count to its list", () => {
  const links = lawSummary({ ...base, bills: 2 }).filter((p) => p.href).map((p) => [p.text, p.href]);
  assert.deepEqual(links, [
    ["民法等の一部を改正する法律", base.latest!.href],
    ["審議中の改正案が 2 件", "#bills"],
    ["12 の法令を引用", "#cites"],
    ["1,234 の法令から引用", "#cited-by"],
    ["用語を 45 語", "#terms"],
  ]);
});

test("lawSummary leaves out what the law does not have", () => {
  const facts = { ...base, enforced: null, amendments: 0, latest: null, upcoming: 0, citedBy: 0, cites: 0, terms: 0 };
  assert.equal(plain(lawSummary(facts)), "民法は、明治二十九年法律第八十九号の法律です。");
  assert.equal(plain(lawSummary({ ...facts, unamended: true })), "民法は、明治二十九年法律第八十九号の法律です。制定されてから一度も改正されていません。");
  assert.equal(plain(lawSummary({ ...facts, citedBy: 3 })), "民法は、明治二十九年法律第八十九号の法律です。この法律は 3 の法令から引用されています。");
  assert.equal(plain(lawSummary({ ...facts, cites: 3 })), "民法は、明治二十九年法律第八十九号の法律です。この法律は 3 の法令を引用しています。");
  assert.equal(plain(lawSummary({ ...facts, amendments: 2 })), "民法は、明治二十九年法律第八十九号の法律です。これまでに 2 件改正されています。");
});

test("topCitations puts the constitution and Acts first, the most cited first within a type", () => {
  const laws = [
    { id: "a", title: "A令", num: "", dir: "cabinet-order" },
    { id: "b", title: "B法", num: "", dir: "act" },
    { id: "c", title: "C法", num: "", dir: "act" },
    { id: "d", title: "憲法", num: "", dir: "constitution" },
    { id: "e", title: "E規則", num: "", dir: "unknown" },
  ];
  const byId = new Map(laws.map((l) => [l.id, l]));
  const cited: Record<string, number> = { a: 100, b: 1, c: 5, d: 0, e: 50 };
  const order = ["constitution", "act", "cabinet-order"];
  const ids = (n: number) => topCitations(["a", "b", "c", "d", "e", "missing"], byId, (id) => cited[id] ?? 0, order, n).map((l) => l.id);
  assert.deepEqual(ids(10), ["d", "c", "b", "a", "e"]);
  assert.deepEqual(ids(2), ["d", "c"]);
});
