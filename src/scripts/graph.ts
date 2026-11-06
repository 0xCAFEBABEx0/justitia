// /graph/?laws=<id>,<id>,…
//
// A git-graph-like view of amendments: one lane per law, one row per amending law (newest
// first). A row has a node on every lane whose law that amendment changed, and the nodes of one
// row are joined, the way one commit touches several files. A lane starts where the law enters
// houritsu (制定 or 収録開始) and ends at its repeal; above the "today" line, amendments that are
// promulgated but not yet in force are drawn dashed.

import type { FileChangeKind, LawDetail } from "../../scripts/extract/types.ts";
import { dataUrl } from "./data-url.ts";
import { initSearch } from "./search.ts";

const DEFAULT_LAWS = ["140AC0000000045"]; // 刑法
const MAX_LANES = 12;
const LANE_W = 22;
const ROW_H = 52;
const PAD = 12;
const COLORS = [
  "#3b6fd4", "#d0563b", "#2e9d6a", "#a55bc9", "#d39a1c", "#1f9bb4",
  "#c94f86", "#6d7f1f", "#7a5c3e", "#5468a8", "#b8453f", "#3f8f8a",
];
const KIND: Record<FileChangeKind, string> = {
  enacted: "制定",
  coverage_start: "収録開始",
  amended: "改正",
  repealed: "廃止",
};

interface Row {
  type: "amendment";
  key: string;
  enforced: string | null;
  upcoming: boolean;
  title: string;
  lawNum: string;
  /** lane index → what happened to that law */
  nodes: Map<number, { kind: FileChangeKind; additions: number; deletions: number }>;
}
type Item = Row | { type: "today" };

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

