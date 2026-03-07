# DynamoDB outputs
output "tenants_table_name" {
  description = "Name of the tenants DynamoDB table"
  value       = module.dynamodb.tenants_table_name
}

output "tenants_table_arn" {
  description = "ARN of the tenants DynamoDB table"
  value       = module.dynamodb.tenants_table_arn
}

output "quote_requests_table_name" {
  description = "Name of the quoteRequests DynamoDB table"
  value       = module.dynamodb.quote_requests_table_name
}

output "orders_table_name" {
  description = "Name of the orders DynamoDB table"
  value       = module.dynamodb.orders_table_name
}

output "sessions_table_name" {
  description = "Name of the sessions DynamoDB table"
  value       = module.dynamodb.sessions_table_name
}

output "magic_links_table_name" {
  description = "Name of the magicLinks DynamoDB table"
  value       = module.dynamodb.magic_links_table_name
}

# S3 outputs
output "assets_bucket_name" {
  description = "Name of the assets S3 bucket"
  value       = module.s3.assets_bucket_name
}

output "admin_bucket_name" {
  description = "Name of the admin S3 bucket"
  value       = module.s3.admin_bucket_name
}

output "sitemaps_bucket_name" {
  description = "Name of the sitemaps S3 bucket"
  value       = module.s3.sitemaps_bucket_name
}

# IAM outputs
output "renderer_role_arn" {
  description = "ARN of the renderer Lambda IAM role"
  value       = module.lambdas.renderer_role_arn
}

output "api_role_arn" {
  description = "ARN of the API Lambda IAM role"
  value       = module.lambdas.api_role_arn
}

output "auth_role_arn" {
  description = "ARN of the auth Lambda IAM role"
  value       = module.lambdas.auth_role_arn
}

output "sitemap_role_arn" {
  description = "ARN of the sitemap Lambda IAM role"
  value       = module.lambdas.sitemap_role_arn
}

output "cache_invalidator_role_arn" {
  description = "ARN of the cache-invalidator Lambda IAM role"
  value       = module.lambdas.cache_invalidator_role_arn
}

output "stripe_webhook_role_arn" {
  description = "ARN of the stripe-webhook Lambda IAM role"
  value       = module.lambdas.stripe_webhook_role_arn
}

output "renderer_function_name" {
  description = "Name of the renderer Lambda function"
  value       = module.lambda_functions.renderer_function_name
}

output "api_gateway_endpoint" {
  description = "API Gateway invoke URL"
  value       = module.api_gateway.api_endpoint
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID"
  value       = module.cloudfront.distribution_id
}

output "cloudfront_domain_name" {
  description = "CloudFront distribution domain"
  value       = module.cloudfront.distribution_domain_name
}

output "site_url" {
  description = "The URL where the site is accessible"
  value       = var.domain_name != "" ? "https://${var.domain_name}" : "https://${module.cloudfront.distribution_domain_name}"
}
