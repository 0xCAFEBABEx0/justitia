// Law text to HTML, shared by the build (law pages) and the browser (text at a past revision).
//
// The text is split into the same blocks the extractor diffs (scripts/extract/blocks.ts), and
// each heading gets the block key as its id, so an amendment page can link straight to the
// article it changed: /laws/<id>/#本則|第三条.

import { Marked } from "marked";
import type { Block } from "../../scripts/extract/blocks.ts";

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

export function escapeHtml(s: string): string {
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

