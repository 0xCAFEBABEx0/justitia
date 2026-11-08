import assert from "node:assert/strict";
import { test } from "node:test";
import { collectRepealedLaws, lastTextBeforeRepeal, repealYear } from "./repealed-laws.ts";
import type { AmendmentSummary, FileChangeKind, LawRevision, LawSummary } from "../../scripts/extract/types.ts";

const amendment = (
  key: string,
  enforced: string | null,
  laws: [string, FileChangeKind][],
  { branch = "main", title = `title of ${key}` }: { branch?: "main" | "upcoming"; title?: string } = {},
): AmendmentSummary => ({
  key,
  branch,
  amendmentLawNum: `num of ${key}`,
  title,
  enforced,
  promulgated: null,
  laws: laws.map(([id, kind]) => ({ id, title: `title of ${id}`, kind })),
  additions: 0,
  deletions: 0,
});
type Summary = Pick<LawSummary, "title" | "num" | "dir" | "status">;
const summary = (id: string, dir: string, status: LawSummary["status"] = "repealed"): [string, Summary] => [
  id,
  { title: `law ${id}`, num: `num ${id}`, dir, status },
];

test("collectRepealedLaws tells how each law was repealed, newest first, 法律 before 政令 on one day", () => {
  const laws = new Map([
    summary("OLD", "act"),
    summary("NEW", "act", "in_force"),
    summary("CO1", "cabinet-order"),
    summary("M1", "ministerial-ordinance"),
    summary("M2", "ministerial-ordinance"),
  ]);
  const list = collectRepealedLaws(
    [
      // A new law replaces the old one, and amends another law on the way.
      amendment("NEW_20261001", "2026-10-01", [["OLD", "repealed"], ["NEW", "enacted"], ["X", "amended"]]),
      // A government order made only to repeal two others.
      amendment("R1_20261001", "2026-10-01", [["CO1", "repealed"], ["M1", "repealed"]], { title: "〇〇令等を廃止する政令" }),
      amendment("A1_20250401", "2025-04-01", [["M2", "repealed"], ["Y", "amended"]], { title: "〇〇法の一部を改正する法律" }),
    ],
    laws,
    ["act", "cabinet-order", "ministerial-ordinance"],
  );
  assert.deepEqual(list.map((l) => [l.id, l.way]), [
    ["OLD", "new_law"],
    ["CO1", "repeal_law"],
    ["M1", "repeal_law"],
    ["M2", "other"],
  ]);
  assert.deepEqual(list[0].newLaw, { id: "NEW", title: "law NEW" });
  assert.equal(list[0].alsoRepeals, 0);
  assert.equal(list[0].num, "num OLD");
  assert.equal(list[1].newLaw, null);
  assert.equal(list[1].alsoRepeals, 1);
  assert.equal(list[3].amendment, "A1_20250401");
});

test("collectRepealedLaws counts a new law coming into force in stages as a new law", () => {
  // A new law already in force (enacted earlier) repeals an old one when its next part comes into force.
  const laws = new Map([summary("OLD", "act"), summary("NEW", "act", "in_force")]);
  const [l] = collectRepealedLaws([amendment("NEW_20260401", "2026-04-01", [["OLD", "repealed"], ["NEW", "amended"]])], laws);
  assert.equal(l.way, "new_law");
  assert.deepEqual(l.newLaw, { id: "NEW", title: "law NEW" });
});

test("collectRepealedLaws knows a new law enacted in the same commit, even without its summary", () => {
  const laws = new Map([summary("OLD", "act")]);
  const [l] = collectRepealedLaws([amendment("NEW_20260401", "2026-04-01", [["OLD", "repealed"], ["NEW", "enacted"]])], laws);
  assert.equal(l.way, "new_law");
  assert.deepEqual(l.newLaw, { id: "NEW", title: "title of NEW" });
});

test("collectRepealedLaws leaves out upcoming changes and laws in force again", () => {
  const laws = new Map([summary("A", "act"), summary("B", "act", "in_force")]);
  const list = collectRepealedLaws(
    [
      amendment("X_20200101", "2020-01-01", [["B", "repealed"]]),
      amendment("Y_20300101", "2030-01-01", [["A", "repealed"]], { branch: "upcoming" }),
    ],
    laws,
  );
  assert.deepEqual(list, []);
});

test("collectRepealedLaws keeps the last repeal of a law repealed twice", () => {
  const laws = new Map([summary("A", "act")]);
  for (const order of [
    ["X_20200101", "Y_20220101"],
    ["Y_20220101", "X_20200101"],
  ]) {
    const all = {
      X_20200101: amendment("X_20200101", "2020-01-01", [["A", "repealed"]]),
      Y_20220101: amendment("Y_20220101", "2022-01-01", [["A", "repealed"]]),
    } as Record<string, AmendmentSummary>;
    const list = collectRepealedLaws(order.map((k) => all[k]), laws);
    assert.deepEqual(list.map((l) => l.amendment), ["Y_20220101"]);
  }
});

test("repealYear is the year of the repeal", () => {
  assert.equal(repealYear({ enforced: "2026-10-01" }), "2026");
  assert.equal(repealYear({ enforced: null }), "undetermined");
});

test("lastTextBeforeRepeal is the revision in force just before the repeal", () => {
  const rev = (amendment: string, kind: FileChangeKind, branch: "main" | "upcoming" = "main") =>
    ({ amendment, kind, branch }) as LawRevision;
  assert.equal(lastTextBeforeRepeal([rev("a", "coverage_start"), rev("b", "amended"), rev("c", "repealed")]), "b");
  assert.equal(lastTextBeforeRepeal([rev("a", "enacted"), rev("c", "repealed"), rev("u", "amended", "upcoming")]), "a");
  assert.equal(lastTextBeforeRepeal([rev("c", "repealed")]), null);
  assert.equal(lastTextBeforeRepeal([rev("a", "enacted"), rev("b", "amended")]), null);
});
