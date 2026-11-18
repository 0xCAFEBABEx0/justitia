import { test } from "node:test";
import assert from "node:assert/strict";
import { jpDataDate } from "./share.ts";

test("jpDataDate writes /data-date.txt's date the way jpDate does, and refuses anything else", () => {
  assert.equal(jpDataDate("2026-11-09\n"), "2026年11月9日");
  assert.equal(jpDataDate("2026-01-20"), "2026年1月20日");
  assert.equal(jpDataDate("<!doctype html>"), null);
  assert.equal(jpDataDate(""), null);
});
