import assert from "node:assert/strict";
import { test } from "node:test";
import { sanitize } from "./render.ts";

test("sanitize keeps allowed markup and rebuilds attributes", () => {
  assert.equal(sanitize('<ruby>漢<rt>かん</rt></ruby><br/>'), "<ruby>漢<rt>かん</rt></ruby><br>");
  assert.equal(sanitize('<td colspan="2" style="x">a</td>'), '<td colspan="2">a</td>');
  assert.equal(
    sanitize('<a href="https://example.jp/" onclick="x()">l</a>'),
    '<a class="link link-primary" href="https://example.jp/" rel="noopener" target="_blank">l</a>',
  );
  assert.equal(sanitize('<a href="javascript:alert(1)">l</a>'), "<a>l</a>");
});

test("sanitize escapes disallowed and malformed tags", () => {
  assert.equal(sanitize("<script>alert(1)</script>"), "&lt;script&gt;alert(1)&lt;/script&gt;");
  // A `<` inside a quoted attribute must not let the outer tag through.
  const out = sanitize('<img src=x onerror=alert(1) title="<span>">');
  assert.doesNotMatch(out, /<img/);
  assert.equal(out, "&lt;img src=x onerror=alert(1) title=&quot;&lt;span&gt;&quot;&gt;");
  assert.equal(sanitize('<span title="a>b" onclick="x">t</span>'), "<span>t</span>");
  assert.equal(sanitize("<svg/onload=alert(1)>"), "&lt;svg/onload=alert(1)&gt;");
  assert.equal(sanitize("a < b > c &amp; d"), "a &lt; b &gt; c &amp; d");
});
