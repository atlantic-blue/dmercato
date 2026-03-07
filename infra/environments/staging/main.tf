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

# -----------------------------------------------------------------------------
# Lambda Functions (actual function resources)
# -----------------------------------------------------------------------------
module "lambda_functions" {
  source = "../../modules/lambda-functions"

  environment             = var.environment
  project_name            = var.project_name
  renderer_role_arn       = module.lambdas.renderer_role_arn
  api_role_arn            = module.lambdas.api_role_arn
  stripe_webhook_role_arn = module.lambdas.stripe_webhook_role_arn
  tenants_table_name      = module.dynamodb.tenants_table_name
  orders_table_name       = module.dynamodb.orders_table_name
  base_url                = var.domain_name != "" ? "https://${var.domain_name}" : "https://${module.cloudfront.distribution_domain_name}"
  stripe_secret_key       = var.stripe_secret_key
  stripe_webhook_secret   = var.stripe_webhook_secret
  platform_fee_percent    = var.platform_fee_percent
  deploy_bucket_name      = ""

  tags = local.common_tags
}

# -----------------------------------------------------------------------------
# API Gateway (HTTP API routing to Lambda functions)
# -----------------------------------------------------------------------------
module "api_gateway" {
  source = "../../modules/api-gateway"

  environment                  = var.environment
  project_name                 = var.project_name
  renderer_function_name       = module.lambda_functions.renderer_function_name
  renderer_invoke_arn          = module.lambda_functions.renderer_invoke_arn
  renderer_function_arn        = module.lambda_functions.renderer_function_arn
  api_function_name            = module.lambda_functions.api_function_name
  api_invoke_arn               = module.lambda_functions.api_invoke_arn
  api_function_arn             = module.lambda_functions.api_function_arn
  stripe_webhook_function_name = module.lambda_functions.stripe_webhook_function_name
  stripe_webhook_invoke_arn    = module.lambda_functions.stripe_webhook_invoke_arn
  stripe_webhook_function_arn  = module.lambda_functions.stripe_webhook_function_arn

  tags = local.common_tags
}

# -----------------------------------------------------------------------------
# CloudFront (CDN: API Gateway for pages, S3 OAC for assets)
# -----------------------------------------------------------------------------
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

# -----------------------------------------------------------------------------
# DNS + ACM (only when domain_name is set)
# -----------------------------------------------------------------------------
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

# -----------------------------------------------------------------------------
# SES (email sending from dmercato.com)
# -----------------------------------------------------------------------------
module "ses" {
  source = "../../modules/ses"

  domain_name = "dmercato.com"
  zone_domain = "dmercato.com"

  tags = local.common_tags
}
