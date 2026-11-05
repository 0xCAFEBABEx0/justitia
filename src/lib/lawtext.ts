// Renders a houritsu law file to HTML at build time.
//
// The text is split into the same blocks the extractor diffs (scripts/extract/blocks.ts), and
// each heading gets the block key as its id, so an amendment page can link straight to the
// article it changed: /laws/<id>/#本則|第三条.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Marked } from "marked";
import { splitBlocks, type Block } from "../../scripts/extract/blocks.ts";
import { splitLawFile } from "../../scripts/extract/frontmatter.ts";
import { meta } from "./data.ts";
import { HOURITSU_DIR } from "./site.ts";

const marked = new Marked({ gfm: true, async: false });

// houritsu is a third-party repository, so only the markup it is known to use gets through.
const ALLOWED_TAGS = new Set([
  "p", "br", "hr", "ul", "ol", "li", "strong", "em", "b", "i", "code", "pre", "blockquote",
  "a", "table", "thead", "tbody", "tr", "td", "th", "sup", "sub", "ruby", "rt", "rp", "span",
  "del", "ins", "h1", "h2", "h3", "h4", "h5", "h6",
]);
// A start or end tag, quoted attribute values included, so a `<` or `>` inside quotes cannot
// split it.
const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^\s"'<>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*\/?>/g;
const ATTR = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Escapes `<` and `>` in text, leaving entities (`&amp;` from marked) as they are. */
function escapeText(s: string): string {
  return s.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function rebuildTag(close: string, name: string, attrs: string): string | null {
  const tag = name.toLowerCase();
  if (!ALLOWED_TAGS.has(tag)) return null;
  if (close) return `</${tag}>`;
  let out = "";
  for (const m of attrs.matchAll(ATTR)) {
    const key = m[1].toLowerCase();
    const v = m[2] ?? m[3] ?? m[4] ?? "";
    if ((key === "colspan" || key === "rowspan") && /^\d{1,3}$/.test(v)) out += ` ${key}="${v}"`;
    else if (key === "href" && tag === "a" && /^https?:\/\/[^\s]*$/.test(v)) {
      out += ` href="${escapeHtml(v)}" rel="noopener" target="_blank"`;
    }
  }
  return `<${tag}${out}>`;
}

/**
 * Keeps only allowed tags, rebuilt from scratch with allowed attributes; every other `<` and
 * `>` in the input is escaped. The output therefore holds no markup this function did not
 * write itself, whatever the input looks like.
 */
export function sanitize(html: string): string {
  let out = "";
  let last = 0;
  for (const m of html.matchAll(TAG)) {
    out += escapeText(html.slice(last, m.index));
    out += rebuildTag(m[1], m[2], m[3]) ?? escapeHtml(m[0]);
    last = m.index + m[0].length;
  }
  return out + escapeText(html.slice(last));
}

export function renderInline(md: string): string {
  return sanitize(marked.parseInline(md) as string);
}

export function renderBlockText(md: string): string {
  return sanitize(marked.parse(md) as string);
}

export interface TocEntry {
  id: string;
  level: number;
  html: string;
}

export interface RenderedLaw {
  html: string;
  toc: TocEntry[];
  articleCount: number;
}

const ARTICLE = /^第[〇一二三四五六七八九十百千]+条/;

export function isArticle(heading: string): boolean {
  return ARTICLE.test(heading);
}

export function renderBlocks(blocks: Block[]): RenderedLaw {
  const parts: string[] = [];
  const toc: TocEntry[] = [];
  let articleCount = 0;
  for (const b of blocks) {
    if (b.level === 1) continue; // the title is rendered by the page
    const id = escapeHtml(b.key);
    if (b.level > 0) {
      const level = Math.min(b.level, 6);
      const headingHtml = renderInline(b.heading);
      const article = isArticle(b.heading);
      if (article) articleCount++;
      else toc.push({ id: b.key, level: b.level, html: headingHtml });
      parts.push(
        `<section class="blk${article ? " art" : ""}" id="${id}"><h${level} class="h"><a class="anchor" href="#${encodeURIComponent(b.key)}">${headingHtml}</a></h${level}>`,
      );
    } else {
      parts.push(`<section class="blk preamble">`);
    }
    if (b.text) parts.push(renderBlockText(b.text));
    parts.push(`</section>`);
  }
  return { html: parts.join("\n"), toc, articleCount };
}

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

/** Renders the law file at `path` (relative to the houritsu clone), or null if it is gone. */
export function renderLawFile(path: string): (RenderedLaw & { title: string }) | null {
  checkSourceCommit();
  let text: string;
  try {
    text = readFileSync(join(HOURITSU_DIR, path), "utf8");
  } catch {
    return null;
  }
  const doc = splitLawFile(text);
  const blocks = splitBlocks(doc.body);
  const title = blocks.find((b) => b.level === 1)?.heading ?? String(doc.frontmatter.title ?? "");
  const titleBlock = blocks.find((b) => b.level === 1);
  const rendered = renderBlocks(blocks);
  // Text right under the title (制定文 etc.) belongs to the title block.
  if (titleBlock?.text) rendered.html = `<section class="blk preamble">${renderBlockText(titleBlock.text)}</section>\n${rendered.html}`;
  return { ...rendered, title };
}
