// Per-law block history: every version of every block of a law, so the text at any revision
// can be put together in the browser from one file.
//
// While the extractor walks the commits it appends one HistoryEntry per law revision to a log;
// buildHistory() turns a law's log into a LawHistory.

import type { Block } from "./blocks.ts";
import type { LawHistory } from "./types.ts";

/** [key, level, heading, text] */
export type BlockVersion = [string, number, string, string];

export interface HistoryEntry {
  /** Index into the law's revisions. */
  r: number;
  /** The block keys of this revision, in order. Present when they differ from the previous revision. */
  keys?: string[];
  /** Blocks that are new or changed in this revision. */
  set?: BlockVersion[];
}

function sameBlock(a: Block, b: Block): boolean {
  return a.level === b.level && a.heading === b.heading && a.text === b.text;
}

/** The log entry for a revision that turned `oldBlocks` into `newBlocks` (either may be empty). */
export function historyEntry(r: number, oldBlocks: Block[], newBlocks: Block[], fresh: boolean): HistoryEntry {
  const entry: HistoryEntry = { r };
  const keysChanged =
    fresh || oldBlocks.length !== newBlocks.length || oldBlocks.some((b, i) => b.key !== newBlocks[i].key);
  if (keysChanged) entry.keys = newBlocks.map((b) => b.key);
  const old = fresh ? new Map<string, Block>() : new Map(oldBlocks.map((b) => [b.key, b]));
  const set: BlockVersion[] = [];
  for (const b of newBlocks) {
    const o = old.get(b.key);
    if (!o || !sameBlock(o, b)) set.push([b.key, b.level, b.heading, b.text]);
  }
  if (set.length) entry.set = set;
  return entry;
}

interface Entry {
  k: string;
  v: number[];
}

function lastText(e: Entry): number {
  return e.v.length ? e.v[e.v.length - 1] : -1;
}

function setText(e: Entry, r: number, t: number): void {
  const n = e.v.length;
  if (n && e.v[n - 2] === r) {
    e.v[n - 1] = t;
    // A version that lasted no revision at all is dropped.
    if (n >= 4 && e.v[n - 3] === t) e.v.length = n - 2;
  } else if (lastText(e) !== t) {
    e.v.push(r, t);
  }
}

/**
 * Blocks are kept in one merged order across all revisions: the blocks of any revision appear
 * in it in their order in that revision. A block that moves gets a second entry.
 */
export function buildHistory(entries: HistoryEntry[]): LawHistory {
  const texts: [number, string, string][] = [];
  const textIndex = new Map<string, number>();
  let order: Entry[] = [];
  let active = new Map<string, Entry>(); // key -> entry of the current revision
  const latest = new Map<string, Entry>(); // key -> newest entry for the key, alive or not

  for (const en of entries) {
    if (en.keys) {
      const pos = new Map<Entry, number>();
      order.forEach((e, i) => pos.set(e, i));
      const inserts = new Map<number, Entry[]>();
      const next = new Map<string, Entry>();
      let last = -1;
      for (const k of en.keys) {
        let e = active.get(k) ?? latest.get(k);
        const p = e ? pos.get(e)! : -1;
        if (e && p > last) {
          last = p;
        } else {
          e = { k, v: [] };
          latest.set(k, e);
          let list = inserts.get(last);
          if (!list) inserts.set(last, (list = []));
          list.push(e);
        }
        next.set(k, e);
      }
      for (const [k, e] of active) {
        const n = next.get(k);
        if (n === e) continue;
        // A block that moved keeps its text in its new place unless this revision changes it.
        if (n) setText(n, en.r, lastText(e));
        setText(e, en.r, -1);
      }
      const merged: Entry[] = [...(inserts.get(-1) ?? [])];
      order.forEach((e, i) => merged.push(e, ...(inserts.get(i) ?? [])));
      order = merged;
      active = next;
    }
    for (const [k, level, heading, text] of en.set ?? []) {
      const e = active.get(k);
      if (!e) throw new Error(`block ${k} set in revision ${en.r} but not in its keys`);
      const id = JSON.stringify([level, heading, text]);
      let t = textIndex.get(id);
      if (t === undefined) {
        t = texts.length;
        texts.push([level, heading, text]);
        textIndex.set(id, t);
      }
      setText(e, en.r, t);
    }
  }
  return { texts, blocks: order.filter((e) => e.v.length).map((e) => ({ k: e.k, v: e.v })) };
}

/** The blocks of revision `r`, as [key, level, heading, text]. */
export function blocksAt(h: LawHistory, r: number): BlockVersion[] {
  const out: BlockVersion[] = [];
  for (const b of h.blocks) {
    let t = -1;
    for (let i = 0; i < b.v.length && b.v[i] <= r; i += 2) t = b.v[i + 1];
    if (t >= 0) {
      const [level, heading, text] = h.texts[t];
      out.push([b.k, level, heading, text]);
    }
  }
  return out;
}
