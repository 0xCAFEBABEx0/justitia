terraform {
  required_version = ">= 1.7.0"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.28"
    }
  }

  # State: HCP Terraform, see backend.tf.
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

data "cloudflare_zone" "site" {
  filter = {
    name    = "anisotro.pics"
    account = { id = var.cloudflare_account_id }
  }
}

module "site" {
  source = "../../modules/cloudflare_site"

  cloudflare_account_id = var.cloudflare_account_id
  cloudflare_zone_id    = data.cloudflare_zone.site.zone_id

  # The Worker deployed by Wrangler (wrangler.jsonc) on the zone apex.
  site_domain = "anisotro.pics"
  worker_name = "justitia"

  # The data the pages fetch in the browser (scripts/upload-data.sh,
  # PUBLIC_DATA_BASE in .github/workflows/publish.yml).
  data_bucket_name = "justitia-data-prod"
  data_domain      = "data.anisotro.pics"
}
