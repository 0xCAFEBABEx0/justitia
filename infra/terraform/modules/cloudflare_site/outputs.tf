output "site_origin" {
  value = "https://${cloudflare_workers_custom_domain.site.hostname}"
}

output "data_bucket_name" {
  value = cloudflare_r2_bucket.data.name
}
