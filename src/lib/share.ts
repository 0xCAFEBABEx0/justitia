// The share and print buttons, and the texts they put on the clipboard. Law pages (built by Astro)
// and the amendment and versions pages (rendered in the browser) use the same HTML string; the
// clicks are handled in one place, src/scripts/share.ts.
//
// Sharing opens each service's own share URL. No third-party script is loaded, so nothing tracks
// the visitor and the pages load no faster or slower.

import { SITE_NAME } from "./site-name.ts";

const ICON_SHARE = `<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M7 8l5-5 5 5" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" /></svg>`;
const ICON_PRINT = `<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 9V3h10v6" /><path d="M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" /><path d="M7 14h10v7H7z" /></svg>`;

// Menu icons. X and LINE are their marks (paths from Simple Icons 16.37.0, CC0-1.0) in white on a
// tile of the service's colour, unchanged: LINE's design guide for custom "LINEで送る" buttons asks
// for a white icon on #06C755
// (https://developers.line.biz/ja/docs/line-social-plugins/resources/design-guide/), and X's mark
// stays white on black, as X shows it. The others are line icons drawn like the rest of the site's.
const svg = (body: string, attrs = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"') =>
  `<svg class="h-5 w-5 shrink-0" viewBox="0 0 24 24" ${attrs} aria-hidden="true">${body}</svg>`;
const tile = (bg: string, scale: number, body: string) =>
  `<svg class="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="5" fill="${bg}" /><g fill="#fff" transform="translate(${12 - 12 * scale} ${12 - 12 * scale}) scale(${scale})">${body}</g></svg>`;
const ICON = {
  x: tile("#000", 0.625, '<path d="M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z" />'),
  line: tile("#06C755", 0.75, '<path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />'),
  link: svg('<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />'),
  titled: svg('<rect x="8" y="8" width="13" height="13" rx="2" /><path d="M4 16V5a2 2 0 0 1 2-2h11" /><path d="M11.5 12.5h6M11.5 16.5h4" />'),
  mail: svg('<rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" />'),
  more: svg('<circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" />', 'fill="currentColor"'),
};

/**
 * 共有 (a menu; the OS share sheet on touch screens) and 印刷. `className` places the group in
 * the row it sits in. The menu opens from the button's left edge; `menuAlign` ("sm:dropdown-end")
 * opens it from the right edge where the group sits at the right of its row, so it stays on screen.
 */
export function shareToolsHtml(className = "", menuAlign = ""): string {
  const item = "gap-3 py-2";
  return `<div class="flex gap-2 print:hidden ${className}" data-share-tools>
  <details class="dropdown ${menuAlign}" data-share>
    <summary class="btn btn-soft btn-sm btn-primary">${ICON_SHARE}共有</summary>
    <ul class="dropdown-content menu z-40 mt-1 w-64 rounded-box border border-base-300 bg-base-100 p-2 shadow-lg">
      <li><a class="${item}" href="https://x.com/intent/tweet" target="_blank" rel="noopener" data-share-to="x">${ICON.x}X でポスト</a></li>
      <li><a class="${item}" href="https://social-plugins.line.me/lineit/share" target="_blank" rel="noopener" data-share-to="line">${ICON.line}LINEで送る</a></li>
      <li><a class="${item}" href="mailto:" data-share-to="mail">${ICON.mail}メールで送る</a></li>
      <li class="menu-title p-0"><hr class="my-1 border-base-300" /></li>
      <li><button type="button" class="${item}" data-share-copy="url">${ICON.link}リンクをコピー</button></li>
      <li><button type="button" class="${item}" data-share-copy="titled">${ICON.titled}タイトル付きでコピー</button></li>
      <li hidden data-share-native-item><button type="button" class="${item}" data-share-native>${ICON.more}その他のアプリ…</button></li>
    </ul>
  </details>
  <button type="button" class="btn btn-soft btn-sm btn-primary" data-print>${ICON_PRINT}印刷</button>
</div>`;
}

export type ShareTarget = "mail" | "x" | "line";

/**
 * The length X counts for a post: 1 for Latin and other characters in the ranges below, 2 for the
 * rest (Japanese among them); a URL counts as 23 whatever its length, as t.co shortens it.
 * https://docs.x.com/resources/fundamentals/counting-characters (the ranges are those of the
 * twitter-text v3 configuration it points to). An emoji sequence counts as 2 there and more here,
 * which only cuts a long title a little earlier.
 */
export function xLength(text: string): number {
  let n = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    const light = c <= 0x10ff || (c >= 0x2000 && c <= 0x200d) || (c >= 0x2010 && c <= 0x201f) || (c >= 0x2032 && c <= 0x2037);
    n += light ? 1 : 2;
  }
  return n;
}

/** A post holds at most 280; X adds the URL (23) after the text, with a space. */
export const X_MAX = 280;
const X_URL = 23;

/** The title cut to fit a post with the URL, ending in "…" when it was cut. */
export function xText(title: string): string {
  const room = X_MAX - X_URL - 1;
  if (xLength(title) <= room) return title;
  let out = "";
  for (const ch of title) {
    if (xLength(out + ch) + xLength("…") > room) break;
    out += ch;
  }
  return `${out}…`;
}

/** The URL that shares `url` (with `title`) on a service. */
export function shareUrl(to: ShareTarget, title: string, url: string): string {
  const e = encodeURIComponent;
  switch (to) {
    case "mail":
      return `mailto:?subject=${e(title)}&body=${e(`${title}\n${url}`)}`;
    case "x":
      // Web Intent: https://docs.x.com/x-for-websites/post-button/guides/web-intent
      return `https://x.com/intent/tweet?text=${e(xText(title))}&url=${e(url)}`;
    case "line":
      // "LINEで送る" with a custom icon, which may send a text with the URL:
      // https://developers.line.biz/ja/docs/line-social-plugins/install-guide/using-line-share-buttons/#using-custom-icons
      return `https://social-plugins.line.me/lineit/share?url=${e(url)}&text=${e(title)}`;
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
