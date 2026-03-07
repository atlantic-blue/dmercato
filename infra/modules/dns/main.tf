# -----------------------------------------------------------------------------
# Route 53 + ACM for custom domain
# Uses an existing hosted zone (data source, not managed)
# -----------------------------------------------------------------------------

# -----------------------------------------------------------------------------
# Look up existing Route 53 Hosted Zone
# -----------------------------------------------------------------------------
data "aws_route53_zone" "main" {
  name         = var.zone_domain
  private_zone = false
}

# -----------------------------------------------------------------------------
# ACM Certificate (domain + wildcard for root zone)
# -----------------------------------------------------------------------------
resource "aws_acm_certificate" "main" {
  domain_name               = var.domain_name
  subject_alternative_names = var.domain_name == var.zone_domain ? ["*.${var.zone_domain}"] : []
  validation_method         = "DNS"

  tags = var.tags

  lifecycle {
    create_before_destroy = true
  }
}

# -----------------------------------------------------------------------------
# DNS validation records for ACM
# -----------------------------------------------------------------------------
resource "aws_route53_record" "acm_validation" {
  for_each = {
    for dvo in aws_acm_certificate.main.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = data.aws_route53_zone.main.zone_id
}

# -----------------------------------------------------------------------------
# Wait for ACM certificate validation
# -----------------------------------------------------------------------------
resource "aws_acm_certificate_validation" "main" {
  certificate_arn         = aws_acm_certificate.main.arn
  validation_record_fqdns = [for record in aws_route53_record.acm_validation : record.fqdn]
}

# -----------------------------------------------------------------------------
# A record: domain -> CloudFront (IPv4)
# -----------------------------------------------------------------------------
resource "aws_route53_record" "cloudfront_a" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = var.cloudfront_distribution_domain_name
    zone_id                = var.cloudfront_distribution_hosted_zone_id
    evaluate_target_health = false
  }
}

# -----------------------------------------------------------------------------
# AAAA record: domain -> CloudFront (IPv6)
# -----------------------------------------------------------------------------
resource "aws_route53_record" "cloudfront_aaaa" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = var.domain_name
  type    = "AAAA"

  alias {
    name                   = var.cloudfront_distribution_domain_name
    zone_id                = var.cloudfront_distribution_hosted_zone_id
    evaluate_target_health = false
  }
}
