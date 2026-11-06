// Renders /amendment/?k=<key> from <data base>/amendments/<key>.json.
//
// Each changed block is shown like a 新旧対照表: the text after the amendment on the left and
// before it on the right, with the changed parts marked. An inline view puts both in one column.

import type { Amendment, BlockChange, FileChange, Hunk, Segment } from "../../scripts/extract/types.ts";
import { badgeClass } from "../lib/badges.ts";
import { DISCLAIMER_NOTE_HTML } from "../lib/disclaimer.ts";
import { SITE_NAME } from "../lib/site-name.ts";
import { dataUrl } from "./data-url.ts";

const KIND: Record<FileChange["kind"], string> = {
  enacted: "制定",
  coverage_start: "収録開始",
  amended: "改正",
  repealed: "廃止",
};
const OP: Record<BlockChange["op"], string> = { added: "新設", deleted: "削除", modified: "改正" };
const OP_BADGE: Record<BlockChange["op"], string> = {
  added: "badge badge-sm badge-success",
  deleted: "badge badge-sm badge-error",
  modified: "badge badge-sm badge-warning",
};
/** A short explanatory line (no data, nothing found, and so on). */
export const NOTE = "text-sm text-base-content/70";

/** The 新旧対照 / インライン switch, as a daisyUI join of two buttons. */
export function viewToggleHtml(view: View): string {
  const btn = (v: View, label: string) =>
    `<button type="button" class="btn btn-sm join-item ${view === v ? "btn-primary" : "border-base-300 bg-base-100"}" data-view="${v}" aria-pressed="${view === v}">${label}</button>`;
  return `<div class="join my-2" role="group" aria-label="表示">${btn("side", "新旧対照")}${btn("inline", "インライン")}</div>`;
}

export type View = "side" | "inline";
export const VIEW_KEY = "justitia:view";

export function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

/**
 * Law text is markdown with a little HTML (ruby, sup/sub, br, tables). The diff view shows it
 * as plain text: tags are simplified, then everything is escaped.
 */
function plain(s: string): string {
  return esc(
    s
      .replace(/<rt>/g, "（")
      .replace(/<\/rt>/g, "）")
      .replace(/<br\s*\/?>/g, "\n")
      .replace(/<\/?(ruby|rp|sup|sub)>/g, ""),
  );
}

