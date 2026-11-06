// Prints the part of the Publish workflow's data cache key that stands for the extractor:
//
//   node scripts/extract/cache-key.ts
//
// a hash of the extractor's source files (tests excluded) and of the exact versions, from
// package-lock.json, of the npm packages it imports and of their dependencies. A change to the
// site's own dependencies (Astro and the like) does not change it, so it keeps the cached data.

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

interface LockPackage {
  version?: string;
  dependencies?: Record<string, string>;
}
type Lock = { packages: Record<string, LockPackage> };

/** The npm packages a source file imports (not node: modules, not relative paths). */
export function importedPackages(source: string): string[] {
  const names = new Set<string>();
  for (const m of source.matchAll(/\b(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) {
    const spec = m[1];
    if (spec.startsWith(".") || spec.startsWith("/") || spec.startsWith("node:")) continue;
    const parts = spec.split("/");
    names.add(spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]);
  }
  return [...names];
}

/**
 * `name@version` for each package and everything it depends on, as npm installed them (resolved
 * the way Node does: the nearest node_modules/<name> up from the package that needs it). Throws
 * when a package is not in the lockfile.
 */
export function lockedVersions(lock: Lock, names: string[]): string[] {
  const seen = new Map<string, string>(); // lockfile path -> name@version
  const resolve = (name: string, from: string): void => {
    let dir = from;
    for (;;) {
      const path = `${dir ? `${dir}/` : ""}node_modules/${name}`;
      const pkg = lock.packages[path];
      if (pkg) {
        if (seen.has(path)) return;
        seen.set(path, `${name}@${pkg.version}`);
        for (const dep of Object.keys(pkg.dependencies ?? {})) resolve(dep, path);
        return;
      }
      if (!dir) throw new Error(`${name} (needed by ${from || "the extractor"}) is not in package-lock.json`);
      const up = dir.lastIndexOf("/node_modules/");
      dir = up < 0 ? "" : dir.slice(0, up);
    }
  };
  for (const name of names) resolve(name, "");
  return [...seen.values()].sort();
}

export async function extractorKey(root: string): Promise<string> {
  const dir = join(root, "scripts/extract");
  const files = (await readdir(dir, { recursive: true }))
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .sort();
  const hash = createHash("sha256");
  const packages = new Set<string>();
  for (const file of files) {
    const source = await readFile(join(dir, file), "utf8");
    hash.update(`${file}\0${source.length}\0${source}`);
    for (const name of importedPackages(source)) packages.add(name);
  }
  const lock = JSON.parse(await readFile(join(root, "package-lock.json"), "utf8")) as Lock;
  hash.update(lockedVersions(lock, [...packages].sort()).join("\n"));
  return hash.digest("hex").slice(0, 16);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(await extractorKey(join(dirname(fileURLToPath(import.meta.url)), "../..")));
}
