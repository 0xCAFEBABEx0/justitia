# State lives in HCP Terraform (Free tier), workspace justitia-prod, so no single
# machine holds it. The workspace runs in Local execution mode: plan and apply run
# on the owner's machine with credentials from 1Password (1password.env), and HCP
# Terraform only stores, locks and versions the state. The organization comes from
# TF_CLOUD_ORGANIZATION in 1password.env. See infra/README.md.
terraform {
  cloud {
    workspaces {
      name = "justitia-prod"
    }
  }
}
