import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { extractorKey, importedPackages, lockedVersions } from "./cache-key.ts";

test("importedPackages lists npm packages, not node: modules or relative imports", () => {
  const source = [
    'import { readFile } from "node:fs/promises";',
    'import { parse } from "yaml";',
    'import * as Diff from "diff";',
    'import DiffMatchPatch from "diff-match-patch";',
    'import type { Thing } from "@scope/pkg/sub/path";',
    'import { blocks } from "./blocks.ts";',
    'const lazy = await import("lazy-pkg");',
  ].join("\n");
  assert.deepEqual(importedPackages(source).sort(), ["@scope/pkg", "diff", "diff-match-patch", "lazy-pkg", "yaml"]);
});

test("lockedVersions follows dependencies the way Node resolves them", () => {
  const lock = {
    packages: {
      "node_modules/a": { version: "1.0.0", dependencies: { b: "^2", c: "^1" } },
      "node_modules/b": { version: "2.0.0" },
      "node_modules/a/node_modules/c": { version: "1.5.0" },
      "node_modules/c": { version: "3.0.0" }, // not the one a uses
      "node_modules/astro": { version: "7.0.0" }, // not imported
    },
  };
  assert.deepEqual(lockedVersions(lock, ["a"]), ["a@1.0.0", "b@2.0.0", "c@1.5.0"]);
  assert.throws(() => lockedVersions(lock, ["missing"]), /missing .*not in package-lock.json/);
});

test("extractorKey ignores tests and other dependencies, and changes with the extractor's", async () => {
  const root = await mkdtemp(join(tmpdir(), "cache-key-"));
  await mkdir(join(root, "scripts/extract"), { recursive: true });
  const lock = (versions: Record<string, string>) =>
    JSON.stringify({ packages: Object.fromEntries(Object.entries(versions).map(([n, v]) => [`node_modules/${n}`, { version: v }])) });
  await writeFile(join(root, "scripts/extract/index.ts"), 'import { parse } from "yaml";\n');
  await writeFile(join(root, "package-lock.json"), lock({ yaml: "2.0.0", astro: "7.0.0" }));
  const key = await extractorKey(root);
  assert.match(key, /^[0-9a-f]{16}$/);

  await writeFile(join(root, "scripts/extract/index.test.ts"), "// a test\n");
  await writeFile(join(root, "package-lock.json"), lock({ yaml: "2.0.0", astro: "7.1.0", "@astrojs/sitemap": "3.0.0" }));
  assert.equal(await extractorKey(root), key);

  await writeFile(join(root, "package-lock.json"), lock({ yaml: "2.1.0", astro: "7.1.0" }));
  assert.notEqual(await extractorKey(root), key);

  await writeFile(join(root, "package-lock.json"), lock({ yaml: "2.0.0", astro: "7.1.0" }));
  await writeFile(join(root, "scripts/extract/index.ts"), 'import { parse } from "yaml"; // changed\n');
  assert.notEqual(await extractorKey(root), key);
});

test("extractorKey works on this repository", async () => {
  const root = join(import.meta.dirname, "../..");
  assert.match(await extractorKey(root), /^[0-9a-f]{16}$/);
  assert.equal(await extractorKey(root), await extractorKey(root));
});
