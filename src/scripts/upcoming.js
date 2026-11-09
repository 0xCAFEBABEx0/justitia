// The filter on /upcoming/: by category and by a word in the law names. The calendar links follow
// the category: the whole site's calendar and feed, or the category's.
import { feedFile, feedUrl } from "../lib/feeds.ts";
export function initUpcomingFilter(root) {
    const base = root.dataset.base ?? "";
    const select = root.querySelector("[data-filter-category]");
    const input = root.querySelector("[data-filter-text]");
    const count = root.querySelector("[data-filter-count]");
    const list = document.querySelector("[data-upcoming-list]");
    const empty = list.querySelector("[data-filter-empty]");
    const items = [...list.querySelectorAll("li[data-cats]")];
    const apply = () => {
        const cat = select.value;
        const words = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
        let shown = 0;
        for (const li of items) {
            const names = (li.dataset.names ?? "").toLowerCase();
            const ok = (!cat || li.dataset.cats.includes(`|${cat}|`)) && words.every((w) => names.includes(w));
            li.hidden = !ok;
            if (ok)
                shown++;
        }
        // Date groups and months with nothing left are hidden too.
        for (const group of list.querySelectorAll("[data-group], [data-month]")) {
            group.hidden = !group.querySelector("li[data-cats]:not([hidden])");
        }
        count.textContent = `${shown.toLocaleString()} 件`;
        empty.hidden = shown > 0;
        empty.classList.toggle("hidden", shown > 0);
        const url = feedUrl(base, cat ? feedFile.category(cat, "ics") : feedFile.all("ics"));
        root.querySelector("[data-calendar-copy]").dataset.copy = url;
        root.querySelector("[data-calendar-file]").href = url;
        root.querySelector("[data-rss-copy]").dataset.copy = feedUrl(base, cat ? feedFile.category(cat, "xml") : feedFile.all("xml"));
        root.querySelector("[data-calendar-label]").textContent = cat ? `分野「${cat}」の法令` : "すべての分野";
    };
    select.addEventListener("change", apply);
    input.addEventListener("input", apply);
    if (select.value || input.value)
        apply(); // values the browser restored on back/forward
}
