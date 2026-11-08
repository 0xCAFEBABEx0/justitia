# Throwaway route for the delivery-redesign canary (infra/README.md, "Route canary"). Requests to
# anisotro.pics/_canary/* go to the assets-only Worker justitia-canary (infra/canary/) instead of the
# Worker justitia on the Custom Domain; Workers routes take precedence over a Custom Domain on the same
# hostname. Deploy that Worker before applying this, and delete this file (then apply) once the checks are done.
resource "cloudflare_workers_route" "canary" {
  zone_id = data.cloudflare_zone.site.zone_id
  pattern = "anisotro.pics/_canary/*"
  script  = "justitia-canary"
}
