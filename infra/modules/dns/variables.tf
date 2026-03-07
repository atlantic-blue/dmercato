variable "domain_name" {
  description = "Full domain for this environment (e.g. dmercato.com or staging.dmercato.com)"
  type        = string
}

variable "zone_domain" {
  description = "Root domain for the Route 53 hosted zone (e.g. dmercato.com)"
  type        = string
}

variable "environment" {
  description = "Deployment environment (staging, prod)"
  type        = string
}

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
}

variable "cloudfront_distribution_domain_name" {
  description = "Domain name of the CloudFront distribution for DNS alias"
  type        = string
}

variable "cloudfront_distribution_hosted_zone_id" {
  description = "Hosted zone ID of the CloudFront distribution for DNS alias"
  type        = string
}

variable "tags" {
  description = "Common tags applied to all resources"
  type        = map(string)
  default     = {}
}
