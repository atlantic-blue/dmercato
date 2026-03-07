terraform {
  backend "s3" {
    bucket         = "dmercato-terraform-state-prod"
    key            = "prod/terraform.tfstate"
    region         = "ap-southeast-2"
    dynamodb_table = "dmercato-terraform-locks-prod"
    encrypt        = true
  }
}
