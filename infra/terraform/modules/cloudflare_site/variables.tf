variable "cloudflare_account_id" {
  type        = string
  description = "Cloudflare account ID."
}

variable "cloudflare_zone_id" {
  type        = string
  description = "ID of the site's zone (anisotro.pics)."
}

variable "site_domain" {
  type        = string
  description = "Hostname of the site, served by the Worker (the zone apex)."
}

variable "worker_name" {
  type        = string
  description = "Name of the Worker that Wrangler deploys (name in wrangler.jsonc)."
}

variable "data_bucket_name" {
  type        = string
  description = "R2 bucket that holds the data the pages fetch in the browser (R2_BUCKET in scripts/upload-data.sh)."
}

variable "data_bucket_location" {
  type        = string
  description = "Location hint of the data bucket. Only honored when the bucket is created."
  default     = "APAC"
}

variable "data_domain" {
  type        = string
  description = "Hostname of the data bucket's custom domain (PUBLIC_DATA_BASE in the Publish workflow)."
}
