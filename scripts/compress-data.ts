// Brotli-compresses the files the pages fetch from the data domain, for the upload to R2.
//
//   node scripts/compress-data.ts <data dir> <output dir>
//   node scripts/compress-data.ts --file <input file> <output file>
//
// Writes <output dir>/<dir>/<name>.json for every <data dir>/<dir>/<name>.json, where <dir> is
// amendments, laws or history. The upload stores these bytes with `Content-Encoding: br`, so R2 holds
// them compressed (over 10 times smaller: history/ files repeat each block's earlier versions, too far
// apart for gzip's 32 KB window but within Brotli's 16 MB one). Cloudflare passes them on to browsers
// that accept br, which all current ones do over HTTPS, and decompresses them for any that do not.
// The data directory itself stays uncompressed (the site build and `npm run preview` read it).
//
// The output is deterministic (same input, same zlib, same bytes), so rclone, which compares MD5
// checksums, uploads only the files whose content changed.
//
// Quality 5 with a 16 MB window: about 100 MB/s per core and 12 to 26 times smaller on samples of the
// published data. Quality 11 compresses up to twice as well but at about 1 MB/s, too slow for 2.7 GB per run.

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { availableParallelism } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { brotliCompress, constants } from "node:zlib";
import { FETCHED_DIRS } from "./extract/data-version.ts";

const compress = promisify(brotliCompress);

export const QUALITY = 5;
export const WINDOW_BITS = 24;

/**
 * Node.js releases with the fix for CVE-2026-111497 (out-of-bounds write in the bundled Brotli decoder):
 * 22.23.4, 24.22.1 and 26.12.1 (https://nodejs.org/en/blog/vulnerability/october-2026-security-releases).
 * `process.versions.brotli` does not change with the fix, so the Node.js version is checked instead.
 * This script only compresses, but it refuses to run on an affected release all the same.
 */
const FIXED: Record<number, [number, number]> = { 22: [23, 4], 24: [22, 1], 26: [12, 1] };

export function hasBrotliFix(version: string): boolean {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!m) return false;
  const [major, minor, patch] = m.slice(1).map(Number);
  if (major > 26) return true;
  const fixed = FIXED[major];
  if (!fixed) return false; // older or odd-numbered (end-of-life) lines got no fix
  return minor > fixed[0] || (minor === fixed[0] && patch >= fixed[1]);
}

export function compressJson(body: Buffer): Promise<Buffer> {
  return compress(body, {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: QUALITY,
      [constants.BROTLI_PARAM_LGWIN]: WINDOW_BITS,
      [constants.BROTLI_PARAM_SIZE_HINT]: body.length,
    },
  });
}

/** Compresses every fetched file of `dataDir` into `outDir`; returns the byte counts before and after. */
export async function compressData(dataDir: string, outDir: string): Promise<{ files: number; raw: number; compressed: number }> {
  const jobs: [string, string][] = [];
  for (const dir of FETCHED_DIRS) {
    await mkdir(join(outDir, dir), { recursive: true });
    for (const name of (await readdir(join(dataDir, dir))).sort()) {
      if (name.endsWith(".json")) jobs.push([join(dataDir, dir, name), join(outDir, dir, name)]);
    }
  }
  let raw = 0;
  let compressed = 0;
  let next = 0;
  // zlib's async calls run on libuv's thread pool (4 threads by default), so a few more jobs than
  // that keep it busy while files are read and written.
  const worker = async () => {
    while (next < jobs.length) {
      const [from, to] = jobs[next++];
      const body = await readFile(from);
      const out = await compressJson(body);
      await writeFile(to, out);
      raw += body.length;
      compressed += out.length;
    }
  };
  await Promise.all(Array.from({ length: Math.max(4, availableParallelism()) * 2 }, worker));
  return { files: jobs.length, raw, compressed };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const file = args[0] === "--file";
  const [from, to] = file ? args.slice(1) : args;
  if (!from || !to || args.length !== (file ? 3 : 2)) {
    console.error("usage: node scripts/compress-data.ts <data dir> <output dir> | --file <input file> <output file>");
    process.exit(2);
  }
  if (!hasBrotliFix(process.version)) {
    console.error(
      `compress-data: Node.js ${process.version} has the Brotli decoder flaw CVE-2026-111497; use 22.23.4, 24.22.1, 26.12.1 or later`,
    );
    process.exit(1);
  }
  if (file) {
    await writeFile(to, await compressJson(await readFile(from)));
    process.exit(0);
  }
  const started = Date.now();
  const { files, raw, compressed } = await compressData(from, to);
  const mib = (n: number) => (n / 1048576).toFixed(1);
  console.log(
    `compress-data: ${files} files, ${mib(raw)} MiB -> ${mib(compressed)} MiB (Brotli quality ${QUALITY}), ${((Date.now() - started) / 1000).toFixed(0)} s`,
  );
}
