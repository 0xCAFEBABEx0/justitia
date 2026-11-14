// Renders the static amendment pages, /amendment/<key>/, with what <data base>/amendments/<key>.json adds to them,
// and forwards /amendment/?k=<key> (the address the site linked before the static pages) to /amendment/<key>/.
//
// Each changed block is shown like a 新旧対照表: the text after the amendment on the left and
// before it on the right, with the changed parts marked. An inline view puts both in one column.

import type { Amendment, BlockChange, FileChange, Hunk, Segment } from "../../scripts/extract/types.ts";
import { badgeClass } from "../lib/badges.ts";
import { isStaged } from "../lib/new-laws.ts";
import { amendingLawNum } from "../lib/law-num.ts";
import { DISCLAIMER_NOTE_HTML } from "../lib/disclaimer.ts";
import { linkPieces, type Piece } from "../lib/links.ts";
import { shareToolsHtml } from "../lib/share.ts";
import { dataUrl } from "./data-url.ts";

const KIND: Record<FileChange["kind"], string> = {
  enacted: "制定",
  coverage_start: "収録開始",
  amended: "改正",
  repealed: "廃止",
};
/** The badge for how an amendment changes a law: a later part of a new law coming into force reads 段階施行, not 改正. */
function kindBadge(f: FileChange, amendmentLawId: string): string {
  return isStaged(f.kind, f.lawId, amendmentLawId)
    ? `<span class="${badgeClass("staged")}">段階施行</span>`
    : `<span class="${badgeClass(f.kind)}">${KIND[f.kind]}</span>`;
}
const OP: Record<BlockChange["op"], string> = { added: "新設", deleted: "削除", modified: "改正" };
const OP_BADGE: Record<BlockChange["op"], string> = {
  added: "badge badge-sm badge-success",
  deleted: "badge badge-sm badge-error",
  modified: "badge badge-sm badge-warning",
};
/** A short explanatory line (no data, nothing found, and so on). */
export const NOTE = "text-sm text-base-content/70";

/** Around one amendment of one law: the law's e-Gov revision IDs before and after it, and the key of the law's revision before it. */
export interface RevisionLinks {
  before?: string;
  after?: string;
  from?: string;
}

/**
 * What the static page adds to the amendment file from the law files (laws/<id>.json), passed to the browser in the
 * page's data-links attribute so that the page rendered again in the browser keeps it.
 */
export interface AmendmentLinks {
  /** By law ID, for the laws the amendment changes. */
  laws: Record<string, RevisionLinks>;
  /** Laws for the amendment graph button; without it, the laws the amendment changes. */
  graph?: string[];
}

/** The graph page shows at most this many laws (MAX_LANES in src/scripts/graph.ts). */
const GRAPH_LANES = 12;

/**
 * A law on e-Gov 法令検索 as it read at one revision: /law/<law ID>/<the rest of the revision ID>. A revision ID e-Gov
 * does not know opens the current text without an error, so the ID must come from the data (houritsu's revision_id),
 * never be pieced together from the amendment key (e-Gov dates undetermined revisions 21171231, for one).
 */
export function egovRevisionUrl(lawId: string, revisionId: string | undefined): string | null {
  if (!revisionId?.startsWith(`${lawId}_`)) return null;
  const rest = revisionId.slice(lawId.length + 1);
  return /^\d{8}_[0-9A-Za-z]+$/.test(rest) ? `https://laws.e-gov.go.jp/law/${lawId}/${rest}` : null;
}

/** The amendment graph of the laws the amendment changes (or `links.graph`). */
export function graphUrl(a: Amendment, links?: AmendmentLinks): string {
  const ids = links?.graph?.length ? links.graph : a.files.map((f) => f.lawId);
  return `/graph/?laws=${[...new Set(ids)].slice(0, GRAPH_LANES).map(encodeURIComponent).join(",")}`;
}

