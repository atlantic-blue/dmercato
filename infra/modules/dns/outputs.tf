output "zone_id" {
  description = "ID of the Route 53 hosted zone"
  value       = data.aws_route53_zone.main.zone_id
}

output "acm_certificate_arn" {
  description = "ARN of the ACM certificate"
  value       = aws_acm_certificate_validation.main.certificate_arn
}