export function jpDate(iso: string | null): string {
  if (!iso) return "未定";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[1]}年${Number(m[2])}月${Number(m[3])}日` : iso;
}

/**
 * Final touches on diff HTML: drop the markdown list markers in front of 号 ("- 一　…") and
 * the blank lines between paragraphs.
 */
function tidy(html: string): string {
  return html.replace(/(^|\n)((?:<(?:ins|del)>)?)- /g, "$1$2").replace(/\n\n/g, "\n");
}

function sideHtml(segs: Segment[], keep: -1 | 1): string {
  return tidy(segs
    .filter(([op]) => op === 0 || op === keep)
    .map(([op, t]) => (op === 0 ? plain(t) : keep === 1 ? `<ins>${plain(t)}</ins>` : `<del>${plain(t)}</del>`))
    .join(""));
}

function inlineHtml(segs: Segment[]): string {
  return tidy(
    segs.map(([op, t]) => (op === 0 ? plain(t) : op === 1 ? `<ins>${plain(t)}</ins>` : `<del>${plain(t)}</del>`)).join(""),
  );
}

function hunksHtml(hunks: Hunk[]): string {
  return `<div class="hunks pb-2">${hunks
    .map(
      (h) =>
        `<div class="hh">@@ 改正前 ${h.oldStart}行目〜 / 改正後 ${h.newStart}行目〜 @@</div>` +
        h.lines
          .map((l) => {
            const cls = l[0] === "+" ? "a" : l[0] === "-" ? "d" : "";
            return `<div class="hl ${cls}">${esc(l)}</div>`;
          })
          .join(""),
    )
    .join("")}</div>`;
}

function headingHtml(h: string): string {
  return plain(h);
}

/**
 * One changed block. "条文へ" links to the block in the current law text, or to `articleUrl(key)`
 * when given (the version page links to the revision being compared instead).
 */
export function blockHtml(b: BlockChange, lawId: string, view: View, articleUrl?: (key: string) => string): string {
  const ctx = b.context.length ? `<span class="text-xs text-base-content/60">${b.context.map(headingHtml).join(" › ")}</span>` : "";
  const href = articleUrl ? articleUrl(b.key) : `/laws/${lawId}/#${encodeURIComponent(b.key)}`;
  const link = b.op !== "deleted" ? ` <a class="link link-primary text-xs" href="${esc(href)}">条文へ</a>` : "";
  const heading = b.oldHeading
    ? `<del>${headingHtml(b.oldHeading)}</del> → <b>${headingHtml(b.heading)}</b>`
    : `<b>${headingHtml(b.heading) || "（前文）"}</b>`;
  let body: string;
  if (b.op === "added") {
    body = `<div class="px-4 py-3"><div class="txt">${tidy(`<ins>${plain(b.new ?? "")}</ins>`)}</div></div>`;
  } else if (b.op === "deleted") {
    body = `<div class="px-4 py-3"><div class="txt">${tidy(`<del>${plain(b.old ?? "")}</del>`)}</div></div>`;
  } else if (b.hunks) {
    body = `<p class="${NOTE} px-4 py-2">大きな表などのため、行ごとの差分で表示しています。</p>${hunksHtml(b.hunks)}`;
  } else if (b.segments) {
    body =
      view === "side"
        ? `<div class="cmp"><div><div class="mb-1 text-xs text-base-content/60">改正後</div><div class="txt">${sideHtml(b.segments, 1)}</div></div>` +
          `<div><div class="mb-1 text-xs text-base-content/60">改正前</div><div class="txt">${sideHtml(b.segments, -1)}</div></div></div>`
        : `<div class="px-4 py-3"><div class="txt">${inlineHtml(b.segments)}</div></div>`;
  } else {
    body = `<p class="${NOTE} px-4 py-3">見出しだけが変わりました。</p>`;
  }
  return `<section class="card card-border my-3 overflow-hidden bg-base-100"><header class="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-base-300 px-4 py-2 text-sm"><span class="${OP_BADGE[b.op]}">${OP[b.op]}</span>${heading}${link}${ctx}</header>${body}</section>`;
}

function fileHtml(f: FileChange, view: View, amendmentKey?: string): string {
  const stats =
    f.kind === "amended" ? ` <span class="tabular-nums"><span class="text-add">+${f.additions}</span> <span class="text-del">−${f.deletions}</span></span>` : "";
  const title = f.titleChange ? `<div class="${NOTE}">題名：<del>${esc(f.titleChange.from)}</del> → ${esc(f.titleChange.to)}</div>` : "";
  let body = "";
  if (f.kind === "amended") {
    body = f.blocks?.length
      ? f.blocks.map((b) => blockHtml(b, f.lawId, view)).join("")
      : `<p class="${NOTE}">条文の変更はありません（e-Gov のデータ上の改訂のみ）。</p>`;
  } else if (f.kind === "repealed") {
    body = `<p class="${NOTE}">この改正で廃止されました。</p>`;
  } else {
    body = `<p class="${NOTE}">${f.kind === "enacted" ? "この法令はここで制定されました。" : "この法令は houritsu にここから収録されています（それ以前の改正履歴はありません）。"}全文は<a class="link link-primary" href="/laws/${f.lawId}/">条文ページ</a>で見られます。</p>`;
  }
  const versions =
    f.kind !== "repealed" && amendmentKey
      ? `・<a class="link link-primary" href="/versions/?law=${f.lawId}&at=${encodeURIComponent(amendmentKey)}">改正後の条文</a>`
      : "";
  return `<section class="mt-8 scroll-mt-[4.5rem]" id="law-${esc(f.lawId)}">
    <h2 class="text-xl font-bold"><a class="link link-hover" href="/laws/${f.lawId}/">${esc(f.title)}</a> <span class="${badgeClass(f.kind)}">${KIND[f.kind]}</span></h2>
    <div class="mt-0.5 mb-3 text-sm text-base-content/60">${esc(f.lawNum)}${stats}${f.blocks ? `・変更 ${f.blocks.length} か所` : ""}${versions}</div>
    ${title}${body}
  </section>`;
}

