import assert from "node:assert/strict";
import { test } from "node:test";
import type { RawCommit } from "./git.ts";
import { sourceVersion, updatedAt } from "./source-version.ts";
import type { Branch } from "./types.ts";

function commit(sha: string, body: string, newBlob = "b1"): RawCommit {
  return {
    sha,
    author: "houritsu",
    date: "2026-11-02T00:00:00+09:00",
    subject: body.split("\n")[0],
    body,
    changes: [{ status: "M", oldBlob: "a1", newBlob, path: "laws/x/y.md" }],
  };
}

test("sourceVersion leaves out commit SHAs but covers content, messages and branches", () => {
  const base: [RawCommit, Branch][] = [
    [commit("1111", "改正A 施行\n\nEnforced: 2026-11-02"), "main"],
    [commit("2222", "改正B 施行\n\nEnforced: undetermined", "b2"), "upcoming"],
  ];
  const v = sourceVersion(base);
  assert.match(v, /^[0-9a-f]{16}$/);
  // A rewritten history: new SHAs, same content.
  assert.equal(sourceVersion(base.map(([c, b]): [RawCommit, Branch] => [{ ...c, sha: c.sha + "f" }, b])), v);
  // A corrected law text (new blob), message or branch changes it.
  assert.notEqual(sourceVersion([base[0], [commit("2222", "改正B 施行\n\nEnforced: undetermined", "b3"), "upcoming"]]), v);
  assert.notEqual(sourceVersion([base[0], [commit("2222", "改正B 施行\n\nEnforced: 2027-04-01", "b2"), "upcoming"]]), v);
  assert.notEqual(sourceVersion([base[0], [base[1][0], "main"]]), v);
  // A late revision inserted in the middle.
  assert.notEqual(sourceVersion([base[0], [commit("3333", "改正C 施行"), "main"], base[1]]), v);
});

test("updatedAt keeps the published date only for the same source version", () => {
  const now = "2026-11-13T01:15:01.000Z";
  assert.equal(updatedAt("abc 2026-11-02T19:10:00.000Z", "abc", now), "2026-11-02T19:10:00.000Z");
  assert.equal(updatedAt("abc 2026-11-02T19:10:00.000Z\n", "abc", now), "2026-11-02T19:10:00.000Z");
  assert.equal(updatedAt("abc 2026-11-02T19:10:00.000Z", "def", now), now);
  assert.equal(updatedAt("abc", "abc", now), now);
  assert.equal(updatedAt("abc not-a-date", "abc", now), now);
  assert.equal(updatedAt("", "abc", now), now);
  assert.equal(updatedAt(undefined, "abc", now), now);
});
