# Accessibility

This repository builds [Anisotropics](https://anisotro.pics/), an unofficial website for reading Japanese laws and
their amendment history. We want everyone to be able to read the law text, follow how it changed, and find what they
are looking for, whatever device, browser settings or assistive technology they use. This page says what we do, what
we know does not work well yet, and how to tell us about a barrier.

The site itself is in Japanese, like the laws it shows. You can write to us in Japanese or English.

## Our goals

- Law pages, amendment pages (新旧対照), the versions page, the timeline, the lists and search should all be usable
  with a keyboard and a screen reader, in both the light and the dark theme, and at phone width.
- We use [WCAG 2.2](https://www.w3.org/TR/WCAG22/) Level AA as a target. This is a goal, not a conformance claim: the
  site has not had a formal WCAG evaluation.
- We keep the Accessibility score of [PageSpeed Insights](https://pagespeed.web.dev/) (Lighthouse) at 100 on the pages
  we check.

## What we have done

- Every page sets `lang="ja"`, uses one heading hierarchy without skipped levels, and has `header`, `nav`, `main` and
  `footer` landmarks. The navigation menus have names, and the current page is marked with `aria-current="page"`.
- Muted text uses at least 65% opacity of the text color, so it meets the 4.5:1 contrast ratio on white. Theme
  colors that failed as text, such as the light theme's warning color, were changed.
- Links in running text are underlined. Small controls have a 24 × 24 px target or enough space around them.
- The light and dark themes follow the operating system setting until you pick one with the switch in the header.
- Decorative icons are hidden from assistive technology. Buttons that show only an icon have a text name.
- In diffs, added and deleted text are marked up with `<ins>` and `<del>`. In the side-by-side view, each column is
  labeled 改正後 or 改正前. In the line view used for very long articles, every changed line starts with `+` or `-`.
- Law pages are static HTML and can be read without JavaScript.
- The site uses one font, Noto Sans JP, served from the site itself, and text can be zoomed with the browser.

## Known limitations

- **Graph page (改正のグラフ):** the graph itself is a picture and is hidden from assistive technology. Each row has
  a link, but it goes to the first law in that row only. To reach every law that an amendment changed, follow the row's
  link to the amendment page, which lists all of them.
- **Inline diff view (インライン):** deleted text is struck through, but added text is shown only by its color and
  background. Screen readers often do not announce `<ins>` and `<del>`. The default side-by-side view (新旧対照)
  labels the two columns, so use it if the inline view is hard to follow.
- **JavaScript:** the amendment, versions, graph and search pages are drawn in the browser and need JavaScript.
- **Very long laws:** some law pages are very large (租税特別措置法 is about 12 MB of HTML), which can make them slow
  with a screen reader or on a low-end device. Every chapter and article has its own link, so you can open the part
  you need from the table of contents or from a search result.
- **No skip link:** there is no "skip to content" link yet. Screen reader users can jump to the `main` landmark.
- **Law text:** the text comes from e-Gov through houritsu and is converted by a program. Tables, figures and
  attachments that e-Gov publishes as images or PDF files are linked as they are, without text alternatives of ours.
- **Testing:** our checks are automated (Lighthouse with axe-core) and visual (Playwright in Chromium, light and dark
  themes, 390 px and 1280 px wide). We have not yet tested the site systematically with screen readers, keyboard-only
  use or other browsers.

## Reporting a barrier

If something on the site is hard or impossible to use, please
[open an issue](https://github.com/0xCAFEBABEx0/justitia/issues/new?labels=accessibility) with the `accessibility`
label. It helps if you can tell us:

- what you were trying to do, and the page address;
- what happened instead;
- your browser and operating system, and any assistive technology or settings you use (for example a screen reader,
  zoom, high contrast or keyboard only).

Screenshots and recordings are welcome but never required. You do not need to tell us anything about a disability.

If the barrier is in the official law text itself, rather than in how this site shows it, please also check
[e-Gov 法令検索](https://laws.e-gov.go.jp/), which is the official source.

## What happens next

The site is maintained by one person on a best-effort basis, so we cannot promise a response time. We will:

1. reply on the issue to confirm we have read it, and ask questions if we need more detail;
2. suggest a workaround if there is one;
3. track the fix on the same issue and say when it is live, so you can check it.

Accessibility issues are treated as bugs, not as feature requests. Problems that block reading the law text or the
diffs come first.

## For contributors

Changes to the site must keep the accessibility rules in [AGENTS.md](AGENTS.md) (rule 9), which apply to human
contributors and coding agents alike. In short:

- muted text is `text-base-content/65`, never `/60`; daisyUI's 50% defaults need an explicit `/65`;
- never put `aria-label` on a `<label>`;
- links in running text are underlined; small targets get 24 px or enough spacing;
- heading levels never skip;
- decorative SVGs get `aria-hidden="true"`;
- check both the light and the dark theme, and a phone-width layout.

When you change markup, styles or a client-rendered page, run Lighthouse on an affected page (the command is in
[CLAUDE.md](CLAUDE.md), "Gotchas") and mention the result in the pull request. If a change adds or removes a known
limitation, update this file in the same pull request.

## About this statement

The repository owner keeps this statement and the practices above up to date. Suggestions for this page or for how we
handle accessibility are welcome as issues or pull requests.

Last reviewed: 2026-11-24.
