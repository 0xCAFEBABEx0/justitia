// Reads the git history of a houritsu clone and writes the JSON the site is built from.
//
//   node scripts/extract/index.ts --repo ../houritsu --out data
//
// Options:
//   --repo <dir>       houritsu clone (default: ./houritsu)
//   --out <dir>        output directory (default: ./data)
//   --main <ref>       ref of enforced revisions (default: origin/main, falling back to main)
//   --upcoming <ref>   ref of promulgated, not yet enforced revisions (default: origin/upcoming;
//                      skipped when missing)
//   --only <ids>       comma-separated law IDs: only these laws are written (for quick checks)
//   --related-only     recompute only the related laws in an existing output (no git access)

import { appendFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { diffBlocks, splitBlocks, type Block } from "./blocks.ts";
import { dataVersion } from "./data-version.ts";
import { splitLawFile, str } from "./frontmatter.ts";
import { BlobReader, listCommits, tryRevParse, type RawCommit } from "./git.ts";
import { buildHistory, historyEntry, type HistoryEntry } from "./history.ts";
import { first, ISO_DATE, parseMessage } from "./message.ts";
import { computeRelated } from "./related.ts";
import type {
  Amendment,
  AmendmentSummary,
  Branch,
  FileChange,
  LawDetail,
  LawRevision,
  LawSummary,
  Meta,
} from "./types.ts";

const CHANGED_LIMIT = 30;

const { values: opts } = parseArgs({
  options: {
    repo: { type: "string", default: "houritsu" },
    out: { type: "string", default: "data" },
    main: { type: "string" },
    upcoming: { type: "string" },
    only: { type: "string" },
    "related-only": { type: "boolean" },
  },
});

const repo = resolve(opts.repo!);
const outDir = resolve(opts.out!);
const only = opts.only ? new Set(opts.only.split(",").map((s) => s.trim())) : null;

async function pickRef(explicit: string | undefined, candidates: string[]): Promise<[string, string] | null> {
  for (const ref of explicit ? [explicit] : candidates) {
    const sha = await tryRevParse(repo, ref);
    if (sha) return [ref, sha];
  }
  if (explicit) throw new Error(`ref not found: ${explicit}`);
  return null;
}

interface LawState {
  summary: LawSummary;
  frontmatter: Record<string, unknown>;
  revisions: LawRevision[];
  deletedOnMain: boolean;
  seenOnMain: boolean;
}

const laws = new Map<string, LawState>();
const summaries: AmendmentSummary[] = [];
const keyCount = new Map<string, number>();
// Started on first use: --related-only reads no blobs, and a running `git cat-file` child
// would keep the process from exiting.
let blobReader: BlobReader | undefined;
function blobs(): BlobReader {
  return (blobReader ??= new BlobReader(repo));
}

function lawIdOf(path: string): string {
  return basename(path, ".md");
}

function lineCount(text: string): number {
  return text.replace(/\n+$/, "").split("\n").length;
}

function dirOf(path: string): string {
  return path.split("/")[1] ?? "";
}

function amendmentKey(lawId: string, enforced: string | null): string {
  const base = `${lawId}_${enforced ? enforced.replaceAll("-", "") : "undetermined"}`;
  const n = (keyCount.get(base) ?? 0) + 1;
  keyCount.set(base, n);
  return n === 1 ? base : `${base}-${n}`;
}

interface Doc {
  frontmatter: Record<string, unknown>;
  body: string;
  blocks?: Block[];
}

// Parsed law files by blob id. The old side of an amendment is usually the new side of the
// previous one, so this saves reading, decoding and splitting most blobs twice. Bounded by
// the total length of the bodies it holds.
const CACHE_CHARS = 200_000_000;
const docCache = new Map<string, Doc>();
let cachedChars = 0;

async function getDoc(sha: string): Promise<Doc> {
  const hit = docCache.get(sha);
  if (hit) {
    docCache.delete(sha); // move to the most recently used end
    docCache.set(sha, hit);
    return hit;
  }
  const doc: Doc = splitLawFile(await blobs().read(sha));
  docCache.set(sha, doc);
  cachedChars += doc.body.length;
  for (const [k, v] of docCache) {
    if (cachedChars <= CACHE_CHARS) break;
    docCache.delete(k);
    cachedChars -= v.body.length;
  }
  return doc;
}

function blocksOf(doc: Doc): Block[] {
  return (doc.blocks ??= splitBlocks(doc.body));
}

// The block history of each law is appended to a log while walking the commits (holding every
// version of every block in memory would take gigabytes), then built per law at the end.
function historyLogPath(lawId: string): string {
  return join(outDir, ".history-log", `${lawId}.ndjson`);
}

async function writeHistory(lawId: string): Promise<void> {
  const lines = (await readFile(historyLogPath(lawId), "utf8")).split("\n").filter(Boolean);
  const history = buildHistory(lines.map((l) => JSON.parse(l) as HistoryEntry));
  await writeJson(join(outDir, "history", `${lawId}.json`), history);
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, JSON.stringify(value));
}

