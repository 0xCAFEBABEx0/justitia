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
| Cache rules `justitia-data-cache` and `data: versioned files 1 day` (zone entrypoint for Cache Rules) | Terraform |
| Response header rule `justitia-data-cors` (zone entrypoint for Response Header Transform Rules) | Terraform |
| Zone setting Browser Cache TTL (4 hours) | Terraform |
| Bot Fight Mode (on) | Terraform |
| Web Assets operation `GET data.anisotro.pics/feeds/{var1}` (the calendars) | Terraform |
| Its managed label `cf-rss-feed`, which Bot Fight Mode lets through | Terraform, through the API on apply (see below) |
| The bucket's custom domain `data.anisotro.pics` | Dashboard (cannot be imported, see below) |
| Worker `justitia`: static assets, compatibility date, `workers_dev`/`preview_urls` off | Wrangler (`wrangler.jsonc`) |
| Workers Logs and Traces of the Worker | Wrangler (`wrangler.jsonc`, `observability`) |
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

## Layout

```text
infra/terraform/
├─ envs/prod/
│  ├─ main.tf          provider, zone lookup, the module's inputs
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

The provider is `cloudflare/cloudflare` `~> 5.28` (v5 renamed and changed many resources: do not copy v3 or v4
examples), with Terraform 1.7 or later. The layout and the way Terraform is run follow the `chronos` repository.

## Running Terraform

The state is in **HCP Terraform** (Free tier), workspace `justitia-prod`, in the organization named in 1Password. The
workspace uses **Local execution mode** (the organization's default): plan and apply run on the owner's machine, and
HCP Terraform only stores, locks and versions the state. In that mode HCP Terraform reads no workspace variables, so
every credential comes from 1Password through `envs/prod/1password.env`, which holds only `op://` references:

| 1Password item (vault Development) | Fields | Used as |
| --- | --- | --- |
| `hcp-terraform` (ID `snuoe5g63q73gugkpj3z256i4q`) | `credential`, `organization` | `TF_TOKEN_app_terraform_io`, `TF_CLOUD_ORGANIZATION` |
| `cloudflare-terraform` | `credential`, `account-id` | `TF_VAR_cloudflare_api_token`, `TF_VAR_cloudflare_account_id` |

Both items are shared with the `chronos` repository's Terraform. Its `account-id` must be the account that has the
`anisotro.pics` zone (otherwise the zone lookup in `envs/prod/main.tf` finds nothing and the plan stops). The
Cloudflare token needs, on top of what `chronos` uses, the `anisotro.pics` zone and these permissions:

- Account: **Workers R2 Storage: Edit** (bucket, `r2.dev` setting) and **Workers Scripts: Edit** (Workers Custom
  Domains).
- Zone `anisotro.pics`: **Zone: Read**, **Workers Routes: Edit**, **Cache Rules: Edit**, **Transform Rules: Edit**,
  **Zone Settings: Edit**, **Bot Management: Edit** and **API Gateway: Edit** (Web Assets operations and their
  labels; "Domain API Gateway" in the API documentation).

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
   does not list. Add or change Cache Rules and Response Header Transform Rules in `modules/cloudflare_site/main.tf`,
   not in the dashboard; a rule added in the dashboard is deleted by the next apply (the plan shows it).
3. After the merge, apply from an up-to-date `main` once the plan shows the same thing, then run `terraform plan`
   again: it should say `No changes.`
4. Check that the site still answers. Use `GET` requests: a `HEAD` request (`curl -I`) shows
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
