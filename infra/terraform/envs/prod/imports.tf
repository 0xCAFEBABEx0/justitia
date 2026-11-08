# One-time import of the Web Assets operation for the calendars, which the owner
# added in the dashboard on 2026-11-08 (with the cf-rss-feed label). On the first
# plan Terraform imports it into the state instead of creating it; once it is in
# the state this block does nothing. Delete this file in a later change, after
# the apply (infra/README.md, "Making a change").
#
# The operation ID is looked up here, so nothing needs to be copied from the
# dashboard. The lookup fails if there is not exactly one such operation.
data "cloudflare_api_shield_operations" "feeds" {
  zone_id  = data.cloudflare_zone.site.zone_id
  host     = ["data.anisotro.pics"]
  method   = ["GET"]
  endpoint = "/feeds/"
}

import {
  to = module.site.cloudflare_api_shield_operation.feeds
  id = "${data.cloudflare_zone.site.zone_id}/${one([for op in data.cloudflare_api_shield_operations.feeds.result : op.operation_id if op.endpoint == "/feeds/{var1}"])}"
}