async function processCommit(c: RawCommit, branch: Branch): Promise<void> {
  const info = parseMessage(c.subject, c.body);
  const amendmentLawId = first(info, "Amendment-Law-Id") ?? "unknown";
  const enforcedTrailer = first(info, "Enforced");
  const enforced =
    enforcedTrailer && ISO_DATE.test(enforcedTrailer)
      ? enforcedTrailer
      : enforcedTrailer === "undetermined"
        ? null
        : c.date.slice(0, 10);
  const promulgated = info.fields["公布日"] && ISO_DATE.test(info.fields["公布日"]) ? info.fields["公布日"] : null;
  const key = amendmentKey(amendmentLawId, enforced);

  const changes = only ? c.changes.filter((ch) => only.has(lawIdOf(ch.path))) : c.changes;
  if (only && changes.length === 0) return;

  // Request every blob of the commit at once; cat-file answers in order.
  const docs = await Promise.all(
    changes.map((ch) =>
      Promise.all([
        ch.status !== "A" && ch.oldBlob ? getDoc(ch.oldBlob) : Promise.resolve(null),
        ch.status !== "D" && ch.newBlob ? getDoc(ch.newBlob) : Promise.resolve(null),
      ]),
    ),
  );

  const files: FileChange[] = [];
  const historyWrites: Promise<void>[] = [];
  changes.forEach((ch, idx) => {
    const [oldDoc, newDoc] = docs[idx];
    const lawId = lawIdOf(ch.path);
    const fm = (newDoc ?? oldDoc)!.frontmatter;

    const kind =
      ch.status === "D"
        ? "repealed"
        : ch.status === "A"
          ? amendmentLawId === lawId
            ? "enacted"
            : "coverage_start"
          : "amended";

    const oldTitle = oldDoc ? str(oldDoc.frontmatter.title) : null;
    const newTitle = newDoc ? str(newDoc.frontmatter.title) : null;
    const titleChange = oldTitle && newTitle && oldTitle !== newTitle ? { from: oldTitle, to: newTitle } : undefined;

    const diff = kind === "amended" ? diffBlocks(blocksOf(oldDoc!), blocksOf(newDoc!)) : null;
    const blockChanges = diff?.changes ?? null;
    const stats = diff
      ? { additions: diff.additions, deletions: diff.deletions }
      : { additions: newDoc ? lineCount(newDoc.body) : 0, deletions: oldDoc ? lineCount(oldDoc.body) : 0 };
    const file: FileChange = {
      lawId,
      path: ch.path,
      kind,
      title: str(fm.title) ?? lawId,
      lawNum: str(fm.law_num) ?? "",
      ...stats,
    };
    if (titleChange) file.titleChange = titleChange;
    if (blockChanges) file.blocks = blockChanges;
    files.push(file);

    // Per-law state.
    let law = laws.get(lawId);
    if (!law) {
      law = {
        summary: {
          id: lawId,
          num: "",
          title: "",
          kana: null,
          abbrev: null,
          type: "",
          dir: dirOf(ch.path),
          category: null,
          path: ch.path,
          status: "in_force",
          firstRevision: null,
          lastAmended: null,
          revisionCount: 0,
          upcomingCount: 0,
        },
        frontmatter: {},
        revisions: [],
        deletedOnMain: false,
        seenOnMain: false,
      };
      laws.set(lawId, law);
    }
    // The frontmatter shown for a law is the one in force (main) when there is one.
    if (branch === "main" || !law.seenOnMain) {
      law.frontmatter = structuredClone(fm);
      law.summary.path = ch.path;
      law.summary.dir = dirOf(ch.path);
    }
    if (branch === "main") {
      law.seenOnMain = true;
      law.deletedOnMain = kind === "repealed";
      law.summary.revisionCount++;
      if (enforced) {
        law.summary.firstRevision ??= enforced;
        law.summary.lastAmended = enforced;
      }
    } else {
      law.summary.upcomingCount++;
    }
    const blocks = file.blocks ?? [];
    const rev: LawRevision = {
      amendment: key,
      branch,
      enforced,
      enforcedText: info.fields["施行日"] ?? null,
      amendmentLawId,
      amendmentLawNum: c.author,
      amendmentTitle: info.title,
      kind,
      revisionId: newDoc ? str(newDoc.frontmatter.revision_id) : null,
      additions: stats.additions,
      deletions: stats.deletions,
      changed: blocks.slice(0, CHANGED_LIMIT).map((b) => ({ op: b.op, heading: b.heading })),
      changedCount: blocks.length,
    };
    if (titleChange) rev.titleChange = titleChange;
    const entry = historyEntry(
      law.revisions.length,
      oldDoc ? blocksOf(oldDoc) : [],
      newDoc ? blocksOf(newDoc) : [],
      kind !== "amended",
    );
    historyWrites.push(appendFile(historyLogPath(lawId), JSON.stringify(entry) + "\n"));
    // structuredClone copies the strings. Otherwise V8 keeps substrings (headings, YAML values)
    // pointing into the whole law text, and every revision of every law stays in memory.
    law.revisions.push(structuredClone(rev));
  });

  await Promise.all(historyWrites);

  const bill = first(info, "Bill");
  const amendment: Amendment = {
    key,
    sha: c.sha,
    branch,
    amendmentLawId,
    amendmentLawNum: c.author,
    title: info.title,
    enforced,
    enforcedText: info.fields["施行日"] ?? null,
    promulgated,
    skippedRevisions: info.trailers["Skipped-Revision"] ?? [],
    files,
  };
  if (bill) amendment.bill = { name: bill, submitter: first(info, "Bill-Submitter"), url: first(info, "Bill-Url") };
  await writeJson(join(outDir, "amendments", `${key}.json`), amendment);

  summaries.push(structuredClone({
    key,
    branch,
    amendmentLawNum: c.author,
    title: info.title,
    enforced,
    promulgated,
    laws: files.map((f) => ({ id: f.lawId, title: f.title, kind: f.kind })),
    additions: files.reduce((s, f) => s + f.additions, 0),
    deletions: files.reduce((s, f) => s + f.deletions, 0),
  }));
}

