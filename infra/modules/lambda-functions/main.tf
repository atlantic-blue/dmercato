locals {
  renderer_function_name = "${var.project_name}-renderer-${var.environment}"
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
      TENANTS_TABLE = var.tenants_table_name
      BASE_URL      = var.base_url
    }
  }

  tags = var.tags
}

# -----------------------------------------------------------------------------
# CloudWatch Log Group for Renderer
# Explicit log group with 14-day retention
# -----------------------------------------------------------------------------
resource "aws_cloudwatch_log_group" "renderer" {
  name              = "/aws/lambda/${local.renderer_function_name}"
  retention_in_days = 14

  tags = var.tags
}
