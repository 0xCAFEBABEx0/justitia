import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { dataVersion } from "./data-version.ts";

async function tree(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "data-version-"));
  for (const sub of ["amendments", "laws", "history", "timeline"]) await mkdir(join(dir, sub));
  for (const [path, body] of Object.entries(files)) await writeFile(join(dir, path), body);
  return dir;
}

test("dataVersion depends only on the fetched files' names and content", async () => {
  const base = { "amendments/a.json": "1", "laws/x.json": "2", "history/x.json": "3" };
  const dirs = await Promise.all([
    tree(base),
    tree(base),
    tree({ ...base, "timeline/2020.json": "not fetched", "meta.json": "{}" }),
    tree({ ...base, "laws/x.json": "changed" }),
    tree({ ...base, "laws/y.json": "added" }),
    // Same bytes split differently between two files.
    tree({ ...base, "amendments/a.json": "", "amendments/b.json": "1" }),
  ]);
  try {
    const [v1, v2, v3, changed, added, moved] = await Promise.all(dirs.map(dataVersion));
    assert.match(v1, /^[0-9a-f]{16}$/);
    assert.equal(v2, v1);
    assert.equal(v3, v1);
    assert.notEqual(changed, v1);
    assert.notEqual(added, v1);
    assert.notEqual(moved, v1);
  } finally {
    await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
  }
});
