# AGENTS.md — justitia

Instructions for AI coding agents working in this repository.

## What this project is

justitia builds **Anisotropics** (`https://anisotro.pics`), a website for browsing Japanese laws and their amendment
history. Its input is [houritsu](https://github.com/Kohei-Wada/houritsu), a repository that keeps every Japanese law in
Git (one commit = one amending law coming into force). Like bundestag/gesetze it lists laws and shows their text; it
also shows *when* and *how* each law changed (amendment timelines and article-level diffs). It runs entirely on
Cloudflare's free tier:

- **Extraction** (`scripts/extract/`) — reads houritsu's git history and writes JSON (`data/`)
- **Astro + TypeScript + Tailwind CSS v4 + daisyUI 5** — statically generated pages (`src/`)
- **Cloudflare Workers static assets** — serves `dist/` at `anisotro.pics`; there is no Worker script
- **R2** (`justitia-data-prod`, custom domain `data.anisotro.pics`) — per-law / per-amendment JSON and the search index,
  fetched by the browser
- **Pagefind** — full-text search, built in shards (`scripts/search-index.ts`)
- **GitHub Actions** (`.github/workflows/publish.yml`) — daily incremental rebuild and deploy
- **Terraform** (`infra/terraform/`) — Cloudflare resource existence and zone rules

The authoritative docs are [README.md](README.md) (data format, design decisions, pages, publishing) and
[infra/README.md](infra/README.md) (who manages what, running Terraform). When the docs and the existing code disagree,
follow how the code is written, and list every discrepancy you found in your final reply.

## Layout

```
scripts/extract/   houritsu git history → data/ (meta.json, laws.json, laws/, amendments/, timeline/, history/)
scripts/           search index, data compression + R2 upload, local preview, changelog check
src/pages/         Astro pages (one file per URL pattern; see README "Pages")
src/components/    shared list / header / badge components
src/layouts/       Base.astro: <head>, header, drawer, footer (license + disclaimer)
src/lib/           build-time helpers (data loading, law text rendering, badges, disclaimer, site name)
src/scripts/       browser scripts for the client-rendered pages (amendment, versions, graph, search, theme)
src/styles/        global.css: daisyUI themes and the styles daisyUI does not cover (law text, diffs, graph)
public/            static files copied to dist/ (_headers, favicons, og-image.png, robots.txt)
infra/terraform/   envs/prod + modules/cloudflare_site (HCP Terraform state, local execution)
.github/           publish and release workflows, Dependabot, importable ruleset for main
```

Generated and ignored: `houritsu/` (clone), `data/` (extractor output), `dist/` (site build), `.astro/`.

## Build & run

Node.js **22.23.4 or later** (22.18 runs TypeScript directly; the data compression step refuses releases without the
Brotli CVE-2026-111497 fix). Package manager: **npm**.

| Command | Effect |
|---|---|
| `npm install` | install dependencies |
| `npm test` | unit tests (`node:test`, `scripts/**/*.test.ts` and `src/**/*.test.ts`); CI runs this |
| `npm run typecheck` | `tsc -p .` |
| `npm run fetch-houritsu` | clone or fetch houritsu into `./houritsu` |
| `npm run extract` | houritsu → `./data` (full run: ~15 min, ~1.5 GB heap) |
| `npm run build` | `./data` + `./houritsu` → `dist/` |
| `npm run search-index` | Pagefind shards from `dist/` into `data/pagefind/` (~17 min for all laws) |
| `npm run preview` | serve `dist/` and `data/` at `http://localhost:4321/` |

`npm run upload-data` and `npm run deploy` publish to production; they belong to the Publish workflow, not to an agent.

**Avoid full local builds.** A full extract + build + search index takes over half an hour and leaves gigabytes behind.
For a quick check, extract only a few laws (`npm run extract -- --only <law ID>,<law ID>`), or set `JUSTITIA_ONLY_LAWS`
for the build, and build into a scratch directory. For pages that need the full data, test against the live site
(for example by injecting CSS or a rebuilt script into the live page with Playwright request interception). Delete
local `houritsu/`, `data/` and `dist/` copies when you are done.

## Rules

1. **No secrets in the repository.** The repository is public and holds infrastructure code. Before every commit and
   PR, check that no token, key, account credential, Terraform state or plan output, or log containing them is in the
   diff, the commit message or the PR text. Credentials live in 1Password and GitHub Actions secrets only;
   `infra/terraform/envs/prod/1password.env` holds `op://` references, never values. `.gitignore` already excludes
   `*.tfstate*`, `*.tfvars*`, `*.tfplan` and `.terraform/`; do not weaken it.
2. **English in the repository, Japanese with the owner.** Code comments, docs, commit messages, issues, PR titles and
   bodies, and review replies are in English. The site UI and all law content are in Japanese on purpose; do not
   translate them. When you talk to the owner (chat), use Japanese.
3. **Read the official docs before fixing.** Before changing anything that touches an external tool or service
   (Cloudflare, Wrangler, R2, rclone, Pagefind, Astro, daisyUI, Terraform provider, GitHub Actions), read its current
   documentation and check the whole pipeline the change touches. Do not fix CI or publish failures one run at a time
   by trial and error: a publish run with new data takes close to an hour.
4. **Stay on Cloudflare's free tier.** No paid services. Keep `dist/` well under Workers static assets' **20,000 files**
   (about 10,000 now) and **25 MiB per file**. No Worker script in the request path (Worker requests count even on
   cache hits). Keep R2 Class B reads cached: data URLs carry `?v=<data version>`; anything new the browser fetches
   from R2 must be cacheable. R2 storage (10 GB) and Class A writes (1 million a month) bound what the daily upload may
   rewrite.
5. **Incremental publishing.** The Publish workflow rebuilds and uploads only what changed (data cache key,
   `_publish/*.txt` markers, Pagefind input hash, Wrangler's changed-file upload). Keep it that way: a change to the
   site alone must not re-extract or re-upload the data. If you add a package that the extractor imports, update the
   cache key list (`scripts/extract/cache-key.test.ts` checks it).
6. **Branding.** The public name is **Anisotropics** (`SITE_NAME` in `src/lib/site-name.ts`). "justitia" is the internal
   project name and must not appear anywhere on the site (titles, logo, OGP, about page, link text). Internal
   identifiers (`JUSTITIA_*` env vars, the localStorage key, the package and Worker names) may keep it.
7. **Disclaimer stays visible.** Law text and diffs are generated by a program and may be wrong. Keep the three
   disclaimer placements: the short note under the heading of the law, amendment and versions pages
   (`DISCLAIMER_NOTE_HTML` in `src/lib/disclaimer.ts`, outside `data-law-text`), the footer of every page, and the full
   text at `/about/#disclaimer`. Keep the data attribution and license links (houritsu CC BY 4.0, e-Gov PDL1.0, the
   AGPL source link) in the footer and on the about page.
8. **Tailwind CSS + daisyUI.** Use daisyUI 5 components first, Tailwind utilities next, and `src/styles/global.css` only
   for what neither covers. daisyUI 4 class names (`input-bordered` and the like) do nothing in v5. One font for the
   whole site, law text included: Noto Sans JP 400/700 from `@fontsource/noto-sans-jp`, served from the site itself.
   Colors come from the adjusted daisyUI `light`/`dark` themes; both themes must work.
9. **Accessibility.** Keep PageSpeed Insights accessibility at 100:
   - muted text is `text-base-content/65`, never `/60` (fails contrast on white); daisyUI's 50% defaults (stat titles,
     inactive tabs) need an explicit `/65`;
   - never put `aria-label` on a `<label>`;
   - links in running text are underlined; small targets get 24 px or enough spacing;
   - heading levels never skip (`AmendmentList` has a `headingLevel` prop);
   - decorative SVGs get `aria-hidden="true"`.
10. **Data contracts.** Keys and URLs never depend on houritsu commit SHAs (its history may be rewritten); amendment
    keys are `<amending law ID>_<YYYYMMDD | undetermined>`. Dates come from the `Enforced` trailer, not the commit date.
    The extractor runs over ~23,000 commits: watch memory, repeated git calls and quadratic work. Do not rename public
    URLs, JSON fields or R2 keys for style alone.
11. **Escape law text.** Text from houritsu or the data reaches the DOM only through `escapeHtml` / `sanitize`
    (`src/lib/render.ts`). The search indexer scrapes the law pages by `data-law-text`, `data-page-title` and
    `data-law-num`; keep those attributes.
12. **Terraform owns existence, Wrangler and the workflow own deploys.** Worker settings that Wrangler sends (including
    `observability`) stay in `wrangler.jsonc`; zone rules, the bucket and the custom domain stay in Terraform.
    `wrangler.jsonc` has no `routes` on purpose. Terraform runs only on the owner's machine under
    `op run --env-file=1password.env` (see `infra/README.md`); `terraform apply` is the owner's step, from an up-to-date
    `main`, never from a feature branch and never without the owner's approval.
13. **TypeScript runs without a build step.** Node's type stripping only accepts erasable syntax (`erasableSyntaxOnly`):
    no enums, namespaces or parameter properties. Tests use `node:test` and `node:assert`; do not add a test framework.
14. **Code shipped to the browser must be AGPL-3.0-compatible.** The repository is `AGPL-3.0-only`.

## Pull requests

- `main` is protected: changes go through a pull request, review threads must be resolved, and the `CodeRabbit` check
  is required. Do not push to `main`.
- Other work may be in progress on other branches at the same time; keep each PR to one topic.
- Update README.md (and `infra/README.md` for infrastructure) in the same PR when behavior, pages, commands or
  publishing change.
- Pushes to `main` that change only Markdown, repository settings, `infra/` or the release workflow and its changelog
  check do not trigger the Publish workflow.

## Versions and releases

Calendar versions `YYYY.M.N` (year and month of the release in Japan time, `N` from 0 within the month), tagged
`vYYYY.M.N`; the full policy is in README.md, "Versioning and releases".

- Do not edit `CHANGELOG.md` in a feature PR. Entries are written by a release PR from the PRs merged since the last
  tag, so write PR titles and descriptions that say what changed for users. When a PR changes a public contract
  (a page URL, a JSON file, field or key under `data.anisotro.pics`, a calendar or feed URL), say so in its
  description; its changelog entry will start with **Breaking:**.
- Cutting a release is the owner's decision. When asked, open a PR titled `Release YYYY.M.N` that changes only
  `CHANGELOG.md` and passes `node scripts/changelog.ts`; right before it merges, check for PRs merged in the meantime
  and add their entries. The Release workflow creates the tag and the GitHub Release
  when it merges; never create, move or delete tags or releases by hand.
- `package.json`'s `version` is not the site's version; do not bump it.
