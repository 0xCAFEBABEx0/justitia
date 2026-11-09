// Checks CHANGELOG.md and gives the release notes of its newest release, for the Release workflow
// (.github/workflows/release.yml). See README, "Versioning and releases", for the rules it checks.
//
//   node scripts/changelog.ts                 check CHANGELOG.md; print the newest version
//   node scripts/changelog.ts --notes <file>  also write the newest release's notes to <file>
//   node scripts/changelog.ts --merged-at <ISO time> …  also require the newest release to be of that month (JST)
//
// Exits with 1 and lists the problems when CHANGELOG.md breaks a rule.

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const REPO_URL = "https://github.com/0xCAFEBABEx0/justitia";

/** Keep a Changelog 1.1.0's kinds of change, in the order they appear in a release. */
export const SECTIONS = ["Added", "Changed", "Deprecated", "Removed", "Fixed", "Security"] as const;

export interface Release {
  /** `YYYY.M.N`, as in the heading (the tag is `v` + version). */
  version: string;
  /** `YYYY-MM-DD` (Japan time), as in the heading. */
  date: string;
  /** The Markdown under the heading, without link reference definitions, trimmed. */
  body: string;
}

export interface Changelog {
  releases: Release[]; // newest first, as in the file
  links: Map<string, string>; // link reference definitions: label → URL
  problems: string[];
}

const RELEASE_HEADING = /^## \[([^\]]+)\] - (\S+)$/;
const LINK_DEFINITION = /^\[([^\]]+)\]:\s+(\S+)\s*$/;
const VERSION = /^(\d{4})\.([1-9]|1[0-2])\.(0|[1-9]\d*)$/;

/**
 * For each line, whether it belongs to a fenced code block (its fence lines included). A block closes at a fence of
 * the same character at least as long as the one that opened it, with nothing after it (CommonMark).
 */
export function fencedLines(lines: string[]): boolean[] {
  let open: { char: string; length: number } | null = null;
  return lines.map((line) => {
    const fence = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
    if (!open) {
      if (fence) open = { char: fence[1][0], length: fence[1].length };
      return fence !== null;
    }
    if (fence && fence[1][0] === open.char && fence[1].length >= open.length && fence[2].trim() === "") open = null;
    return true;
  });
}

export function parseChangelog(markdown: string): Changelog {
  const releases: Release[] = [];
  const links = new Map<string, string>();
  const problems: string[] = [];
  let current: { version: string; date: string; lines: string[] } | null = null;
  const finish = () => {
    if (current) releases.push({ version: current.version, date: current.date, body: current.lines.join("\n").trim() });
  };
  const lines = markdown.split(/\r?\n/);
  const fenced = fencedLines(lines); // no line of a code block is structure
  for (const [i, line] of lines.entries()) {
    if (fenced[i]) {
      current?.lines.push(line);
      continue;
    }
    const link = LINK_DEFINITION.exec(line);
    if (link) {
      links.set(link[1], link[2]);
      continue;
    }
    if (line.startsWith("## ")) {
      finish();
      const m = RELEASE_HEADING.exec(line);
      if (!m) {
        problems.push(`"${line}": a release heading is "## [YYYY.M.N] - YYYY-MM-DD"`);
        current = null;
        continue;
      }
      current = { version: m[1], date: m[2], lines: [] };
      continue;
    }
    current?.lines.push(line);
  }
  finish();
  return { releases, links, problems };
}

function isDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date;
}

/** The URL the link reference of `releases[i]` must point to: the compare view from the release before it. */
export function releaseLink(releases: Release[], i: number): string {
  const older = releases[i + 1];
  const tag = `v${releases[i].version}`;
  return older ? `${REPO_URL}/compare/v${older.version}...${tag}` : `${REPO_URL}/releases/tag/${tag}`;
}

