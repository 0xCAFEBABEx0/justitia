// Renders /versions/?law=<id>&at=<amendment key | YYYY-MM-DD>[&from=<...>].
//
// The text of a law at any of its revisions is put together from <data base>/history/<id>.json
// (see scripts/extract/history.ts). With `from`, the page shows what changed between the two
// revisions instead, like `git diff from..at`.

import { diffBlocks, type Block } from "../../scripts/extract/blocks.ts";
import { blocksAt } from "../../scripts/extract/history.ts";
import type { LawDetail, LawHistory, LawRevision } from "../../scripts/extract/types.ts";
import { renderBlocks, renderBlockText } from "../lib/render.ts";
import { blockHtml, esc, jpDate, VIEW_KEY, type View } from "./amendment.ts";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function toBlocks(h: LawHistory, r: number): Block[] {
  const stack: string[] = [];
  return blocksAt(h, r).map(([key, level, heading, text]) => {
    stack.length = level;
    const context = stack.slice(2).filter((s) => s);
    stack[level] = heading;
    return { key, level, heading, context, text };
  });
}

function revLabel(r: LawRevision): string {
  const date = r.enforced ? jpDate(r.enforced) : "施行日未定";
  const kind = r.kind === "repealed" ? "廃止" : r.kind === "enacted" ? "制定" : r.kind === "coverage_start" ? "収録開始" : "改正";
  return `${date} ${kind}${r.branch === "upcoming" ? "（施行予定）" : ""}：${r.amendmentTitle}`;
}

/** The revision a URL value names: an amendment key, or the last revision in force on a date. */
function resolve(revs: LawRevision[], value: string | null, fallback: number): number {
  if (!value) return fallback;
  const byKey = revs.findIndex((r) => r.amendment === value);
  if (byKey >= 0) return byKey;
  if (ISO.test(value)) {
    let found = -1;
    revs.forEach((r, i) => {
      if (r.enforced && r.enforced <= value) found = i;
    });
    return found;
  }
  return fallback;
}

function options(revs: LawRevision[], selected: number, none?: string): string {
  const opts = revs
    .map((r, i) => ({ r, i }))
    .reverse()
    .map(({ r, i }) => `<option value="${i}" ${i === selected ? "selected" : ""}>${esc(revLabel(r))}</option>`);
  if (none !== undefined) opts.unshift(`<option value="-1" ${selected < 0 ? "selected" : ""}>${esc(none)}</option>`);
  return opts.join("");
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return (await res.json()) as T;
}

