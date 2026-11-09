// The clicks of the share and print buttons (src/lib/share.ts), the tools under a law text block
// opened by its anchor (リンクをコピー / 引用してコピー), and what the page needs while printing.
// Started once per page from the layout; clicks are caught on the document, so buttons in content
// rendered later (amendment and versions pages) work too.
import { citationHeading, citationText, shareUrl, titledText } from "../lib/share.ts";
import { SITE_NAME } from "../lib/site-name.ts";
const SITE_SUFFIX = ` | ${SITE_NAME}`;
/** The law text block the URL's #fragment points at, if any. */
function targetBlock() {
    if (!location.hash)
        return null;
    let id;
    try {
        id = decodeURIComponent(location.hash.slice(1));
    }
    catch {
        return null;
    }
    const el = document.getElementById(id);
    return el?.matches(".law-text .blk") && el.querySelector(":scope > .h") ? el : null;
}
/** The block's heading as plain text, with ruby readings in brackets as in blockBody. */
function headingText(block) {
    const h = block.querySelector(":scope > .h");
    if (!h)
        return "";
    const clone = h.cloneNode(true);
    clone.querySelectorAll("rp").forEach((el) => el.remove());
    clone.querySelectorAll("rt").forEach((el) => el.replaceWith(`（${el.textContent ?? ""}）`));
    return clone.textContent?.trim() ?? "";
}
/** The page's name for sharing, with the article in the #fragment: 民法 第九十条（公序良俗）. */
function shareTitle() {
    const named = document.querySelector("[data-share-title]")?.dataset.shareTitle;
    const title = named || document.title.replace(SITE_SUFFIX, "");
    const block = targetBlock();
    return block ? `${title} ${headingText(block)}` : title;
}
let toastTimer;
function toast(message, ok = true) {
    const box = document.querySelector("[data-toast]");
    if (!box)
        return;
    const alert = document.createElement("div");
    alert.className = `alert ${ok ? "alert-success" : "alert-error"} py-2 text-sm`;
    alert.textContent = message;
    box.replaceChildren(alert);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => box.replaceChildren(), 2500);
}
async function copy(text, done) {
    try {
        await navigator.clipboard.writeText(text);
    }
    catch {
        // Older browsers, or a page not allowed the clipboard API: copy through a hidden field.
        const area = document.createElement("textarea");
        area.value = text;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.append(area);
        area.select();
        const ok = document.execCommand("copy");
        area.remove();
        if (!ok) {
            toast("コピーできませんでした", false);
            return;
        }
    }
    toast(done);
}
/** Phones and tablets get the OS share sheet; a mouse gets the menu, which also offers the sheet. */
function useShareSheet() {
    return typeof navigator.share === "function" && matchMedia("(pointer: coarse)").matches;
}
async function shareSheet() {
    try {
        await navigator.share({ title: shareTitle(), url: location.href });
        return true;
    }
    catch (e) {
        return e instanceof DOMException && e.name === "AbortError"; // closed by the user
    }
}
// Dropdown menus (details elements): the share menu and others marked data-menu. One click outside
// closes them, as Escape does.
const MENU = "details[data-share], details[data-menu]";
function closeMenus(except) {
    document.querySelectorAll(`:is(${MENU})[open]`).forEach((d) => {
        if (d !== except)
            d.open = false;
    });
}
/** The plain text of a law text block: paragraphs and items on their own lines, ruby in brackets. */
function blockBody(block) {
    const clone = block.cloneNode(true);
    clone.querySelectorAll(":scope > .h, .cite-tools, rp").forEach((el) => el.remove());
    clone.querySelectorAll("rt").forEach((el) => el.replaceWith(`（${el.textContent ?? ""}）`));
    clone.querySelectorAll("br").forEach((el) => el.replaceWith("\n"));
    clone.querySelectorAll("td, th").forEach((el) => el.append("\t"));
    clone.querySelectorAll("p, li, tr, h1, h2, h3, h4, h5, h6").forEach((el) => el.append("\n"));
    return clone.textContent ?? "";
}
function citation(block) {
    const text = block.closest(".law-text");
    const c = {
        law: text.dataset.citeLaw ?? shareTitle(),
        num: text.dataset.citeNum,
        key: block.id,
        heading: headingText(block),
    };
    return citationText({ ...c, body: blockBody(block), asOf: text.dataset.citeAsof ?? "", url: location.href });
}
/**
 * The tools under the block the #fragment points at: one set on the page, moved as the fragment
 * changes. The versions page calls this again after it draws a new text.
 */
