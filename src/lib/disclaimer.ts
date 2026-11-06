// The disclaimer shown under the heading of the pages with law text and diffs: law pages (built
// by Astro) and the amendment and versions pages (rendered in the browser), so it is one HTML
// string both can use.

const EGOV_URL = "https://laws.e-gov.go.jp/";

/** A short note that the text and diffs are generated and can be wrong, and that no liability is accepted. */
export const DISCLAIMER_NOTE_HTML = `<div role="note" class="alert alert-warning alert-soft mb-4 items-start gap-3 py-2.5 text-base-content" data-disclaimer>
  <svg class="mt-0.5 h-5 w-5 shrink-0 text-warning" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></svg>
  <p>条文と新旧対照は自動生成のため、誤りを含むことがあります。正式な内容は <a class="link link-primary" href="${EGOV_URL}">e-Gov 法令検索</a> で確認してください。本サイトの利用により生じた損害について、管理者は一切の責任を負いません。</p>
</div>`;
