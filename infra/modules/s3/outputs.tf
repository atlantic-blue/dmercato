output "assets_bucket_name" {
  description = "Name of the assets S3 bucket"
  value       = aws_s3_bucket.assets.id
}

output "assets_bucket_arn" {
  description = "ARN of the assets S3 bucket"
  value       = aws_s3_bucket.assets.arn
}

output "admin_bucket_name" {
  description = "Name of the admin S3 bucket"
  value       = aws_s3_bucket.admin.id
}

output "admin_bucket_arn" {
  description = "ARN of the admin S3 bucket"
  value       = aws_s3_bucket.admin.arn
}

output "sitemaps_bucket_name" {
  description = "Name of the sitemaps S3 bucket"
  value       = aws_s3_bucket.sitemaps.id
}

output "sitemaps_bucket_arn" {
  description = "ARN of the sitemaps S3 bucket"
  value       = aws_s3_bucket.sitemaps.arn
}
