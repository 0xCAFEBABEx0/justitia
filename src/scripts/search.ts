// Title search over /search-index.json, loaded the first time the box gets focus.
// Index rows: [id, title, kana, abbrev, lawNum, status] with status 0 = 現行, 1 = 廃止, 2 = 未施行.

type Row = [string, string, string, string, string, number];

let index: Promise<Row[]> | null = null;
function loadIndex(): Promise<Row[]> {
  return (index ??= fetch("/search-index.json").then((r) => r.json() as Promise<Row[]>));
}

const norm = (s: string) => s.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
const toHiragana = (s: string) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
const STATUS = ["", "廃止", "未施行"];

interface Prepared {
  row: Row;
  title: string;
  kana: string;
  abbrev: string;
  num: string;
}
let prepared: Prepared[] | null = null;

function search(rows: Row[], q: string): Row[] {
  prepared ??= rows.map((row) => ({
    row,
    title: norm(row[1]),
    kana: toHiragana(norm(row[2])),
    abbrev: norm(row[3]),
    num: norm(row[4]),
  }));
  const nq = norm(q);
  const hq = toHiragana(nq);
  if (!nq) return [];
  const scored: [number, Prepared][] = [];
  for (const p of prepared) {
    let s = -1;
    if (p.title === nq || p.abbrev === nq) s = 0;
    else if (p.title.startsWith(nq) || p.abbrev.startsWith(nq)) s = 1;
    else if (p.kana.startsWith(hq)) s = 2;
    else if (p.title.includes(nq) || p.abbrev.includes(nq)) s = 3;
    else if (p.num.includes(nq) || p.kana.includes(hq)) s = 4;
    if (s < 0) continue;
    // Laws in force first, then shorter titles.
    scored.push([s * 10 + (p.row[5] === 0 ? 0 : 5) + Math.min(p.title.length, 400) / 1000, p]);
  }
  scored.sort((a, b) => a[0] - b[0]);
  return scored.slice(0, 40).map(([, p]) => p.row);
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

/**
 * Wires a search box. By default choosing a result opens the law's page; with `onPick` the
 * law is handed to the callback instead and the box is cleared.
 */
export function initSearch(root: HTMLElement, onPick?: (id: string, title: string) => void): void {
  const input = root.querySelector("input")!;
  const box = document.createElement("div");
  box.className = "search-results";
  box.hidden = true;
  root.append(box);
  let active = -1;

  const links = () => Array.from(box.querySelectorAll<HTMLAnchorElement>("a"));
  const setActive = (i: number) => {
    const ls = links();
    active = Math.max(-1, Math.min(i, ls.length - 1));
    ls.forEach((a, j) => a.classList.toggle("active", j === active));
    ls[active]?.scrollIntoView({ block: "nearest" });
  };

  const update = async () => {
    const q = input.value.trim();
    if (!q) {
      box.hidden = true;
      return;
    }
    const rows = search(await loadIndex(), q);
    if (input.value.trim() !== q) return; // a newer query is on its way
    box.innerHTML = rows.length
      ? rows
          .map(
            (r) =>
              `<a href="/laws/${r[0]}/" data-id="${r[0]}" data-title="${esc(r[1])}">${esc(r[1])}<small>${esc(r[4])}${r[5] ? `・${STATUS[r[5]]}` : ""}</small></a>`,
          )
          .join("")
      : `<div class="empty">見つかりませんでした</div>`;
    box.hidden = false;
    active = -1;
  };

  const pick = (a: HTMLAnchorElement) => {
    if (!onPick) {
      location.href = a.href;
      return;
    }
    onPick(a.dataset.id!, a.dataset.title!);
    input.value = "";
    box.hidden = true;
  };
  box.addEventListener("click", (e) => {
    const a = (e.target as HTMLElement).closest("a");
    if (a && onPick) {
      e.preventDefault();
      pick(a);
    }
  });

  input.addEventListener("focus", () => void loadIndex());
  input.addEventListener("input", () => void update());
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(active + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(active - 1);
    } else if (e.key === "Enter") {
      const target = links()[Math.max(active, 0)];
      if (target) pick(target);
    } else if (e.key === "Escape") {
      box.hidden = true;
    }
  });
  document.addEventListener("click", (e) => {
    if (!root.contains(e.target as Node)) box.hidden = true;
  });
}
