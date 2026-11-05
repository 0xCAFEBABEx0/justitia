import { diffLines, structuredPatch } from "diff";
import type { BlockChange, Hunk } from "./types.ts";

export interface Block {
  key: string;
  level: number; // 0 = text before the first heading
  heading: string;
  context: string[];
  text: string; // lines after the heading, trailing blank lines removed
}

const HEADING = /^(#{1,6}) (.*)$/;
const SUPPLEMENTARY = /^附\s*則/;
const CAPTION = /（[^（）]*）\s*$/;

const NUMERAL = "[〇一二三四五六七八九十百千]+";
/** 第三条の二, 第二十二章, 第一編 ... at the start of a heading. */
const NUMBERED = new RegExp(`^第${NUMERAL}[編章節款目条](?:の${NUMERAL})*`);

/**
 * The part of a heading that identifies it across revisions: the number of an article or
 * chapter (so 第一条（目的） matches 第一条（趣旨）, and 第二十二章 matches after its title is
 * reworded), otherwise the heading without a trailing caption.
 */
function headingKey(heading: string): string {
  if (SUPPLEMENTARY.test(heading)) return heading; // 附則（平成…法律第…号） is the identity
  const numbered = NUMBERED.exec(heading);
  if (numbered) return numbered[0];
  return heading.replace(CAPTION, "").trim() || heading;
}

/** Splits a law body into blocks at markdown headings. */
export function splitBlocks(body: string): Block[] {
  const blocks: Block[] = [];
  const stack: string[] = []; // stack[level] = heading text
  const seen = new Map<string, number>();
  let scope = "本則";
  let scopeLevel = 0;
  let cur: { level: number; heading: string; context: string[]; key: string; lines: string[] } = {
    level: 0,
    heading: "",
    context: [],
    key: "本則|",
    lines: [],
  };

  const flush = () => {
    const lines = cur.lines;
    while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
    while (lines.length && lines[0].trim() === "") lines.shift();
    if (cur.level === 0 && lines.length === 0) return;
    const n = (seen.get(cur.key) ?? 0) + 1;
    seen.set(cur.key, n);
    blocks.push({
      key: n === 1 ? cur.key : `${cur.key}#${n}`,
      level: cur.level,
      heading: cur.heading,
      context: cur.context,
      text: lines.join("\n"),
    });
  };

  for (const line of body.split("\n")) {
    const m = HEADING.exec(line);
    if (!m) {
      cur.lines.push(line);
      continue;
    }
    flush();
    const level = m[1].length;
    const heading = m[2].trim();
    let key: string;
    if (level === 1) {
      key = "題名";
    } else if (SUPPLEMENTARY.test(heading)) {
      scope = heading;
      scopeLevel = level;
      key = `${scope}|`;
    } else {
      if (scopeLevel && level <= scopeLevel) {
        scope = "本則"; // e.g. 別表 after the 附則
        scopeLevel = 0;
      }
      key = `${scope}|${headingKey(heading)}`;
    }
    stack.length = level;
    const context = stack.slice(2).filter((h) => h); // skip the title (level 1)
    stack[level] = heading;
    cur = { level, heading, context, key, lines: [] };
  }
  flush();
  return blocks;
}

function lineCount(text: string): number {
  return text === "" ? 0 : text.split("\n").length;
}

/**
 * Lines added and deleted by a set of block changes, counting a heading as a line. This is
 * close to `git diff --numstat` but much cheaper, since only changed blocks are compared.
 */
export function countLines(changes: BlockChange[]): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const c of changes) {
    const headingChanged = c.op === "modified" && c.oldHeading !== undefined;
    if (c.op === "added") additions += 1 + lineCount(c.new ?? "");
    else if (c.op === "deleted") deletions += 1 + lineCount(c.old ?? "");
    if (headingChanged) {
      additions++;
      deletions++;
    }
    if (c.op !== "modified") continue;
    if (c.hunks) {
      for (const h of c.hunks) {
        for (const l of h.lines) {
          if (l[0] === "+") additions++;
          else if (l[0] === "-") deletions++;
        }
      }
    } else if (c.old !== undefined && c.new !== undefined) {
      for (const part of diffLines(c.old + "\n", c.new + "\n")) {
        if (part.added) additions += part.count ?? 0;
        else if (part.removed) deletions += part.count ?? 0;
      }
    }
  }
  return { additions, deletions };
}

/** Above this many characters (old + new) a modified block is stored as hunks. */
export const FULL_TEXT_LIMIT = 40_000;

function toHunks(oldText: string, newText: string): Hunk[] {
  const patch = structuredPatch("a", "b", oldText + "\n", newText + "\n", "", "", {
    context: 3,
    timeout: 5_000,
  });
  if (patch) {
    return patch.hunks.map((h) => ({
      oldStart: h.oldStart,
      oldLines: h.oldLines,
      newStart: h.newStart,
      newLines: h.newLines,
      lines: h.lines.filter((l) => !l.startsWith("\\")),
    }));
  }
  // The diff gave up (very large and very different): replace everything.
  const o = oldText.split("\n");
  const n = newText.split("\n");
  return [
    {
      oldStart: 1,
      oldLines: o.length,
      newStart: 1,
      newLines: n.length,
      lines: [...o.map((l) => "-" + l), ...n.map((l) => "+" + l)],
    },
  ];
}

function withText(change: BlockChange, oldText: string | null, newText: string | null): BlockChange {
  const size = (oldText?.length ?? 0) + (newText?.length ?? 0);
  if (oldText !== null && newText !== null && size > FULL_TEXT_LIMIT) {
    change.hunks = toHunks(oldText, newText);
  } else {
    if (oldText !== null) change.old = oldText;
    if (newText !== null) change.new = newText;
  }
  return change;
}

/**
 * Compares two versions of a law block by block. Changes come in the order of the new text,
 * with each deleted block placed after the block that preceded it in the old text.
 */
export function diffBlocks(oldBlocks: Block[], newBlocks: Block[]): BlockChange[] {
  const oldByKey = new Map(oldBlocks.map((b) => [b.key, b]));
  const newIndex = new Map(newBlocks.map((b, i) => [b.key, i]));
  const out: { pos: number; sub: number; change: BlockChange }[] = [];

  newBlocks.forEach((nb, i) => {
    const ob = oldByKey.get(nb.key);
    if (!ob) {
      out.push({
        pos: i,
        sub: 0,
        change: withText(
          { op: "added", key: nb.key, level: nb.level, heading: nb.heading, context: nb.context },
          null,
          nb.text,
        ),
      });
      return;
    }
    if (ob.text === nb.text && ob.heading === nb.heading) return;
    const change: BlockChange = {
      op: "modified",
      key: nb.key,
      level: nb.level,
      heading: nb.heading,
      context: nb.context,
    };
    if (ob.heading !== nb.heading) change.oldHeading = ob.heading;
    out.push({ pos: i, sub: 0, change: ob.text === nb.text ? change : withText(change, ob.text, nb.text) });
  });

  let anchor = -1;
  oldBlocks.forEach((ob, j) => {
    const i = newIndex.get(ob.key);
    if (i !== undefined) {
      anchor = i;
      return;
    }
    out.push({
      pos: anchor,
      sub: j + 1,
      change: withText(
        { op: "deleted", key: ob.key, level: ob.level, heading: ob.heading, context: ob.context },
        ob.text,
        null,
      ),
    });
  });

  out.sort((a, b) => a.pos - b.pos || a.sub - b.sub);
  return out.map((o) => o.change);
}
