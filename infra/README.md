# Infrastructure

The site runs on Cloudflare's free tier: the built site as Workers static assets at `https://anisotro.pics`, and the
data the pages fetch in the browser in the R2 bucket `justitia-data-prod` at `https://data.anisotro.pics` (see
[Publishing](../README.md#publishing) in the main README). This directory holds the Terraform configuration for the
Cloudflare side.

## Who manages what

Terraform says which Cloudflare resources exist and how the zone treats them; Wrangler and the Publish workflow put
the site and the data on them.

| Concern | Managed by |
| --- | --- |
| R2 bucket `justitia-data-prod` (existence, location hint) | Terraform |
| The bucket's `r2.dev` URL (off) | Terraform |
| Workers Custom Domain `anisotro.pics` → Worker `justitia` | Terraform |
| Workers routes `anisotro.pics/amendment/<prefix>*` → Workers `justitia-amendments-*` (the static amendment pages) | Terraform (`envs/prod/amendments.tf`, see below) |
| Workers Custom Domain `www.anisotro.pics` → Worker `justitia`, with Previews on (`preview.www.anisotro.pics`) | Terraform (`envs/prod/preview.tf`, see [Previews](#previews)) |
| Redirect rule `www to apex` (zone entrypoint for Single Redirects) | Terraform (`envs/prod/preview.tf`) |
| Access application `justitia-preview` and policy `justitia-preview-owner` | Terraform (`envs/prod/preview.tf`) |
| Cache rules `justitia-data-cache` and `data: versioned files 1 day` (zone entrypoint for Cache Rules) | Terraform |
| Response header rule `justitia-data-cors` (zone entrypoint for Response Header Transform Rules) | Terraform |
| Zone setting Browser Cache TTL (4 hours) | Terraform |
| Zone setting Always Use HTTPS (on: http:// answers 301 to https://) | Terraform |
| Bot Fight Mode (on) | Terraform |
| AI Crawler and Agent access policies: Training disallowed (and blocked at the edge), Search and Agent (Personal Agents included) allowed (see below) | Terraform |
| Bot Preference Sync (on), which writes those policies into `robots.txt` | Dashboard (the provider cannot set it, see below) |
| Web Assets operation `GET data.anisotro.pics/feeds/{var1}` (the calendars) | Terraform |
| Its managed label `cf-rss-feed`, which Bot Fight Mode lets through | Terraform, through the API on apply (see below) |
| The bucket's custom domain `data.anisotro.pics` | Dashboard (cannot be imported, see below) |
| Worker `justitia`: static assets, compatibility date, `workers_dev`/`preview_urls` off | Wrangler (`wrangler.jsonc`) |
| Workers `justitia-amendments-1` to `justitia-amendments-3`: the same settings, observability off | Wrangler (`wrangler.justitia-amendments-*.jsonc`) |
| Workers Logs and Traces of the Worker | Wrangler (`wrangler.jsonc`, `observability`) |
| The Preview `preview` of the Worker and its settings (`previews` in `wrangler.jsonc`) | Wrangler (`npm run deploy:preview`, Preview workflow) |
| Objects in the bucket | `scripts/upload-data.sh` (Publish workflow) |
| API tokens for the Publish workflow and for Terraform | Dashboard |

Wrangler applies `wrangler.jsonc` on every deploy, so a setting that Wrangler sends (the Worker's settings, including
observability) is kept there, not in Terraform, or the two would undo each other. `wrangler.jsonc` has no `routes`:
with one, `wrangler deploy` replaces the Worker's custom domains with the ones it lists; without one, it leaves the
domain that Terraform attaches alone.

The bucket's custom domain stays in the dashboard because the provider's `cloudflare_r2_custom_domain` cannot be
imported (provider 5.28 documentation), and letting Terraform create it would replace the live domain. DNS records
are not managed either: a Workers Custom Domain and an R2 custom domain each manage their own proxied record and
certificate.

The calendars under `https://data.anisotro.pics/feeds/` are fetched by calendar apps' servers, which Bot Fight Mode
may challenge (`.ics` is not one of the static extensions it leaves alone). Bot Fight Mode does not block requests to
a Web Assets operation with the managed label `cf-rss-feed`, so `feeds/` is an operation with that label. The
provider (5.28, and its latest release as of 2026-11-08) can manage the operation (`cloudflare_api_shield_operation`)
but has no resource for labels, so `terraform_data.feeds_rss_label` sets the label on apply with the API call
*Replace operations attached to a managed label*, which makes this operation the only one with `cf-rss-feed`. The
token comes from the `TF_VAR_cloudflare_api_token` that `op run` sets, so it is not in the configuration or the state.
It runs when the resource is created and again when the operation is replaced. Terraform does not read the label
back, so a label removed in the dashboard does not show in a plan; after an apply, check that the operation still
has `cf-rss-feed` under Security → Web Assets → Operations, and set it again with
`terraform apply -replace=module.site.terraform_data.feeds_rss_label`.

AI crawlers and agents are handled by the zone's *AI Crawler and Agent access policies* (Security → Settings → Bot
traffic), set on `cloudflare_bot_management`: **Training** (crawlers that take the content to train or fine-tune a
model) is *Disallow*, which with Bot Preference Sync on disallows them in `robots.txt` and blocks them at the edge
(crawlers used for both Search and Training, such as Baiduspider, are only disallowed, so no search crawler is
blocked), while **Search** (crawlers that index the
content to answer questions later, such as OAI-SearchBot) and **Agent** (fetches made for a person in real time, such
as ChatGPT-User and Claude-User, with the Personal Agents set the same way) are not blocked. With **Bot Preference
Sync** on, Cloudflare writes these policies into `https://anisotro.pics/robots.txt`: it prepends its Content Signals
(`search=yes,ai-train=no`) and a `Disallow: /` for each blocked crawler to the site's own `public/robots.txt`. The
older switches, managed robots.txt (`is_robots_txt_managed`, off) and *Block AI bots* (`ai_bots_protection`, left as
the API reports it), are not used. The Personal Agents (`ai_agents`) need provider 5.29.

Bot Preference Sync itself stays in the dashboard (Security → Settings → Bot traffic → AI Crawler and Agent access
policies → *Enable Bot Preference Sync*, on): provider 5.29.0 has a `bot_preference_sync_enabled` argument but never
sends it to the API or reads it back, so an apply that set it could not converge. After an apply, `robots.txt` should
list the training crawlers (GPTBot, ClaudeBot, CCBot, Google-Extended and the like) and no `# AI Agents` section.

## Layout

```text
infra/terraform/
├─ envs/prod/
│  ├─ main.tf          provider, zone lookup, the module's inputs
│  ├─ amendments.tf    Workers routes of the amendment Workers
│  ├─ preview.tf       www.anisotro.pics for the Previews, its redirect to the apex, Cloudflare Access
│  ├─ variables.tf
│  ├─ outputs.tf
│  ├─ backend.tf       state in HCP Terraform, workspace justitia-prod
│  └─ 1password.env    op:// references for the credentials; run Terraform under `op run`
└─ modules/cloudflare_site/
   ├─ main.tf          the resources
   ├─ variables.tf
   ├─ outputs.tf
   └─ versions.tf
```

The provider is `cloudflare/cloudflare` `~> 5.29` (v5 renamed and changed many resources: do not copy v3 or v4
examples), with Terraform 1.7 or later. The layout and the way Terraform is run follow the `chronos` repository.

## Amendment Workers' routes

The static amendment pages are served by three assets-only Workers (README, "Amendment Workers"), each on Workers
routes under `anisotro.pics/amendment/`: `0*` … `4*` → `justitia-amendments-1`, `501*` … `504*` →
`justitia-amendments-2`, and `*` → `justitia-amendments-3`, ten routes in all (the free plan allows 1,000 a zone). The Workers are created by the first Publish run that deploys them, not by Terraform, so apply the routes
only after that run has succeeded; a route to a Worker that does not exist would answer with an error. The token's
**Zone > Workers Routes: Edit** permission covers them (used for the canary on 2026-11-08). After an apply, check
that:

- `https://anisotro.pics/amendment/<a key>/` answers 200 with that amendment, for a key of each Worker (for example
  one starting with `4`, one with `503` and one with `508`);
- `https://anisotro.pics/amendment/?k=<a key>` forwards to `/amendment/<a key>/` (served by `justitia-amendments-3`);
- `https://anisotro.pics/amendment/x/` answers the site's 404 page with status 404;
- the rest of the site is unchanged (`/`, `/laws/<id>/`, `/_astro/` files);
- the Workers' Metrics show only static asset requests, no invocations.

A route takes about a minute to start answering. The site links to `/amendment/<key>/`, which only these routes
serve, so removing them (`amendments.tf`) takes every amendment page down: undo the linking in the site first.

To rename an amendment Worker or add one, keep the old one serving until the routes have moved, so no page goes
missing:

1. Merge the change (`scripts/amendment-shards.ts`, its `wrangler.<name>.jsonc` and `amendments.tf`). The Publish run
   creates the new Worker with its first `wrangler deploy`.
2. Apply: the plan updates the `script` of the routes in place (`~`), and adds a route for each new prefix. Do it
   before any change to the site's CSS or scripts is published: the old Worker is no longer deployed, and its pages
   load `/_astro/` files that the main Worker keeps only until the Publish run after the one that replaced them
   (README, publishing step 5).
3. Run the checks above, then delete the Worker that no route uses any more, in the dashboard (Workers & Pages → the
   Worker → Settings → Delete) or with `npx wrangler delete --name <old name>` (needs the Workers Admin role).

The three were first named `amendments-1` to `amendments-3`, and renamed this way on 2026-11-09.

## Previews

A push to the `preview` branch builds the site and deploys it as the Worker Preview `preview` of the Worker
`justitia` (`.github/workflows/preview.yml`, `npm run deploy:preview`), at **`https://preview.www.anisotro.pics/`**.
Each deployment also gets its own URL, `https://<deployment ID>-preview.www.anisotro.pics/`. Cloudflare Access lets
only the addresses in 1Password in (`cloudflare-terraform`, field `preview-access-emails`). Nothing reaches production: the workflow has no R2
credentials and never runs `wrangler deploy` (`scripts/preview-workflow.test.ts` checks it).

How it is put together (`envs/prod/preview.tf`):

- **Hostname.** `www.anisotro.pics` is a second Workers Custom Domain of `justitia`, with `previews_enabled = true`.
  A Preview's URL is `<preview name>.<Custom Domain>`, and Previews on a Custom Domain make Cloudflare add a wildcard
  DNS record and certificate for `*.<that hostname>`. No new Worker.
- **Redirect.** A Single Redirect sends `www.anisotro.pics` itself (`http.host eq "www.anisotro.pics"`) to
  `https://anisotro.pics` + path with a 301, keeping the query string, so the production pages never show under a
  second hostname. Redirects run before Workers, so these requests are not Worker requests. Hostnames below www do
  not match and are not redirected. The Free plan allows 10 Redirect Rules per zone; this is the only one.
- **Access.** A self-hosted application `justitia-preview` with two **public hostname** destinations,
  `preview.www.anisotro.pics` and `*.www.anisotro.pics` (the deployment URLs; the wildcard covers one level below
  www, not www itself or the apex), and the policy `justitia-preview-owner` (allow these emails). The destination
  types that follow a Worker's Previews (`all_preview_workers`, `preview_worker`) are not used: they apply to every
  hostname a Preview answers, including any production hostname a wildcard has caught. The Custom Domain depends on
  the application, so Access is in place before the Preview hostnames exist.
- **The Preview build** (`JUSTITIA_PREVIEW=1`, `src/lib/preview.ts`): Cloudflare adds `X-Robots-Tag` only to Previews
  on workers.dev, so the build appends `X-Robots-Tag: noindex, nofollow` for every path to `dist/_headers`. Previews
  have no Workers routes, so the amendment Workers' pages (`/amendment/<key>/`) do not exist there; the Preview build
  makes no static amendment pages, and its 404 page renders an amendment in the browser from the production data in
  R2 with the branch's own `src/scripts/amendment.ts` (without the e-Gov and comparison links, the related laws in the
  graph link and the page's own head). Changes to the amendment Workers themselves (`scripts/split-amendments.ts`, their Wrangler files)
  cannot be previewed. The Preview reads the production data at `https://data.anisotro.pics`. Every difference from
  production is listed in the main README, [Differences from production](../README.md#differences-from-production).
- **Worker settings** (`previews` in `wrangler.jsonc`): a Preview takes nothing from the production settings but
  `assets` and `compatibility_date`. The block sets observability only; the site has no bindings, and a Preview must
  never get a binding that can write production data. `workers_dev` and `preview_urls` stay `false`. Previews need
  Wrangler 4.135.0 or later. `wrangler tail` cannot follow a Preview: use Workers & Pages → `justitia` →
  Observability.

**Never turn Previews on for the apex `anisotro.pics`, or for any hostname that has other hostnames below it.** The
wildcard `*.anisotro.pics` would take precedence over every other hostname at that level, so `data.anisotro.pics`
(R2) would answer with the Worker's Preview 404 and every page would lose its data. There is no setting that limits
the wildcard to one Preview name. The apex domain therefore has `previews_enabled = false` written out in
`modules/cloudflare_site/main.tf`, and every Workers Custom Domain has `prevent_destroy`.

Free plan: up to 100 Previews per Worker and 100 deployments per Preview (the oldest are deleted). Requests to a
Preview count toward the 100,000 Worker requests a day only when they run a Worker script, and this Worker has none.
Zero Trust Free covers Access for up to 50 users.

### Changing `previews_enabled` or `enabled` on an existing domain

The provider replaces a `cloudflare_workers_custom_domain` when either value changes, so do not change it in
Terraform first. Switch it in place with the API (`PUT /accounts/{account_id}/workers/domains`, which updates the
domain with that hostname), then set the same value in Terraform and check that the plan shows no change for it. From
`infra/terraform/envs/prod`, for example to turn Previews off on www:

```bash
export ZONE_ID=$(op run --env-file=1password.env -- terraform output -raw zone_id)
op run --env-file=1password.env -- sh -c 'curl -sS -X PUT \
  "https://api.cloudflare.com/client/v4/accounts/$TF_VAR_cloudflare_account_id/workers/domains" \
  -H "Authorization: Bearer $TF_VAR_cloudflare_api_token" -H "Content-Type: application/json" \
  --data "{\"hostname\":\"www.anisotro.pics\",\"service\":\"justitia\",\"zone_id\":\"$ZONE_ID\",\"enabled\":true,\"previews_enabled\":false}"' \
  | jq '.success, .result'
```

To list the account's Workers Custom Domains and their values, `GET` the same URL.

### Prerequisites

1. **Zero Trust** is set up on the account, once, in the dashboard (Zero Trust, Free plan: it asks for payment
   details but charges nothing). Sign-in uses the default login method (Cloudflare's own identity provider); add the
   one-time PIN method in Zero Trust settings if you prefer a code by email.
2. The Terraform token has **Account: Access: Apps and Policies: Edit** and **Zone: Single Redirect: Edit** (see
   [Running Terraform](#running-terraform)). Creating the www Custom Domain uses the Workers **Admin** role it already
   has.
3. The 1Password item `cloudflare-terraform` (vault Development) has the field `preview-access-emails`: one address, or several
   separated by commas.
4. DNS: no record covers `www.anisotro.pics` or `*.www.anisotro.pics` when the domain is created, a wildcard
   `*.anisotro.pics` included. Otherwise the apply fails with 409, code 100117 ("Hostname(s) 'www.anisotro.pics',
   '*.www.anisotro.pics' already have externally managed DNS records"). On 2026-11-18 the zone had two such
   leftovers from the registrar, a proxied CNAME `www` and a proxied CNAME `*`, both to `pixie.porkbun.com` and both
   answering 525; the apply went through once both were deleted.
5. The zone has no Redirect Rules yet. The configuration creates the zone's entrypoint ruleset for Single Redirects;
   if one exists (`GET /zones/{zone_id}/rulesets/phases/http_request_dynamic_redirect/entrypoint` answers with a
   ruleset, not 404), import it first and copy its rules into `preview.tf`, or the apply fails.
6. The existing Workers Custom Domains (the `GET` above) all have `previews_enabled: false`.

The Preview workflow uses the Publish workflow's `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets; it needs
no other secret. That token can also deploy production: Cloudflare has no permission for Previews alone (Workers
Scripts Write covers both `wrangler preview` and `wrangler deploy`), so code pushed to `preview` runs with production
deployment rights. The owner accepted this (2026-11-18): the token is a repository secret, which a workflow on any
branch can already read, and only people with write access can push. The tests keep the workflow itself to one
`wrangler preview` and no R2 credentials. To narrow it later, move the Publish secrets to a GitHub environment
allowed on `main` only and give the Preview its own token in an environment allowed on `preview` only.

### Rollout

1. Merge the pull request that adds this.
2. `op run --env-file=1password.env -- terraform plan` should show **4 to add, 0 to change, 0 to destroy**:
   `cloudflare_workers_custom_domain.preview` (www, `enabled` and `previews_enabled` true),
   `cloudflare_ruleset.redirects`, `cloudflare_zero_trust_access_policy.preview` and
   `cloudflare_zero_trust_access_application.preview`, and nothing for `module.site.cloudflare_workers_custom_domain.site`
   (its values are written out as they are). If anything is to be changed, replaced or destroyed, do not apply.
3. Delete the `www` and `*` DNS records (Prerequisite 4), then apply. If the apply creates the www Custom Domain but
   fails to read it back (404, code 100114, "Origin '<id>' not found", seen on 2026-11-18 right after the create), do
   not apply again: the domain exists, and the state does not have it. Find its `id` with the `GET` above, import it,
   and check that `terraform plan` shows no changes:

   ```bash
   op run --env-file=1password.env -- sh -c \
     'terraform import cloudflare_workers_custom_domain.preview "$TF_VAR_cloudflare_account_id/<id>"'
   ```
4. Right away, check every hostname of the zone with `GET` requests (`curl -s -D - -o /dev/null <url>`): the status and
   `content-type` must be as before.
   - `https://anisotro.pics/` and `https://anisotro.pics/laws/129AC0000000089/`: 200, `text/html`;
   - `https://anisotro.pics/amendment/<a key>/`: 200, `text/html` (an amendment Worker);
   - `https://data.anisotro.pics/_publish/data-version.txt`: 200, `text/plain`, as before (R2; `check-br.txt` exists
     only during a Publish run);
   - `https://www.anisotro.pics/` → 301 with `location: https://anisotro.pics/`, and
     `https://www.anisotro.pics/browse/?x=1` → `location: https://anisotro.pics/browse/?x=1`;
5. Push to `preview` and wait for the Preview workflow. Cloudflare issues the certificate for `*.www.anisotro.pics`
   when the first Preview is created, which can take a while; until then HTTPS requests to the Preview fail before
   they reach Access. Once `curl -sI https://preview.www.anisotro.pics/` connects, check that both the stable URL and
   the deployment-specific URL that `wrangler preview` prints in the workflow log redirect to the Access sign-in
   (`*.cloudflareaccess.com`) without a session.
6. Open `https://preview.www.anisotro.pics/`, sign in, and check that the site shows, that a page answers with
   `x-robots-tag: noindex, nofollow`, and that an amendment page (`/amendment/<a key>/`) renders.

### Rollback

If any other hostname misbehaves after Previews are on, turn them off on www with the API `PUT` above
(`"previews_enabled": false`). That removes the wildcard at once. Then set `previews_enabled = false` in `preview.tf`
and check that the plan shows no change for the domain.

To remove the whole setup, open a pull request that removes it. Deleting a resource block also deletes its
`prevent_destroy`, so the plan will destroy the www Custom Domain without any further step: that pull request is the
deliberate removal, and the owner checks in the plan that the only destroys are the ones it means, before applying.
What to remove from `preview.tf`:

- the www Custom Domain, the Access application and the Access policy;
- the `www to apex` rule of `cloudflare_ruleset.redirects`. If the ruleset holds other rules (an entrypoint imported
  under Prerequisites, or rules added later), keep the resource at the same address with those rules, so that the plan
  changes it in place; remove the resource only when no rule is left. Keep the redirect for as long as `www` should
  still lead to the apex.

Sources (checked 2026-11-18): [Previews](https://developers.cloudflare.com/workers/previews/),
[Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/),
[Access applications](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/),
[Single Redirects](https://developers.cloudflare.com/rules/url-forwarding/single-redirects/),
[API token permissions](https://developers.cloudflare.com/fundamentals/api/reference/permissions/), and the
`cloudflare` provider 5.29.0 schema.

## Running Terraform

The state is in **HCP Terraform** (Free tier), workspace `justitia-prod`, in the organization named in 1Password. The
workspace uses **Local execution mode** (the organization's default): plan and apply run on the owner's machine, and
HCP Terraform only stores, locks and versions the state. In that mode HCP Terraform reads no workspace variables, so
every credential comes from 1Password through `envs/prod/1password.env`, which holds only `op://` references:

| 1Password item (vault Development) | Fields | Used as |
| --- | --- | --- |
| `hcp-terraform` (ID `snuoe5g63q73gugkpj3z256i4q`) | `credential`, `organization` | `TF_TOKEN_app_terraform_io`, `TF_CLOUD_ORGANIZATION` |
| `cloudflare-terraform` | `credential`, `account-id`, `preview-access-emails` | `TF_VAR_cloudflare_api_token`, `TF_VAR_cloudflare_account_id`, `TF_VAR_preview_access_emails` (who Cloudflare Access lets into the Previews, separated by commas) |

Both items are shared with the `chronos` repository's Terraform; only this repository reads `preview-access-emails`,
which keeps the addresses out of the repository and the plan output (the variable is sensitive). The `account-id` of
`cloudflare-terraform` must be the account that has the
`anisotro.pics` zone (otherwise the zone lookup in `envs/prod/main.tf` finds nothing and the plan stops). The
Cloudflare token needs, on top of what `chronos` uses, the `anisotro.pics` zone and these permissions:

- Account: **Workers R2 Storage: Edit** (bucket, `r2.dev` setting) and the Workers role **Admin** for all Workers
  (Workers Custom Domains, and creating or deleting a Worker with Wrangler by hand). The legacy **Workers Scripts:
  Edit** permission maps to the **Editor** role, which can deploy existing Workers but cannot create or delete one
  ([Workers roles](https://developers.cloudflare.com/workers/authorization/workers/#wrangler)).
- Zone `anisotro.pics`: **Zone: Read**, **Workers Routes: Edit**, **Cache Rules: Edit**, **Transform Rules: Edit**,
  **Zone Settings: Edit**, **Bot Management: Edit**, **API Gateway: Edit** (Web Assets operations and their
  labels; "Domain API Gateway" in the API documentation) and **Single Redirect: Edit** (the redirect from www to
  the apex; "Dynamic URL Redirects Write" in the Rulesets API documentation).
- Account: **Access: Apps and Policies: Edit** ("Access: Apps and Policies Write" in the API documentation), for the
  Previews' Access application and policy.

It is not the Publish workflow's token, which only deploys the Worker.

From `infra/terraform/envs/prod`, on a machine with the 1Password app (with *Integrate with 1Password CLI* on), the
`op` CLI and Terraform:

```bash
op run --env-file=1password.env -- terraform init     # once per machine
op run --env-file=1password.env -- terraform plan
op run --env-file=1password.env -- terraform apply    # owner, from an up-to-date main, after reading the plan
```

Do not use `terraform login`, which stores the HCP Terraform token in plain text, and do not add a `terraform.tfvars`
or `*.auto.tfvars` here: it would override the `TF_VAR_*` values without a warning. Without credentials,
`terraform init -backend=false && terraform validate` still checks the configuration. No CI job runs Terraform, and
`.terraform.lock.hcl` is not committed (as in `chronos`).

## Making a change

1. Change the configuration in a pull request, and run `terraform plan` on its branch. The plan should show only
   what the change is meant to do, with nothing to destroy or replace that is not meant to go.
2. Each `cloudflare_ruleset` owns its whole phase: an apply removes any rule in that phase that the configuration
   does not list. Add or change Cache Rules and Response Header Transform Rules in `modules/cloudflare_site/main.tf`
   and Redirect Rules in `envs/prod/preview.tf`, not in the dashboard; a rule added in the dashboard is deleted by
   the next apply (the plan shows it).
3. Never apply a plan that destroys or replaces anything you did not mean to remove. Every Workers Custom Domain has
   `prevent_destroy`, so a plan that would replace one stops with an error; never lift it to get past that. The
   provider replaces a Workers Custom Domain (destroy, then create, taking the hostname offline) when `enabled` or
   `previews_enabled` changes, so change those on a live domain with the API first ([Previews](#previews)).
4. After the merge, apply from an up-to-date `main` once the plan shows the same thing, then run `terraform plan`
   again: it should say `No changes.`
5. Check that the site still answers. Use `GET` requests: a `HEAD` request (`curl -I`) shows
   `cf-cache-status: DYNAMIC` on this zone even for a file that is cached.

   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' https://anisotro.pics/                  # 200
   curl -s -D - -o /dev/null https://data.anisotro.pics/pagefind/shards.json         # twice
   ```

   The second request for `shards.json` should show `HTTP/2 200`, `cf-cache-status: HIT` and
   `access-control-allow-origin: *` (an error response can be cached too, so check the status as well).
   (The files under `_publish/` are uploaded with `Cache-Control: no-store` and never come from the cache.)

The Web Assets operation for the calendars, added in the dashboard on 2026-11-08, was imported the same day (pull
request #35, with an import block that looked up the operation ID and was then removed): the plan showed 1 to import
(the operation), 1 to add (`terraform_data.feeds_rss_label`, which set the label the operation already had), 0 to
change and 0 to destroy, and the plan after the apply said `No changes.`

The existing resources were imported into the state on 2026-11-07 (pull request #21, with import blocks that were
then removed): the plan showed 6 to import, 1 to add (the `r2.dev` setting, which the provider cannot import), 0 to
change and 0 to destroy.

## Setting up a new account

The production setup was made before this configuration. To build it from nothing, for example in another account:

1. `terraform apply -target=module.site.cloudflare_r2_bucket.data`, then connect the bucket's custom domain
   (`data.anisotro.pics`) in the dashboard, which Terraform does not manage.
2. Set up the Publish workflow's tokens and secrets ([One-time setup](../README.md#one-time-setup)) and run it once:
   it uploads the data and creates the Worker, which the Workers Custom Domain needs.
3. `terraform apply` for the rest (custom domain, rules, zone settings).

## Observability

Workers Logs and Traces are on in `wrangler.jsonc` (`observability`), with every request sampled. View them in the
dashboard under Workers & Pages → `justitia` → Observability. On the Workers Free plan, Workers Logs takes up to
200,000 log events a day with 3 days of retention; from 2026-12-01, logs and traces share 0.5 GB of ingestion a day
with 7 days of retention. When the daily allowance runs out on Free, Cloudflare stops ingesting until 00:00 UTC
instead of charging, so the setting cannot cost money. The Worker has no script: a request that a static asset
answers is not a Worker invocation, so expect few events, if any.

Sources (checked 2026-11-07): [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/),
[Traces](https://developers.cloudflare.com/workers/observability/traces/),
[Observability pricing](https://developers.cloudflare.com/observability/pricing/),
[Static assets billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/), and the
`observability` keys in Wrangler 4.151.3's `config-schema.json`.