function shortDate(iso: string | null): string {
  if (!iso) return "未定";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[1]}.${Number(m[2])}.${Number(m[3])}` : iso;
}

const cache = new Map<string, Promise<LawDetail | null>>();
function loadLaw(root: HTMLElement, id: string): Promise<LawDetail | null> {
  let p = cache.get(id);
  if (!p) {
    p = fetch(dataUrl(root, `laws/${id}.json`))
      .then((r) => (r.ok ? (r.json() as Promise<LawDetail>) : null))
      .catch(() => null);
    cache.set(id, p);
  }
  return p;
}

function buildItems(laws: LawDetail[]): Item[] {
  const rows = new Map<string, Row>();
  laws.forEach((law, lane) => {
    for (const r of law.revisions) {
      let row = rows.get(r.amendment);
      if (!row) {
        row = {
          type: "amendment",
          key: r.amendment,
          enforced: r.enforced,
          upcoming: r.branch === "upcoming",
          title: r.amendmentTitle,
          lawNum: r.amendmentLawNum,
          nodes: new Map(),
        };
        rows.set(r.amendment, row);
      }
      row.nodes.set(lane, { kind: r.kind, additions: r.additions, deletions: r.deletions });
    }
  });
  const byDateDesc = (a: Row, b: Row) =>
    (b.enforced ?? "9999-12-31").localeCompare(a.enforced ?? "9999-12-31") || b.key.localeCompare(a.key);
  const all = [...rows.values()];
  const upcoming = all.filter((r) => r.upcoming).sort(byDateDesc);
  const main = all.filter((r) => !r.upcoming).sort(byDateDesc);
  return upcoming.length ? [...upcoming, { type: "today" }, ...main] : main;
}

function svgFor(items: Item[], laws: LawDetail[]): string {
  const width = PAD * 2 + Math.max(laws.length - 1, 0) * LANE_W;
  const height = items.length * ROW_H;
  const x = (lane: number) => PAD + lane * LANE_W;
  const y = (i: number) => i * ROW_H + ROW_H / 2;
  const todayIdx = items.findIndex((it) => it.type === "today");
  const todayY = todayIdx >= 0 ? y(todayIdx) : -1;
  const parts: string[] = [];

  // Lanes.
  laws.forEach((_, lane) => {
    const idx = items.flatMap((it, i) => (it.type === "amendment" && it.nodes.has(lane) ? [i] : []));
    if (!idx.length) return;
    const newest = idx[0];
    const oldest = idx[idx.length - 1];
    const newestRow = items[newest] as Row;
    const ended = newestRow.nodes.get(lane)!.kind === "repealed";
    const onlyUpcoming = idx.every((i) => (items[i] as Row).upcoming);
    const top = ended || onlyUpcoming ? y(newest) : 0;
    const bottom = y(oldest);
    const color = COLORS[lane % COLORS.length];
    const seg = (y1: number, y2: number, dashed: boolean) =>
      y2 > y1
        ? `<line x1="${x(lane)}" y1="${y1}" x2="${x(lane)}" y2="${y2}" stroke="${color}" stroke-width="2.5"${dashed ? ' stroke-dasharray="4 4"' : ""}/>`
        : "";
    if (todayY > 0) {
      parts.push(seg(top, Math.min(bottom, todayY), true));
      parts.push(seg(Math.max(top, todayY), bottom, false));
    } else {
      parts.push(seg(top, bottom, false));
    }
  });

  // Today line.
  if (todayY > 0) {
    parts.push(`<line x1="0" y1="${todayY}" x2="${width}" y2="${todayY}" class="g-today"/>`);
  }

  // Nodes, with a connector across the lanes one amendment touched.
  items.forEach((it, i) => {
    if (it.type !== "amendment") return;
    const lanes = [...it.nodes.keys()].sort((a, b) => a - b);
    if (lanes.length > 1) {
      parts.push(`<line x1="${x(lanes[0])}" y1="${y(i)}" x2="${x(lanes[lanes.length - 1])}" y2="${y(i)}" class="g-link"/>`);
    }
    for (const lane of lanes) {
      const { kind } = it.nodes.get(lane)!;
      const color = COLORS[lane % COLORS.length];
      const cx = x(lane);
      const cy = y(i);
      const href = `/amendment/?k=${encodeURIComponent(it.key)}#law-${laws[lane].id}`;
      const label = `${laws[lane].title}：${KIND[kind]}（${shortDate(it.enforced)}）`;
      let shape: string;
      if (kind === "repealed") {
        shape = `<path d="M${cx - 5} ${cy - 5}L${cx + 5} ${cy + 5}M${cx + 5} ${cy - 5}L${cx - 5} ${cy + 5}" stroke="${color}" stroke-width="3"/>`;
      } else if (kind === "coverage_start") {
        shape = `<circle cx="${cx}" cy="${cy}" r="5.5" class="g-node-hollow" stroke="${color}"/>`;
      } else if (kind === "enacted") {
        shape = `<rect x="${cx - 6}" y="${cy - 6}" width="12" height="12" rx="2" fill="${color}"/>`;
      } else {
        shape = `<circle cx="${cx}" cy="${cy}" r="5.5" fill="${it.upcoming ? "var(--surface)" : color}" stroke="${color}" stroke-width="2.5"/>`;
      }
      parts.push(`<a href="${href}"><title>${esc(label)}</title>${shape}<circle cx="${cx}" cy="${cy}" r="10" fill="transparent"/></a>`);
    }
  });

  return `<svg class="g-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true">${parts.join("")}</svg>`;
}

function rowsHtml(items: Item[], laws: LawDetail[], today: string): string {
  return items
    .map((it) => {
      if (it.type === "today") return `<div class="g-row g-today-row"><span>今日（${shortDate(today)}）より上は施行前の改正</span></div>`;
      const lanes = [...it.nodes.keys()].sort((a, b) => a - b);
      let add = 0;
      let del = 0;
      const notes: string[] = [];
      for (const lane of lanes) {
        const n = it.nodes.get(lane)!;
        add += n.additions;
        del += n.deletions;
        if (n.kind !== "amended") notes.push(`${esc(laws[lane].title)}を${KIND[n.kind]}`);
      }
      const dots = lanes.map((l) => `<i style="background:${COLORS[l % COLORS.length]}"></i>`).join("");
      const href = `/amendment/?k=${encodeURIComponent(it.key)}#law-${laws[lanes[0]].id}`;
      return `<div class="g-row${it.upcoming ? " upcoming" : ""}">
        <div class="g-line1"><span class="g-date">${shortDate(it.enforced)}</span><a href="${href}">${esc(it.title)}</a></div>
        <div class="g-line2"><span class="g-dots">${dots}</span>${esc(it.lawNum)}${notes.length ? `・${notes.join("、")}` : ""}${
          add + del > 0 ? ` <span class="plus">+${add}</span> <span class="minus">−${del}</span>` : ""
        }</div>
      </div>`;
    })
    .join("");
}

