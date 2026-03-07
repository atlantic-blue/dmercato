terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

data "aws_caller_identity" "current" {}

locals {
  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

module "dynamodb" {
  source = "../../modules/dynamodb"

  environment  = var.environment
  project_name = var.project_name
  tags         = local.common_tags
}

module "s3" {
  source = "../../modules/s3"

  environment  = var.environment
  project_name = var.project_name
  tags         = local.common_tags
}

module "lambdas" {
  source = "../../modules/lambdas"

  environment    = var.environment
  project_name   = var.project_name
  aws_region     = var.aws_region
  aws_account_id = data.aws_caller_identity.current.account_id

  tenants_table_arn                    = module.dynamodb.tenants_table_arn
  tenants_city_index_arn               = module.dynamodb.tenants_city_index_arn
  quote_requests_table_arn             = module.dynamodb.quote_requests_table_arn
  quote_requests_vendor_slug_index_arn = module.dynamodb.quote_requests_vendor_slug_index_arn
  orders_table_arn                     = module.dynamodb.orders_table_arn
  orders_vendor_slug_index_arn         = module.dynamodb.orders_vendor_slug_index_arn
  sessions_table_arn                   = module.dynamodb.sessions_table_arn
  magic_links_table_arn                = module.dynamodb.magic_links_table_arn
  assets_bucket_arn                    = module.s3.assets_bucket_arn
  sitemaps_bucket_arn                  = module.s3.sitemaps_bucket_arn

  tags = local.common_tags
}
