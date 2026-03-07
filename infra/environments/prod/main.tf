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

module "lambda_functions" {
  source = "../../modules/lambda-functions"

  environment        = var.environment
  project_name       = var.project_name
  renderer_role_arn  = module.lambdas.renderer_role_arn
  tenants_table_name = module.dynamodb.tenants_table_name
  base_url           = var.domain_name != "" ? "https://${var.domain_name}" : "https://${module.cloudfront.distribution_domain_name}"
  deploy_bucket_name = ""

  tags = local.common_tags
}

module "api_gateway" {
  source = "../../modules/api-gateway"

  environment            = var.environment
  project_name           = var.project_name
  renderer_function_name = module.lambda_functions.renderer_function_name
  renderer_invoke_arn    = module.lambda_functions.renderer_invoke_arn
  renderer_function_arn  = module.lambda_functions.renderer_function_arn

  tags = local.common_tags
}

module "cloudfront" {
  source = "../../modules/cloudfront"

  environment                        = var.environment
  project_name                       = var.project_name
  api_gateway_endpoint               = module.api_gateway.api_endpoint
  assets_bucket_name                 = module.s3.assets_bucket_name
  assets_bucket_arn                  = module.s3.assets_bucket_arn
  assets_bucket_regional_domain_name = module.s3.assets_bucket_regional_domain_name

  domain_name         = var.domain_name
  acm_certificate_arn = var.domain_name != "" ? module.dns[0].acm_certificate_arn : ""

  tags = local.common_tags
}

module "dns" {
  source = "../../modules/dns"
  count  = var.domain_name != "" ? 1 : 0

  domain_name                            = var.domain_name
  zone_domain                            = "dmercato.com"
  environment                            = var.environment
  project_name                           = var.project_name
  cloudfront_distribution_domain_name    = module.cloudfront.distribution_domain_name
  cloudfront_distribution_hosted_zone_id = "Z2FDTNDATAQYW2"

  tags = local.common_tags
}
