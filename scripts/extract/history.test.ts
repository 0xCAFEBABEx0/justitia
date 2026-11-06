import assert from "node:assert/strict";
import { test } from "node:test";
import { splitBlocks } from "./blocks.ts";
import { blocksAt, buildHistory, historyEntry, type HistoryEntry } from "./history.ts";

const versions = [
  "# 法\n\n## 第一条\n\nA\n\n## 第二条\n\nB\n",
  "# 法\n\n## 第一条\n\nA2\n\n## 第二条\n\nB\n",
  "# 法\n\n## 第一条\n\nA2\n\n## 第一条の二\n\nN\n\n## 第二条\n\nB\n",
  "# 法\n\n## 第二条\n\nB\n\n## 第一条\n\nA2\n", // moved
  "# 法\n\n## 第二条\n\nB3\n",
  "", // repealed
  "# 法\n\n## 第一条\n\nA\n\n## 第三条\n\nC\n", // back again
];

function texts(v: string): string[] {
  return splitBlocks(v).map((b) => `${b.key}|${b.level}|${b.heading}|${b.text}`);
}

test("buildHistory reproduces every revision", () => {
  const entries: HistoryEntry[] = [];
  let prev = splitBlocks("");
  versions.forEach((v, r) => {
    const blocks = v ? splitBlocks(v) : [];
    entries.push(historyEntry(r, prev, blocks, r === 0));
    prev = blocks;
  });
  const h = buildHistory(entries);
  versions.forEach((v, r) => {
    const got = blocksAt(h, r).map(([k, l, hd, t]) => `${k}|${l}|${hd}|${t}`);
    assert.deepEqual(got, v ? texts(v) : [], `revision ${r}`);
  });
  // Unchanged blocks are stored once.
  assert.equal(h.texts.filter(([, hd, t]) => hd === "第二条" && t === "B").length, 1);
});