/** The 新旧対照 / インライン switch, as a daisyUI join of two buttons. */
export function viewToggleHtml(view: View): string {
  const btn = (v: View, label: string) =>
    `<button type="button" class="btn btn-sm join-item ${view === v ? "btn-primary" : "border-base-300 bg-base-100"}" data-view="${v}" aria-pressed="${view === v}">${label}</button>`;
  return `<div class="join my-2 print:hidden" role="group" aria-label="表示">${btn("side", "新旧対照")}${btn("inline", "インライン")}</div>`;
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

/** A URL in the text, opened in a new tab like the links on the law pages. */
function linkOpen(href: string): string {
  return `<a class="link link-primary" href="${esc(href)}" rel="noopener" target="_blank">`;
}

/**
 * Diff pieces to HTML: changed text in <ins>/<del>, and each URL in one <a> around its pieces,
 * so a URL that the amendment changed in the middle is still one link with the change marked.
 */
function piecesHtml(pieces: Piece[], text: (s: string) => string = plain): string {
  let out = "";
  let open: Piece["link"] = null;
  for (const p of pieces) {
    if (p.link !== open) {
      if (open) out += "</a>";
      if (p.link) out += linkOpen(p.link.href);
      open = p.link;
    }
    const t = text(p.text);
    out += p.op === 0 ? t : p.op === 1 ? `<ins>${t}</ins>` : `<del>${t}</del>`;
  }
  return open ? out + "</a>" : out;
}

function sideHtml(segs: Segment[], keep: -1 | 1): string {
  return tidy(piecesHtml(linkPieces(segs, keep)));
}

function inlineHtml(segs: Segment[]): string {
  return tidy(piecesHtml(linkPieces(segs, 0)));
}

function hunksHtml(hunks: Hunk[]): string {
  return `<div class="hunks pb-2">${hunks
    .map(
      (h) =>
        `<div class="hh">@@ 改正前 ${h.oldStart}行目〜 / 改正後 ${h.newStart}行目〜 @@</div>` +
        h.lines
          .map((l) => {
            const cls = l[0] === "+" ? "a" : l[0] === "-" ? "d" : "";
            return `<div class="hl ${cls}">${piecesHtml(linkPieces([[0, l]], 1), esc)}</div>`;
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
  const ctx = b.context.length ? `<span class="text-xs text-base-content/65">${b.context.map(headingHtml).join(" › ")}</span>` : "";
  const href = articleUrl ? articleUrl(b.key) : `/laws/${lawId}/#${encodeURIComponent(b.key)}`;
  const link = b.op !== "deleted" ? ` <a class="link link-primary text-xs print:hidden" href="${esc(href)}">条文へ</a>` : "";
  const heading = b.oldHeading
    ? `<del>${headingHtml(b.oldHeading)}</del> → <b>${headingHtml(b.heading)}</b>`
    : `<b>${headingHtml(b.heading) || "（前文）"}</b>`;
  let body: string;
  if (b.op === "added") {
    body = `<div class="px-4 py-3"><div class="txt">${tidy(piecesHtml(linkPieces([[1, b.new ?? ""]], 1)))}</div></div>`;
  } else if (b.op === "deleted") {
    body = `<div class="px-4 py-3"><div class="txt">${tidy(piecesHtml(linkPieces([[-1, b.old ?? ""]], -1)))}</div></div>`;
  } else if (b.hunks) {
    body = `<p class="${NOTE} px-4 py-2">大きな表などのため、行ごとの差分で表示しています。</p>${hunksHtml(b.hunks)}`;
  } else if (b.segments) {
    body =
      view === "side"
        ? `<div class="cmp"><div><div class="mb-1 text-xs text-base-content/65">改正後</div><div class="txt">${sideHtml(b.segments, 1)}</div></div>` +
          `<div><div class="mb-1 text-xs text-base-content/65">改正前</div><div class="txt">${sideHtml(b.segments, -1)}</div></div></div>`
        : `<div class="px-4 py-3"><div class="txt">${inlineHtml(b.segments)}</div></div>`;
  } else {
    body = `<p class="${NOTE} px-4 py-3">見出しだけが変わりました。</p>`;
  }
  return `<section class="card card-border my-3 overflow-hidden bg-base-100"><header class="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-base-300 px-4 py-2 text-sm"><span class="${OP_BADGE[b.op]}">${OP[b.op]}</span>${heading}${link}${ctx}</header>${body}</section>`;
}

/**
 * One changed law. With `blocks`, only the blocks it returns are shown (the static page renders as many as fit
 * its size budget, see amendmentStaticHtml).
 */
function fileHtml(
  f: FileChange,
  view: View,
  a: Amendment,
  links: AmendmentLinks | undefined,
  blocks: BlockChange[] | undefined = f.blocks,
): string {
  const staged = isStaged(f.kind, f.lawId, a.amendmentLawId);
  const stats =
    f.kind === "amended" ? ` <span class="tabular-nums"><span class="text-add">+${f.additions}</span> <span class="text-del">−${f.deletions}</span></span>` : "";
  const title = f.titleChange ? `<div class="${NOTE}">題名：<del>${esc(f.titleChange.from)}</del> → ${esc(f.titleChange.to)}</div>` : "";
  let body = "";
  if (f.kind === "amended") {
    body = (staged ? `<p class="${NOTE}">この法令自身の規定のうち、この日に施行された部分です（段階施行）。</p>` : "") +
      (f.blocks?.length
      ? (blocks ?? []).map((b) => blockHtml(b, f.lawId, view)).join("") +
        (blocks && blocks.length < f.blocks.length ? `<p class="${NOTE} my-3" data-rest>残り ${f.blocks.length - blocks.length} か所の差分を読み込んでいます…</p>` : "")
      : `<p class="${NOTE}">条文の変更はありません（e-Gov のデータ上の改訂のみ）。</p>`);
  } else if (f.kind === "repealed") {
    body = `<p class="${NOTE}">この改正で廃止されました。</p>`;
  } else {
    body = `<p class="${NOTE}">${f.kind === "enacted" ? "この法令はここで制定されました。" : "この法令は houritsu にここから収録されています（それ以前の改正履歴はありません）。"}全文は<a class="link link-primary" href="/laws/${f.lawId}/">条文ページ</a>で見られます。</p>`;
  }
  const actions = lawActionsHtml(f, a, staged, links?.laws[f.lawId]);
  return `<section class="mt-8 scroll-mt-[4.5rem] print:mt-6" id="law-${esc(f.lawId)}">
    <h2 class="text-xl font-bold break-after-avoid"><a class="link link-hover" href="/laws/${f.lawId}/">${esc(f.title)}</a> ${kindBadge(f, a.amendmentLawId)}</h2>
    <div class="mt-0.5 ${actions ? "" : "mb-3 "}text-sm text-base-content/65">${esc(f.lawNum)}${stats}${f.blocks ? `・変更 ${f.blocks.length} か所` : ""}</div>
    ${actions}${title}${body}
  </section>`;
}

/**
 * The links under one changed law, like the buttons under a law page's heading: its text after the change, the whole
 * text compared with the revision before (the versions page), the two revisions on e-Gov 法令検索 (where readers
 * check the official text, as the disclaimer asks), and, on an amendment that changes several laws, printing it alone.
 */
function lawActionsHtml(f: FileChange, a: Amendment, staged: boolean, r: RevisionLinks | undefined): string {
  const what = staged ? "施行" : "改正";
  const link = (href: string, label: string) => `<a class="link link-primary inline-block py-0.5" href="${esc(href)}">${label}</a>`;
  const items: string[] = [];
  const key = encodeURIComponent(a.key);
  if (f.kind !== "repealed") items.push(link(`/versions/?law=${f.lawId}&at=${key}`, `${what}後の条文`));
  if (f.kind === "amended" && r?.from) items.push(link(`/versions/?law=${f.lawId}&from=${encodeURIComponent(r.from)}&at=${key}`, `${what}前と全文で比較`));
  // No e-Gov link for a repeal: e-Gov showed no text for the revision of a repealed law checked (2026-11).
  const after = f.kind !== "repealed" ? egovRevisionUrl(f.lawId, r?.after) : null;
  const before = f.kind === "amended" ? egovRevisionUrl(f.lawId, r?.before) : null;
  if (before) items.push(link(before, `e-Gov（${what}前）`));
  if (after) items.push(link(after, f.kind === "amended" ? `e-Gov（${what}後）` : f.kind === "enacted" ? "e-Gov（制定時）" : "e-Gov（この時点）"));
  // An amendment that changes many laws: each can be printed alone.
  if (a.files.length > 1)
    items.push(`<button type="button" class="btn btn-ghost btn-xs font-normal text-primary" data-print-law="law-${esc(f.lawId)}">この法令だけ印刷</button>`);
  return items.length ? `<div class="mt-0.5 mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm print:hidden">${items.join("")}</div>` : "";
}

function headHtml(a: Amendment, links: AmendmentLinks | undefined): string {
  const facts: [string, string][] = [
    ["改正法令", esc(amendingLawNum(a.amendmentLawNum))],
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
      ? `<details class="collapse-arrow collapse mb-2 border print:hidden border-base-300 bg-base-100" ${a.files.length <= 20 ? "open" : ""}><summary class="collapse-title font-bold">変更された法令</summary><ul class="collapse-content menu menu-sm w-full pt-0">${a.files
          .map((f) => `<li><a href="#law-${esc(f.lawId)}">${esc(f.title)} ${kindBadge(f, a.amendmentLawId)}</a></li>`)
          .join("")}</ul></details>`
      : "";
  return `<div>
    <div class="breadcrumbs py-0 text-sm text-base-content/70 print:hidden"><ul><li><a href="/timeline/">改正の年表</a></li><li><a href="/timeline/${a.enforced?.slice(0, 4) ?? "undetermined"}/">${a.enforced?.slice(0, 4) ?? "施行日未定"}</a></li></ul></div>
    <h1 class="text-2xl leading-snug font-bold sm:text-3xl">${esc(a.title)}${a.branch === "upcoming" ? ` <span class="${badgeClass("upcoming")}">施行予定</span>` : ""}</h1>
    <dl class="my-4 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-0.5 text-sm">${facts.map(([k, v]) => `<dt class="text-base-content/65">${k}</dt><dd>${v}</dd>`).join("")}</dl>
    <div class="mb-4 flex flex-wrap gap-2 print:hidden">
      <a class="btn btn-soft btn-sm btn-primary" href="${esc(graphUrl(a, links))}">改正のグラフ</a>
      ${shareToolsHtml("sm:ml-auto", "sm:dropdown-end")}
    </div>
    ${DISCLAIMER_NOTE_HTML}
    ${toc}
  </div>`;
}

/** Adds or replaces a <head> element, such as the robots meta tag or the canonical link. */
const utf8 = new TextEncoder();

/**
 * The amendment page's content as built into the static page /amendment/<key>/, in the side-by-side view.
 * Googlebot reads only the first 2 MB of a page, and an amendment that changes dozens of laws runs to several MB,
 * so blocks are rendered only while the content stays within `budget` bytes; `complete` says whether all were.
 * In the browser, renderAmendmentPage then fetches the amendment and renders the rest.
 */
export function amendmentStaticHtml(a: Amendment, budget: number, links?: AmendmentLinks): { html: string; complete: boolean } {
  const hasDiffs = a.files.some((f) => f.blocks?.some((b) => b.segments));
  const parts = [headHtml(a, links), hasDiffs ? viewToggleHtml("side") : ""];
  let used = parts.reduce((n, p) => n + utf8.encode(p).length, 0);
  let complete = true;
  for (const f of a.files) {
    const blocks: BlockChange[] = [];
    if (complete) {
      for (const b of f.blocks ?? []) {
        const size = utf8.encode(blockHtml(b, f.lawId, "side")).length;
        if (used + size > budget) {
          complete = false;
          break;
        }
        blocks.push(b);
        used += size;
      }
    } else if (f.blocks?.length) {
      complete = false;
    }
    const html = fileHtml(f, "side", a, links, blocks);
    used += utf8.encode(html).length - blocks.reduce((n, b) => n + utf8.encode(blockHtml(b, f.lawId, "side")).length, 0);
    parts.push(html);
  }
  return { html: parts.join(""), complete };
}

function setHead(tag: "meta" | "link", match: Record<string, string>, attrs: Record<string, string>): void {
  const selector = `${tag}${Object.entries(match).map(([k, v]) => `[${k}="${v}"]`).join("")}`;
  let el = document.head.querySelector(selector);
  if (!el) {
    el = document.createElement(tag);
    for (const [k, v] of Object.entries(match)) el.setAttribute(k, v);
    document.head.append(el);
  }
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
}

/** /amendment/ without an amendment key gets noindex, so it is not indexed as an empty page (a "soft 404"). */
function noindex(): void {
  setHead("meta", { name: "robots" }, { content: "noindex" });
}

/** The meta description of an amendment's page. */
export function amendmentDescription(a: Amendment): string {
  const lawCount = a.files.length;
  return `${a.title}（${amendingLawNum(a.amendmentLawNum)}）${a.enforced ? `の${jpDate(a.enforced)}の施行` : ""}で変わった${lawCount > 1 ? `${lawCount} 法令の` : ""}条文を、改正前と改正後の新旧対照で見られます。`;
}

/** The element the URL's #fragment names, if any. */
function fragmentTarget(): HTMLElement | null {
  if (!location.hash) return null;
  try {
    return document.getElementById(decodeURIComponent(location.hash.slice(1)));
  } catch {
    return null; // a malformed %-escape
  }
}

/** The links the static page built in (data-links, see AmendmentLinks). */
function pageLinks(root: HTMLElement): AmendmentLinks | undefined {
  try {
    return root.dataset.links ? (JSON.parse(root.dataset.links) as AmendmentLinks) : undefined;
  } catch {
    return undefined;
  }
}

function storedView(): View {
  try {
    if (localStorage.getItem(VIEW_KEY) === "inline") return "inline";
  } catch {
    /* storage unavailable */
  }
  return "side";
}

function storeView(view: View): void {
  try {
    localStorage.setItem(VIEW_KEY, view);
  } catch {
    /* ignore */
  }
}

/**
 * Where /amendment/?k=<key> (the address the site linked before the static pages) forwards to: /amendment/<key>/
 * with the same #fragment, or null when the query has no well-formed key.
 */
export function legacyAmendmentPath(search: string, hash: string): string | null {
  const k = new URLSearchParams(search).get("k");
  return k && /^[0-9A-Za-z_-]+$/.test(k) ? `/amendment/${k}/${hash}` : null;
}

/**
 * Renders the amendment page. On the static page /amendment/<key>/ (root has data-key), the content is already
 * there: when it holds every block and the side-by-side view is wanted, only the view switch needs the data, which
 * is fetched when it is used. Otherwise the amendment is fetched and rendered again. /amendment/?k=<key> (no
 * data-key) goes to /amendment/<key>/, keeping the #fragment; a key with no page there gets the 404 page.
 * `chosenView` is the view the reader just picked; without it, the stored preference is used.
 */
export async function renderAmendmentPage(root: HTMLElement, chosenView?: View): Promise<void> {
  const key = root.dataset.key;
  if (!key) {
    const to = legacyAmendmentPath(location.search, location.hash);
    if (to) {
      location.replace(to);
      return;
    }
    noindex();
    root.innerHTML = `<p class="${NOTE}">改正が指定されていません。<a class="link link-primary" href="/timeline/">改正の年表</a>から選んでください。</p>`;
    return;
  }
  let view = chosenView ?? storedView();
  if (root.dataset.complete === "true" && view === "side") {
    root.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((btn) =>
      btn.addEventListener("click", () => {
        if (btn.dataset.view === "side") return;
        storeView("inline");
        root.dataset.complete = "false";
        void renderAmendmentPage(root, "inline");
      }),
    );
    return;
  }
  let a: Amendment;
  try {
    const res = await fetch(dataUrl(root, `amendments/${key}.json`));
    if (!res.ok) throw new Error(String(res.status));
    a = (await res.json()) as Amendment;
  } catch {
    const rest = root.querySelectorAll("[data-rest]");
    rest.forEach((p) => (p.textContent = "残りの差分を読み込めませんでした。ページを再読み込みしてください。"));
    if (rest.length === 0) {
      // A complete page whose inline view could not load: say so under the view switch, keeping the diffs shown.
      root.querySelector("[data-load-error]")?.remove();
      root
        .querySelector('[role="group"]')
        ?.insertAdjacentHTML("afterend", `<p class="${NOTE}" role="alert" data-load-error>インライン表示を読み込めませんでした。ページを再読み込みしてください。</p>`);
    }
    return;
  }

  const hasDiffs = a.files.some((f) => f.blocks?.some((b) => b.segments));
  const links = pageLinks(root);
  const render = () => {
    const toggle = hasDiffs ? viewToggleHtml(view) : "";
    root.className = view === "inline" ? "inline-view" : "";
    root.innerHTML = headHtml(a, links) + toggle + a.files.map((f) => fileHtml(f, view, a, links)).join("");
    root.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((btn) =>
      btn.addEventListener("click", () => {
        view = btn.dataset.view as View;
        storeView(view);
        const y = scrollY;
        render();
        scrollTo(0, y);
      }),
    );
  };
  const y = scrollY;
  render();
  // A view the reader just picked keeps their place; on load, a #fragment wins, since the blocks rendered above its
  // target (on a static page, the ones it left out) move it down.
  const target = fragmentTarget();
  if (!chosenView && target) target.scrollIntoView();
  else scrollTo(0, y);
}
