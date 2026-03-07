data "aws_iam_policy_document" "lambda_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

locals {
  ssm_parameter_arn_prefix = "arn:aws:ssm:${var.aws_region}:${var.aws_account_id}:parameter/${var.project_name}/${var.environment}/*"
  log_group_arn_prefix     = "arn:aws:logs:${var.aws_region}:${var.aws_account_id}:log-group:/aws/lambda/${var.project_name}-*-${var.environment}"
}

# -----------------------------------------------------------------------------
# Renderer Lambda Role
# DynamoDB GetItem on tenants + Query on city-index, SSM, Logs
# -----------------------------------------------------------------------------
resource "aws_iam_role" "renderer" {
  name               = "${var.project_name}-renderer-${var.environment}"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json

  tags = var.tags
}

data "aws_iam_policy_document" "renderer" {
  statement {
    sid    = "DynamoDBReadTenants"
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
    ]
    resources = [var.tenants_table_arn]
  }

  statement {
    sid    = "DynamoDBQueryCityIndex"
    effect = "Allow"
    actions = [
      "dynamodb:Query",
    ]
    resources = [var.tenants_city_index_arn]
  }

  statement {
    sid    = "SSMGetParameter"
    effect = "Allow"
    actions = [
      "ssm:GetParameter",
      "ssm:GetParameters",
    ]
    resources = [local.ssm_parameter_arn_prefix]
  }

  statement {
    sid    = "CloudWatchLogs"
    effect = "Allow"
    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = [
      local.log_group_arn_prefix,
      "${local.log_group_arn_prefix}:*",
    ]
  }
}

resource "aws_iam_role_policy" "renderer" {
  name   = "${var.project_name}-renderer-policy-${var.environment}"
  role   = aws_iam_role.renderer.id
  policy = data.aws_iam_policy_document.renderer.json
}

# -----------------------------------------------------------------------------
# API Lambda Role
# DynamoDB CRUD on tenants + quoteRequests, S3 PutObject on assets,
# SES SendEmail, Lambda Invoke on cache-invalidator, SSM, Logs
# -----------------------------------------------------------------------------
resource "aws_iam_role" "api" {
  name               = "${var.project_name}-api-${var.environment}"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json

  tags = var.tags
}

data "aws_iam_policy_document" "api" {
  statement {
    sid    = "DynamoDBCRUDTenants"
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
      "dynamodb:Query",
      "dynamodb:Scan",
    ]
    resources = [
      var.tenants_table_arn,
      "${var.tenants_table_arn}/index/*",
    ]
  }

  statement {
    sid    = "DynamoDBCRUDQuoteRequests"
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
      "dynamodb:Query",
      "dynamodb:Scan",
    ]
    resources = [
      var.quote_requests_table_arn,
      var.quote_requests_vendor_slug_index_arn,
    ]
  }

  statement {
    sid    = "S3PutAssets"
    effect = "Allow"
    actions = [
      "s3:PutObject",
    ]
    resources = ["${var.assets_bucket_arn}/*"]
  }

  statement {
    sid    = "SESSendEmail"
    effect = "Allow"
    actions = [
      "ses:SendEmail",
      "ses:SendRawEmail",
    ]
    resources = ["arn:aws:ses:${var.aws_region}:${var.aws_account_id}:identity/*"]
  }

  statement {
    sid    = "LambdaInvokeCacheInvalidator"
    effect = "Allow"
    actions = [
      "lambda:InvokeFunction",
    ]
    resources = [
      "arn:aws:lambda:${var.aws_region}:${var.aws_account_id}:function:${var.project_name}-cache-invalidator-${var.environment}",
    ]
  }

  statement {
    sid    = "SSMGetParameter"
    effect = "Allow"
    actions = [
      "ssm:GetParameter",
      "ssm:GetParameters",
    ]
    resources = [local.ssm_parameter_arn_prefix]
  }

  statement {
    sid    = "CloudWatchLogs"
    effect = "Allow"
    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = [
      local.log_group_arn_prefix,
      "${local.log_group_arn_prefix}:*",
    ]
  }
}

resource "aws_iam_role_policy" "api" {
  name   = "${var.project_name}-api-policy-${var.environment}"
  role   = aws_iam_role.api.id
  policy = data.aws_iam_policy_document.api.json
}

# -----------------------------------------------------------------------------
# Auth Lambda Role
# DynamoDB Scan on tenants (email lookup), CRUD on sessions + magicLinks,
# SES SendEmail, SSM, Logs
# -----------------------------------------------------------------------------
resource "aws_iam_role" "auth" {
  name               = "${var.project_name}-auth-${var.environment}"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json

  tags = var.tags
}

data "aws_iam_policy_document" "auth" {
  statement {
    sid    = "DynamoDBScanTenants"
    effect = "Allow"
    actions = [
      "dynamodb:Scan",
    ]
    resources = [var.tenants_table_arn]
  }

  statement {
    sid    = "DynamoDBCRUDSessions"
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
      "dynamodb:Query",
      "dynamodb:Scan",
    ]
    resources = [var.sessions_table_arn]
  }

  statement {
    sid    = "DynamoDBCRUDMagicLinks"
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
      "dynamodb:Query",
      "dynamodb:Scan",
    ]
    resources = [var.magic_links_table_arn]
  }

  statement {
    sid    = "SESSendEmail"
    effect = "Allow"
    actions = [
      "ses:SendEmail",
      "ses:SendRawEmail",
    ]
    resources = ["arn:aws:ses:${var.aws_region}:${var.aws_account_id}:identity/*"]
  }

  statement {
    sid    = "SSMGetParameter"
    effect = "Allow"
    actions = [
      "ssm:GetParameter",
      "ssm:GetParameters",
    ]
    resources = [local.ssm_parameter_arn_prefix]
  }

  statement {
    sid    = "CloudWatchLogs"
    effect = "Allow"
    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = [
      local.log_group_arn_prefix,
      "${local.log_group_arn_prefix}:*",
    ]
  }
}

