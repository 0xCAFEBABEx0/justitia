# Worker Previews of the Worker justitia: `wrangler preview --name preview` (.github/workflows/preview.yml, on push
# to the preview branch) serves the build at https://preview.www.anisotro.pics/, behind Cloudflare Access. See
# infra/README.md, "Previews", for the prerequisites, the rollout and the rollback.
#
# A Preview's URL is <preview name>.<Custom Domain>, and turning Previews on for a Custom Domain makes Cloudflare
# add a wildcard DNS record and certificate for *.<that hostname>. The wildcard wins over every other hostname at
# that level, so Previews must never be turned on for the apex: data.anisotro.pics (R2) would start answering with
# the Worker's Preview 404. www.anisotro.pics has nothing below it, so it becomes a second Custom Domain of the same
# Worker with Previews on (no new Worker), and the redirect below sends www itself to the apex.

locals {
  preview_host = "preview.www.anisotro.pics"
  # One or more addresses from 1Password (1password.env), separated by commas. The addresses are personal data and
  # never appear in the repository.
  preview_access_emails = compact([for e in split(",", var.preview_access_emails) : trimspace(e)])
}

# Before the first apply, delete the existing www.anisotro.pics DNS record (a CNAME left from the registrar), or
# creating this domain fails. Previews are on from the start, which needs no replacement. Never change `enabled` or
# `previews_enabled` here first: the provider replaces the domain when either changes (see the site domain in
# modules/cloudflare_site/main.tf); use the API PUT in infra/README.md, then match the values here.
resource "cloudflare_workers_custom_domain" "preview" {
  account_id       = var.cloudflare_account_id
  zone_id          = data.cloudflare_zone.site.zone_id
  hostname         = "www.anisotro.pics"
  service          = "justitia"
  enabled          = true
  previews_enabled = true

  # Access first, so the Preview hostnames never answer without it.
  depends_on = [cloudflare_zero_trust_access_application.preview]

  lifecycle {
    prevent_destroy = true
  }
}

# Single Redirect (Rules > Redirect Rules): www.anisotro.pics itself goes to the apex with a 301, so the production
# pages never show under a second hostname. The match is exact, so preview.www.anisotro.pics and the deployment
# URLs below www are not redirected. Redirects run before Workers, so these requests do not count as Worker
# requests. This is the zone's entrypoint ruleset for the phase, like the rulesets in modules/cloudflare_site: it
# owns every Redirect Rule of the zone, so a rule added in the dashboard would be deleted on apply.
resource "cloudflare_ruleset" "redirects" {
  zone_id = data.cloudflare_zone.site.zone_id
  name    = "default"
  kind    = "zone"
  phase   = "http_request_dynamic_redirect"
  rules = [{
    description = "www to apex"
    expression  = "(http.host eq \"www.anisotro.pics\")"
    action      = "redirect"
    enabled     = true
    action_parameters = {
      from_value = {
        status_code = 301
        target_url = {
          expression = "concat(\"https://anisotro.pics\", http.request.uri.path)"
        }
        preserve_query_string = true
      }
    }
  }]
}

# Cloudflare Access for the Preview hostnames, with hostname (public) destinations only. The destination types that
# follow a Worker's Previews (all_preview_workers, preview_worker) are not used: they apply to every hostname a
# Preview answers, including any production hostname a wildcard has caught. The wildcard destination covers the
# deployment URLs (<id>-preview.www.anisotro.pics), one level below www; it does not match www itself or the apex.
resource "cloudflare_zero_trust_access_policy" "preview" {
  account_id = var.cloudflare_account_id
  name       = "justitia-preview-owner"
  decision   = "allow"
  include    = [for e in local.preview_access_emails : { email = { email = e } }]
}

resource "cloudflare_zero_trust_access_application" "preview" {
  account_id           = var.cloudflare_account_id
  type                 = "self_hosted"
  name                 = "justitia-preview"
  domain               = local.preview_host
  app_launcher_visible = false
  session_duration     = "24h"
  destinations = [
    { type = "public", uri = local.preview_host },
    { type = "public", uri = "*.www.anisotro.pics" },
  ]
  policies = [{ id = cloudflare_zero_trust_access_policy.preview.id, precedence = 1 }]
}
