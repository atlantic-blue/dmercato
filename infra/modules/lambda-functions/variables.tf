variable "environment" {
  description = "Deployment environment (staging, prod)"
  type        = string
}

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
}

variable "renderer_role_arn" {
  description = "ARN of the IAM role for the renderer Lambda function"
  type        = string
}

variable "api_role_arn" {
  description = "ARN of the IAM role for the API Lambda function"
  type        = string
}

variable "stripe_webhook_role_arn" {
  description = "ARN of the IAM role for the Stripe webhook Lambda function"
  type        = string
}

variable "tenants_table_name" {
  description = "Name of the tenants DynamoDB table"
  type        = string
}

variable "orders_table_name" {
  description = "Name of the orders DynamoDB table"
  type        = string
}

variable "base_url" {
  description = "Base URL for the application (e.g. https://dmercato.com)"
  type        = string
}

variable "stripe_secret_key" {
  description = "Stripe secret API key"
  type        = string
  sensitive   = true
}

variable "stripe_webhook_secret" {
  description = "Stripe webhook signing secret"
  type        = string
  sensitive   = true
}

variable "platform_fee_percent" {
  description = "Platform fee percentage for Stripe checkout (e.g. 5)"
  type        = string
  default     = "5"
}

variable "stripe_publishable_key" {
  description = "Stripe publishable key for embedded checkout"
  type        = string
  default     = ""
}

variable "deploy_bucket_name" {
  description = "Name of the S3 bucket used for Lambda deployment artifacts"
  type        = string
}

variable "tags" {
  description = "Common tags applied to all resources"
  type        = map(string)
  default     = {}
}
