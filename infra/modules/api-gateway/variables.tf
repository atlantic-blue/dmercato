variable "environment" {
  description = "Deployment environment (staging, prod)"
  type        = string
}

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
}

variable "renderer_function_name" {
  description = "Name of the renderer Lambda function"
  type        = string
}

variable "renderer_invoke_arn" {
  description = "Invoke ARN of the renderer Lambda function"
  type        = string
}

variable "renderer_function_arn" {
  description = "ARN of the renderer Lambda function"
  type        = string
}

variable "api_function_name" {
  description = "Name of the API Lambda function"
  type        = string
}

variable "api_invoke_arn" {
  description = "Invoke ARN of the API Lambda function"
  type        = string
}

variable "api_function_arn" {
  description = "ARN of the API Lambda function"
  type        = string
}

variable "stripe_webhook_function_name" {
  description = "Name of the Stripe webhook Lambda function"
  type        = string
}

variable "stripe_webhook_invoke_arn" {
  description = "Invoke ARN of the Stripe webhook Lambda function"
  type        = string
}

variable "stripe_webhook_function_arn" {
  description = "ARN of the Stripe webhook Lambda function"
  type        = string
}

variable "tags" {
  description = "Common tags applied to all resources"
  type        = map(string)
  default     = {}
}
