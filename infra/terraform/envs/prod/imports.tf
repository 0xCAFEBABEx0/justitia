# One-time imports of the resources that existed before Terraform managed them
# (set up in the dashboard or by Wrangler in 2026-11). On the first plan Terraform
# imports them into the state instead of creating them; once they are in the
# state these blocks do nothing. Delete this file in a later change, after the
# first apply (infra/README.md, "First apply").
#
# The IDs that are not names are looked up here, so nothing needs to be copied
# from the dashboard. The provider cannot import the R2 bucket's custom domain or
# its r2.dev setting (see modules/cloudflare_site/main.tf).

# The zone's entrypoint rulesets, by phase. The lookup fails if a phase has none
# (no rule was ever made in it), which would mean the setup differs from what
# this configuration expects.
data "cloudflare_rulesets" "zone" {
  zone_id = data.cloudflare_zone.site.zone_id
}

locals {
  zone_entrypoints = {
    for ruleset in data.cloudflare_rulesets.zone.rulesets : ruleset.phase => ruleset.id
    if ruleset.kind == "zone"
  }
}

# The custom domain Wrangler attached to the Worker (routes in wrangler.jsonc
# until this change).
data "cloudflare_workers_custom_domain" "site" {
  account_id = var.cloudflare_account_id
  filter = {
    hostname = "anisotro.pics"
    service  = "justitia"
  }
}

import {
  to = module.site.cloudflare_r2_bucket.data
  id = "${var.cloudflare_account_id}/justitia-data-prod/default"
}

import {
  to = module.site.cloudflare_workers_custom_domain.site
  id = "${var.cloudflare_account_id}/${data.cloudflare_workers_custom_domain.site.id}"
}

import {
  to = module.site.cloudflare_ruleset.cache
  id = "zones/${data.cloudflare_zone.site.zone_id}/${local.zone_entrypoints["http_request_cache_settings"]}"
}

import {
  to = module.site.cloudflare_ruleset.response_headers
  id = "zones/${data.cloudflare_zone.site.zone_id}/${local.zone_entrypoints["http_response_headers_transform"]}"
}

import {
  to = module.site.cloudflare_zone_setting.browser_cache_ttl
  id = "${data.cloudflare_zone.site.zone_id}/browser_cache_ttl"
}

import {
  to = module.site.cloudflare_bot_management.zone
  id = data.cloudflare_zone.site.zone_id
}
