variable "environment" {
  description = "Deployment environment (staging, prod)"
  type        = string
}

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
}

variable "aws_region" {
  description = "AWS region for resource ARN construction"
  type        = string
}

variable "aws_account_id" {
  description = "AWS account ID for resource ARN construction"
  type        = string
}

variable "tenants_table_arn" {
  description = "ARN of the tenants DynamoDB table"
  type        = string
}

variable "tenants_city_index_arn" {
  description = "ARN of the tenants city-index GSI"
  type        = string
}

variable "quote_requests_table_arn" {
  description = "ARN of the quoteRequests DynamoDB table"
  type        = string
}

variable "quote_requests_vendor_slug_index_arn" {
  description = "ARN of the quoteRequests vendorSlug-createdAt-index GSI"
  type        = string
}

variable "orders_table_arn" {
  description = "ARN of the orders DynamoDB table"
  type        = string
}

variable "orders_vendor_slug_index_arn" {
  description = "ARN of the orders vendorSlug-createdAt-index GSI"
  type        = string
}

variable "sessions_table_arn" {
  description = "ARN of the sessions DynamoDB table"
  type        = string
}

variable "magic_links_table_arn" {
  description = "ARN of the magicLinks DynamoDB table"
  type        = string
}

variable "assets_bucket_arn" {
  description = "ARN of the assets S3 bucket"
  type        = string
}

variable "sitemaps_bucket_arn" {
  description = "ARN of the sitemaps S3 bucket"
  type        = string
}

variable "tags" {
  description = "Common tags applied to all resources"
  type        = map(string)
  default     = {}
}
