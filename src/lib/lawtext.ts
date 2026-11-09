// Renders a houritsu law file to HTML at build time.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { splitBlocks } from "../../scripts/extract/blocks.ts";
import { splitLawFile, type LawDoc } from "../../scripts/extract/frontmatter.ts";
import { meta } from "./data.ts";
import { renderBlocks, renderBlockText, type RenderedLaw } from "./render.ts";
import { HOURITSU_DIR } from "./site.ts";

export { isArticle, renderBlocks, renderBlockText, renderInline, sanitize, type RenderedLaw, type TocEntry } from "./render.ts";

let sourceChecked = false;

/**
 * The law pages read the houritsu working tree, while the history comes from the commit the
 * extractor recorded. Refuse to build if the two differ, rather than publish text from one
 * version next to the history of another.
 */
function checkSourceCommit(): void {
  if (sourceChecked) return;
  const want = meta().source.mainCommit;
  const head = execFileSync("git", ["-C", HOURITSU_DIR, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  if (head !== want) {
    throw new Error(
      `The houritsu checkout (${head}) is not the commit the data was extracted from (${want}). ` +
        `Run \`git -C ${HOURITSU_DIR} checkout --detach ${want}\` or extract again.`,
    );
  }
  try {
    execFileSync("git", ["-C", HOURITSU_DIR, "diff", "--quiet", "HEAD", "--", "laws"]);
  } catch {
    throw new Error(`laws/ in the houritsu checkout has uncommitted changes (${HOURITSU_DIR}).`);
  }
  sourceChecked = true;
}

/** The law file at `path` (relative to the houritsu clone), split into frontmatter and body, or null if it is gone. */
export function readLawFile(path: string): LawDoc | null {
  checkSourceCommit();
  let text: string;
  try {
    text = readFileSync(join(HOURITSU_DIR, path), "utf8");
  } catch {
    return null;
  }
  return splitLawFile(text);
}

/** Renders the law file at `path` (relative to the houritsu clone), or null if it is gone. */
export function renderLawFile(path: string): (RenderedLaw & { title: string }) | null {
  const doc = readLawFile(path);
  if (!doc) return null;
  const blocks = splitBlocks(doc.body);
  const title = blocks.find((b) => b.level === 1)?.heading ?? String(doc.frontmatter.title ?? "");
  const titleBlock = blocks.find((b) => b.level === 1);
  const rendered = renderBlocks(blocks);
  // Text right under the title (制定文 etc.) belongs to the title block.
  if (titleBlock?.text) rendered.html = `<section class="blk preamble">${renderBlockText(titleBlock.text)}</section>\n${rendered.html}`;
  return { ...rendered, title };
}
