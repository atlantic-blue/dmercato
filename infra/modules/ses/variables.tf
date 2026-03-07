variable "domain_name" {
  description = "Domain for SES email sending (e.g. dmercato.com)"
  type        = string
}

variable "zone_domain" {
  description = "Root domain for the Route 53 hosted zone"
  type        = string
}

variable "tags" {
  description = "Common tags applied to all resources"
  type        = map(string)
  default     = {}
}
