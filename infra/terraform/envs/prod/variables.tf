variable "cloudflare_api_token" {
  type        = string
  sensitive   = true
  description = "Cloudflare API token for Terraform. Pass via TF_VAR_cloudflare_api_token (1password.env); never commit it."
}

variable "cloudflare_account_id" {
  type        = string
  description = "Cloudflare account ID. Pass via TF_VAR_cloudflare_account_id (1password.env)."
}
