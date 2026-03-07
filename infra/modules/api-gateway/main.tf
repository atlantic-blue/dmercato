# -----------------------------------------------------------------------------
# HTTP API Gateway (v2)
# Catch-all proxy routing to the renderer Lambda
# -----------------------------------------------------------------------------
resource "aws_apigatewayv2_api" "renderer" {
  name          = "${var.project_name}-${var.environment}"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = ["*"]
    allow_methods = [
      "GET",
      "HEAD",
      "OPTIONS",
    ]
    allow_headers = [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
    ]
    max_age = 3600
  }

  tags = var.tags
}

# -----------------------------------------------------------------------------
# CloudWatch log group for API Gateway access logs
# -----------------------------------------------------------------------------
resource "aws_cloudwatch_log_group" "api_gateway" {
  name              = "/aws/apigateway/${var.project_name}-${var.environment}"
  retention_in_days = 30

  tags = var.tags
}

# -----------------------------------------------------------------------------
# Default stage with auto-deploy and access logging
# -----------------------------------------------------------------------------
resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.renderer.id
  name        = "$default"
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_gateway.arn
    format = jsonencode({
      requestId        = "$context.requestId"
      ip               = "$context.identity.sourceIp"
      requestTime      = "$context.requestTime"
      httpMethod       = "$context.httpMethod"
      routeKey         = "$context.routeKey"
      status           = "$context.status"
      protocol         = "$context.protocol"
      responseLength   = "$context.responseLength"
      integrationError = "$context.integrationErrorMessage"
    })
  }

  tags = var.tags
}

# -----------------------------------------------------------------------------
# Lambda proxy integration for the renderer
# -----------------------------------------------------------------------------
resource "aws_apigatewayv2_integration" "renderer" {
  api_id                 = aws_apigatewayv2_api.renderer.id
  integration_type       = "AWS_PROXY"
  integration_uri        = var.renderer_invoke_arn
  integration_method     = "POST"
  payload_format_version = "2.0"
}

# -----------------------------------------------------------------------------
# Routes: root GET / and catch-all GET /{proxy+}
# -----------------------------------------------------------------------------
resource "aws_apigatewayv2_route" "root" {
  api_id    = aws_apigatewayv2_api.renderer.id
  route_key = "GET /"
  target    = "integrations/${aws_apigatewayv2_integration.renderer.id}"
}

resource "aws_apigatewayv2_route" "proxy" {
  api_id    = aws_apigatewayv2_api.renderer.id
  route_key = "GET /{proxy+}"
  target    = "integrations/${aws_apigatewayv2_integration.renderer.id}"
}

# -----------------------------------------------------------------------------
# Lambda permission: allow API Gateway to invoke the renderer
# -----------------------------------------------------------------------------
resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.renderer_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.renderer.execution_arn}/*/*"
}
