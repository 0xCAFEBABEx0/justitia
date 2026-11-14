# Cloudflare foundation for the site: what exists and how the zone treats it.
# Wrangler deploys the Worker itself (code, static assets, observability) from
# wrangler.jsonc, and scripts/upload-data.sh fills the bucket. See infra/README.md.
#
# Everything here except the r2.dev setting existed before Terraform managed it
# and was imported into the state on 2026-11-07; the feeds operation and its
# label were added in the dashboard on 2026-11-08 and imported after that.

# The data the pages fetch in the browser (amendments/, laws/, history/, pagefind/
# and _publish/), served at data_domain. Deleting the bucket deletes all of it.
resource "cloudflare_r2_bucket" "data" {
  account_id = var.cloudflare_account_id
  name       = var.data_bucket_name
  location   = var.data_bucket_location

  lifecycle {
    prevent_destroy = true
  }
}

# The bucket's r2.dev URL stays off: r2.dev is rate limited and not cached, and
# all reads should go through data_domain and the zone's cache.
# The provider cannot import this resource; creating it only sets the value
# (PUT), so the first apply created it without changing anything.
resource "cloudflare_r2_managed_domain" "data" {
  account_id  = var.cloudflare_account_id
  bucket_name = cloudflare_r2_bucket.data.name
  enabled     = false
}

# The bucket's custom domain (data_domain) is not managed here: the provider's
# cloudflare_r2_custom_domain cannot be imported (provider 5.28 docs), and
# creating it again would replace the live domain. It stays as set up in the
# dashboard (R2 > justitia-data-prod > Settings > Custom Domains).

# The site's hostname. A Workers Custom Domain manages its own proxied DNS record
# and certificate, so there is no cloudflare_dns_record for it. The Worker must
# exist (Wrangler creates it on the first deploy). wrangler.jsonc has no
# `routes`, so `wrangler deploy` leaves this domain alone.
resource "cloudflare_workers_custom_domain" "site" {
  account_id = var.cloudflare_account_id
  zone_id    = var.cloudflare_zone_id
  hostname   = var.site_domain
  service    = var.worker_name
}

# Cache Rules (Caching > Cache Rules): the zone's entrypoint ruleset for the
# http_request_cache_settings phase, with the rules in the dashboard's order. The
# ruleset owns the whole phase: a rule missing here is deleted on apply.
# 1. Without it Cloudflare caches only some file extensions and none of the JSON;
#    with it every response from data_domain that has a Cache-Control header is
#    cached for as long as that allows (the upload sets `public, max-age=3600`),
#    and one without is not cached (bypass_by_default).
# 2. amendments/, laws/ and history/ files are fetched with the data version in
#    the query string (?v=), so a new build gets new cache keys and the edge can
#    keep each one for a day, longer than the Cache-Control in R2.
# Entrypoint rulesets created in the dashboard are named "default"; the name
# cannot change without replacing the ruleset (and dropping its rules meanwhile).
resource "cloudflare_ruleset" "cache" {
  zone_id = var.cloudflare_zone_id
  name    = "default"
  kind    = "zone"
  phase   = "http_request_cache_settings"
  rules = [
    {
      description = "justitia-data-cache"
      expression  = "(http.host eq \"${var.data_domain}\")"
      action      = "set_cache_settings"
      enabled     = true
      action_parameters = {
        cache = true
        edge_ttl = {
          mode = "bypass_by_default"
        }
      }
    },
    {
      description = "data: versioned files 1 day"
      expression  = "(http.host eq \"${var.data_domain}\" and (starts_with(http.request.uri.path, \"/amendments/\") or starts_with(http.request.uri.path, \"/laws/\") or starts_with(http.request.uri.path, \"/history/\")))"
      action      = "set_cache_settings"
      enabled     = true
      action_parameters = {
        cache = true
        edge_ttl = {
          mode    = "override_origin"
          default = 86400
        }
      }
    },
  ]
}

