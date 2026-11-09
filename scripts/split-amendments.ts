// Moves the static amendment pages out of dist/ into one directory per amendment Worker (scripts/amendment-shards.ts),
// so that the main Worker keeps fewer than 20,000 files and each amendment Worker gets its own pages:
//
//   dist/amendment/<key>/index.html → dist-amendments/<worker>/amendment/<key>/index.html
//
// Every amendment Worker also gets the site's 404 page, and the catch-all one (prefix "") a copy of the /amendment/
// page, which its route takes over from the main Worker. The main Worker keeps its own copy, so the page works
// before the routes exist too. Fails when a Worker would hold MAX_FILES_PER_WORKER files or more.
//
//   node scripts/split-amendments.ts [--dist dist] [--out dist-amendments]
import { cp, mkdir, readdir, rename, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { MAX_FILES_PER_WORKER, SHARDS, shardOf } from "./amendment-shards.ts";

const { values: opts } = parseArgs({
  options: { dist: { type: "string", default: "dist" }, out: { type: "string", default: "dist-amendments" } },
});
const dist = resolve(opts.dist!);
const out = resolve(opts.out!);

await rm(out, { recursive: true, force: true });
for (const s of SHARDS) await mkdir(join(out, s.name, "amendment"), { recursive: true });

const counts = new Map(SHARDS.map((s) => [s.name, 0]));
const entries = await readdir(join(dist, "amendment"), { withFileTypes: true });
for (const e of entries) {
  if (!e.isDirectory()) continue; // index.html, the /amendment/ page, stays in dist/
  const shard = shardOf(e.name);
  await rename(join(dist, "amendment", e.name), join(out, shard.name, "amendment", e.name));
  counts.set(shard.name, counts.get(shard.name)! + 1);
}

for (const s of SHARDS) {
  await cp(join(dist, "404.html"), join(out, s.name, "404.html"));
  let files = counts.get(s.name)! + 1;
  if (s.prefixes.includes("")) {
    await cp(join(dist, "amendment", "index.html"), join(out, s.name, "amendment", "index.html"));
    files++;
  }
  console.log(`${s.name}: ${files} files`);
  if (files >= MAX_FILES_PER_WORKER) {
    throw new Error(
      `${s.name} would hold ${files} files (limit ${MAX_FILES_PER_WORKER}; a Worker version holds at most 20,000): ` +
        "add a Worker for the newest years in scripts/amendment-shards.ts, its Wrangler config and its routes",
    );
  }
}