async function main(): Promise<void> {
  const mainRef = await pickRef(opts.main, ["origin/main", "main"]);
  if (!mainRef) throw new Error(`no main branch in ${repo}`);
  const upcomingRef = await pickRef(opts.upcoming, ["origin/upcoming", "upcoming"]);

  for (const sub of ["amendments", "laws", "history", "timeline", ".history-log"]) {
    await rm(join(outDir, sub), { recursive: true, force: true });
    await mkdir(join(outDir, sub), { recursive: true });
  }

  const started = Date.now();
  const mainCommits = await listCommits(repo, mainRef[0]);
  const upcomingCommits = upcomingRef ? await listCommits(repo, upcomingRef[0], mainRef[0]) : [];
  console.log(`${mainCommits.length} commits on ${mainRef[0]}, ${upcomingCommits.length} more on ${upcomingRef?.[0] ?? "(no upcoming)"}`);

  const all: [RawCommit, Branch][] = [
    ...mainCommits.map((c): [RawCommit, Branch] => [c, "main"]),
    ...upcomingCommits.map((c): [RawCommit, Branch] => [c, "upcoming"]),
  ];
  for (let i = 0; i < all.length; i++) {
    await processCommit(all[i][0], all[i][1]);
    if ((i + 1) % 1000 === 0) {
      const heap = (process.memoryUsage().heapUsed / 1e6).toFixed(0);
      console.log(`  ${i + 1}/${all.length} (${((Date.now() - started) / 1000).toFixed(0)}s, heap ${heap} MB)`);
    }
  }
  blobReader?.close();

  // Laws.
  const related = computeRelated(summaries);
  const lawSummaries: LawSummary[] = [];
  for (const law of laws.values()) {
    const fm = law.frontmatter;
    const s = law.summary;
    s.num = str(fm.law_num) ?? "";
    s.title = str(fm.title) ?? s.id;
    s.kana = str(fm.title_kana);
    s.abbrev = str(fm.abbrev);
    s.type = str(fm.law_type) ?? "";
    s.category = str(fm.category);
    s.status = !law.seenOnMain ? "upcoming_only" : law.deletedOnMain ? "repealed" : "in_force";
    const detail: LawDetail = { ...s, frontmatter: fm, related: related.get(s.id) ?? [], revisions: law.revisions };
    await writeJson(join(outDir, "laws", `${s.id}.json`), detail);
    await writeHistory(s.id);
    lawSummaries.push(s);
  }
  await rm(join(outDir, ".history-log"), { recursive: true, force: true });
  lawSummaries.sort((a, b) => (a.kana ?? a.title).localeCompare(b.kana ?? b.title, "ja"));
  await writeJson(join(outDir, "laws.json"), lawSummaries);

  // Timeline by enforcement year.
  const byYear = new Map<string, AmendmentSummary[]>();
  for (const s of summaries) {
    const year = s.enforced?.slice(0, 4) ?? "undetermined";
    let list = byYear.get(year);
    if (!list) byYear.set(year, (list = []));
    list.push(s);
  }
  for (const [year, list] of byYear) {
    list.sort((a, b) => (a.enforced ?? "9999").localeCompare(b.enforced ?? "9999"));
    await writeJson(join(outDir, "timeline", `${year}.json`), list);
  }

  const meta: Meta = {
    generatedAt: new Date().toISOString(),
    dataVersion: await dataVersion(outDir),
    source: {
      repository: "https://github.com/Kohei-Wada/houritsu",
      mainRef: mainRef[0],
      mainCommit: mainRef[1],
      upcomingRef: upcomingRef?.[0] ?? null,
      upcomingCommit: upcomingRef?.[1] ?? null,
    },
    counts: {
      laws: lawSummaries.length,
      lawsInForce: lawSummaries.filter((l) => l.status === "in_force").length,
      lawsRepealed: lawSummaries.filter((l) => l.status === "repealed").length,
      amendments: summaries.length,
      upcomingAmendments: summaries.filter((s) => s.branch === "upcoming").length,
    },
  };
  await writeJson(join(outDir, "meta.json"), meta);
  console.log(`done in ${((Date.now() - started) / 1000).toFixed(0)}s:`, meta.counts);
}

/** --related-only: rewrite laws/<id>.json with related laws computed from timeline/*.json. */
async function relatedOnly(): Promise<void> {
  const summaries: AmendmentSummary[] = [];
  for (const f of await readdir(join(outDir, "timeline"))) {
    summaries.push(...(JSON.parse(await readFile(join(outDir, "timeline", f), "utf8")) as AmendmentSummary[]));
  }
  const related = computeRelated(summaries);
  let n = 0;
  for (const f of await readdir(join(outDir, "laws"))) {
    const path = join(outDir, "laws", f);
    const detail = JSON.parse(await readFile(path, "utf8")) as LawDetail;
    const { revisions, ...rest } = detail;
    await writeJson(path, { ...rest, related: related.get(detail.id) ?? [], revisions });
    n++;
  }
  // laws/ changed, so the data version has to follow.
  const metaPath = join(outDir, "meta.json");
  const meta = JSON.parse(await readFile(metaPath, "utf8")) as Meta;
  await writeJson(metaPath, { ...meta, dataVersion: await dataVersion(outDir) });
  console.log(`related laws written for ${n} laws`);
}

(opts["related-only"] ? relatedOnly() : main()).catch((err) => {
  console.error(err);
  process.exit(1);
});
