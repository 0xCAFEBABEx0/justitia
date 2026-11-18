variable "cloudflare_api_token" {
  type        = string
  sensitive   = true
  description = "Cloudflare API token for Terraform. Pass via TF_VAR_cloudflare_api_token (1password.env); never commit it."
}

variable "cloudflare_account_id" {
  type        = string
  description = "Cloudflare account ID. Pass via TF_VAR_cloudflare_account_id (1password.env)."
}

variable "preview_access_emails" {
  type        = string
  sensitive   = true
  description = "Email addresses that Cloudflare Access lets into the Previews (preview.tf), separated by commas. Pass via TF_VAR_preview_access_emails (1password.env); never commit them."

  validation {
    condition     = length(compact([for e in split(",", var.preview_access_emails) : trimspace(e)])) > 0
    error_message = "preview_access_emails must hold at least one email address."
  }
}
