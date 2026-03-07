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

variable "tenants_table_name" {
  description = "Name of the tenants DynamoDB table"
  type        = string
}

variable "base_url" {
  description = "Base URL for the application (e.g. https://dmercato.com)"
  type        = string
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
