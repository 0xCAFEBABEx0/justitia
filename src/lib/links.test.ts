import assert from "node:assert/strict";
import { test } from "node:test";
import { findUrls, linkPieces, type Piece } from "./links.ts";

const urls = (s: string) => findUrls(s).map((l) => s.slice(l.start, l.end));
/** Pieces as [op, text, href or null], for comparing. */
const flat = (ps: Piece[]) => ps.map((p) => [p.op, p.text, p.link?.href ?? null]);

test("findUrls stops at markup, brackets and Japanese text", () => {
  assert.deepEqual(urls("[a.pdf](https://laws.e-gov.go.jp/api/2/attachment/x?src=./pict/a.pdf)"), [
    "https://laws.e-gov.go.jp/api/2/attachment/x?src=./pict/a.pdf",
  ]);
  assert.deepEqual(urls('<a href="https://example.jp/a.jpg">a.jpg</a>'), ["https://example.jp/a.jpg"]);
  assert.deepEqual(urls("（https://www.example.go.jp/）を参照。"), ["https://www.example.go.jp/"]);
  assert.deepEqual(urls("see https://example.jp/a."), ["https://example.jp/a"]);
  assert.deepEqual(urls("https://example.jp/a&lt;br&gt;"), ["https://example.jp/a"]);
  assert.deepEqual(urls("javascript:alert(1) ftp://example.jp/ https:// http://"), []);
});

test("findUrls decodes &amp; in the href only", () => {
  const [l] = findUrls("https://example.jp/?a=1&amp;b=2");
  assert.equal(l.href, "https://example.jp/?a=1&b=2");
  assert.equal(l.end, "https://example.jp/?a=1&amp;b=2".length);
});

// From the 2026-11-02 amendment of 425M60000008058: the attachment URL carries the revision.
const segs: [-1 | 0 | 1, string][] = [
  [0, "[a.pdf](https://e.jp/425_2026"],
  [-1, "0401"],
  [1, "1102"],
  [0, "_508?src=a.pdf)"],
];

test("linkPieces keeps a URL changed in the middle as one link on each side", () => {
  const after = linkPieces(segs, 1);
  assert.deepEqual(flat(after), [
    [0, "[a.pdf](", null],
    [0, "https://e.jp/425_2026", "https://e.jp/425_20261102_508?src=a.pdf"],
    [1, "1102", "https://e.jp/425_20261102_508?src=a.pdf"],
    [0, "_508?src=a.pdf", "https://e.jp/425_20261102_508?src=a.pdf"],
    [0, ")", null],
  ]);
  assert.equal(after[1].link, after[3].link);
  assert.deepEqual(flat(linkPieces(segs, -1)).map((p) => p[2]), [
    null,
    "https://e.jp/425_20260401_508?src=a.pdf",
    "https://e.jp/425_20260401_508?src=a.pdf",
    "https://e.jp/425_20260401_508?src=a.pdf",
    null,
  ]);
});

test("linkPieces in the inline view puts deleted text inside the new URL", () => {
  assert.deepEqual(flat(linkPieces(segs, 0)).map((p) => p[2]), [
    null,
    "https://e.jp/425_20261102_508?src=a.pdf",
    "https://e.jp/425_20261102_508?src=a.pdf",
    "https://e.jp/425_20261102_508?src=a.pdf",
    "https://e.jp/425_20261102_508?src=a.pdf",
    null,
  ]);
  // A URL that only the old text has is linked to the old URL.
  assert.deepEqual(flat(linkPieces([[0, "a "], [-1, "https://old.jp/"], [1, "b"]], 0)), [
    [0, "a ", null],
    [-1, "https://old.jp/", "https://old.jp/"],
    [1, "b", null],
  ]);
});

test("linkPieces in the inline view keeps deleted prose and other URLs out of the new URL", () => {
  // Old: "https://a.jp/x 参照 https://b.jp/ y", new: "https://a.jp/xy".
  const ps = linkPieces([[0, "https://a.jp/x"], [-1, " 参照 https://b.jp/ "], [0, "y"]], 0);
  assert.deepEqual(flat(ps), [
    [0, "https://a.jp/x", "https://a.jp/xy"],
    [-1, " 参照 ", null],
    [-1, "https://b.jp/", "https://b.jp/"],
    [-1, " ", null],
    [0, "y", "https://a.jp/xy"],
  ]);
});

test("linkPieces leaves text without URLs as it is", () => {
  assert.deepEqual(flat(linkPieces([[0, "第一条"], [1, "改正"]], 1)), [
    [0, "第一条", null],
    [1, "改正", null],
  ]);
});
