# Dev reuses the staging state bucket and lock table under its own key.
#
# A Terraform backend cannot be created by the configuration that uses it, so a new bucket
# per environment needs a bootstrap step outside CI. Sharing the existing bucket avoids that
# entirely, keeps the state encrypted and locked exactly as staging is, and adds nothing to
# the bill. The key namespaces the two apart, so they never touch each other's state.
terraform {
  backend "s3" {
    bucket         = "dmercato-terraform-state-staging"
    key            = "dev/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "dmercato-terraform-locks-staging"
    encrypt        = true
  }
}
