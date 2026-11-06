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
| `meta.json` | Generation time, the houritsu commits used, counts |
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

A static [Astro](https://astro.build/) site, to be hosted on Cloudflare's free tier.

- **Site** (`https://anisotro.pics`): `dist/` is served as Workers static assets. Requests for static assets are free
  and unlimited. The site has about 10,000 files, within the free tier's 20,000-file limit.
- **Per-amendment and per-law JSON and the search index** (`https://data.anisotro.pics`): `data/amendments/`,
  `data/laws/`, `data/history/` and `data/pagefind/` go in a public R2 bucket, served through a custom domain with
  Cloudflare caching. The amendment, graph, version and search pages fetch them in the browser.
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
| `/` | Search, recent amendments, upcoming amendments |
| `/browse/`, `/browse/kana/<row>/`, `/browse/type/<type>/`, `/browse/category/<category>/` | Law lists |
| `/laws/<law ID>/` | Law text (an anchor per heading), table of contents, amendment history |
| `/amendment/?k=<amendment key>` | Old and new text of the articles an amendment changed (side by side, or inline) |
| `/timeline/`, `/timeline/<year>/` | Amendments by year of entry into force |
| `/versions/?law=<law ID>&at=<amendment key or YYYY-MM-DD>[&from=<…>]` | The law's text at any revision, past or upcoming; with `from`, what changed between two revisions (like `git diff from..at`) |
| `/search/?q=<words>` | Full-text search over the current law text, with links to the matching articles |
| `/graph/?laws=<ID>,<ID>,…` | Amendment graph: one lane per law, with laws changed by the same amending law joined by a line (git-graph style) |
