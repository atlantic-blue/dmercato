terraform {
  backend "s3" {
    bucket         = "dmercato-terraform-state-staging"
    key            = "staging/terraform.tfstate"
    region         = "ap-southeast-2"
    dynamodb_table = "dmercato-terraform-locks-staging"
    encrypt        = true
  }
}
