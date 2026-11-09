import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { checkChangelog, jstMonth, parseChangelog, releaseNotes, REPO_URL, unwrap } from "./changelog.ts";

const head = "# Changelog\n\nIntro.\n\n";

function changelog(...releases: { version: string; date: string; body?: string }[]): string {
  const sections = releases.map((r) => `## [${r.version}] - ${r.date}\n\n${r.body ?? "### Added\n\n- Something. (#1)"}\n`);
  const links = releases.map((r, i) => {
    const older = releases[i + 1];
    return older
      ? `[${r.version}]: ${REPO_URL}/compare/v${older.version}...v${r.version}`
      : `[${r.version}]: ${REPO_URL}/releases/tag/v${r.version}`;
  });
  return `${head}${sections.join("\n")}\n${links.join("\n")}\n`;
}

test("the repository's CHANGELOG.md follows the rules", async () => {
  const markdown = await readFile(join(import.meta.dirname, "../CHANGELOG.md"), "utf8");
  assert.deepEqual(checkChangelog(markdown), []);
});

test("a well-formed changelog has no problems", () => {
  const md = changelog(
    { version: "2026.12.0", date: "2026-12-01" },
    { version: "2026.11.1", date: "2026-11-20", body: "### Added\n\n- A. (#2)\n\n### Fixed\n\n- B. (#3)" },
    { version: "2026.11.0", date: "2026-11-09" },
  );
  assert.deepEqual(checkChangelog(md), []);
  const { releases } = parseChangelog(md);
  assert.deepEqual(
    releases.map((r) => r.version),
    ["2026.12.0", "2026.11.1", "2026.11.0"],
  );
  assert.equal(releases[1].body, "### Added\n\n- A. (#2)\n\n### Fixed\n\n- B. (#3)");
});

test("versions count the releases of their month from 0", () => {
  const skipped = changelog({ version: "2026.11.2", date: "2026-11-20" }, { version: "2026.11.0", date: "2026-11-09" });
  assert.match(checkChangelog(skipped).join("\n"), /expected 2026\.11\.1/);
  const notFromZero = changelog({ version: "2026.12.1", date: "2026-12-01" }, { version: "2026.11.0", date: "2026-11-09" });
  assert.match(checkChangelog(notFromZero).join("\n"), /expected 2026\.12\.0/);
  // 2026.1.x is not counted as part of 2026.11.
  const january = changelog({ version: "2026.11.0", date: "2026-11-09" }, { version: "2026.1.0", date: "2026-01-05" });
  assert.deepEqual(checkChangelog(january), []);
});

test("the version must match the date and use the YYYY.M.N form", () => {
  assert.match(checkChangelog(changelog({ version: "2026.11.0", date: "2026-12-01" })).join("\n"), /year and month/);
  assert.match(checkChangelog(changelog({ version: "2026.09.0", date: "2026-09-01" })).join("\n"), /YYYY\.M\.N/);
  assert.match(checkChangelog(changelog({ version: "v2026.9.0", date: "2026-09-01" })).join("\n"), /YYYY\.M\.N/);
  assert.match(checkChangelog(changelog({ version: "2026.2.0", date: "2026-02-30" })).join("\n"), /not a date/);
});

test("releases are listed newest first", () => {
  const md = changelog({ version: "2026.11.0", date: "2026-11-01" }, { version: "2026.10.0", date: "2026-11-02" });
  assert.match(checkChangelog(md).join("\n"), /newest first/);
});

test("sections are Keep a Changelog kinds, in order, with entries", () => {
  const unknown = changelog({ version: "2026.11.0", date: "2026-11-09", body: "### New\n\n- A." });
  assert.match(checkChangelog(unknown).join("\n"), /not one of/);
  const order = changelog({ version: "2026.11.0", date: "2026-11-09", body: "### Fixed\n\n- A.\n\n### Added\n\n- B." });
  assert.match(checkChangelog(order).join("\n"), /out of order/);
  const empty = changelog({ version: "2026.11.0", date: "2026-11-09", body: "Nothing yet." });
  assert.match(checkChangelog(empty).join("\n"), /at least one/);
});

test("headings and link references are checked", () => {
  assert.match(checkChangelog(`${head}## [Unreleased]\n\n- A.\n`).join("\n"), /release heading/);
  assert.match(checkChangelog(head).join("\n"), /no release heading/);
  const md = changelog({ version: "2026.11.1", date: "2026-11-20" }, { version: "2026.11.0", date: "2026-11-09" });
  const wrong = md.replace(`compare/v2026.11.0...v2026.11.1`, `releases/tag/v2026.11.1`);
  assert.match(checkChangelog(wrong).join("\n"), /needs the link reference/);
});

test("release notes are the section, with a link to the full diff after the first release", () => {
  const md = changelog({ version: "2026.11.1", date: "2026-11-20" }, { version: "2026.11.0", date: "2026-11-09" });
  const { releases } = parseChangelog(md);
  assert.equal(
    releaseNotes(releases, 0),
    `### Added\n\n- Something. (#1)\n\n**Full changelog**: ${REPO_URL}/compare/v2026.11.0...v2026.11.1\n`,
  );
  assert.equal(releaseNotes(releases, 1), "### Added\n\n- Something. (#1)\n");
});

test("release notes join wrapped lines, since GitHub shows every line break", () => {
  assert.equal(
    unwrap("Intro line one\nand two.\n\n### Added\n\n- Item one\n  continued. (#1)\n- Item two. (#2)\n"),
    "Intro line one and two.\n\n### Added\n\n- Item one continued. (#1)\n- Item two. (#2)\n",
  );
});

test("the compare link to main must start at the newest release", () => {
  const md = changelog({ version: "2026.11.1", date: "2026-11-20" }, { version: "2026.11.0", date: "2026-11-09" });
  const current = md.replace("Intro.", `Intro: ${REPO_URL}/compare/v2026.11.1...main.`);
  assert.deepEqual(checkChangelog(current), []);
  const stale = md.replace("Intro.", `Intro: ${REPO_URL}/compare/v2026.11.0...main.`);
  assert.match(checkChangelog(stale).join("\n"), /starts at v2026\.11\.0/);
});

test("lines in fenced code blocks are not structure", () => {
  const body = "### Added\n\n- Example:\n\n  ```\n## not a heading\n[x]: https://example.com/\n  ```";
  const md = changelog({ version: "2026.11.0", date: "2026-11-09", body });
  assert.deepEqual(checkChangelog(md), []);
  assert.equal(parseChangelog(md).releases[0].body, body);
});

test("the month of an instant is taken in Japan time", () => {
  assert.equal(jstMonth(new Date("2026-11-30T14:59:59Z")), "2026.11");
  assert.equal(jstMonth(new Date("2026-11-30T15:00:00Z")), "2026.12");
});

test("release notes keep the lines of code blocks", () => {
  assert.equal(unwrap("- A:\n\n  ```\n  one\n  two\n  ```\n"), "- A:\n\n  ```\n  one\n  two\n  ```\n");
});
