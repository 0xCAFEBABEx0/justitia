import { test } from "node:test";
import assert from "node:assert/strict";
import { amendingLawNum, isUnknownAmendingLaw, UNKNOWN_AMENDING_LAW } from "./law-num.ts";

test("amendingLawNum shows 改正法令不明 for houritsu's all-zero placeholder", () => {
  assert.equal(amendingLawNum("000000000000000"), UNKNOWN_AMENDING_LAW);
  assert.equal(amendingLawNum("令和六年法律第五十二号"), "令和六年法律第五十二号");
  assert.equal(amendingLawNum(""), "");
});

test("isUnknownAmendingLaw matches only the all-zero ID", () => {
  assert.equal(isUnknownAmendingLaw("000000000000000"), true);
  assert.equal(isUnknownAmendingLaw("506AC0000000052"), false);
});
