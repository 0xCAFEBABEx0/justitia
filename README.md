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
| `/` | Search, recent amendments, upcoming amendments |
| `/browse/`, `/browse/kana/<row>/`, `/browse/type/<type>/`, `/browse/category/<category>/` | Law lists |
| `/laws/<law ID>/` | Law text (an anchor per heading), table of contents, amendment history |
| `/amendment/?k=<amendment key>` | Old and new text of the articles an amendment changed (side by side, or inline) |
| `/timeline/`, `/timeline/<year>/` | Amendments by year of entry into force |
| `/versions/?law=<law ID>&at=<amendment key or YYYY-MM-DD>[&from=<…>]` | The law's text at any revision, past or upcoming; with `from`, what changed between two revisions (like `git diff from..at`) |
| `/search/?q=<words>` | Full-text search over the current law text, with links to the matching articles |
| `/graph/?laws=<ID>,<ID>,…` | Amendment graph: one lane per law, with laws changed by the same amending law joined by a line (git-graph style) |
| (any other path) | The 404 page |

## Publishing

`.github/workflows/publish.yml` publishes the site every day at 06:30 JST, on every push to `main`, and when run by
hand (Actions → Publish → Run workflow). It takes about 40 minutes on a GitHub-hosted runner:

1. fetch houritsu, extract the data, build the site and the search index (as in [Site](#site));
2. `npm run upload-data` (`scripts/upload-data.sh`): sync `amendments/`, `laws/`, `history/` and `pagefind/` to the
   R2 bucket with rclone. Only files whose content changed are uploaded, and files that are gone are deleted
   (Pagefind files one run later, so a search page that was open during the upload keeps working);
3. `npm run deploy`: deploy `dist/` to Workers static assets with Wrangler (`wrangler.jsonc`). Wrangler uploads
   only the files that changed.

The data goes first, so a new page never links to data that is not there yet. Data files are uploaded with
`Cache-Control: public, max-age=3600`. The pages fetch `amendments/`, `laws/` and `history/` files with the build's
data version in the query string (`?v=`, from `generatedAt` in `meta.json`), which is part of the cache key, so a
new build never gets files cached from an older one, and a page never mixes the two. Pagefind's
`pagefind-entry.json` and our `pagefind/shards.json` are always fetched with a `?ts=` query, which skips the cache,
so the search page picks up a new index right away. The bucket also holds `_publish/pagefind-unused.txt`, the
upload script's list of Pagefind files to delete on the next run.

### One-time setup

In the Cloudflare account that has the `anisotro.pics` zone:

1. **R2 bucket**: create `justitia-data-prod` with the location hint *Asia-Pacific*, close to most readers.
2. **Custom domain**: in the bucket's settings, connect `data.anisotro.pics`. Keep the `r2.dev` URL disabled.
3. **Cache rule** (Caching → Cache Rules): when the hostname equals `data.anisotro.pics`, make the request
   *eligible for cache*, with the edge TTL taken from the `Cache-Control` header. Without it, Cloudflare caches only
   some file types, and none of the JSON.
4. **CORS header** (Rules → Transform Rules → Response Header): when the hostname equals `data.anisotro.pics`, set
   the static header `Access-Control-Allow-Origin: *`. The pages on `anisotro.pics` read this cross-origin data
   (including `pagefind.js`, which is loaded as a module). A transform rule is used instead of the bucket's CORS
   policy because R2 adds CORS headers only to requests that send an `Origin` header, and the cache keeps whichever
   response it got first; a transform rule adds the header to every response, cached or not. All of the data is
   public.
5. **API token for Wrangler** (Manage account → Account API tokens → Create token): use the *Edit Cloudflare
   Workers* template, limited to this account and the `anisotro.pics` zone. It needs to be allowed to create a
   Worker (the first deploy creates `justitia`) and *Workers Routes: Edit* on the zone. The first deploy also
   creates the `anisotro.pics` custom domain; run from CI, Wrangler replaces an existing `A`, `AAAA` or `CNAME`
   record on the apex with the Worker's record (other record types, such as `MX`, are not touched).
6. **R2 API token** (R2 → Manage API tokens → Create account API token): *Object Read & Write*, limited to the
   `justitia-data-prod` bucket. It gives an access key ID and a secret access key.

In the GitHub repository (Settings → Secrets and variables → Actions), add these repository secrets:

| Secret | Value |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | The Cloudflare account ID |
| `CLOUDFLARE_API_TOKEN` | The token from step 5 |
| `R2_ACCESS_KEY_ID` | The access key ID from step 6 |
| `R2_SECRET_ACCESS_KEY` | The secret access key from step 6 |

Then run the workflow by hand once. Its first step after the checkout writes, reads back and deletes one small
object in the bucket (`scripts/upload-data.sh --check`) and verifies the API token, so a wrong secret fails the run
in about a minute instead of after the build. The first upload is about 79,000 files and 3.5 GB, within R2's free tier
(10 GB stored, 1 million writes a month); later runs upload only what changed. GitHub turns off scheduled workflows
in a public repository after 60 days without activity; turn the workflow back on under Actions if that happens.

To publish from your own machine instead, set the same four values as environment variables (and install rclone 1.68 or later),
then run `npm run upload-data` and `npm run deploy` after building.

