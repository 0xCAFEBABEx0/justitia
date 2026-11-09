import assert from "node:assert/strict";
import { test } from "node:test";
import { amendmentUrl, jstDate, kanaRow, OTHER_ROW } from "./data.ts";
const law = (kana) => ({ kana });
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
