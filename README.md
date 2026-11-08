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

The options (`--repo`, `--out`, `--main`, `--upcoming`, `--only`, `--related-only`) are described in the comment at the top of `scripts/extract/index.ts`.
Passing a law ID, as in `--only 140AC0000000045`, writes only that law (useful for testing).

### Output

The types are in `scripts/extract/types.ts`.

| File | Contents |
| --- | --- |
| `meta.json` | Generation time, data version (a hash of `amendments/`, `laws/` and `history/`), the houritsu commits used, counts |
| `laws.json` | All laws (in force, repealed, and not yet in force), in kana order |
| `laws/<law ID>.json` | Per-law details, amendment history (oldest first, upcoming amendments last), and the laws most often amended together with it |
| `amendments/<key>.json` | Per-amendment (one houritsu commit) details, with an article-level diff for each law it changed |
| `timeline/<year>.json` | Amendments by year of entry into force (`undetermined.json` when the date is not yet fixed) |
| `history/<law ID>.json` | Every version of every block of the law, so its text at any revision can be put together in the browser (see `scripts/extract/history.ts`) |

### Design decisions

- **No commit SHAs in URLs or keys.** houritsu may rewrite its history until v1.0, so an amendment's key is
  `<amending law ID>_<date in force YYYYMMDD | undetermined>`
  (with `-2`, `-3` appended when several commits share the same amending law and date).
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
| `/` | Search, newly enacted laws (recent and upcoming), recent amendments, upcoming amendments |
| `/browse/`, `/browse/kana/<row>/`, `/browse/type/<type>/`, `/browse/category/<category>/` | Law lists |
| `/laws/<law ID>/` | Law text (an anchor per heading), table of contents, amendment history, and the law's calendar (`.ics`) |
| `/amendment/?k=<amendment key>` | Old and new text of the articles an amendment changed (side by side, or inline) |
| `/new/`, `/new/<year>/` | Newly enacted laws (a law whose file first appears in houritsu through the law itself), by year of entry into force, with a type filter. Later parts of a new law coming into force are labeled 段階施行, not 改正, across the site |
| `/repealed/`, `/repealed/<year>/` | Repealed laws (a law whose file is deleted from houritsu's main branch; houritsu records repeals from 2017 on), by year and date of repeal, laid out like `/new/`, with type and "how it was repealed" filters: by a new law coming into force, by a law made to repeal it, or by another amending law. Each links the text in force just before the repeal. Repealed law pages show the same details |
| `/upcoming/` | Amendments promulgated and not yet in force, by month of entry into force (with a countdown in days), then those without a date; a filter by category and law name; the calendar (`.ics`) of the whole site or of the chosen category to subscribe to (see [Calendars](#calendars)) |
| `/timeline/`, `/timeline/<year>/` | Amendments by year of entry into force |
| `/versions/?law=<law ID>&at=<amendment key or YYYY-MM-DD>[&from=<…>]` | The law's text at any revision, past or upcoming; with `from`, what changed between two revisions (like `git diff from..at`) |
| `/search/?q=<words>` | Full-text search over the current law text, with links to the matching articles |
| `/graph/?laws=<ID>,<ID>,…` | Amendment graph: one lane per law, with laws changed by the same amending law joined by a line (git-graph style) |
| (any other path) | The 404 page |

### Name and page metadata

The site is called **Anisotropics** after its domain (`SITE_NAME` in `src/lib/site-name.ts`); "justitia" is only
the name of this project and does not appear on the site.

- Every page has its own title (`<page> | Anisotropics`) and description, plus Open Graph and X card tags. All pages
  share one card image, `public/og-image.png` (an image per law would add about 9,000 files). The amendment and
  versions pages are filled in by the browser from their query string, so link previews (which do not run scripts)
  show their generic title.
- Pages get a canonical link, except the amendment and versions pages (their content depends on the query string,
  and a canonical link without it would mark every amendment as the same page) and the 404 page (served at any
  missing path).
- Icons: `public/favicon.svg` is the drawing; `favicon.ico` (16, 32 and 48 px; Google Search does not use SVG
  favicons), `apple-touch-icon.png` (180 px) and `og-image.png` are rendered from it.
- `@astrojs/sitemap` writes `sitemap-index.xml` (all pages except the amendment, versions and 404 pages), which
  `public/robots.txt` points to.

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
to `main` (except changes to Markdown files, repository settings and `infra/`), and when run by hand (Actions → Publish →
Run workflow). houritsu is pushed once a day at about 04:10 JST (04:27 JST on Sundays, when its builder fetches
everything from e-Gov), so the first run picks up the day's commits; the second one covers a scheduled run that
GitHub dropped or a late push to houritsu, and takes about 2 minutes when there is nothing new.
It rebuilds only what changed:

1. fetch houritsu, then extract the data (as in [Data extraction](#data-extraction)), unless the data is in the
   workflow's cache. The cache key is made of the houritsu commits (`main` and `upcoming`) and a hash of the
   extractor's code and the installed versions of the packages it imports (`diff`, `diff-match-patch`, `yaml`;
   `scripts/extract/cache-key.test.ts` checks that list against the imports), so a change to the site's
   dependencies does not extract again. The cache holds what the site build reads (`meta.json`,
   `laws.json`, `laws/`, `timeline/`). A change to the site alone, or a day without new commits in houritsu, uses
   the cache, as long as R2 still holds the same data: the upload records the data version it uploaded and how
   it stored it in `_publish/data-version.txt` (`<data version> br`, `incomplete` while it uploads), and a cached
   copy with another version (after an extractor change is reverted, for example) is extracted and uploaded again;
2. build the site, then the search index (`npm run search-index -- --skip-if-same <published input hash>`),
   unless the published index was built from the same input: `shards.json` records a hash of the indexed parts
   of the law pages, the indexer and the Pagefind version, and the upload publishes it as
   `_publish/pagefind-input.txt` once the whole index is uploaded (`incomplete` while it uploads);
3. `npm run feeds` writes the calendars to `data/feeds/` (see [Calendars](#calendars)), on every run;
4. `npm run upload-data` (`scripts/upload-data.sh`): sync to the R2 bucket with rclone only the parts that were
   rebuilt: `data` (`amendments/`, `laws/`, `history/`), `feeds` (every run) and `pagefind`. The data files are stored
   Brotli-compressed (see below). Only files whose content changed are uploaded, and files that are gone are
   deleted. Pagefind files are deleted only after they have been unused for
   7 days, so a search page that has been open since before an upload keeps working for a week; a full index is
   about 260 MiB, so that keeps under 2 GB of old files even if every file changed every day. The cache is saved
   after this step, so a run that fails earlier saves nothing;
5. `npm run deploy`: deploy `dist/` to Workers static assets with Wrangler (`wrangler.jsonc`). Wrangler uploads
   only the files that changed.

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

### Calendars

`scripts/feeds.ts` (`npm run feeds`) writes iCalendar files (RFC 5545) of the days amendments come into force to
`data/feeds/`, from `laws.json` and `timeline/` only, so it also runs when the workflow reuses its cached data:

| File (under `https://data.anisotro.pics/feeds/`) | Events |
| --- | --- |
| `all.ics` | every amendment |
| `category-<category>.ics` | the amendments that change a law of the category (as on `/browse/category/<category>/`) |
| `law-<law ID>.ics` | the amendments that change the law; one file for every law that is not repealed |

Each amendment is an all-day event on its enforcement day, with the amending law, the laws it changes, a link to
its page on the site and the disclaimer. Amendments without an enforcement date are left out, and so are those
that came into force more than a year (366 days) before the day the file is written, so a subscription stays
small. Nothing in a file depends on the time it is written (`DTSTAMP` is the promulgation date), so a file is
uploaded again only when its events change. `REFRESH-INTERVAL` (RFC 7986) and `X-PUBLISHED-TTL` ask calendar
apps to fetch it again every 12 hours. The upload stores the files uncompressed as `text/calendar; charset=utf-8`
with `Cache-Control: public, max-age=3600`, at URLs without `?v=`, since a subscription keeps its URL; the zone's
first cache rule caches them for that hour. `/upcoming/` and the law pages copy a calendar's URL for Google
Calendar, Outlook or Apple Calendar to subscribe to, or open the file to import once.

Calendar apps such as Google Calendar and Outlook fetch subscriptions from their own servers, which Bot Fight Mode
may challenge on a non-static extension such as `.ics` (see the `--check` note in `scripts/upload-data.sh`).
Cloudflare documents one exception: Bot Fight Mode does not block requests to Web Assets operations labeled
`cf-rss-feed` (Cloudflare docs, *Security → Web Assets → Label operations*). In the dashboard, under Security →
Web Assets → Operations, add the operation `GET data.anisotro.pics/feeds/{var1}` and give it the managed label
`cf-rss-feed`.

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
