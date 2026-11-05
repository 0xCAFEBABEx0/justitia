import DiffMatchPatch from "diff-match-patch";
import { diffLines, structuredPatch } from "diff";
import type { BlockChange, Hunk, Segment } from "./types.ts";

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

/** Above this many characters (old + new) a modified block is stored as line hunks. */
export const SEGMENT_LIMIT = 20_000;

const dmp = new DiffMatchPatch();
dmp.Diff_Timeout = 0.5; // seconds; past it the diff is coarser, not wrong

function charDiff(oldText: string, newText: string): Segment[] {
  const diffs = dmp.diff_main(oldText, newText, false);
  dmp.diff_cleanupSemantic(diffs);
  return diffs.map(([op, text]) => [op as -1 | 0 | 1, text]);
}

/**
 * Diff of two block texts: lines first, then characters within each run of replaced lines, so
 * the costly character diff only sees the lines that changed. Also counts changed lines.
 */
export function toSegments(oldText: string, newText: string): { segments: Segment[]; additions: number; deletions: number } {
  const parts = diffLines(oldText + "\n", newText + "\n", { timeout: 5_000 });
  if (!parts) {
    const segments = charDiff(oldText, newText);
    return { segments, additions: lineCount(newText), deletions: lineCount(oldText) };
  }
  const segments: Segment[] = [];
  const push = (op: -1 | 0 | 1, text: string) => {
    if (!text) return;
    const last = segments[segments.length - 1];
    if (last && last[0] === op) last[1] += text;
    else segments.push([op, text]);
  };
  let additions = 0;
  let deletions = 0;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part.removed) {
      deletions += part.count ?? 0;
      const next = parts[i + 1];
      if (next?.added) {
        additions += next.count ?? 0;
        for (const [op, text] of charDiff(part.value, next.value)) push(op, text);
        i++;
      } else {
        push(-1, part.value);
      }
    } else if (part.added) {
      additions += part.count ?? 0;
      push(1, part.value);
    } else {
      push(0, part.value);
    }
  }
  // Drop the "\n" appended to both texts above. Usually it is the end of a final unchanged
  // segment; when the block ends in an insertion or a deletion, diff the whole block instead.
  const last = segments.at(-1);
  if (last && last[0] === 0 && last[1].endsWith("\n")) {
    last[1] = last[1].slice(0, -1);
    if (!last[1]) segments.pop();
  } else {
    return { segments: charDiff(oldText, newText), additions, deletions };
  }
  return { segments, additions, deletions };
}

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

export interface BlockDiff {
  changes: BlockChange[];
  /** Lines added and deleted, counting a heading as a line; close to `git diff --numstat`. */
  additions: number;
  deletions: number;
}

/**
 * Compares two versions of a law block by block. Changes come in the order of the new text,
 * with each deleted block placed after the block that preceded it in the old text.
 */
export function diffBlocks(oldBlocks: Block[], newBlocks: Block[]): BlockDiff {
  const oldByKey = new Map(oldBlocks.map((b) => [b.key, b]));
  const newIndex = new Map(newBlocks.map((b, i) => [b.key, i]));
  const out: { pos: number; sub: number; change: BlockChange }[] = [];
  let additions = 0;
  let deletions = 0;

  newBlocks.forEach((nb, i) => {
    const ob = oldByKey.get(nb.key);
    const base = { key: nb.key, level: nb.level, heading: nb.heading, context: nb.context };
    if (!ob) {
      additions += 1 + lineCount(nb.text);
      out.push({ pos: i, sub: 0, change: { op: "added", ...base, new: nb.text } });
      return;
    }
    if (ob.text === nb.text && ob.heading === nb.heading) return;
    const change: BlockChange = { op: "modified", ...base };
    if (ob.heading !== nb.heading) {
      change.oldHeading = ob.heading;
      additions++;
      deletions++;
    }
    if (ob.text !== nb.text) {
      if (ob.text.length + nb.text.length > SEGMENT_LIMIT) {
        change.hunks = toHunks(ob.text, nb.text);
        for (const h of change.hunks) {
          for (const l of h.lines) {
            if (l[0] === "+") additions++;
            else if (l[0] === "-") deletions++;
          }
        }
      } else {
        const st = toSegments(ob.text, nb.text);
        change.segments = st.segments;
        additions += st.additions;
        deletions += st.deletions;
      }
    }
    out.push({ pos: i, sub: 0, change });
  });

  let anchor = -1;
  oldBlocks.forEach((ob, j) => {
    const i = newIndex.get(ob.key);
    if (i !== undefined) {
      anchor = i;
      return;
    }
    deletions += 1 + lineCount(ob.text);
    out.push({
      pos: anchor,
      sub: j + 1,
      change: { op: "deleted", key: ob.key, level: ob.level, heading: ob.heading, context: ob.context, old: ob.text },
    });
  });

  out.sort((a, b) => a.pos - b.pos || a.sub - b.sub);
  return { changes: out.map((o) => o.change), additions, deletions };
}
