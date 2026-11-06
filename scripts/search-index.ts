// Builds the full-text search index from the built law pages, with Pagefind.
//
//   node scripts/search-index.ts [--dist dist] [--out <JUSTITIA_DATA>/pagefind]
//
// Indexing all law text at once takes more memory than a CI runner has (over 13 GB), so the laws
// are split into shards of about SHARD_BYTES of law HTML (about 5 GB of memory and one minute
// each; 16 shards for all laws), each a separate Pagefind index in
// <out>/<n>/. The search page loads shard 0 and merges the others (Pagefind's mergeIndex).
// <out>/shards.json lists them.
//
// Only the law text is indexed, one record per block (see records()).

import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import * as pagefind from "pagefind";

const SHARD_BYTES = 45_000_000;

const { values: opts } = parseArgs({
  options: {
    dist: { type: "string", default: "dist" },
    out: { type: "string" },
    "max-shards": { type: "string" }, // for trying out the index on part of the laws
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
  const start = page.indexOf('<article class="law-text">');
  if (start < 0) return null;
  const article = page.slice(start, page.indexOf("</article>", start));
  if (!article.includes('<section class="blk')) return null;
  const title = text(/<h1 class="page-title">([\s\S]*?)<\/h1>/.exec(page)?.[1].replace(/<span class="badge[\s\S]*?<\/span>/g, "") ?? "");
  const num = /<div class="law-meta">\s*<span>([^<]*)<\/span>/.exec(page)?.[1] ?? "";
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
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });

  // Group into shards in ID order, reading each page only when its shard is indexed.
  const sizes: { id: string; bytes: number }[] = [];
  for (const id of ids) {
    const html = await readFile(join(dist, "laws", id, "index.html"), "utf8");
    const law = lawOf(id, html);
    if (law) sizes.push({ id, bytes: Buffer.byteLength(law.article) });
  }
  const shards: string[][] = [[]];
  let bytes = 0;
  for (const s of sizes) {
    if (bytes + s.bytes > SHARD_BYTES && shards[shards.length - 1].length) {
      shards.push([]);
      bytes = 0;
    }
    shards[shards.length - 1].push(s.id);
    bytes += s.bytes;
  }

  const started = Date.now();
  if (opts["max-shards"]) shards.length = Math.min(shards.length, Number(opts["max-shards"]));
  for (const [n, shard] of shards.entries()) {
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
    console.log(`shard ${n}: ${shard.length} laws, ${count} records (${((Date.now() - started) / 1000).toFixed(0)}s)`);
  }
  await writeFile(join(out, "shards.json"), JSON.stringify({ shards: shards.length, laws: sizes.length }));
  console.log(`search index: ${sizes.length} laws in ${shards.length} shards, ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

