import assert from "node:assert/strict";
import { test } from "node:test";
import { kanaRow, OTHER_ROW } from "./data.ts";
import type { LawSummary } from "../../scripts/extract/types.ts";

const law = (kana: string | null) => ({ kana }) as LawSummary;

test("kanaRow groups by the first kana and sends laws without a reading to 他", () => {
  assert.equal(kanaRow(law("みんぽう")), "ま");
  assert.equal(kanaRow(law("ケイホウ")), "か");
  assert.equal(kanaRow(law(null)), OTHER_ROW);
  assert.equal(kanaRow(law("")), OTHER_ROW);
  assert.equal(kanaRow(law("  ")), OTHER_ROW);
});
