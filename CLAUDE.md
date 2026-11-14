# CLAUDE.md — justitia (Anisotropics)

Japanese laws and their amendment history as a static website, built from the houritsu git repository and hosted
on Cloudflare's free tier. Generic agent instructions live in [AGENTS.md](AGENTS.md), the canonical copy shared with
other agents and imported below (including what to do when docs and code disagree); this file adds
Claude-Code-specific pointers. Full design notes are in [README.md](README.md) and [infra/README.md](infra/README.md).

@AGENTS.md

## Commands

All commands run at the repository root (package manager: **npm**, Node.js >= 22.23.4):

```bash
npm install
npm test                 # node:test over scripts/**/*.test.ts and src/**/*.test.ts (the only check CI runs)
npm run typecheck        # tsc -p . (run it too; CI does not)

npm run fetch-houritsu   # clone/fetch houritsu into ./houritsu, detached at origin/main
npm run extract          # houritsu → ./data; add `-- --only <law ID>,…` for a quick partial run
npm run bills            # bills pending in the Diet → ./data/bills.json (optional; law pages show them)
npm run build            # ./data + ./houritsu → dist/; JUSTITIA_ONLY_LAWS=<ID>,… limits law pages
npm run search-index     # Pagefind shards from dist/ into data/pagefind/
npm run preview          # serve dist/ + data/ at http://localhost:4321/

npm run upload-data      # production R2 upload (Publish workflow only)
npm run deploy           # production Wrangler deploy (Publish workflow only)

node scripts/changelog.ts  # check CHANGELOG.md (npm test runs the same check)
```

Infra commands run in `infra/terraform/envs/prod/`:

```bash
terraform init -backend=false && terraform validate   # safe anywhere
op run --env-file=1password.env -- terraform plan     # owner's machine only: HCP Terraform state + 1Password creds
# terraform apply: owner only, the same way, from an up-to-date main, after the owner approves the plan
```

### Quick local check (about 15 seconds)

Do not run the full pipeline locally. Instead:

1. blobless clone of houritsu (`git clone --filter=blob:none …`, sparse if only a few laws are needed);
2. `npm run extract -- --only <law ID>,…`;
3. `npx astro build --outDir <scratch>/dist` with `JUSTITIA_ONLY_LAWS` set;
4. from `<scratch>`, run `JUSTITIA_DATA=<repo>/data node <repo>/scripts/preview.ts` (it serves `./dist`) and look at
   the pages with Playwright.

For pages that need the full data (amendment, versions, graph, search), load the live page and swap in the changed
CSS or bundled script with Playwright `context.route` / `page.route` (rewrite `</head>` before parsing; an init script
at DOMContentLoaded is too late for the first layout). Remove `houritsu/`, `data/` and scratch builds afterwards.

## Architecture (1-minute version)

- **Extraction** (`scripts/extract/index.ts`): walks houritsu's `main` and `upcoming` branches and writes
  `meta.json`, `laws.json`, `laws/<id>.json`, `amendments/<key>.json`, `timeline/<year>.json` and
  `history/<id>.json` (every distinct version of every block, so the browser can rebuild the text at any revision).
  Diffs are per article (blocks matched by heading number), stored as character runs, or line hunks for blocks over
  20,000 characters. Types: `scripts/extract/types.ts`.
- **Site** (`src/`): Astro `output: "static"`, `trailingSlash: "always"`. Law pages (`/laws/<id>/`), lists
  (`/browse/`, `/new/`, `/repealed/`, `/timeline/`) and the home page are prerendered. The amendment, versions, graph
  and search pages are client-rendered by `src/scripts/*.ts` from JSON at `PUBLIC_DATA_BASE`
  (`https://data.anisotro.pics` in production), with `?v=<dataVersion>` for caching.
- **Hosting**: `dist/` is an assets-only Worker `justitia` (`wrangler.jsonc`; `workers_dev` and `preview_urls` off,
  no `routes`); Terraform attaches the `anisotro.pics` Custom Domain. Data lives in R2 `justitia-data-prod`,
  Brotli-precompressed with `Content-Encoding: br` (`scripts/compress-data.ts`), served through cache rules.
- **Publish** (`.github/workflows/publish.yml`): 05:17 and 08:47 JST daily (houritsu pushes around 04:02–04:10 JST,
  04:27 on Sundays), on push to `main`, and by hand. Order: extract (cached) → build → search index (skipped if the
  input hash matches) → upload data → deploy site, so a page never links to data that is not there yet.
- **Release** (`.github/workflows/release.yml`): when a `Release YYYY.M.N` PR (CHANGELOG.md only) merges, creates the
  tag `vYYYY.M.N` and a GitHub Release from the newest CHANGELOG.md section. Releases deploy nothing; see AGENTS.md,
  "Versions and releases".

## Gotchas

- Cloudflare Bot Fight Mode challenges GitHub runners on non-static extensions such as `.json`; any CI request to
  `data.anisotro.pics` must use a static extension (the check object is `_publish/check-br.txt`).
- To check caching, use GET (`curl -s -D - -o /dev/null <url>`); HEAD reports `cf-cache-status: DYNAMIC` even for
  cached files. Right after a deploy, Cloudflare may still serve the old HTML for a while; check the CSS hash before
  trusting a measurement.
- Astro's `compressHTML` turns a newline between Japanese text lines into a stray space and drops one between text and
  an element. Keep a Japanese sentence on one source line and write explicit spaces before Latin links.
- Page background is daisyUI `base-200` and boxes are `base-100`, so daisyUI defaults that use `base-200` (card border,
  btn, tabs-box) need overrides in `global.css`.
- Lists without date headings have no top margin: the section heading above needs `mb-3`. `AmendmentList` /
  `NewLawList` with `groupByDate={false}` render one `<ul>`.
- Law pages can be huge (租税特別措置法 ~11.7 MB of HTML, ~1,600 blocks in 民法); `.law-text .blk` uses
  `content-visibility: auto`. Measure layout cost before adding per-block markup.
- Lighthouse runs here with `CHROME_PATH=/opt/pw-browsers/chromium` and
  `--chrome-flags="--headless=new --no-sandbox --proxy-server=$HTTPS_PROXY"`.
