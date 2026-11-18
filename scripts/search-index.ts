// Builds the full-text search index from the built law pages, with Pagefind.
//
//   node scripts/search-index.ts [--dist dist] [--out <JUSTITIA_DATA>/pagefind] [--skip-if-same <url>]
//                                [--previous <dir>]
//
// shards.json also records a hash of everything the index is built from (the indexed parts of the
// law pages, this script and the Pagefind version); scripts/upload-data.sh publishes it, once the
// whole index is uploaded, as _publish/pagefind-input.txt. With --skip-if-same, that file is fetched
// from <url> first; when it holds the same hash, nothing is built or written, so a change that
// leaves the law text and its markup alone (most changes to the site) skips the indexing.
//
// Indexing all law text at once takes more memory than a CI runner has (over 13 GB), so the laws
// are split into shards of about SHARD_BYTES of law HTML (about 5 GB of memory and one minute
// each; 16 shards for all laws), each a separate Pagefind index in
// <out>/<n>/. The search page loads shard 0 and merges the others (Pagefind's mergeIndex).
// <out>/shards.json lists them.
//
// With --previous, <dir> holds an earlier output of this script (the workflow keeps the last published index in its
// cache). Its split into shards is kept while the shards stay small enough, and a shard whose input is the same as one
// of <dir>'s is copied from there instead of being indexed again (scripts/search-shards.ts). Pagefind writes the same
// files for the same input, so the result is the same as indexing everything; a day's new commits in houritsu usually
// touch a few shards.
//
// Only the law text is indexed, one record per block (see records()).

import { createHash } from "node:crypto";
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import * as pagefind from "pagefind";
import { planShards, type IndexedLaw, type PreviousShards } from "./search-shards.ts";

const { values: opts } = parseArgs({
  options: {
    dist: { type: "string", default: "dist" },
    out: { type: "string" },
    "max-shards": { type: "string" }, // for trying out the index on part of the laws
    "skip-if-same": { type: "string" },
    previous: { type: "string" },
  },
});
const dist = resolve(opts.dist!);
const out = resolve(opts.out ?? join(process.env.JUSTITIA_DATA ?? "data", "pagefind"));

