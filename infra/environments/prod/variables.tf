variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "prod"
}

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
  default     = "dmercato"
}

variable "aws_region" {
  description = "AWS region for resource deployment"
  type        = string
  default     = "us-east-1"
}

variable "domain_name" {
  description = "Custom domain name for this environment"
  type        = string
  default     = "dmercato.com"
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
  description = "Platform fee percentage for Stripe checkout. Zero: the platform takes no commission, revenue is the subscription (DEC-014)"
  type        = string
  default     = "0"
}

variable "stripe_publishable_key" {
  description = "Stripe publishable key for embedded checkout"
  type        = string
  default     = ""
}
