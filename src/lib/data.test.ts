import assert from "node:assert/strict";
import { test } from "node:test";
import { jstDate, kanaRow, OTHER_ROW } from "./data.ts";
import type { LawSummary } from "../../scripts/extract/types.ts";

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
  assert.equal(jstDate("2026-12-31T21:30:00.000Z"), "2027-01-01"); // the daily publish, 06:30 JST
  assert.equal(jstDate(new Date("2026-03-29T12:00:00Z")), "2026-03-29");
});
