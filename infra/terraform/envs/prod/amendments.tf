# Workers routes for the static amendment pages (/amendment/<key>/). Three assets-only Workers serve them
# (scripts/amendment-shards.ts, wrangler.justitia-amendments-*.jsonc), because one Worker version holds at most
# 20,000 files on the Workers Free plan. Workers routes take precedence over the Custom Domain of the main
# Worker justitia on the same hostname, and the most specific route wins, so "amendment/*" catches only what the
# others do not (Reiwa 5 on, and the /amendment/ page itself). A request a static asset answers runs no Worker
# script, so it is free like a request to the Custom Domain (checked live with a canary on 2026-11-08).
#
# The Workers are created by their first `wrangler deploy` in the Publish workflow; apply this only after that
# run, or the routes would point at Workers that do not exist yet. Keep the map in step with SHARDS in
# scripts/amendment-shards.ts (scripts/amendment-shards.test.ts checks it).
locals {
  amendment_routes = {
    "0"   = "justitia-amendments-1"
    "1"   = "justitia-amendments-1"
    "2"   = "justitia-amendments-1"
    "3"   = "justitia-amendments-1"
    "4"   = "justitia-amendments-1"
    "501" = "justitia-amendments-2"
    "502" = "justitia-amendments-2"
    "503" = "justitia-amendments-2"
    "504" = "justitia-amendments-2"
    ""    = "justitia-amendments-3"
  }
}

resource "cloudflare_workers_route" "amendments" {
  for_each = local.amendment_routes

  zone_id = data.cloudflare_zone.site.zone_id
  pattern = "anisotro.pics/amendment/${each.key}*"
  script  = each.value
}