resource "aws_iam_role_policy" "auth" {
  name   = "${var.project_name}-auth-policy-${var.environment}"
  role   = aws_iam_role.auth.id
  policy = data.aws_iam_policy_document.auth.json
}

# -----------------------------------------------------------------------------
# Sitemap Lambda Role
# DynamoDB Scan on tenants, S3 PutObject on sitemaps, SSM, Logs
# -----------------------------------------------------------------------------
resource "aws_iam_role" "sitemap" {
  name               = "${var.project_name}-sitemap-${var.environment}"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json

  tags = var.tags
}

data "aws_iam_policy_document" "sitemap" {
  statement {
    sid    = "DynamoDBScanTenants"
    effect = "Allow"
    actions = [
      "dynamodb:Scan",
    ]
    resources = [var.tenants_table_arn]
  }

  statement {
    sid    = "S3PutSitemaps"
    effect = "Allow"
    actions = [
      "s3:PutObject",
    ]
    resources = ["${var.sitemaps_bucket_arn}/*"]
  }

  statement {
    sid    = "SSMGetParameter"
    effect = "Allow"
    actions = [
      "ssm:GetParameter",
      "ssm:GetParameters",
    ]
    resources = [local.ssm_parameter_arn_prefix]
  }

  statement {
    sid    = "CloudWatchLogs"
    effect = "Allow"
    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = [
      local.log_group_arn_prefix,
      "${local.log_group_arn_prefix}:*",
    ]
  }
}

resource "aws_iam_role_policy" "sitemap" {
  name   = "${var.project_name}-sitemap-policy-${var.environment}"
  role   = aws_iam_role.sitemap.id
  policy = data.aws_iam_policy_document.sitemap.json
}

# -----------------------------------------------------------------------------
# Cache Invalidator Lambda Role
# CloudFront CreateInvalidation, SSM, Logs
# -----------------------------------------------------------------------------
resource "aws_iam_role" "cache_invalidator" {
  name               = "${var.project_name}-cache-invalidator-${var.environment}"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json

  tags = var.tags
}

data "aws_iam_policy_document" "cache_invalidator" {
  statement {
    sid    = "CloudFrontInvalidation"
    effect = "Allow"
    actions = [
      "cloudfront:CreateInvalidation",
    ]
    resources = [
      "arn:aws:cloudfront::${var.aws_account_id}:distribution/*",
    ]
  }

  statement {
    sid    = "SSMGetParameter"
    effect = "Allow"
    actions = [
      "ssm:GetParameter",
      "ssm:GetParameters",
    ]
    resources = [local.ssm_parameter_arn_prefix]
  }

  statement {
    sid    = "CloudWatchLogs"
    effect = "Allow"
    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = [
      local.log_group_arn_prefix,
      "${local.log_group_arn_prefix}:*",
    ]
  }
}

resource "aws_iam_role_policy" "cache_invalidator" {
  name   = "${var.project_name}-cache-invalidator-policy-${var.environment}"
  role   = aws_iam_role.cache_invalidator.id
  policy = data.aws_iam_policy_document.cache_invalidator.json
}

# -----------------------------------------------------------------------------
# Stripe Webhook Lambda Role (stub for future)
# DynamoDB on orders + tenants, SSM, Logs
# -----------------------------------------------------------------------------
resource "aws_iam_role" "stripe_webhook" {
  name               = "${var.project_name}-stripe-webhook-${var.environment}"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json

  tags = var.tags
}

data "aws_iam_policy_document" "stripe_webhook" {
  statement {
    sid    = "DynamoDBOrders"
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
      "dynamodb:Query",
      "dynamodb:Scan",
    ]
    resources = [
      var.orders_table_arn,
      var.orders_vendor_slug_index_arn,
    ]
  }

  statement {
    sid    = "DynamoDBTenants"
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
      "dynamodb:Query",
      "dynamodb:Scan",
    ]
    resources = [
      var.tenants_table_arn,
      "${var.tenants_table_arn}/index/*",
    ]
  }

  statement {
    sid    = "SESSendEmail"
    effect = "Allow"
    actions = [
      "ses:SendEmail",
      "ses:SendRawEmail",
    ]
    resources = ["arn:aws:ses:${var.aws_region}:${var.aws_account_id}:identity/*"]
  }

  statement {
    sid    = "SSMGetParameter"
    effect = "Allow"
    actions = [
      "ssm:GetParameter",
      "ssm:GetParameters",
    ]
    resources = [local.ssm_parameter_arn_prefix]
  }

  statement {
    sid    = "CloudWatchLogs"
    effect = "Allow"
    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = [
      local.log_group_arn_prefix,
      "${local.log_group_arn_prefix}:*",
    ]
  }
}

resource "aws_iam_role_policy" "stripe_webhook" {
  name   = "${var.project_name}-stripe-webhook-policy-${var.environment}"
  role   = aws_iam_role.stripe_webhook.id
  policy = data.aws_iam_policy_document.stripe_webhook.json
}
