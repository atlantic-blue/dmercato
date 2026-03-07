terraform {
  backend "s3" {
    bucket         = "dmercato-terraform-state-staging"
    key            = "staging/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "dmercato-terraform-locks-staging"
    encrypt        = true
  }
}
