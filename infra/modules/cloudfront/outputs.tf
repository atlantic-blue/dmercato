output "distribution_id" {
  description = "ID of the CloudFront distribution"
  value       = aws_cloudfront_distribution.main.id
}

output "distribution_domain_name" {
  description = "Domain name of the CloudFront distribution (*.cloudfront.net)"
  value       = aws_cloudfront_distribution.main.domain_name
}

output "distribution_arn" {
  description = "ARN of the CloudFront distribution"
  value       = aws_cloudfront_distribution.main.arn
}
