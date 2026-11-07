import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { brotliDecompressSync } from "node:zlib";
import { compressData, hasBrotliFix } from "./compress-data.ts";

test("hasBrotliFix accepts only Node.js releases with the CVE-2026-111497 fix", () => {
  for (const v of ["v22.23.4", "v22.23.10", "v22.24.0", "v24.22.1", "v24.23.0", "v26.12.1", "v26.13.0", "v27.0.0"]) {
    assert.equal(hasBrotliFix(v), true, v);
  }
  for (const v of ["v20.19.5", "v22.18.0", "v22.23.3", "v23.11.1", "v24.22.0", "v25.9.0", "v26.12.0", "nightly"]) {
    assert.equal(hasBrotliFix(v), false, v);
  }
});

test("compressData writes every fetched file as Brotli, deterministically, and nothing else", async () => {
  const data = await mkdtemp(join(tmpdir(), "compress-data-"));
  const [out1, out2] = [join(data, "out1"), join(data, "out2")];
  const files: Record<string, string> = {
    "amendments/a_20200101.json": JSON.stringify({ key: "a", text: "第一条　".repeat(5000) }),
    "laws/x.json": JSON.stringify({ id: "x", title: "民法" }),
    "history/x.json": JSON.stringify({ texts: [[2, "第一条", "本文".repeat(100)]], blocks: [] }),
    "history/empty.json": "",
  };
  try {
    for (const dir of ["amendments", "laws", "history", "timeline"]) await mkdir(join(data, dir));
    for (const [path, body] of Object.entries(files)) await writeFile(join(data, path), body);
    await writeFile(join(data, "timeline/2020.json"), "[]");
    await writeFile(join(data, "meta.json"), "{}");

    const stats = await compressData(data, out1);
    await compressData(data, out2);
    assert.equal(stats.files, 4);
    assert.ok(stats.compressed < stats.raw);
    assert.deepEqual((await readdir(out1)).sort(), ["amendments", "history", "laws"]);
    for (const [path, body] of Object.entries(files)) {
      const compressed = await readFile(join(out1, path));
      assert.equal(brotliDecompressSync(compressed).toString(), body, path);
      assert.deepEqual(await readFile(join(out2, path)), compressed, `${path} differs between runs`);
    }
  } finally {
    await rm(data, { recursive: true, force: true });
  }
});
