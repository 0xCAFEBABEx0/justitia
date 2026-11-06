import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

// The publish workflow caches the extracted data under a key that hashes the extractor's code and
// the package.json of each package it imports (not the whole package-lock.json). This keeps that
// list in step with the imports, so a new import cannot be left out of the key.
test("the publish cache key lists every package the extractor imports", async () => {
  const dir = import.meta.dirname;
  const imported = new Set<string>();
  for (const name of await readdir(dir)) {
    if (!name.endsWith(".ts") || name.endsWith(".test.ts")) continue;
    const code = await readFile(join(dir, name), "utf8");
    for (const [, spec] of code.matchAll(/\bfrom\s+"([^"]+)"/g)) {
      if (spec.startsWith(".") || spec.startsWith("node:")) continue;
      imported.add(spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]);
    }
  }
  const workflow = await readFile(join(dir, "../../.github/workflows/publish.yml"), "utf8");
  const key = workflow.match(/^\s*key: data-.*$/m)?.[0] ?? "";
  const keyed = new Set([...key.matchAll(/'node_modules\/(.+?)\/package\.json'/g)].map((m) => m[1]));
  assert.deepEqual([...keyed].sort(), [...imported].sort());
});
