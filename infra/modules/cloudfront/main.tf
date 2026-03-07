# -----------------------------------------------------------------------------
# CloudFront distribution with two origins:
# 1. API Gateway (default behavior) — vendor pages at /{slug}
# 2. S3 via OAC (ordered behavior) — static assets at /assets/*
# -----------------------------------------------------------------------------

locals {
  api_gateway_domain = replace(var.api_gateway_endpoint, "/^https?:\\/\\//", "")
  use_custom_domain  = var.domain_name != "" && var.acm_certificate_arn != ""
}

# -----------------------------------------------------------------------------
# Origin Access Control for S3
# -----------------------------------------------------------------------------
resource "aws_cloudfront_origin_access_control" "assets" {
  name                              = "${var.project_name}-assets-oac-${var.environment}"
  description                       = "OAC for ${var.project_name} assets S3 bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# -----------------------------------------------------------------------------
# CloudFront Function to strip /assets prefix for S3 origin
# -----------------------------------------------------------------------------
resource "aws_cloudfront_function" "strip_assets_prefix" {
  name    = "${var.project_name}-strip-assets-${var.environment}"
  runtime = "cloudfront-js-2.0"
  publish = true
  code    = <<-EOF
    function handler(event) {
      var request = event.request;
      request.uri = request.uri.replace(/^\/assets/, '');
      return request;
    }
  EOF
}

# -----------------------------------------------------------------------------
# CloudFront Distribution
# -----------------------------------------------------------------------------
resource "aws_cloudfront_distribution" "main" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = ""
  price_class         = "PriceClass_100"
  comment             = "${var.project_name} ${var.environment} distribution"

  aliases = local.use_custom_domain ? [var.domain_name] : []

  tags = var.tags

  # ---------------------------------------------------------------------------
  # Origin 1: API Gateway
  # ---------------------------------------------------------------------------
  origin {
    domain_name = local.api_gateway_domain
    origin_id   = "api-gateway"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  # ---------------------------------------------------------------------------
  # Origin 2: S3 assets bucket via OAC
  # ---------------------------------------------------------------------------
  origin {
    domain_name              = var.assets_bucket_regional_domain_name
    origin_id                = "assets-s3"
    origin_access_control_id = aws_cloudfront_origin_access_control.assets.id
  }

  # ---------------------------------------------------------------------------
  # Default cache behavior -> API Gateway
  # CachingDisabled: 4135ea2d-6df8-44a3-9df3-4b5a84be39ad
  # AllViewerExceptHostHeader: b689b0a0-8dc8-4fd7-b57e-bf6d5e23d2a3
  # ---------------------------------------------------------------------------
  default_cache_behavior {
    target_origin_id       = "api-gateway"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    cache_policy_id          = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
    origin_request_policy_id = "b689b0a8-53d0-40ab-baf2-68738e2966ac"
  }

  # ---------------------------------------------------------------------------
  # Ordered cache behavior: /api/* -> API Gateway (allows POST)
  # CachingDisabled: 4135ea2d-6df8-44a3-9df3-4b5a84be39ad
  # AllViewerExceptHostHeader: b689b0a8-53d0-40ab-baf2-68738e2966ac
  # ---------------------------------------------------------------------------
  ordered_cache_behavior {
    path_pattern           = "/api/*"
    target_origin_id       = "api-gateway"
    allowed_methods        = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods         = ["GET", "HEAD"]
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    cache_policy_id          = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
    origin_request_policy_id = "b689b0a8-53d0-40ab-baf2-68738e2966ac"
  }

  # ---------------------------------------------------------------------------
  # Ordered cache behavior: /assets/* -> S3
  # CachingOptimized: 658327ea-f89d-4fab-a63d-7e88639e58f6
  # ---------------------------------------------------------------------------
  ordered_cache_behavior {
    path_pattern           = "/assets/*"
    target_origin_id       = "assets-s3"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    cache_policy_id = "658327ea-f89d-4fab-a63d-7e88639e58f6"

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.strip_assets_prefix.arn
    }
  }

  # ---------------------------------------------------------------------------
  # Viewer certificate
  # ---------------------------------------------------------------------------
  viewer_certificate {
    cloudfront_default_certificate = local.use_custom_domain ? false : true
    acm_certificate_arn            = local.use_custom_domain ? var.acm_certificate_arn : null
    ssl_support_method             = local.use_custom_domain ? "sni-only" : null
    minimum_protocol_version       = local.use_custom_domain ? "TLSv1.2_2021" : null
  }

  # ---------------------------------------------------------------------------
  # Restrictions (none)
  # ---------------------------------------------------------------------------
  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }
}

# -----------------------------------------------------------------------------
# S3 bucket policy allowing CloudFront OAC read access
# -----------------------------------------------------------------------------
data "aws_iam_policy_document" "assets_cloudfront" {
  statement {
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    actions   = ["s3:GetObject"]
    resources = ["${var.assets_bucket_arn}/*"]

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.main.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "assets_cloudfront" {
  bucket = var.assets_bucket_name
  policy = data.aws_iam_policy_document.assets_cloudfront.json
}