export function refreshCiteTools() {
    document.querySelectorAll(".cite-tools").forEach((el) => el.remove());
    const block = targetBlock();
    if (!block?.closest(".law-text")?.dataset.citeLaw)
        return;
    const tools = document.createElement("div");
    tools.className = "cite-tools print:hidden";
    tools.setAttribute("role", "group");
    tools.setAttribute("aria-label", headingText(block));
    tools.innerHTML =
        `<button type="button" class="btn btn-soft btn-xs btn-primary" data-cite-copy="link">この条へのリンクをコピー</button>` +
            `<button type="button" class="btn btn-soft btn-xs btn-primary" data-cite-copy="cite">引用してコピー</button>`;
    block.querySelector(":scope > .h").after(tools);
}
// ---- Printing ----
// The page prints in the light theme whatever the screen shows: dark text on white paper, and the
// diff colors meant for white. daisyUI's theme controller applies the dark theme with :has() on
// the checked switch, so the switch is unchecked for the print too.
let saved = null;
function beforePrint() {
    const root = document.documentElement;
    const switches = [...document.querySelectorAll("[data-theme-switch]")];
    saved ??= { theme: root.dataset.theme, checked: switches.map((s) => s.checked) };
    root.dataset.theme = "light";
    switches.forEach((s) => (s.checked = false));
    const head = document.querySelector("[data-print-head]");
    if (head) {
        let url = location.href;
        try {
            url = decodeURI(url); // the Japanese of an article's #fragment, readable on paper
        }
        catch {
            /* keep it encoded */
        }
        head.querySelector("[data-print-url]").textContent = url;
        const now = new Date();
        head.querySelector("[data-print-date]").textContent = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;
    }
}
function afterPrint() {
    const root = document.documentElement;
    if (saved) {
        if (saved.theme === undefined)
            delete root.dataset.theme;
        else
            root.dataset.theme = saved.theme;
        const checked = saved.checked;
        document.querySelectorAll("[data-theme-switch]").forEach((s, i) => (s.checked = checked[i] ?? false));
        saved = null;
    }
    root.classList.remove("print-one");
    document.querySelectorAll(".print-target").forEach((el) => el.classList.remove("print-target"));
}
function prepareMenu(details) {
    details.querySelectorAll("[data-share-to]").forEach((a) => {
        a.href = shareUrl(a.dataset.shareTo, shareTitle(), location.href);
    });
    if (typeof navigator.share === "function")
        details.querySelector("[data-share-native-item]")?.removeAttribute("hidden");
}
function onClick(e) {
    const el = e.target instanceof Element ? e.target : null;
    closeMenus(el?.closest(MENU));
    if (!el)
        return;
    const summary = el.closest("details[data-share] > summary");
    if (summary) {
        const details = summary.parentElement;
        if (details.open)
            return;
        // Fill in the links before the menu can open, whichever way it opens: the URL changes with the
        // #fragment and on the versions page.
        prepareMenu(details);
        if (useShareSheet()) {
            e.preventDefault();
            // The menu is the fallback when the share sheet fails for another reason than being closed.
            void shareSheet().then((shared) => {
                if (!shared)
                    details.open = true;
            });
        }
        return;
    }
    const action = el.closest("[data-share-copy], [data-share-native], [data-share-to], [data-print], [data-print-law], [data-cite-copy], [data-copy]");
    if (!action) {
        // A link in a menu, such as a calendar file: the page stays, so the menu closes.
        if (el.closest("details[data-menu] a"))
            closeMenus();
        return;
    }
    const d = action.dataset;
    if (d.copy) {
        // Any other text to copy, such as a calendar's URL, with the message to show once it is copied.
        void copy(d.copy, d.copyDone ?? "コピーしました");
    }
    else if (d.shareCopy) {
        void copy(d.shareCopy === "titled" ? titledText(shareTitle(), location.href) : location.href, "リンクをコピーしました");
    }
    else if (action.hasAttribute("data-share-native")) {
        void shareSheet().then((shared) => {
            if (!shared)
                toast("共有できませんでした。リンクをコピーしてお使いください", false);
        });
    }
    else if (action.hasAttribute("data-print")) {
        window.print();
    }
    else if (d.printLaw) {
        // One law of an amendment that changes many: the others are hidden until the print ends.
        const section = document.getElementById(d.printLaw);
        if (section) {
            document.documentElement.classList.add("print-one");
            section.classList.add("print-target");
            window.print();
        }
    }
    else if (d.citeCopy) {
        const block = action.closest(".blk");
        if (!block)
            return;
        if (d.citeCopy === "link") {
            void copy(titledText(citationHeading({ law: block.closest(".law-text").dataset.citeLaw ?? "", key: block.id, heading: headingText(block) }), location.href), "リンクをコピーしました");
        }
        else {
            void copy(citation(block), "引用文をコピーしました");
        }
    }
    closeMenus();
}
export function initShare() {
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", (e) => {
        if (e.key !== "Escape")
            return;
        const open = document.querySelector(`:is(${MENU})[open]`);
        if (!open)
            return;
        open.open = false;
        open.querySelector("summary")?.focus();
    });
    addEventListener("beforeprint", beforePrint);
    addEventListener("afterprint", afterPrint);
    addEventListener("hashchange", refreshCiteTools);
    refreshCiteTools();
}