/** Everything wrong with the changelog; empty when it follows the rules. */
export function checkChangelog(markdown: string): string[] {
  const { releases, links, problems } = parseChangelog(markdown);
  if (releases.length === 0 && problems.length === 0) problems.push("no release heading (## [YYYY.M.N] - YYYY-MM-DD)");
  releases.forEach((release, i) => {
    const where = `[${release.version}]`;
    const v = VERSION.exec(release.version);
    if (!v) {
      problems.push(`${where}: the version is YYYY.M.N (month without a leading zero, N from 0), such as 2026.11.0`);
      return;
    }
    if (!isDate(release.date)) {
      problems.push(`${where}: "${release.date}" is not a date (YYYY-MM-DD)`);
      return;
    }
    const [year, month, n] = v.slice(1).map(Number);
    const [dateYear, dateMonth] = release.date.split("-").map(Number);
    if (year !== dateYear || month !== dateMonth) {
      problems.push(`${where}: the version's year and month must be those of its date (${release.date})`);
    }
    // N counts the releases before this one in the same month, so versions go 2026.11.0, 2026.11.1, 2026.12.0.
    const earlierInMonth = releases.slice(i + 1).filter((r) => {
      const o = VERSION.exec(r.version);
      return o !== null && Number(o[1]) === year && Number(o[2]) === month;
    }).length;
    if (n !== earlierInMonth) {
      problems.push(`${where}: expected ${year}.${month}.${earlierInMonth} (N counts the earlier releases of the month, from 0)`);
    }
    const older = releases[i + 1];
    if (older && isDate(older.date) && older.date > release.date) {
      problems.push(`${where}: releases are listed newest first, but [${older.version}] (${older.date}) comes after it`);
    }
    if (releases.findIndex((r) => r.version === release.version) !== i) {
      problems.push(`${where}: the version appears more than once`);
    }

    const bodyLines = release.body.split("\n");
    const inCode = fencedLines(bodyLines);
    const headings = bodyLines.filter((l, j) => !inCode[j] && l.startsWith("### ")).map((l) => l.slice(4).trim());
    let last = -1;
    for (const heading of headings) {
      const at = (SECTIONS as readonly string[]).indexOf(heading);
      if (at < 0) problems.push(`${where}: "### ${heading}" is not one of ${SECTIONS.join(", ")}`);
      else if (at <= last) problems.push(`${where}: "### ${heading}" is out of order or repeated (${SECTIONS.join(", ")})`);
      else last = at;
    }
    if (headings.length === 0 || !/^- /m.test(release.body)) {
      problems.push(`${where}: a release has at least one "### <kind of change>" section with "- " entries`);
    }

    const expected = releaseLink(releases, i);
    const actual = links.get(release.version);
    if (actual !== expected) {
      problems.push(`${where}: needs the link reference "[${release.version}]: ${expected}"${actual ? ` (found ${actual})` : ""}`);
    }
  });
  // The "changes merged since the latest release" link under the introduction compares from the newest tag.
  const newest = releases[0]?.version;
  for (const [, from] of markdown.matchAll(/\/compare\/v([\d.]+?)\.\.\.main\b/g)) {
    if (newest && from !== newest) problems.push(`the compare link to main starts at v${from}, not at the newest release v${newest}`);
  }
  return problems;
}

/** The month (`YYYY.M`) of an instant in Japan time. */
export function jstMonth(now: Date): string {
  const jst = new Date(now.getTime() + 9 * 3600 * 1000);
  return `${jst.getUTCFullYear()}.${jst.getUTCMonth() + 1}`;
}

/**
 * Joins the lines of each paragraph and list item. CHANGELOG.md is wrapped at 120 columns, but GitHub shows every
 * line break of a release's notes (as in comments), which would break sentences in the middle.
 */
export function unwrap(markdown: string): string {
  const out: string[] = [];
  const lines = markdown.split("\n");
  const fenced = fencedLines(lines); // code blocks keep their lines
  for (const [i, line] of lines.entries()) {
    const prev = out.at(-1);
    const continues = !fenced[i] && line.trim() !== "" && !/^\s*([-*+] |\d+\. |#|>|\|)/.test(line);
    if (continues && prev !== undefined && !fenced[i - 1] && prev.trim() !== "" && !/^\s*(#|\|)/.test(prev)) {
      out[out.length - 1] = `${prev} ${line.trim()}`;
    } else {
      out.push(line);
    }
  }
  return out.join("\n");
}

/** The notes of the GitHub Release for `releases[i]`: its changelog section and a link to the full diff. */
export function releaseNotes(releases: Release[], i: number): string {
  const older = releases[i + 1];
  const full = older ? `\n\n**Full changelog**: ${releaseLink(releases, i)}` : "";
  return `${unwrap(releases[i].body)}${full}\n`;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const mergedAt = args[0] === "--merged-at" ? new Date(args[1] ?? "") : undefined;
  if (mergedAt) args.splice(0, 2);
  const notesFile = args[0] === "--notes" ? args[1] : undefined;
  if (args.length !== (notesFile ? 2 : 0) || (mergedAt && Number.isNaN(mergedAt.getTime()))) {
    console.error("usage: node scripts/changelog.ts [--merged-at <ISO time>] [--notes <file>]");
    process.exit(2);
  }
  const markdown = await readFile(join(import.meta.dirname, "../CHANGELOG.md"), "utf8");
  const problems = checkChangelog(markdown);
  if (problems.length > 0) {
    for (const problem of problems) console.error(`CHANGELOG.md: ${problem}`);
    process.exit(1);
  }
  const { releases } = parseChangelog(markdown);
  // A release PR merged in a later month than it was written in must get that month's version first. The merge time,
  // not the time of the run, which may start after midnight at the end of a month.
  if (mergedAt && !releases[0].version.startsWith(`${jstMonth(mergedAt)}.`)) {
    console.error(
      `CHANGELOG.md: the newest release ${releases[0].version} is not of the month it was merged in (${jstMonth(mergedAt)}, Japan time)`,
    );
    process.exit(1);
  }
  if (notesFile) await writeFile(notesFile, releaseNotes(releases, 0));
  console.log(releases[0].version);
}
