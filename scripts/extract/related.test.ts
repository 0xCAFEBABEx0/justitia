import assert from "node:assert/strict";
import { test } from "node:test";
import { computeRelated } from "./related.ts";
import type { AmendmentSummary } from "./types.ts";

const a = (key: string, ids: string[]): AmendmentSummary => ({
  key,
  branch: "main",
  amendmentLawNum: "",
  title: key,
  enforced: "2020-01-01",
  promulgated: null,
  laws: ids.map((id) => ({ id, title: `法${id}`, kind: "amended" })),
  additions: 0,
  deletions: 0,
});

test("computeRelated counts shared amendments and skips omnibus ones", () => {
  const omnibus = a("big", Array.from({ length: 50 }, (_, i) => `X${i}`).concat(["A", "B"]));
  const rel = computeRelated([a("1", ["A", "B"]), a("2", ["A", "B", "C"]), a("3", ["A"]), omnibus]);
  assert.deepEqual(rel.get("A"), [
    { id: "B", title: "法B", count: 2 },
    { id: "C", title: "法C", count: 1 },
  ]);
  assert.equal(rel.has("X0"), false);
});
