terraform {
  backend "s3" {
    bucket         = "dmercato-terraform-state-prod"
    key            = "prod/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "dmercato-terraform-locks-prod"
    encrypt        = true
  }
}