export function initGraph(root: HTMLElement): void {
  const today = root.dataset.today!;
  const lanesEl = root.querySelector<HTMLElement>("[data-lanes]")!;
  const suggestEl = root.querySelector<HTMLElement>("[data-suggest]")!;
  const body = root.querySelector<HTMLElement>("[data-body]")!;
  const fromUrl = (new URLSearchParams(location.search).get("laws") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[0-9A-Za-z_]+$/.test(s));
  let ids = (fromUrl.length ? fromUrl : DEFAULT_LAWS).slice(0, MAX_LANES);
  let seq = 0;

  const setIds = (next: string[]) => {
    ids = [...new Set(next)].slice(0, MAX_LANES);
    const url = new URL(location.href);
    url.searchParams.set("laws", ids.join(","));
    history.replaceState(null, "", url);
    void render();
  };

  initSearch(root.querySelector<HTMLElement>("[data-graph-search]")!, (id) => {
    if (!ids.includes(id)) setIds([...ids, id]);
  });

  const render = async () => {
    const mine = ++seq;
    const loaded = await Promise.all(ids.map((id) => loadLaw(root, id)));
    if (mine !== seq) return;
    const laws = loaded.filter((l): l is LawDetail => l !== null);
    const missing = ids.filter((_, i) => loaded[i] === null);

    lanesEl.innerHTML = laws.length
      ? laws
          .map(
            (l, i) => `<span class="g-chip"><i style="background:${COLORS[i % COLORS.length]}"></i>
              <a href="/laws/${l.id}/">${esc(l.title)}</a>
              <button type="button" data-remove="${l.id}" aria-label="${esc(l.title)}を外す">×</button></span>`,
          )
          .join("")
      : `<span class="note">法令を追加してください。</span>`;
    if (missing.length) lanesEl.insertAdjacentHTML("beforeend", `<span class="note">見つからない法令 ID：${missing.map(esc).join("、")}</span>`);
    lanesEl.querySelectorAll<HTMLButtonElement>("[data-remove]").forEach((b) =>
      b.addEventListener("click", () => setIds(ids.filter((id) => id !== b.dataset.remove))),
    );

    // Suggestions: laws most often amended together with the ones shown.
    const score = new Map<string, { title: string; n: number }>();
    for (const l of laws) {
      for (const r of l.related ?? []) {
        if (ids.includes(r.id)) continue;
        const s = score.get(r.id) ?? { title: r.title, n: 0 };
        s.n += r.count;
        score.set(r.id, s);
      }
    }
    const sugg = [...score].sort((a, b) => b[1].n - a[1].n).slice(0, 8);
    suggestEl.innerHTML =
      sugg.length && ids.length < MAX_LANES
        ? `<span class="note">一緒に改正されることが多い法令：</span>` +
          sugg.map(([id, s]) => `<button type="button" data-add="${id}">＋ ${esc(s.title)}</button>`).join("")
        : "";
    suggestEl.querySelectorAll<HTMLButtonElement>("[data-add]").forEach((b) =>
      b.addEventListener("click", () => setIds([...ids, b.dataset.add!])),
    );

    if (!laws.length) {
      body.innerHTML = "";
      return;
    }
    const items = buildItems(laws);
    const svg = svgFor(items, laws);
    const width = PAD * 2 + Math.max(laws.length - 1, 0) * LANE_W;
    body.innerHTML = `<div class="g-wrap" style="--g-left:${width + 8}px">${svg}<div class="g-rows">${rowsHtml(items, laws, today)}</div></div>`;
  };

  void render();
}