# Response Header Transform Rules (Rules > Transform Rules): the zone's
# entrypoint ruleset for the http_response_headers_transform phase. The pages on
# site_domain read this cross-origin data (pagefind.js is loaded as a module).
# A transform rule rather than the bucket's CORS policy: R2 adds CORS headers only
# when the request has an Origin header, and the cache keeps whichever response
# it got first; this adds the header to every response, cached or not. All of
# the data is public. See the cache rule above about the name.
resource "cloudflare_ruleset" "response_headers" {
  zone_id = var.cloudflare_zone_id
  name    = "default"
  kind    = "zone"
  phase   = "http_response_headers_transform"
  rules = [{
    description = "justitia-data-cors"
    expression  = "(http.host eq \"${var.data_domain}\")"
    action      = "rewrite"
    enabled     = true
    action_parameters = {
      headers = {
        "Access-Control-Allow-Origin" = {
          operation = "set"
          value     = "*"
        }
      }
    }
  }]
}

# Browser Cache TTL (Caching > Configuration): 4 hours, the Free plan default.
# Cloudflare raises a shorter max-age from the origin to this, so browsers keep
# the data files (max-age=3600 in R2) for 4 hours.
resource "cloudflare_zone_setting" "browser_cache_ttl" {
  zone_id    = var.cloudflare_zone_id
  setting_id = "browser_cache_ttl"
  value      = 14400
}

# Always Use HTTPS (SSL/TLS > Edge Certificates): every http:// request on the zone,
# the site and data_domain alike, gets a 301 to the same https:// URL. Without it,
# http://anisotro.pics/ answers 200 with the same page as https://, a duplicate URL
# for search engines. The redirect happens at Cloudflare's edge, before the Workers
# and the bucket; nothing on the origin redirects, so there is no redirect loop.
resource "cloudflare_zone_setting" "always_use_https" {
  zone_id    = var.cloudflare_zone_id
  setting_id = "always_use_https"
  value      = "on"
}

# Bot Fight Mode (Security > Bots) is on. It challenges automated clients, such as
# GitHub's runners, on non-static file extensions (.json) but not on the static
# ones (.txt), which is why the Publish workflow fetches only .txt files from
# data_domain. Only fight_mode is set here, and the other settings keep their
# values, except is_robots_txt_managed, which the provider sets to false when it is
# left out: the site serves its own robots.txt (public/robots.txt).
resource "cloudflare_bot_management" "zone" {
  zone_id    = var.cloudflare_zone_id
  fight_mode = true
}

# The calendars (.ics) under data_domain/feeds/ (scripts/feeds.ts) are fetched by
# calendar apps' servers, such as Google Calendar's, which Bot Fight Mode above may
# challenge: .ics is not one of the static extensions it leaves alone. Bot Fight
# Mode does not block requests to a Web Assets operation labeled cf-rss-feed
# (Cloudflare docs, Security > Web Assets > Label operations), so the feeds are an
# operation (Security > Web Assets > Operations) with that label. One path
# parameter covers every file in feeds/.
resource "cloudflare_api_shield_operation" "feeds" {
  zone_id  = var.cloudflare_zone_id
  method   = "GET"
  host     = var.data_domain
  endpoint = "/feeds/{var1}"
}

# The provider (5.28) has no resource for operation labels, so the label is set
# through the API on apply: "Replace operations attached to a managed label"
# (PUT .../api_gateway/labels/managed/cf-rss-feed/resources/operation) makes the
# feeds operation the only one with cf-rss-feed. It runs again when the operation
# is replaced. Terraform does not read the label back: a label removed in the
# dashboard does not show in a plan (see infra/README.md for how to check, and
# `terraform apply -replace` on this resource to set it again).
# The token comes from the environment that `op run` sets up (1password.env), so
# it is never part of the configuration or the state.
resource "terraform_data" "feeds_rss_label" {
  triggers_replace = [var.cloudflare_zone_id, cloudflare_api_shield_operation.feeds.operation_id]

  provisioner "local-exec" {
    command = <<-EOT
      set -eu
      curl -sS --fail-with-body -o /dev/null -X PUT \
        "https://api.cloudflare.com/client/v4/zones/${var.cloudflare_zone_id}/api_gateway/labels/managed/cf-rss-feed/resources/operation" \
        -H "Authorization: Bearer $TF_VAR_cloudflare_api_token" \
        -H "Content-Type: application/json" \
        --data '{"selector":{"include":{"operation_ids":["${cloudflare_api_shield_operation.feeds.operation_id}"]}}}'
      echo "cf-rss-feed: attached to operation ${cloudflare_api_shield_operation.feeds.operation_id}"
    EOT
  }
}
