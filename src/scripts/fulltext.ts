// Full-text search over the law text (/search/?q=...), with the Pagefind index built by
// scripts/search-index.ts: one record per article (block), so each result is an article.
// The index is split into shards under <data base>/pagefind/<n>/; shard 0 is loaded and the
// others are merged into it.

interface ResultData {
  url: string;
  excerpt: string;
  meta: { title?: string; law?: string; num?: string };
}
interface Pagefind {
  options(o: Record<string, unknown>): Promise<void>;
  mergeIndex(url: string, o?: Record<string, unknown>): Promise<void>;
  search(q: string): Promise<{ results: { id: string; data(): Promise<ResultData> }[] }>;
}

const PAGE = 10;

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

/** Pagefind excerpts are text with <mark> around the hits; keep only those tags. */
function excerpt(s: string): string {
  return esc(s.replace(/<\/?mark>/g, "\u0001")).replace(/\u0001([^\u0001]*)\u0001/g, "<mark>$1</mark>").replace(/\u0001/g, "");
}

let loading: Promise<Pagefind> | null = null;
function loadPagefind(base: string): Promise<Pagefind> {
  return (loading ??= (async () => {
    const { shards } = (await (await fetch(`${base}/pagefind/shards.json`)).json()) as { shards: number };
    const pf = (await import(/* @vite-ignore */ `${base}/pagefind/0/pagefind.js`)) as Pagefind;
    // The indexed URLs are site paths. Without baseUrl, Pagefind prefixes them with the directory
    // the index is loaded from (/data/ locally, the data domain in production).
    await pf.options({ baseUrl: "/", excerptLength: 40 });
    for (let n = 1; n < shards; n++) await pf.mergeIndex(`${base}/pagefind/${n}/`, { baseUrl: "/" });
    return pf;
  })());
}

export async function initFulltext(root: HTMLElement): Promise<void> {
  const base = root.dataset.base!;
  const form = root.querySelector("form")!;
  const input = form.querySelector("input")!;
  const out = root.querySelector<HTMLElement>("[data-results]")!;
  let seq = 0;

  const run = async (q: string) => {
    const mine = ++seq;
    const url = new URL(location.href);
    if (q) url.searchParams.set("q", q);
    else url.searchParams.delete("q");
    history.replaceState(null, "", url);
    document.title = q ? `「${q}」の全文検索 | justitia` : "全文検索 | justitia";
    if (!q) {
      out.innerHTML = "";
      return;
    }
    out.innerHTML = `<p class="loading">検索しています…</p>`;
    let pf: Pagefind;
    try {
      pf = await loadPagefind(base);
    } catch {
      out.innerHTML = `<p class="note">検索の索引を読み込めませんでした。</p>`;
      loading = null;
      return;
    }
    const { results } = await pf.search(q);
    if (mine !== seq) return;
    if (!results.length) {
      out.innerHTML = `<p class="note">「${esc(q)}」を含む条文は見つかりませんでした。</p>`;
      return;
    }
    out.innerHTML = `<p class="note">${results.length.toLocaleString()} 件の条が見つかりました。</p><ol class="ft-results"></ol>`;
    const list = out.querySelector("ol")!;
    let shown = 0;
    const more = document.createElement("button");
    more.type = "button";
    more.className = "more";
    const showMore = async () => {
      more.disabled = true;
      const page = await Promise.all(results.slice(shown, shown + PAGE).map((r) => r.data()));
      if (mine !== seq) return;
      for (const d of page) {
        list.insertAdjacentHTML(
          "beforeend",
          `<li><div class="law">${esc(d.meta.law ?? "")} <small>${esc(d.meta.num ?? "")}</small></div>` +
            `<a class="t" href="${esc(d.url)}">${esc(d.meta.title ?? d.url)}</a>` +
            `<div class="ex">${excerpt(d.excerpt)}</div></li>`,
        );
      }
      shown += page.length;
      more.disabled = false;
      more.textContent = `さらに表示（残り ${(results.length - shown).toLocaleString()} 件）`;
      more.hidden = shown >= results.length;
    };
    out.append(more);
    more.addEventListener("click", () => void showMore());
    await showMore();
  };

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    void run(input.value.trim());
  });
  const q = new URLSearchParams(location.search).get("q")?.trim() ?? "";
  input.value = q;
  if (q) await run(q);
  else input.focus();
}
