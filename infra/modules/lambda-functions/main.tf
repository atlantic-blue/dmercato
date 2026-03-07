locals {
  renderer_function_name       = "${var.project_name}-renderer-${var.environment}"
  api_function_name            = "${var.project_name}-api-${var.environment}"
  stripe_webhook_function_name = "${var.project_name}-stripe-webhook-${var.environment}"
}

# -----------------------------------------------------------------------------
# Renderer Lambda Function
# Server-side renders tenant storefronts
# Runtime: Node.js 20.x on ARM64, 256 MB, 10s timeout
# -----------------------------------------------------------------------------
resource "aws_lambda_function" "renderer" {
  function_name = local.renderer_function_name
  role          = var.renderer_role_arn

  runtime       = "nodejs20.x"
  architectures = ["arm64"]
  handler       = "index.handler"
  memory_size   = 256
  timeout       = 10

  filename         = "${path.module}/../../../dist/renderer.zip"
  source_code_hash = filebase64sha256("${path.module}/../../../dist/renderer.zip")

  environment {
    variables = {
      TENANTS_TABLE          = var.tenants_table_name
      BASE_URL               = var.base_url
      STRIPE_PUBLISHABLE_KEY = var.stripe_publishable_key
    }
  }

  tags = var.tags
}

resource "aws_cloudwatch_log_group" "renderer" {
  name              = "/aws/lambda/${local.renderer_function_name}"
  retention_in_days = 14
  tags              = var.tags
}

# -----------------------------------------------------------------------------
# API Lambda Function
# Handles checkout sessions, quote requests, vendor updates
# Runtime: Node.js 20.x on ARM64, 256 MB, 30s timeout
# -----------------------------------------------------------------------------
resource "aws_lambda_function" "api" {
  function_name = local.api_function_name
  role          = var.api_role_arn

  runtime       = "nodejs20.x"
  architectures = ["arm64"]
  handler       = "index.handler"
  memory_size   = 256
  timeout       = 30

  filename         = "${path.module}/../../../dist/api.zip"
  source_code_hash = filebase64sha256("${path.module}/../../../dist/api.zip")

  environment {
    variables = {
      TENANTS_TABLE        = var.tenants_table_name
      ORDERS_TABLE         = var.orders_table_name
      STRIPE_SECRET_KEY    = var.stripe_secret_key
      PLATFORM_FEE_PERCENT = var.platform_fee_percent
      BASE_URL             = var.base_url
      AWS_SES_REGION       = "us-east-1"
    }
  }

  tags = var.tags
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/lambda/${local.api_function_name}"
  retention_in_days = 14
  tags              = var.tags
}

# -----------------------------------------------------------------------------
# Stripe Webhook Lambda Function
# Handles Stripe webhook events (checkout.session.completed, account.updated)
# Runtime: Node.js 20.x on ARM64, 256 MB, 30s timeout
# -----------------------------------------------------------------------------
resource "aws_lambda_function" "stripe_webhook" {
  function_name = local.stripe_webhook_function_name
  role          = var.stripe_webhook_role_arn

  runtime       = "nodejs20.x"
  architectures = ["arm64"]
  handler       = "index.handler"
  memory_size   = 256
  timeout       = 30

  filename         = "${path.module}/../../../dist/stripe-webhook.zip"
  source_code_hash = filebase64sha256("${path.module}/../../../dist/stripe-webhook.zip")

  environment {
    variables = {
      TENANTS_TABLE          = var.tenants_table_name
      ORDERS_TABLE           = var.orders_table_name
      STRIPE_SECRET_KEY      = var.stripe_secret_key
      STRIPE_WEBHOOK_SECRET  = var.stripe_webhook_secret
      SES_FROM_ADDRESS       = "noreply@dmercato.com"
      BASE_URL               = var.base_url
      AWS_SES_REGION         = "us-east-1"
    }
  }

  tags = var.tags
}

resource "aws_cloudwatch_log_group" "stripe_webhook" {
  name              = "/aws/lambda/${local.stripe_webhook_function_name}"
  retention_in_days = 14
  tags              = var.tags
}
