// URLs in the text of a diff, so the amendment and comparison pages can link them.
//
// The diff views show law text as plain text, markup included, and a diff can change a URL in
// the middle (an attachment URL carries the revision date). So URLs are found in the whole text
// of each side, and the diff segments are cut at the URL boundaries: every piece is then inside
// one URL or outside all of them, and the page can wrap a run of pieces in one <a> with the
// <ins>/<del> marks inside it.

import type { Segment } from "../../scripts/extract/types.ts";

export interface UrlRange {
  start: number;
  end: number;
  href: string;
}

export interface Piece {
  op: -1 | 0 | 1;
  text: string;
  /** The URL this piece is part of, the same object for every piece of that URL. */
  link: UrlRange | null;
}

// ASCII URL characters only: law text puts full-width brackets and Japanese right after a URL.
// Quotes, brackets and parentheses end a URL too, so `<a href="…">` and `[…](…)` in the markdown
// give just the URL.
const URL_RE = /https?:\/\/[A-Za-z0-9\-._~:/?#@!$&*+,;=%]+/g;
const TRAILING = /[.,;:!?]+$/;

/** The http(s) URLs in `text`, in order. */
export function findUrls(text: string): UrlRange[] {
  const out: UrlRange[] = [];
  for (const m of text.matchAll(URL_RE)) {
    const url = m[0].replace(TRAILING, "");
    const href = url.replace(/&amp;/g, "&");
    let parsed: URL;
    try {
      parsed = new URL(href);
    } catch {
      continue;
    }
    if ((parsed.protocol !== "https:" && parsed.protocol !== "http:") || !parsed.hostname) continue;
    out.push({ start: m.index, end: m.index + url.length, href });
  }
  return out;
}

/** Cuts `text`, which starts at `pos` in a side's text, at the boundaries of `links`. */
function cut(op: Piece["op"], text: string, pos: number, links: UrlRange[], from: { i: number }, out: Piece[]): void {
  const end = pos + text.length;
  while (from.i < links.length && links[from.i].end <= pos) from.i++;
  let at = pos;
  for (let i = from.i; i < links.length && links[i].start < end; i++) {
    const l = links[i];
    if (l.start > at) out.push({ op, text: text.slice(at - pos, l.start - pos), link: null });
    const stop = Math.min(l.end, end);
    out.push({ op, text: text.slice(Math.max(l.start, at) - pos, stop - pos), link: l });
    at = stop;
  }
  if (at < end) out.push({ op, text: text.slice(at - pos), link: null });
}

/**
 * Splits diff segments into pieces that each lie inside one URL or outside all of them.
 * `side` 1 keeps the text after the amendment, -1 the text before it, and 0 both (the inline
 * view). In the inline view, URLs come from the new text; deleted text in the middle of a new URL
 * belongs to that URL, and other deleted text is linked by the URLs of the old text.
 */
export function linkPieces(segs: Segment[], side: -1 | 0 | 1): Piece[] {
  const newText = side === -1 ? "" : segs.filter(([op]) => op !== -1).map(([, t]) => t).join("");
  const oldText = side === 1 ? "" : segs.filter(([op]) => op !== 1).map(([, t]) => t).join("");
  const newLinks = findUrls(newText);
  const oldLinks = findUrls(oldText);
  const newFrom = { i: 0 };
  const oldFrom = { i: 0 };
  const out: Piece[] = [];
  let newPos = 0;
  let oldPos = 0;
  for (const [op, text] of segs) {
    if (!text) continue;
    if (side === -1) {
      if (op !== 1) cut(op, text, oldPos, oldLinks, oldFrom, out);
    } else if (side === 1 || op !== -1) {
      if (op !== -1) cut(op, text, newPos, newLinks, newFrom, out);
    } else {
      const inside = newLinks.find((l) => l.start < newPos && newPos < l.end);
      if (inside) out.push({ op, text, link: inside });
      else cut(op, text, oldPos, oldLinks, oldFrom, out);
    }
    if (op !== -1) newPos += text.length;
    if (op !== 1) oldPos += text.length;
  }
  return out;
}