const SECTION =
  /<section class="blk[^"]*"(?: id="([^"]*)")?>(?:<h\d class="h"><a[^>]*>([\s\S]*?)<\/a><\/h\d>)?([\s\S]*?)<\/section>/g;

function text(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function unescape(s: string): string {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
}

function attr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

interface Law {
  id: string;
  title: string;
  num: string;
  article: string;
}

/** The law text of a built law page, or null when it has none (repealed, not yet in force). */
function lawOf(id: string, page: string): Law | null {
  // The markers are data attributes on the law page (src/pages/laws/[id].astro), not its classes.
  const start = /<article[^>]*\sdata-law-text[\s>]/.exec(page)?.index ?? -1;
  if (start < 0) {
    // A law page built before the markers were added: index nothing rather than part of the site.
    if (page.includes('<article class="law-text"')) throw new Error(`${id}: law page from an older build; rebuild the site first`);
    return null;
  }
  const article = page.slice(start, page.indexOf("</article>", start));
  if (!article.includes('<section class="blk')) return null;
  // The badges by the title (施行予定, 制定以来改正なし, 改正案を審議中) are spans or links; none is part of the title.
  const title = text(/<h1[^>]*data-page-title[^>]*>([\s\S]*?)<\/h1>/.exec(page)?.[1].replace(/<(span|a) class="badge[\s\S]*?<\/\1>/g, "") ?? "");
  const num = /<span data-law-num[^>]*>([^<]*)<\/span>/.exec(page)?.[1] ?? "";
  return { id, title, num, article };
}

/**
 * One search record per block (article, chapter text, supplementary provision, table...), so a
 * result is the article that matches rather than a whole law, and an article's heading counts
 * more than its text. Blocks without text (headings of parts and chapters) are skipped.
 */
function* records(law: Law): Generator<{ url: string; content: string }> {
  for (const m of law.article.matchAll(SECTION)) {
    const [, id, headingHtml, body] = m;
    if (!text(body)) continue;
    const key = id ? unescape(id) : "";
    // Articles in supplementary provisions are named with their 附則, e.g. 附則（令和二年…）第四条.
    const scope = key.includes("|") ? key.slice(0, key.indexOf("|")) : "";
    const own = headingHtml ? text(headingHtml) : "冒頭";
    const heading = scope && scope !== "本則" && !own.replace(/\s+/g, "").startsWith("附則") ? `${scope.replace(/\s+/g, "")} ${own}` : own;
    const url = `/laws/${law.id}/` + (key ? `#${encodeURIComponent(key)}` : "");
    yield {
      url,
      content:
        `<!doctype html><html lang="ja"><head><title>${attr(heading)}</title></head><body>` +
        `<span data-pagefind-meta="law:${attr(law.title)}"></span><span data-pagefind-meta="num:${attr(law.num)}"></span>` +
        `<h1>${attr(heading)}</h1>${body}<p data-pagefind-weight="2">${attr(law.title)}</p></body></html>`,
    };
  }
}

async function main(): Promise<void> {
  const ids = (await readdir(join(dist, "laws"), { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  // Read every law page once for the hashes; each page is read again when its shard is indexed.
  const laws: IndexedLaw[] = [];
  for (const id of ids) {
    const law = lawOf(id, await readFile(join(dist, "laws", id, "index.html"), "utf8"));
    if (!law) continue;
    const hash = createHash("sha256").update(`${law.title}\0${law.num}\0${law.article}`).digest("hex");
    laws.push({ id, bytes: Buffer.byteLength(law.article), hash });
  }
  const here = dirname(fileURLToPath(import.meta.url));
  const common = createHash("sha256")
    .update(await readFile(fileURLToPath(import.meta.url)))
    .update(await readFile(join(here, "search-shards.ts")))
    .update(JSON.parse(await readFile(join(here, "../node_modules/pagefind/package.json"), "utf8")).version)
    .digest("hex");
  const previousDir = opts.previous ? resolve(opts.previous) : null;
  if (previousDir === out) throw new Error("--previous must not be the output directory, which is emptied first");
  const previous = previousDir ? await readPrevious(previousDir) : null;
  const plan = planShards(laws, common, previous, opts["max-shards"] ? Number(opts["max-shards"]) : undefined);

  if (opts["skip-if-same"]) {
    const published = await fetch(`${opts["skip-if-same"]}?ts=${Date.now()}`)
      .then((r) => (r.ok ? r.text() : null))
      .then((t) => t?.trim() || null)
      .catch(() => null);
    if (published === plan.input) {
      console.log(`search index: unchanged (${plan.input}), not rebuilt`);
      return;
    }
    console.log(`search index: ${published ?? "no published index"} -> ${plan.input}, rebuilding`);
  }
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });

  const started = Date.now();
  let indexed = 0;
  for (const [n, shard] of plan.shards.entries()) {
    const from = plan.reuse[n];
    if (from >= 0 && previousDir) {
      await cp(join(previousDir, String(from)), join(out, String(n)), { recursive: true });
      console.log(`shard ${n}: ${shard.length} laws, unchanged (from shard ${from} of the previous index)`);
      continue;
    }
    const { index, errors } = await pagefind.createIndex({ forceLanguage: "ja", maxFragments: 1500 });
    if (!index) throw new Error(errors.join("\n"));
    let count = 0;
    for (const id of shard) {
      const law = lawOf(id, await readFile(join(dist, "laws", id, "index.html"), "utf8"))!;
      for (const rec of records(law)) {
        const res = await index.addHTMLFile(rec);
        if (res.errors.length) throw new Error(`${rec.url}: ${res.errors.join("; ")}`);
        count++;
      }
    }
    const written = await index.writeFiles({ outputPath: join(out, String(n)) });
    if (written.errors.length) throw new Error(written.errors.join("\n"));
    await index.deleteIndex();
    await pagefind.close(); // frees the indexer's memory before the next shard
    indexed++;
    console.log(`shard ${n}: ${shard.length} laws, ${count} records (${((Date.now() - started) / 1000).toFixed(0)}s)`);
  }
  const shards = { shards: plan.shards.length, laws: laws.length, input: plan.input, starts: plan.starts, inputs: plan.inputs };
  await writeFile(join(out, "shards.json"), JSON.stringify(shards));
  console.log(`search index: ${laws.length} laws in ${plan.shards.length} shards (${indexed} indexed), ${out}`);
}

/** The shards of an earlier output of this script that are still there, or null when it has none. */
async function readPrevious(dir: string): Promise<PreviousShards | null> {
  const json = await readFile(join(dir, "shards.json"), "utf8").catch(() => null);
  if (!json) return null;
  const { starts, inputs } = JSON.parse(json) as PreviousShards;
  if (!starts || !inputs) return { starts };
  // A shard directory that is missing or incomplete (no pagefind-entry.json) is indexed again.
  const present = await Promise.all(
    inputs.map((_, n) => readFile(join(dir, String(n), "pagefind-entry.json")).then(() => true, () => false)),
  );
  return { starts, inputs: inputs.map((h, n) => (present[n] ? h : "")) };
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

