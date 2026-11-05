import assert from "node:assert/strict";
import { test } from "node:test";
import { diffBlocks, splitBlocks, toSegments } from "./blocks.ts";

const OLD = `# 刑法

前文

## 第一編　総則

### 第一章　通則

#### 第一条（国内犯）

この法律は、日本国内において罪を犯したすべての者に適用する。

#### 第二条（すべての者の国外犯）

旧二条

#### 第三条（国民の国外犯）

三条

## 附　則

### 第一条（施行期日）

旧附則一条

## 附　則（平成一五年七月一八日法律第一二二号）

### 第一条（施行期日）

平成一五年附則一条
`;

const NEW = OLD.replace("旧二条", "新二条")
  .replace("#### 第三条（国民の国外犯）\n\n三条\n\n", "")
  .replace("#### 第一条（国内犯）", "#### 第一条（国内犯の定義）")
  .replace("### 第一章　通則", "### 第一章　通則規定")
  .concat("\n## 附　則（令和七年六月一日法律第一号）\n\n### 第一条（施行期日）\n\n令和七年附則一条\n");

test("splitBlocks keys articles by scope and number", () => {
  const keys = splitBlocks(OLD).map((b) => b.key);
  assert.deepEqual(keys, [
    "題名",
    "本則|第一編",
    "本則|第一章",
    "本則|第一条",
    "本則|第二条",
    "本則|第三条",
    "附　則|",
    "附　則|第一条",
    "附　則（平成一五年七月一八日法律第一二二号）|",
    "附　則（平成一五年七月一八日法律第一二二号）|第一条",
  ]);
  const art2 = splitBlocks(OLD).find((b) => b.key === "本則|第二条")!;
  assert.deepEqual(art2.context, ["第一編　総則", "第一章　通則"]);
  assert.equal(art2.text, "旧二条");
});

test("diffBlocks finds modified, deleted and added blocks in order", () => {
  const { changes, additions, deletions } = diffBlocks(splitBlocks(OLD), splitBlocks(NEW));
  assert.deepEqual(
    changes.map((c) => [c.op, c.key]),
    [
      ["modified", "本則|第一章"],
      ["modified", "本則|第一条"],
      ["modified", "本則|第二条"],
      ["deleted", "本則|第三条"],
      ["added", "附　則（令和七年六月一日法律第一号）|"],
      ["added", "附　則（令和七年六月一日法律第一号）|第一条"],
    ],
  );
  assert.equal(changes[0].oldHeading, "第一章　通則");
  const caption = changes[1];
  assert.equal(caption.oldHeading, "第一条（国内犯）");
  assert.equal(caption.segments, undefined); // only the caption changed
  assert.deepEqual(changes[2].segments, [
    [-1, "旧"],
    [1, "新"],
    [0, "二条"],
  ]);
  assert.equal(changes[3].old, "三条");
  assert.equal(changes[4].new, "");
  // headings of 第一章 and 第一条 and the text of 第二条: +1 -1 each; 第三条 deleted: -2;
  // new 附則 heading (no text): +1; its 第一条: +2
  assert.deepEqual([additions, deletions], [6, 5]);
});

test("large blocks are stored as hunks", () => {
  const big = Array.from({ length: 5000 }, (_, i) => `行${i}`).join("\n");
  const oldBody = `# 法\n\n## 別表\n\n${big}\n`;
  const newBody = oldBody.replace("行2500\n", "行2500改\n");
  const [c] = diffBlocks(splitBlocks(oldBody), splitBlocks(newBody)).changes;
  assert.equal(c.op, "modified");
  assert.equal(c.segments, undefined);
  assert.equal(c.hunks?.length, 1);
  assert.deepEqual(c.hunks![0].lines.filter((l) => l[0] !== " "), ["-行2500", "+行2500改"]);
});

test("toSegments reconstructs both texts", () => {
  const cases: [string, string][] = [
    ["一項\n二項\n三項", "一項\n二項改\n三項"],
    ["一項", "一項\n二項"],
    ["一項\n二項", "一項"],
    ["前文", "後文"],
    ["", "新設"],
    ["一項\n二項\n三項", "零項\n一項\n三項\n四項"],
  ];
  for (const [o, n] of cases) {
    const { segments } = toSegments(o, n);
    const old = segments.filter(([op]) => op !== 1).map(([, t]) => t).join("");
    const neu = segments.filter(([op]) => op !== -1).map(([, t]) => t).join("");
    assert.equal(old, o);
    assert.equal(neu, n);
  }
});
