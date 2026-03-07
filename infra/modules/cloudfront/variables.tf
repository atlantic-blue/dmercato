variable "environment" {
  description = "Deployment environment (staging, prod)"
  type        = string
}

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
}

variable "api_gateway_endpoint" {
  description = "API Gateway invoke URL (without protocol)"
  type        = string
}

variable "assets_bucket_name" {
  description = "Name of the assets S3 bucket"
  type        = string
}

variable "assets_bucket_arn" {
  description = "ARN of the assets S3 bucket"
  type        = string
}

variable "assets_bucket_regional_domain_name" {
  description = "Regional domain name of the assets S3 bucket"
  type        = string
}

variable "domain_name" {
  description = "Custom domain (empty string = no custom domain, use CloudFront default)"
  type        = string
  default     = ""
}

variable "acm_certificate_arn" {
  description = "ACM certificate ARN for custom domain (empty = no custom domain)"
  type        = string
  default     = ""
}

variable "tags" {
  description = "Common tags applied to all resources"
  type        = map(string)
  default     = {}
}
