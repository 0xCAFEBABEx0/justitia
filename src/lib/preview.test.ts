import { test } from "node:test";
import assert from "node:assert/strict";
import { amendmentKeyOfPath, PREVIEW_HEADERS_RULE, withPreviewHeaders } from "./preview.ts";

test("withPreviewHeaders appends one noindex rule for every path", () => {
  const site = "# comment\n/_astro/*\n  Cache-Control: public, max-age=31536000, immutable\n\n";
  const out = withPreviewHeaders(site);
  assert.equal(out, "# comment\n/_astro/*\n  Cache-Control: public, max-age=31536000, immutable\n/*\n  X-Robots-Tag: noindex, nofollow\n");
  assert.ok(out.startsWith(site.trimEnd()), "the site's own rules stay as they are");
  assert.equal(withPreviewHeaders(""), PREVIEW_HEADERS_RULE);
});

test("amendmentKeyOfPath accepts only static amendment page paths", () => {
  assert.equal(amendmentKeyOfPath("/amendment/506M60000100085_20240527/"), "506M60000100085_20240527");
  assert.equal(amendmentKeyOfPath("/amendment/507AC0000000046_undetermined/"), "507AC0000000046_undetermined");
  assert.equal(amendmentKeyOfPath("/amendment/506M60000100085_20240527-2/"), "506M60000100085_20240527-2");
  assert.equal(amendmentKeyOfPath("/amendment/507AC0000000046_undetermined-12/"), "507AC0000000046_undetermined-12");
  assert.equal(amendmentKeyOfPath("/amendment/506M60000100085_20240527-/"), null);
  assert.equal(amendmentKeyOfPath("/amendment/"), null);
  assert.equal(amendmentKeyOfPath("/amendment/506M60000100085_20240527"), "506M60000100085_20240527");
  assert.equal(amendmentKeyOfPath("/amendment/506M60000100085_20240527-2"), "506M60000100085_20240527-2");
  assert.equal(amendmentKeyOfPath("/amendment"), null);
  assert.equal(amendmentKeyOfPath("/amendment/506M60000100085_20240527/x/"), null);
  assert.equal(amendmentKeyOfPath("/amendment/506M60000100085_20240527//"), null);
  assert.equal(amendmentKeyOfPath("/amendment/../laws/x_20240527/"), null);
  assert.equal(amendmentKeyOfPath("/amendment/%2e%2e_20240527/"), null);
  assert.equal(amendmentKeyOfPath("/laws/129AC0000000089/"), null);
});