function headHtml(a: Amendment): string {
  const facts: [string, string][] = [
    ["改正法令", esc(a.amendmentLawNum)],
    ["公布日", jpDate(a.promulgated)],
    ["施行日", a.enforced ? jpDate(a.enforced) : esc(a.enforcedText ?? "未定")],
  ];
  if (a.bill) {
    const name = esc(a.bill.name) + (a.bill.submitter ? `（提出：${esc(a.bill.submitter)}）` : "");
    facts.push(["議案", a.bill.url && /^https?:\/\//.test(a.bill.url) ? `<a class="link link-primary" href="${esc(a.bill.url)}" rel="noopener">${name}</a>` : name]);
  }
  facts.push(["変更された法令", `${a.files.length} 件`]);
  const toc =
    a.files.length > 1
      ? `<details class="collapse-arrow collapse mb-2 border border-base-300 bg-base-100" ${a.files.length <= 20 ? "open" : ""}><summary class="collapse-title font-bold">変更された法令</summary><ul class="collapse-content menu menu-sm w-full pt-0">${a.files
          .map((f) => `<li><a href="#law-${esc(f.lawId)}">${esc(f.title)} <span class="${badgeClass(f.kind)}">${KIND[f.kind]}</span></a></li>`)
          .join("")}</ul></details>`
      : "";
  return `<div>
    <div class="breadcrumbs py-0 text-sm text-base-content/70"><ul><li><a href="/timeline/">改正の年表</a></li><li><a href="/timeline/${a.enforced?.slice(0, 4) ?? "undetermined"}/">${a.enforced?.slice(0, 4) ?? "施行日未定"}</a></li></ul></div>
    <h1 class="text-2xl leading-snug font-bold sm:text-3xl">${esc(a.title)}${a.branch === "upcoming" ? ` <span class="${badgeClass("upcoming")}">施行予定</span>` : ""}</h1>
    <dl class="my-4 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-0.5 text-sm">${facts.map(([k, v]) => `<dt class="text-base-content/60">${k}</dt><dd>${v}</dd>`).join("")}</dl>
    ${DISCLAIMER_NOTE_HTML}
    ${toc}
  </div>`;
}

export async function renderAmendmentPage(root: HTMLElement): Promise<void> {
  const key = new URLSearchParams(location.search).get("k");
  if (!key || !/^[0-9A-Za-z_-]+$/.test(key)) {
    root.innerHTML = `<p class="${NOTE}">改正が指定されていません。<a class="link link-primary" href="/timeline/">改正の年表</a>から選んでください。</p>`;
    return;
  }
  let a: Amendment;
  try {
    const res = await fetch(dataUrl(root, `amendments/${key}.json`));
    if (!res.ok) throw new Error(String(res.status));
    a = (await res.json()) as Amendment;
  } catch {
    root.innerHTML = `<p class="${NOTE}">改正「${esc(key)}」が見つかりませんでした。</p>`;
    return;
  }
  document.title = `${a.title}（${jpDate(a.enforced)}施行） | ${SITE_NAME}`;

  let view: View = "side";
  try {
    if (localStorage.getItem(VIEW_KEY) === "inline") view = "inline";
  } catch {
    /* storage unavailable */
  }

  const hasDiffs = a.files.some((f) => f.blocks?.some((b) => b.segments));
  const render = () => {
    const toggle = hasDiffs ? viewToggleHtml(view) : "";
    root.className = view === "inline" ? "inline-view" : "";
    root.innerHTML = headHtml(a) + toggle + a.files.map((f) => fileHtml(f, view, a.key)).join("");
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
