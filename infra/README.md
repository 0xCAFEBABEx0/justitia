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
| Cache rule `justitia-data-cache` (zone entrypoint for Cache Rules) | Terraform |
| Response header rule `justitia-data-cors` (zone entrypoint for Response Header Transform Rules) | Terraform |
| Zone setting Browser Cache TTL (4 hours) | Terraform |
| Bot Fight Mode (on) | Terraform |
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

## Layout

```text
infra/terraform/
├─ envs/prod/
│  ├─ main.tf          provider, zone lookup, the module's inputs
│  ├─ variables.tf
│  ├─ outputs.tf
│  ├─ backend.tf       state in HCP Terraform, workspace justitia-prod
│  ├─ imports.tf       one-time imports of the existing resources (delete after the first apply)
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
  **Zone Settings: Edit** and **Bot Management: Edit**.

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

## First apply (taking over the existing resources)

Everything except the bucket's `r2.dev` setting already exists, made in the dashboard or by Wrangler.
`envs/prod/imports.tf` imports it into the state on the first apply instead of creating it, and looks up the IDs that
are not names (zone, entrypoint rulesets, the Workers Custom Domain) itself.

1. Add the `anisotro.pics` zone and the permissions above to the token in the 1Password item `cloudflare-terraform`
   (Manage account → Account API tokens, or My Profile → API Tokens for a user token).
2. `terraform init` (creates the `justitia-prod` workspace), then `terraform plan`. The plan must show the six imports,
   **1 to add** (`cloudflare_r2_managed_domain.data`: the provider cannot import it, and creating it only writes
   `enabled = false`, the current value), **0 to destroy** and no replacement. If it wants to replace a ruleset, its
   name differs from `default`: set the name the plan shows. If it wants to change a rule or a setting in place,
   compare with the dashboard and change the configuration to match what is live, unless the change is wanted.
3. Apply only when the plan is as above, then delete `envs/prod/imports.tf` in a follow-up change (the imports are
   done, and its lookups would fail if one of those resources were ever replaced).
4. After the apply, check that nothing moved: `curl -sI https://anisotro.pics/` (200), and
   `curl -sI https://data.anisotro.pics/_publish/data-version.txt` twice (`access-control-allow-origin: *`,
   `cf-cache-status: HIT` on the second).

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
