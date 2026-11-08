// The share and print buttons, and the texts they put on the clipboard. Law pages (built by Astro)
// and the amendment and versions pages (rendered in the browser) use the same HTML string; the
// clicks are handled in one place, src/scripts/share.ts.
//
// Sharing opens each service's own share URL. No third-party script is loaded, so nothing tracks
// the visitor and the pages load no faster or slower.

import { SITE_NAME } from "./site-name.ts";

const ICON_SHARE = `<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M7 8l5-5 5 5" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" /></svg>`;
const ICON_PRINT = `<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 9V3h10v6" /><path d="M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" /><path d="M7 14h10v7H7z" /></svg>`;

/**
 * 共有 (a menu; the OS share sheet on touch screens) and 印刷. `className` places the group in
 * the row it sits in.
 */
export function shareToolsHtml(className = ""): string {
  const item = "py-2";
  return `<div class="flex gap-2 print:hidden ${className}" data-share-tools>
  <details class="dropdown dropdown-end" data-share>
    <summary class="btn btn-soft btn-sm btn-primary">${ICON_SHARE}共有</summary>
    <ul class="dropdown-content menu z-40 mt-1 w-60 rounded-box border border-base-300 bg-base-100 p-2 shadow-lg">
      <li><button type="button" class="${item}" data-share-copy="url">リンクをコピー</button></li>
      <li><button type="button" class="${item}" data-share-copy="titled">タイトル付きでコピー</button></li>
      <li><a class="${item}" href="mailto:" data-share-to="mail">メールで送る</a></li>
      <li><a class="${item}" href="https://x.com/intent/tweet" target="_blank" rel="noopener" data-share-to="x">X でポスト</a></li>
      <li><a class="${item}" href="https://social-plugins.line.me/lineit/share" target="_blank" rel="noopener" data-share-to="line">LINE で送る</a></li>
      <li hidden data-share-native-item><button type="button" class="${item}" data-share-native>その他のアプリで共有…</button></li>
    </ul>
  </details>
  <button type="button" class="btn btn-soft btn-sm btn-primary" data-print>${ICON_PRINT}印刷</button>
</div>`;
}

export type ShareTarget = "mail" | "x" | "line";

/** The URL that shares `url` (with `title`) on a service. */
export function shareUrl(to: ShareTarget, title: string, url: string): string {
  const e = encodeURIComponent;
  switch (to) {
    case "mail":
      return `mailto:?subject=${e(title)}&body=${e(`${title}\n${url}`)}`;
    case "x":
      // https://docs.x.com/x-for-websites/post-button/guides/web-intent
      return `https://x.com/intent/tweet?text=${e(title)}&url=${e(url)}`;
    case "line":
      // https://developers.line.biz/en/docs/line-social-plugins/install-guide/using-line-share-buttons/
      return `https://social-plugins.line.me/lineit/share?url=${e(url)}`;
  }
}

/** The title and the URL on two lines, for chat and mail: "民法 第九十条（公序良俗） | Anisotropics\nhttps://…". */
export function titledText(title: string, url: string): string {
  return `${title} | ${SITE_NAME}\n${url}`;
}

/**
 * Where a block sits, from its key ("本則|第九十条", "附　則（昭和二二年…）|第一条"): nothing
 * for the main provisions, "附則（…）" for a supplementary provision.
 */
export function blockScope(key: string): string {
  const scope = key.split("|")[0] ?? "";
  if (!scope || scope === "本則") return "";
  return scope.replace(/^附[\s　]*則/, "附則");
}

export interface Citation {
  /** The law's title: 民法 */
  law: string;
  /** The law's number: 明治二十九年法律第八十九号 */
  num?: string;
  /** The block's key, for the 附則 it belongs to. */
  key: string;
  /** The block's heading: 第九十条（公序良俗） */
  heading: string;
  /** The text of the block, as plain text. */
  body: string;
  /** Which text this is: 2026年11月8日時点の現行条文 */
  asOf: string;
  url: string;
}

/** The heading a block is cited by: 民法（明治二十九年法律第八十九号）附則（…）第一条 */
export function citationHeading(c: Pick<Citation, "law" | "num" | "key" | "heading">): string {
  return `${c.law}${c.num ? `（${c.num}）` : ""}${blockScope(c.key)}${c.heading}`;
}

/** A block of law text to paste into a memo or a contract review: heading, text, and where it came from. */
export function citationText(c: Citation): string {
  const body = c.body
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return [
    citationHeading(c),
    body,
    "",
    `出典：${SITE_NAME}（${c.asOf}）${c.url}`,
    "※自動生成した非公式のテキストです。正式な条文は e-Gov 法令検索で確認してください。",
  ].join("\n");
}
