# justitia

A website for browsing Japanese laws and their amendment history. It is generated from
[houritsu](https://github.com/Kohei-Wada/houritsu), a repository that keeps Japanese laws in Git
(one commit = one amending law coming into force).
Like [bundestag/gesetze](https://bundestag.github.io/gesetze/), it lists laws and shows their text.
It also uses what Git is good at: showing *when* and *how* each law changed (amendment history and diffs).

The site itself is in Japanese, since its content is Japanese law.

## Plan

1. **Data extraction** (`scripts/extract/` in this repository): read houritsu's history and write JSON.
2. **Site**: law lists, law text pages, a per-law amendment timeline, and per-amendment diffs (article-by-article comparison).
3. **Search and extras**: full-text search, amendments not yet in force (the `upcoming` branch), and "text as of a given date".
4. **Publishing**: a daily GitHub Actions run pulls houritsu, rebuilds, and deploys to Cloudflare.

## Data extraction

Requires Node.js 22.18 or later (TypeScript runs directly, without a build step).

```sh
npm install
npm run fetch-houritsu   # clone houritsu into ./houritsu (fetch on later runs) and check out origin/main
npm run extract          # write JSON to ./data
```

The options (`--repo`, `--out`, `--main`, `--upcoming`, `--only`, `--related-only`, `--published-source`) are described in the comment at the top of `scripts/extract/index.ts`.
Passing a law ID, as in `--only 140AC0000000045`, writes only that law (useful for testing).

### Output

The types are in `scripts/extract/types.ts`.

| File | Contents |
| --- | --- |
| `meta.json` | Generation time, data date (`updatedAt`: when the content read from houritsu last changed, see [Publishing](#publishing)), data version (a hash of `amendments/`, `laws/` and `history/`), source version (a hash of the content read from houritsu, without commit SHAs), the houritsu commits used, counts |
| `laws.json` | All laws (in force, repealed, and not yet in force), in kana order |
| `laws/<law ID>.json` | Per-law details, amendment history (oldest first, upcoming amendments last), and the laws most often amended together with it |
| `amendments/<key>.json` | Per-amendment (one houritsu commit) details, with an article-level diff for each law it changed |
| `timeline/<year>.json` | Amendments by year of entry into force (`undetermined.json` when the date is not yet fixed) |
| `history/<law ID>.json` | Every version of every block of the law, so its text at any revision can be put together in the browser (see `scripts/extract/history.ts`) |

### Design decisions

- **No commit SHAs in URLs or keys.** houritsu may rewrite its history until v1.0, so an amendment's key is
  `<amending law ID>_<date in force YYYYMMDD | undetermined>`
  (with `-2`, `-3` appended when several commits share the same amending law and date).
  When e-Gov does not name the amending law (houritsu's commit says 「改正法令: 不明」), houritsu uses the ID
  `000000000000000` as both its ID and its law number; the key keeps it, and the site shows the number as
  「改正法令不明」 (`src/lib/law-num.ts`).
- **Diffs are kept per article.** The law text is split into blocks at its headings (part, chapter, section, article,
  supplementary provisions, appended tables, and so on). Old and new blocks are matched by heading number, so
  `第一条（目的）` and `第一条（趣旨）` count as the same article. Articles inside supplementary provisions are told
  apart per set of supplementary provisions. This makes it possible to show which article changed and how, like
  an official comparison table (新旧対照表). A changed block is stored as a character-level diff (runs of unchanged,
  deleted, and added text), so this data alone is enough to show the full old text, the full new text, and what
  changed. Large blocks (over 20,000 characters old and new combined, mostly appended tables) are stored as
  line-based unified diff hunks.
- **Dates are dates of entry into force.** houritsu records dates before 1970 as 1970-01-02, so the date comes from
  the `Enforced` trailer, not from the commit date.
- **Added/removed line counts are approximate.** `git diff --numstat` takes minutes over the whole history, so lines
  are counted by comparing only the changed blocks (a heading counts as one line).
- **Enactment and start of coverage are different events.** Where a law first appears in a commit whose amending law
  is the law itself, it is "enacted" (`enacted`); otherwise it is the point where houritsu started covering it
  (`coverage_start`). houritsu's history starts around 2015, so most laws begin at the start of coverage.
- **Past and future text comes from a block history.** Storing the full text of every revision would take about
  18 GB. Instead, `history/<law ID>.json` stores each distinct version of each block once, together with an order of
  blocks that is consistent with every revision. This is 1 to 4 times the size of the current text (about 43 MB for
  the largest law, 租税特別措置法, before compression). It reproduces the text of every revision exactly (checked
  against git for all 429 revisions of four of the largest laws, and 2,821 revisions of 400 randomly chosen laws).
- **The law text matches the extracted history.** The law pages read the houritsu working tree, so the build stops if
  that checkout is not the commit recorded in `meta.json` (or `laws/` has local changes).

## Site

A static [Astro](https://astro.build/) site, hosted on Cloudflare's free tier (see [Publishing](#publishing)).

- **Site** (`https://anisotro.pics`): `dist/` is served as Workers static assets. Requests for static assets are free
  and unlimited. The site has about 10,000 files, within the free tier's 20,000-file limit.
- **Per-amendment and per-law JSON and the search index** (`https://data.anisotro.pics`): `data/amendments/`,
  `data/laws/`, `data/history/` and `data/pagefind/` go in a public R2 bucket, served through a custom domain with
  Cloudflare caching. The amendment, graph, version and search pages fetch them in the browser. No Worker runs in
  front of either, so there is no per-request limit to run into.
- **Full-text search** uses [Pagefind](https://pagefind.app/) (its extended build segments Japanese words). Each
  article (block) is its own search record, so a result is the matching article, and words in its heading count
  more: a search for 正当防衛 finds 刑法第三十六条 first, where whole-law records ranked unrelated laws higher.
  Indexing all law text at once needs over 13 GB of memory, so `npm run search-index` splits the laws into shards of
  about 45 MB of law HTML (under 5 GB of memory each). All laws make 16 shards, about 530,000 records and 600 MB,
  and take about 17 minutes. The search page merges the shards.

```sh
npm run extract          # build data/ (see above)
npm run build            # build dist/ (including text pages for about 9,400 laws)
npm run search-index     # build the full-text search index from dist/ into data/pagefind/
npm run preview          # serve dist/ and data/ at http://localhost:4321/
```

| Environment variable | Meaning | Default |
| --- | --- | --- |
| `JUSTITIA_DATA` | Directory with the extractor's output | `./data` |
| `JUSTITIA_HOURITSU` | houritsu clone (for the current law text) | `./houritsu` |
| `PUBLIC_DATA_BASE` | URL the browser fetches amendment JSON from | `/data` (production: `https://data.anisotro.pics`) |
| `JUSTITIA_ONLY_LAWS` | Comma-separated law IDs to limit which text pages are built (for testing) | all |

### Pages

| URL | Contents |
| --- | --- |
| `/` | Search, newly enacted laws (recent and upcoming), recent amendments, upcoming amendments, bills pending in the Diet (those one house has passed first), and a few counts (with the number of laws never amended, linking to `/stats/unamended/`) |
| `/browse/`, `/browse/kana/<row>/`, `/browse/type/<type>/`, `/browse/category/<category>/` | Law lists |
| `/laws/<law ID>/` | Law text (an anchor per heading), table of contents, amendment history, the terms the law defines that have a `/terms/` page (`#terms`), and the law's calendar (`.ics`) and RSS feed. A law in force also gets a generated summary under the heading (`src/lib/law-summary.ts`: number and type, date in force, amendments with a link to the last one, amendments not in force yet, pending bills, citations and defined terms) and the laws in force that cite it (`#cited-by`) and that it cites (`#cites`), counted as on `/stats/cited/`, with up to 10 of each listed: the constitution and Acts first, the most cited first. Bills pending in the Diet that would amend the law (see [Bills in the Diet](#bills-in-the-diet)) head the history (`#bills`), with a 「改正案を審議中」 badge by the title |
| `/amendment/<amendment key>/` | Old and new text of the articles an amendment changed (side by side, or inline), as a static page with its own title, description and structured data, served by the amendment Workers (see [Amendment Workers](#amendment-workers)). Like a law page, it has a row of actions (the amendment graph of the laws it changes, share, print), and under each changed law, links to its text after the change, the whole text compared with the revision before, and both revisions on e-Gov 法令検索 |
| `/amendment/?k=<amendment key>` | The address the site linked before the static pages: its script forwards to `/amendment/<amendment key>/`, keeping the `#fragment` |
| `/new/`, `/new/<year>/` | Newly enacted laws (a law whose file first appears in houritsu through the law itself), by year of entry into force, with a type filter. Later parts of a new law coming into force are labeled 段階施行, not 改正, across the site |
| `/repealed/`, `/repealed/<year>/` | Repealed laws (a law whose file is deleted from houritsu's main branch; houritsu records repeals from 2017 on), by year and date of repeal, laid out like `/new/`, with type and "how it was repealed" filters: by a new law coming into force, by a law made to repeal it, or by another amending law. Each links the text in force just before the repeal. Repealed law pages show the same details |
| `/upcoming/` | Amendments promulgated and not yet in force, by month of entry into force (with a countdown in days), then those without a date; a filter by category and law name; the calendar (`.ics`) and RSS feed of the whole site or of the chosen category to subscribe to (see [Calendars and RSS feeds](#calendars-and-rss-feeds)) |
| `/bills/` | 「国会で審議中の法律案」: every law bill pending in the Diet (see [Bills in the Diet](#bills-in-the-diet)), those one house has passed first, then those still in the house they were sent to, latest step first. Each shows its steps, links to the 衆議院 pages and, when its title names them, the laws it would amend. Linked from the menu, the home page, `/upcoming/` and the bills on law pages |
| `/timeline/`, `/timeline/<year>/` | Amendments by year of entry into force |
| `/stats/` | 「法令の統計」: statistics over the laws in force, with the top five of each list below. Built at build time (`src/lib/stats.ts`) from the extracted data (every `laws/<id>.json`) and, for the length, katakana, cited and companies pages, from the law files in the houritsu clone (read once, about 20 seconds for all laws, shared with `/terms/`); each page says the date of the data, and has a note that the figures are counted by a program |
| `/stats/unamended/` | Laws never amended since they were made according to e-Gov (frontmatter `amendment.law_id` null or `""`; houritsu's own history mostly starts in the 2000s, so it cannot tell), oldest first by era, with a type filter. Law pages of these laws get a 「制定以来改正なし」 badge linking here |
| `/stats/oldest/` | The 300 oldest laws in force, by the year of their number (read from the law ID) |
| `/stats/most-amended/` | Laws with the most amendments in force recorded in houritsu (the enactment and 段階施行 not counted; a first recorded revision made by another law is), and the most amended in the last year |
| `/stats/diff/` | The 100 amendments in force (one law, one amending law and one date each) that added and deleted the most lines of that law, counted as on the amendment pages (`additions` + `deletions` of the law's revision), with the amendments that changed the most blocks (articles, headings, 附則, 別表) and the ones that amended the most laws at once (from the timeline, repealed laws included). 段階施行 is left out, and so is a revision that filled in a text houritsu first recorded empty (the title heading alone, `EMPTY_TEXT_LINES` in `src/lib/stats.ts`; 地方税法 in 2017) |
| `/stats/length/` | The 100 longest laws and the 30 shortest Acts by characters (the text without the title, whitespace and markup, 附則 and 別表 included), and the Acts with the most 削除 articles and the most branch-numbered articles (第三条の二) in the main provisions |
| `/stats/katakana/` | Laws whose main provisions are written in katakana (文語体), told by the particles between kanji (条ノ規定ハ against 条の規定は), oldest first by era, with e-Gov's date of the latest amendment |
| `/stats/cited/` | The 100 laws cited by the most other laws in force, the Acts no law in force cites, and the laws that cite the most others. A law cites another when its text has the other's law number (法令番号); 日本国憲法, which laws cite without a number, is counted by its title |
| `/stats/companies/` | Companies and bodies named in laws (`src/lib/companies.ts`): those with a law of their own (特殊会社 such as NTT and JT, NHK, 日本銀行) and some without, with the number of laws in force whose text has the name outside law titles, and the Acts naming each |
| `/terms/` | 「法令用語の定義集」: the terms that at least 5 laws in force define (`MIN_LAWS` in `src/lib/term-index.ts`), by how many laws define them, with a filter box. Linked from the menu and the `/stats/` hub |
| `/terms/<term>/` | How each law in force that defines the term defines it, quoted from the main provisions and grouped by wording, with links to the articles, and terms defined by the same laws. `src/lib/terms.ts` finds the forms that say what a term means: 「X」とは、…をいう (and the bracketless この法律で、X とは of older laws), the items of a glossary article (次の各号に掲げる用語の意義は…) and X（…をいう。以下同じ。）. …（以下「X」という。） counts only when it is a definition by reference to another law named by its title or a short name the law defines (地方自治法第二百五十二条の十九第一項の指定都市（以下「指定都市」という。）), and only when that law has 「X」 in brackets or defines X; a short name for a phrase of the text (事業を行う者（以下「事業者」という。）, 第三十三条第一項の登録（以下「登録」という。）) is not a definition. Definitions that refer to the same provision of another law are grouped, with a link to that article Law pages list the terms they define that have a page. Read in the same pass over the houritsu clone as the stats pages |
| `/versions/?law=<law ID>&at=<amendment key or YYYY-MM-DD>[&from=<…>]` | The law's text at any revision, past or upcoming; with `from`, what changed between two revisions (like `git diff from..at`) |
| `/search/?q=<words>` | Full-text search over the current law text, with links to the matching articles |
| `/graph/?laws=<ID>,<ID>,…` | Amendment graph: one lane per law, with laws changed by the same amending law joined by a line (git-graph style) |
| (any other path) | The 404 page |

### Navigation

The pages are grouped in `src/lib/nav.ts` (法令を探す, 改正・施行, 統計, このサイトについて), and the same list drives
three menus in `src/layouts/Base.astro`:

- From 768 px wide, the header has a button per group (このサイトについて aside) that opens a dropdown of its pages,
  with a one-line description for the first two groups. The dropdowns are HTML popovers (`popovertarget`), so they
  need no script: a click outside or Esc closes them, and opening one closes the other. Where the browser supports
  CSS anchor positioning, a dropdown opens under its button; elsewhere it opens centered under the header. The
  group of the current page is highlighted (the `nav` prop of `Base.astro`), and the link to the current page has
  `aria-current="page"`.
- Below 768 px, the 「メニュー」 button opens the drawer, which lists every group with its heading.
- The footer of every page has the same list as a site map, above the disclaimer.

Every menu link is a plain `<a href>` in the built HTML, so crawlers find them whether a menu is open or not.

### Bills in the Diet

Law pages show the law bills (閣法, 衆法, 参法) under deliberation in the Diet that would amend the law. `npm run bills`
(`scripts/bills.ts`) downloads `gian.json` of the House of Representatives bill database that SmartNews Media Research
Institute keeps ([smartnews-smri/house-of-representatives](https://github.com/smartnews-smri/house-of-representatives),
MIT, updated from the 衆議院 website around 23:00 JST every day) and writes the bills still pending to
`data/bills.json`. A bill counts as pending when its row in the latest session says 審議中 or 閉会中審査 (a bill last
listed in an earlier session has lapsed). The build reads that file (`src/lib/bills.ts`); without it, the pages show no
bills. The publish workflow runs it before every build, and a failed download is a warning, not a failed run. The file
is not uploaded to R2.

A bill is matched to the laws it amends by its title alone: 「X及びYの一部を改正する法律案」 names X and Y, read as a run
of the titles of Acts in force joined by 及び, 並びに or 、 (law titles contain those too). A title shared by two
laws in force, or a run with one unknown title, matches nothing. Bills for new laws and 整備法, whose titles do not
name the laws they change, are not shown on law pages; `/bills/` lists every pending bill, with or without laws. Only the bills' numbers, titles, steps and links to the 衆議院 pages are
used, never their text. The database has the 衆議院's votes by group but not the 参議院's.

### Name and page metadata

The site is called **Anisotropics** after its domain (`SITE_NAME` in `src/lib/site-name.ts`); "justitia" is only
the name of this project and does not appear on the site.

- Every page has its own title (`<page> | Anisotropics`) and description, plus Open Graph and X card tags. All pages
  share one card image, `public/og-image.png` (an image per law would add about 9,000 files). The versions page is
  filled in by the browser from its query string, so link previews (which do not run scripts) show its generic
  title.
- Pages get a canonical link, except `/amendment/` and the versions page (their content depends on the query string,
  and a canonical link without it would mark every amendment as the same page) and the 404 page (served at any
  missing path). `/amendment/` without a key gets `noindex`, so that it is not indexed as an empty page.
- An amendment page whose laws were all only enacted (制定) or first recorded by houritsu (収録開始) shows no diff,
  only links to the law pages, so it gets `noindex` and is left out of the sitemap (`amendmentIndexable` in
  `src/lib/seo.ts`; about a quarter of the amendment pages). Its URL keeps working and the site keeps linking to it.
- `public/robots.txt` keeps crawlers off the pages the browser fills in from a query string: `/versions/` (law
  pages link it once per revision, tens of thousands of URLs), search results (`/search/?q=`) and the old
  amendment address (`/amendment/?k=`). Google's crawl budget guide asks sites to block such URLs with robots.txt
  rather than `noindex`, which still costs a crawl each.
- Structured data (JSON-LD, `src/lib/seo.ts`): pages with breadcrumbs carry a schema.org `BreadcrumbList`
  (`PageHeader`), and law pages a `Legislation` (law number, type, legal force, date of the last amendment in force,
  the e-Gov page as `sameAs`).
- Law pages lead with what only this site has: the generated summary, then the amendment history, the defined terms
  and the citations, which link law pages to each other. The law text itself is also on e-Gov.
- On law pages the amendment history and table of contents come before the law text in the HTML, and CSS places
  them to the right (wide screens) or after the text (narrow screens). Googlebot reads only the first 2 MB of a
  page, and the text of the largest laws is over 10 MB.
- Icons: `public/favicon.svg` is the drawing; `favicon.ico` (16, 32 and 48 px; Google Search does not use SVG
  favicons), `apple-touch-icon.png` (180 px) and `og-image.png` are rendered from it.
- `@astrojs/sitemap` writes `sitemap-index.xml` (all pages except `/amendment/`, the `noindex` amendment pages, the
  versions page and the 404 page),
  which `public/robots.txt` points to and Search Console has. It lists `sitemap-laws-0.xml`, the law pages with a
  `lastmod` (the day the latest amendment in force came into force, never later than the build date, and left out
  before 1970, which Search Console reports as an invalid date),
  `sitemap-amendments-0.xml`, the static amendment pages except the `noindex` ones, with a `lastmod` (the day the
  amendment came into force, or the day it was promulgated while it is not in force yet or its date is
  undetermined; same limits), `sitemap-terms-0.xml`, the pages of defined terms (`/terms/<term>/`), and
  `sitemap-pages-0.xml`, the other pages; the last two have no `lastmod` (their content changes with the data, not
  on a date a page could state).

### Disclaimer

The law text and the diffs are generated by a program, so a conversion error or a bug can garble a page or show a
wrong diff. The site says so, points to e-Gov for the official text, and states that the administrator accepts no
liability for damages from its use, in three places:

- The footer of every page, with a link to the full text.
- The about page: the full disclaimer, in a section with the anchor `/about/#disclaimer`.
- Under the heading of the law, amendment and versions pages: a short note (`DISCLAIMER_NOTE_HTML` in
  `src/lib/disclaimer.ts`, used by both the Astro page and the browser scripts). On law pages it sits outside
  `<article data-law-text>`, so it is not part of the search index.

### Styling

- [Tailwind CSS](https://tailwindcss.com/) v4 (through `@tailwindcss/vite`) and [daisyUI](https://daisyui.com/) 5.
  Pages and the browser scripts use daisyUI components (navbar, drawer, menu, tabs, card, list, badge, timeline,
  stats, breadcrumbs, input, select, button, join, collapse, loading, swap, theme controller) and Tailwind utilities.
  `src/styles/global.css` holds the theme and the few styles neither covers: the law text, the diffs and the graph.
- Colors come from daisyUI's `light` and `dark` themes, adjusted in `global.css`. The sun/moon switch at the top
  right (daisyUI's theme controller and swap, `src/scripts/theme.ts`) picks one; the choice is kept in
  `localStorage` and applied in `<head>` before the page is drawn. Until it is used, the theme follows the
  operating system setting. The colors for added and deleted text (`text-add`, `text-del`, ...) are theme
  variables there too.
- One font for the whole site, law text included: Noto Sans JP (400 and 700) from `@fontsource/noto-sans-jp`,
  served from the site itself, so no request goes to a font service. The font is split by Unicode range, so a
  page only downloads the parts for the characters it uses (about 1.3 MB for 民法, cached for every later page).
  Fontsource also lists a WOFF copy of each file; `astro.config.mjs` drops those, since every current browser
  reads WOFF2, which keeps about 250 unused files out of `dist/`.

## Publishing

`.github/workflows/publish.yml` publishes the site every day at 05:17 JST and again at 08:47 JST, on every push
to `main` (except changes to Markdown files, repository settings, `infra/` and the release workflow; see
[Versioning and releases](#versioning-and-releases)), and when run by hand (Actions → Publish →
Run workflow). houritsu is pushed once a day at about 04:10 JST (04:27 JST on Sundays, when its builder fetches
everything from e-Gov), so the first run picks up the day's commits; the second one covers a scheduled run that
GitHub dropped or a late push to houritsu, and takes about 2 minutes when there is nothing new.
It rebuilds only what changed:

1. fetch houritsu, then extract the data (as in [Data extraction](#data-extraction)), unless the data is in the
   workflow's cache. The cache key is made of the houritsu commits (`main` and `upcoming`) and a hash of the
   extractor's code and the installed versions of the packages it imports (`diff`, `diff-match-patch`, `yaml`;
   `scripts/extract/cache-key.test.ts` checks that list against the imports), so a change to the site's
   dependencies does not extract again. The cache holds what the site build reads (`meta.json`,
   `laws.json`, `laws/`, `timeline/`, and `amendments/` for the static amendment pages). A change to the site alone, or a day without new commits in houritsu, uses
   the cache, as long as R2 still holds the same data: the upload records the data version it uploaded and how
   it stored it in `_publish/data-version.txt` (`<data version> br`, `incomplete` while it uploads), and a cached
   copy with another version (after an extractor change is reverted, for example) is extracted and uploaded again.
   The second line of that file is `<source version> <updated at>` from `meta.json`. houritsu rewrites its history
   almost every day, often without changing any law (a new README in its root commit, for example), which changes
   its commit SHAs and so the cache key. The extractor gets that line (`--published-source`) and keeps the published
   data date when the content it reads from houritsu is the same (`scripts/extract/source-version.ts`), so the date
   the pages show (最終更新, データ更新) moves only when the data does. A cached copy is used only when its date is the
   published one too;
2. `npm run bills` writes the bills pending in the Diet (see [Bills in the Diet](#bills-in-the-diet)), then build
   the site, then the search index (`npm run search-index -- --skip-if-same <published input hash>`),
   unless the published index was built from the same input: `shards.json` records a hash of the indexed parts
   of the law pages, the indexer and the Pagefind version, and the upload publishes it as
   `_publish/pagefind-input.txt` once the whole index is uploaded (`incomplete` while it uploads);
3. `npm run feeds` writes the calendars and RSS feeds to `data/feeds/` (see
   [Calendars and RSS feeds](#calendars-and-rss-feeds)), on every run;
4. `npm run upload-data` (`scripts/upload-data.sh`): sync to the R2 bucket with rclone only the parts that were
   rebuilt: `data` (`amendments/`, `laws/`, `history/`), `feeds` (every run) and `pagefind`. The data files are stored
   Brotli-compressed (see below). Only files whose content changed are uploaded, and files that are gone are
   deleted. Pagefind files are deleted only after they have been unused for
   7 days, so a search page that has been open since before an upload keeps working for a week; a full index is
   about 260 MiB, so that keeps under 2 GB of old files even if every file changed every day. The cache is saved
   after this step, so a run that fails earlier saves nothing;
5. `npm run deploy`: deploy `dist/` to Workers static assets with Wrangler (`wrangler.jsonc`). Wrangler uploads
   only the files that changed. Before that, `npm run split-amendments` has moved the static amendment pages out of
   `dist/`, and `dist/_astro/` has received the previous build's files back (from the workflow's cache), so pages
   still served from the amendment Workers, or open in a browser, keep their CSS and scripts during the deploy;
6. `npm run deploy:amendments`: deploy the three amendment Workers the same way (see below).

### Amendment Workers

A Worker version holds at most 20,000 files on the Workers Free plan. The site has about 10,000 pages and there are
over 23,000 amendments, so the static amendment pages (`/amendment/<key>/`, `src/pages/amendment/[key].astro`) are
served by three more assets-only Workers (`wrangler.justitia-amendments-*.jsonc`), split by the era and year of the
amending law, the first three characters of the key (`scripts/amendment-shards.ts`):

| Worker | Keys | Amending laws |
| --- | --- | --- |
| `justitia-amendments-1` | `0`–`4` | Meiji to Heisei, which no longer grow |
| `justitia-amendments-2` | `501`–`504` | Reiwa 1–4 |
| `justitia-amendments-3` | everything else | Reiwa 5 on, about 1,900 a year |

Each answers Workers routes `anisotro.pics/amendment/<prefix>*`, which Terraform manages
(`infra/terraform/envs/prod/amendments.tf`): routes take precedence over the main Worker's Custom Domain on the same
hostname, and the most specific route wins, so the catch-all `amendment/*` also takes `/amendment/?k=` (it has a copy
of that page). None of them runs a Worker script, so their requests are free static asset requests, as for the main
Worker (checked with a live canary on 2026-11-08).

After the build, `scripts/split-amendments.ts` moves each page to `dist-amendments/<worker>/amendment/<key>/`, gives
each Worker a copy of the 404 page, and fails when a Worker would hold 18,000 files or more; then a fourth Worker has
to take the newest years. An amendment page builds in the side-by-side view as much of the diff as fits in 800 KB
(Googlebot reads the first 2 MB of a page, and an amendment that changes dozens of laws runs to several MB); the
browser fetches the amendment from R2 only for the rest, or when the inline view is chosen.

The amendment pages load their CSS and scripts from `/_astro/` on the main Worker, which the main Worker therefore
keeps for one build after they change (see step 5 above).

A new Worker name is created by its first `wrangler deploy` in the Publish workflow (the Wrangler token may create
Workers); the owner then points the routes at it (`infra/README.md`, "Amendment Workers' routes").

A change to the site takes a few minutes. New commits in houritsu take about 15 minutes more for the extraction
and, when the law text changed, about 10 for the search index. To rebuild everything anyway, run the workflow by
hand with *rebuild* checked.

The data goes first, so a new page never links to data that is not there yet. Data files are uploaded with
`Cache-Control: public, max-age=3600`.

The data files are stored Brotli-compressed, with `Content-Encoding: br`: `scripts/compress-data.ts` compresses
them (quality 5, 16 MB window) into a temporary directory during the upload, so `data/` itself stays plain JSON.
That makes the 2.7 GiB of JSON (1.6 GiB of it `history/`, whose files repeat each block's earlier versions, too far
apart for gzip's 32 KB window) over 10 times smaller in R2, which has 10 GB of free storage. Cloudflare passes
a Brotli response from R2 on as it is to a client that accepts `br` and decompresses it for one that does not
(Cloudflare docs, *ETag headers*), and the browser decompresses it before the page reads it, so the pages need
no change. The compression is deterministic, so unchanged files are not uploaded again. It needs Node.js 22.23.4,
24.22.1, 26.12.1 or later, the releases with the fix for the Brotli decoder flaw CVE-2026-111497; the script
refuses to run on earlier ones (`process.versions.brotli` does not show the fix, so it checks the Node.js
version). The pages fetch `amendments/`, `laws/` and `history/` files with the data
version in the query string (`?v=`, `dataVersion` in `meta.json`), which is part of the cache key. The data version is
a hash of those files, so a build that changes any of them gets new URLs (a page never mixes files from two builds),
and a build that changes none, such as a day without new commits in houritsu, keeps the cached copies. The search
page goes through the cache too, since each request that misses it is a read in R2 (Class B, 10 million a month
free): it fetches `pagefind/shards.json` with `?ts=` set to the current 5-minute period, so a new index is used within
5 minutes, and gives Pagefind the index's input hash from `shards.json` as `metaCacheTag`, so each shard's
`pagefind-entry.json` is fetched as `?ts=<input hash>` and cached until the index changes (by default Pagefind adds
the current time, which skips the cache on every page load). The bucket also holds `_publish/data-version.txt` and
`_publish/pagefind-input.txt` (see above), and `_publish/pagefind-unused.txt`, the upload script's list of the
Pagefind files that the current index does not use, each with the time it was first found unused.

The home page and the graph take today's date from the build (in Japan time), not from the data, so the daily
publish moves amendments from upcoming to enforced even on days that reuse the cached data.

### Calendars and RSS feeds

`scripts/feeds.ts` (`npm run feeds`) writes iCalendar files (RFC 5545) of the days amendments come into force and
RSS 2.0 feeds of amendments promulgated and coming into force to `data/feeds/`, from `laws.json` and `timeline/`
only, so it also runs when the workflow reuses its cached data:

| Files (under `https://data.anisotro.pics/feeds/`) | Amendments |
| --- | --- |
| `all.ics`, `all.xml` | every amendment |
| `category-<category>.ics`, `.xml` | the amendments that change a law of the category (as on `/browse/category/<category>/`); a pair for every category |
| `law-<law ID>.ics`, `.xml` | the amendments that change the law; a pair for every law that is not repealed |

Each amendment is an all-day event on its enforcement day, with the amending law, the laws it changes, a link to
its page on the site and the disclaimer. Amendments without an enforcement date are left out, and so are those
that came into force more than a year (366 days) before the day the file is written, so a subscription stays
small. Nothing in a file depends on the time it is written (`DTSTAMP` is the promulgation date), so a file is
uploaded again only when its events change. `REFRESH-INTERVAL` (RFC 7986) and `X-PUBLISHED-TTL` ask calendar
apps to fetch it again every 12 hours. The upload stores the files uncompressed as `text/calendar; charset=utf-8`
with `Cache-Control: public, max-age=3600`, at URLs without `?v=`, since a subscription keeps its URL; the zone's
first cache rule caches them at the edge for that hour. Clients see `max-age=14400`: the zone's Browser Cache TTL
(4 hours, Terraform) replaces an origin value lower than itself (Cloudflare docs, *Edge and Browser Cache TTL*),
which is still well within the 12 hours the files ask for. `/upcoming/` and the law pages copy a calendar's URL for Google
Calendar, Outlook or Apple Calendar to subscribe to, or open the file to import once.

An RSS feed has an item when an amendment is promulgated (公布) and another when it comes into force (施行), each
dated that day (midnight JST), or one item (公布・施行) when both fall on the same day. Items from the past year
(366 days) up to the day the file is written are kept, newest first, up to 200 (`RSS_MAX_ITEMS`; the
site-wide feed would have about 3,500, 3 MB) plus the rest of the day the 200th item falls on, so a day like
1 April is never cut and a feed can hold somewhat more than 200; each links the amendment's page (for a law's
feed, that law's part of it) and carries the disclaimer. `lastBuildDate` is the newest item's day, not the time of
writing, so a feed too is uploaded again only when its items change; `ttl` asks for a fetch every 12 hours. The
upload stores the feeds like the calendars, as `application/rss+xml; charset=utf-8`. Every page links the
site-wide feed with `<link rel="alternate" type="application/rss+xml">`, and the law and category pages link
their own feed too, so feed readers find them from the page URL. `/upcoming/` and the law pages copy a feed's URL.

Calendar apps such as Google Calendar and Outlook, and feed readers such as Feedly, fetch subscriptions from their
own servers, which Bot Fight Mode may challenge on a non-static extension such as `.ics` or `.xml` (see the `--check` note in `scripts/upload-data.sh`).
Cloudflare documents one exception: Bot Fight Mode does not block requests to Web Assets operations labeled
`cf-rss-feed` (Cloudflare docs, *Security → Web Assets → Label operations*). Terraform keeps the operation
`GET data.anisotro.pics/feeds/{var1}` with that label (see [`infra/README.md`](infra/README.md)).

### One-time setup

The Cloudflare resources (the R2 bucket `justitia-data-prod`, the `anisotro.pics` custom domain of the Worker, the
zone's cache and response header rules, Browser Cache TTL and Bot Fight Mode) are managed with Terraform under
[`infra/`](infra/README.md), which also says how they are set up. The Worker itself, with its Workers Logs and Traces
settings, is deployed by Wrangler from `wrangler.jsonc`. Three things are still set up in the dashboard:

1. **Custom domain of the bucket**: in the bucket's settings, connect `data.anisotro.pics` (the Terraform provider
   cannot import an existing one; see [`infra/README.md`](infra/README.md)).
2. **API token for Wrangler** (Manage account → Account API tokens → Create token): use the *Edit Cloudflare
   Workers* template, limited to this account and the `anisotro.pics` zone. It needs to be allowed to create a
   Worker (the first deploy creates `justitia`). `wrangler.jsonc` has no `routes`, so the deploy does not touch the
   Worker's custom domain, which Terraform attaches.
3. **R2 API token** (R2 → Manage API tokens → Create account API token): *Object Read & Write*, limited to the
   `justitia-data-prod` bucket. It gives an access key ID and a secret access key.

In the GitHub repository (Settings → Secrets and variables → Actions), add these repository secrets:

| Secret | Value |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | The Cloudflare account ID |
| `CLOUDFLARE_API_TOKEN` | The token from step 2 |
| `R2_ACCESS_KEY_ID` | The access key ID from step 3 |
| `R2_SECRET_ACCESS_KEY` | The secret access key from step 3 |

Then run the workflow by hand once. Its first step after the checkout writes, reads back and deletes one small
object in the bucket (`scripts/upload-data.sh --check`) and verifies the API token, so a wrong secret fails the run
in about a minute instead of after the build. The check also uploads a Brotli-compressed object and fetches it
through `data.anisotro.pics` with `Accept-Encoding: br`, `gzip` and `identity`, and stops the run if Cloudflare
does not serve it as `br` to the first and decompressed to the others. The first upload is about 59,000 files and
under 1 GB (the search index, about 260 MiB, is most of it), within R2's free tier (10 GB stored, 1 million writes a
month); later runs upload only what changed. GitHub turns off scheduled workflows
in a public repository after 60 days without activity; turn the workflow back on under Actions if that happens.

To publish from your own machine instead, set the same four values as environment variables (and install rclone 1.68 or
later, and Node.js 22.23.4 or later),
then run `npm run upload-data` and `npm run deploy` after building.


## Versioning and releases

The site is deployed continuously: every push to `main` publishes it, and houritsu's daily update is published every
morning. A version therefore does not gate a deploy. It names a point in `main`'s history, so a change can be referred
to and announced, and [CHANGELOG.md](CHANGELOG.md) and the
[GitHub Releases](https://github.com/0xCAFEBABEx0/justitia/releases) say what changed for the people who use the
site, its data, feeds and calendars.

- **Calendar versions `YYYY.M.N`**: the year and month (Japan time) of the release, and `N`, which counts the releases
  of that month from 0: `2026.11.0`, `2026.11.1`, `2026.12.0`. The tag is `v` + version (`v2026.11.0`). Semantic
  versioning would not fit: nothing installs a version of the site, and its public contracts (below) are kept
  stable by rule instead of by major versions. A calendar version says how recent a change is, allows any number
  of releases a month, and is also a valid semantic version (no leading zeros), so tools that sort versions sort
  it correctly.
- **What a version covers**: the code in this repository (site, extractor, feeds, publishing). The data is not
  versioned by releases: houritsu's daily updates are published without one, and each build of the data has its own
  data version (`dataVersion` in `meta.json`, see [Output](#output)) and data date (`updatedAt`, the day houritsu's
  content last changed, shown on the home and about pages, on law pages and in print).
- **Public contracts and breaking changes**: page URLs, the files, fields and keys of the JSON at
  `https://data.anisotro.pics`, and the URLs of the calendars and feeds are relied on by bookmarks, subscriptions and
  reusers of the data. They are not changed for style ([AGENTS.md](AGENTS.md), rule 10). When one has to change, the
  pull request says so, and its changelog entry starts with **Breaking:**.
- **`package.json`'s `version` is not the site's version.** The package is private and never published; the field
  stays as it is and is not bumped. The tags and CHANGELOG.md are the record.

### Changelog

[CHANGELOG.md](CHANGELOG.md) follows [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/): one section per
release, newest first, headed `## [YYYY.M.N] - YYYY-MM-DD`, with entries under `### Added`, `### Changed`,
`### Deprecated`, `### Removed`, `### Fixed` and `### Security` (in that order, only those used), and a link
reference per version at the end of the file (the compare view from the version before it; the tag page for the
first). Entries are in English, written for the people who use the site and its data rather than for developers, and
end with the pull requests they come from (`(#27, #29)`).

- List: new and changed pages and features, visible fixes, accessibility and performance improvements, changes to
  the published data, calendars and feeds, and security fixes.
- Leave out: dependency updates (unless they fix a security issue or change something visible), refactoring, tests,
  documentation, CI, infrastructure and repository settings, and changes undone before the release (a canary added
  and removed, for example). A release needs at least one entry.

Feature pull requests do not edit CHANGELOG.md: several branches are open at once, and they would all change the
same lines. The release pull request writes the entries from the pull requests merged since the last tag, so a pull
request's title and description should say what changed for users.

### Cutting a release

Cut a release when `main` has changes worth announcing: after a notable feature or fix, or about once a week when
smaller changes have piled up. Changes that would all be left out of the changelog need no release.

1. List what was merged since the last release:
   `git fetch origin --tags && git log --first-parent --oneline "$(git describe --tags --abbrev=0 origin/main)..origin/main"`.
2. On a new branch from `origin/main`, add the new section at the top of CHANGELOG.md (above the previous release),
   with the version and today's date in Japan time, and its link reference at the end; update the version in the
   "Changes merged since the latest release" compare link under the introduction. `node scripts/changelog.ts` checks
   the file (`npm test` does too).
3. Open a pull request titled `Release YYYY.M.N` that changes only CHANGELOG.md, with `@coderabbitai ignore` in its
   description so that it does not spend a CodeRabbit review. CodeRabbit then posts no check, so the owner merges it
   by bypassing the ruleset ("Merge without waiting for requirements to be met"). The Publish workflow ignores it, so
   the merge deploys nothing new. Before merging it, hold other merges until it is in, run the command of step 1
   again and add entries for anything merged in the meantime (above all a **Breaking:** change). If the date has
   passed, update it (and the version, if the month changed: the workflow refuses a version of an earlier month).
4. Merge it. `.github/workflows/release.yml` checks CHANGELOG.md, then creates the tag `vYYYY.M.N` on the merge
   commit and a GitHub Release titled `YYYY.M.N` whose notes are the new section (with its lines joined, since
   GitHub shows every line break) and a link to the full diff. It does nothing if that release already exists; if
   it failed, fix CHANGELOG.md in another pull request, or run it by hand (Actions → Release → Run workflow), which
   creates the newest version's release at the last commit on `main`'s first-parent line that changed CHANGELOG.md
   (the release PR's merge), even if other pull requests have merged since.

Tags are never moved or deleted. A mistake in published notes is fixed in CHANGELOG.md by a pull request and by
editing the GitHub Release by hand; a mistake in the code is fixed in the next release.

## License

Copyright (C) 2026 0xCAFEBABEx0

The code in this repository is free software under the [GNU Affero General Public License v3.0](LICENSE)
(`AGPL-3.0-only`). If you run a modified version of it as a public website, the AGPL asks you to offer your users
its source code; the site links to this repository from its footer and about page for that reason.

The data the site shows is not covered by that license:

- **Law texts and amendment history** come from [houritsu](https://github.com/Kohei-Wada/houritsu) by Kohei-Wada,
  under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). houritsu is built from
  [e-Gov 法令検索](https://laws.e-gov.go.jp/) data under the
  [Public Data License 1.0 (PDL1.0)](https://www.digital.go.jp/resources/open_data/public_data_license_v1.0).
  The statute text itself is not copyrighted (Copyright Act of Japan, Article 13).
- **The generated data** (the JSON published at `data.anisotro.pics` and the pages built from it) is houritsu's data
  changed by this project: converted to JSON, split by law and amendment, with article-level diffs and a search index
  added. It is provided under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Credit houritsu and
  e-Gov 法令検索 as above when you reuse it.
- **Noto Sans JP**, bundled through `@fontsource/noto-sans-jp`, is under the
  [SIL Open Font License 1.1](https://openfontlicense.org/).

No warranty: the data is generated automatically and may be wrong or out of date. Check e-Gov 法令検索 or the 官報
before relying on it.