export async function renderVersionsPage(root: HTMLElement): Promise<void> {
  const params = new URLSearchParams(location.search);
  const id = params.get("law");
  if (!id || !/^[0-9A-Za-z]+$/.test(id)) {
    root.innerHTML = `<p class="note">法令が指定されていません。<a href="/browse/">法令一覧</a>から選んでください。</p>`;
    return;
  }
  const base = root.dataset.base;
  let law: LawDetail;
  let hist: LawHistory;
  try {
    [law, hist] = await Promise.all([
      getJson<LawDetail>(`${base}/laws/${id}.json`),
      getJson<LawHistory>(`${base}/history/${id}.json`),
    ]);
  } catch {
    root.innerHTML = `<p class="note">法令「${esc(id)}」の履歴が見つかりませんでした。</p>`;
    return;
  }
  const revs = law.revisions;
  // The last revision in force; a law with only upcoming revisions has none.
  let lastInForce = -1;
  revs.forEach((r, i) => {
    if (r.branch === "main") lastInForce = i;
  });

  let at = resolve(revs, params.get("at"), Math.max(lastInForce, 0));
  let from = params.has("from") ? resolve(revs, params.get("from"), -1) : -1;
  // The date shown in the date input: the one asked for, until another revision is chosen.
  const asked = params.get("at") ?? "";
  let date = ISO.test(asked) && from < 0 ? asked : "";
  let view: View = "side";
  try {
    if (localStorage.getItem(VIEW_KEY) === "inline") view = "inline";
  } catch {
    /* storage unavailable */
  }

  const render = () => {
    const url = new URL(location.href);
    url.searchParams.set("law", id);
    if (at >= 0) url.searchParams.set("at", revs[at].amendment);
    if (from >= 0) url.searchParams.set("from", revs[from].amendment);
    else url.searchParams.delete("from");
    history.replaceState(null, "", url);

    const blocks = at >= 0 && revs[at].kind !== "repealed" ? toBlocks(hist, at) : [];
    const title = blocks.find((b) => b.level === 1)?.heading ?? law.title;
    document.title = `${title}（${from >= 0 ? "改正の比較" : "時点の条文"}） | justitia`;

    const controls = `<div class="versions-controls">
      <label>表示する時点 <select data-at>${options(revs, at)}</select></label>
      <label>日付で選ぶ <input type="date" data-date value="${date}" /></label>
      <label>比べる時点 <select data-from>${options(revs, from, "比べない（条文を表示）")}</select></label>
    </div>`;

    let body: string;
    if (at < 0) {
      body = `<p class="note">その日より前の条文はありません。houritsu の収録は ${revs[0]?.enforced ? jpDate(revs[0].enforced) : "最初の改正"} からです。</p>`;
    } else if (from >= 0) {
      const diff = diffBlocks(toBlocks(hist, from), blocks);
      const older = Math.min(from, at) === from;
      body =
        `<p class="note">${esc(revLabel(revs[from]))} の時点から ${esc(revLabel(revs[at]))} の時点までに変わった箇所です${older ? "" : "（新しい時点から古い時点への変化として表示しています）"}。` +
        ` <span class="plus">+${diff.additions}</span> <span class="minus">−${diff.deletions}</span>・変更 ${diff.changes.length} か所</p>` +
        `<div class="view-toggle" role="group" aria-label="表示">
          <button type="button" data-view="side" aria-pressed="${view === "side"}">新旧対照</button>
          <button type="button" data-view="inline" aria-pressed="${view === "inline"}">インライン</button>
        </div>` +
        (diff.changes.length
          ? diff.changes
              .map((b) =>
                blockHtml(b, id, view, (key) => `/versions/?law=${id}&at=${encodeURIComponent(revs[at].amendment)}#${encodeURIComponent(key)}`),
              )
              .join("")
          : `<p class="note">条文の違いはありません。</p>`);
    } else if (revs[at].kind === "repealed") {
      body = `<p class="note">この時点で廃止されています。</p>`;
    } else {
      const titleBlock = blocks.find((b) => b.level === 1);
      const rendered = renderBlocks(blocks);
      const preamble = titleBlock?.text ? `<section class="blk preamble">${renderBlockText(titleBlock.text)}</section>\n` : "";
      const r = revs[at];
      const notice =
        at === lastInForce
          ? "現在施行されている条文です。"
          : r.branch === "upcoming"
            ? "まだ施行されていない改正を反映した条文です。"
            : "過去の条文です。現在の条文とは異なります。";
      body = `<p class="note">${esc(revLabel(r))} の後の条文。${notice}
          <a href="/amendment/?k=${encodeURIComponent(r.amendment)}#law-${esc(id)}">この改正の新旧対照</a></p>
        <article class="law-text">${preamble}${rendered.html}</article>`;
    }

    root.className = from >= 0 && view === "inline" ? "inline-view" : "";
    root.innerHTML = `<div class="crumbs"><a href="/laws/${esc(id)}/">${esc(law.title)}</a></div>
      <h1 class="page-title">${esc(title)}</h1>
      ${controls}${body}`;

    root.querySelector<HTMLSelectElement>("[data-at]")!.addEventListener("change", (e) => {
      at = Number((e.target as HTMLSelectElement).value);
      date = "";
      render();
    });
    root.querySelector<HTMLSelectElement>("[data-from]")!.addEventListener("change", (e) => {
      from = Number((e.target as HTMLSelectElement).value);
      date = "";
      render();
    });
    root.querySelector<HTMLInputElement>("[data-date]")!.addEventListener("change", (e) => {
      const v = (e.target as HTMLInputElement).value;
      if (!ISO.test(v)) return;
      at = resolve(revs, v, at);
      from = -1;
      date = v;
      render();
    });
    root.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((btn) =>
      btn.addEventListener("click", () => {
        view = btn.dataset.view as View;
        try {
          localStorage.setItem(VIEW_KEY, view);
        } catch {
          /* ignore */
        }
        const y = scrollY;
        render();
        scrollTo(0, y);
      }),
    );
  };
  render();
  if (location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
}
