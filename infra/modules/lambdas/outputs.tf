output "renderer_role_arn" {
  description = "ARN of the renderer Lambda IAM role"
  value       = aws_iam_role.renderer.arn
}

output "renderer_role_name" {
  description = "Name of the renderer Lambda IAM role"
  value       = aws_iam_role.renderer.name
}

output "api_role_arn" {
  description = "ARN of the API Lambda IAM role"
  value       = aws_iam_role.api.arn
}

output "api_role_name" {
  description = "Name of the API Lambda IAM role"
  value       = aws_iam_role.api.name
}

output "auth_role_arn" {
  description = "ARN of the auth Lambda IAM role"
  value       = aws_iam_role.auth.arn
}

output "auth_role_name" {
  description = "Name of the auth Lambda IAM role"
  value       = aws_iam_role.auth.name
}

output "sitemap_role_arn" {
  description = "ARN of the sitemap Lambda IAM role"
  value       = aws_iam_role.sitemap.arn
}

output "sitemap_role_name" {
  description = "Name of the sitemap Lambda IAM role"
  value       = aws_iam_role.sitemap.name
}

output "cache_invalidator_role_arn" {
  description = "ARN of the cache-invalidator Lambda IAM role"
  value       = aws_iam_role.cache_invalidator.arn
}

output "cache_invalidator_role_name" {
  description = "Name of the cache-invalidator Lambda IAM role"
  value       = aws_iam_role.cache_invalidator.name
}

output "stripe_webhook_role_arn" {
  description = "ARN of the stripe-webhook Lambda IAM role"
  value       = aws_iam_role.stripe_webhook.arn
}

output "stripe_webhook_role_name" {
  description = "Name of the stripe-webhook Lambda IAM role"
  value       = aws_iam_role.stripe_webhook.name
}
