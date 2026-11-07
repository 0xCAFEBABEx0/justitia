output "zone_id" {
  value = data.cloudflare_zone.site.zone_id
}

output "site_origin" {
  value = module.site.site_origin
}

output "data_bucket_name" {
  value = module.site.data_bucket_name
}
