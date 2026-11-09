import assert from "node:assert/strict";
import { test } from "node:test";
import { amendmentUrl, indexRevisions, jstDate, kanaRow, OTHER_ROW } from "./data.ts";
import type { LawRevision, LawSummary } from "../../scripts/extract/types.ts";

const law = (kana: string | null) => ({ kana }) as LawSummary;

test("kanaRow groups by the first kana and sends laws without a reading to 他", () => {
  assert.equal(kanaRow(law("みんぽう")), "ま");
  assert.equal(kanaRow(law("ケイホウ")), "か");
  assert.equal(kanaRow(law(null)), OTHER_ROW);
  assert.equal(kanaRow(law("")), OTHER_ROW);
  assert.equal(kanaRow(law("  ")), OTHER_ROW);
});

test("jstDate gives the date in Japan (UTC+9)", () => {
  assert.equal(jstDate("2026-11-06T14:59:59.999Z"), "2026-11-06");
  assert.equal(jstDate("2026-11-06T15:00:00.000Z"), "2026-11-07");
  assert.equal(jstDate("2026-12-31T20:17:00.000Z"), "2027-01-01"); // the daily publish, 05:17 JST
  assert.equal(jstDate(new Date("2026-03-29T12:00:00Z")), "2026-03-29");
});

test("amendmentUrl links the static amendment page", () => {
  assert.equal(amendmentUrl("429AC0000000044_20200401"), "/amendment/429AC0000000044_20200401/");
  assert.equal(amendmentUrl("508AC0000000045_undetermined"), "/amendment/508AC0000000045_undetermined/");
});

test("indexRevisions gives each amendment of a law the revision before it", () => {
  const rev = (amendment: string, revisionId: string | null) => ({ amendment, revisionId }) as LawRevision;
  const index = indexRevisions([
    {
      id: "L1",
      revisions: [rev("A_20200101", "L1_20200101_A"), rev("B_20210101", "L1_20210101_B"), rev("C_undetermined", "L1_21171231_C")],
    },
    { id: "L2", revisions: [rev("B_20210101", "L2_20210101_B"), rev("D_20220101", null)] },
  ]);
  assert.deepEqual(index.get("A_20200101"), { L1: { after: "L1_20200101_A" } });
  assert.deepEqual(index.get("B_20210101"), {
    L1: { after: "L1_20210101_B", before: "L1_20200101_A", from: "A_20200101" },
    L2: { after: "L2_20210101_B" },
  });
  assert.deepEqual(index.get("C_undetermined"), { L1: { after: "L1_21171231_C", before: "L1_20210101_B", from: "B_20210101" } });
  assert.deepEqual(index.get("D_20220101"), { L2: { before: "L2_20210101_B", from: "B_20210101" } });
});
