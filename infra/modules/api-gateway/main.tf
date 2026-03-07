# -----------------------------------------------------------------------------
# HTTP API Gateway (v2)
# Routes: GET/* -> renderer, POST /api/* -> API Lambda, POST /api/stripe/* -> webhook
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
      "POST",
    ]
    allow_headers = [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Stripe-Signature",
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
# Integration: Renderer Lambda (GET pages)
# -----------------------------------------------------------------------------
resource "aws_apigatewayv2_integration" "renderer" {
  api_id                 = aws_apigatewayv2_api.renderer.id
  integration_type       = "AWS_PROXY"
  integration_uri        = var.renderer_invoke_arn
  integration_method     = "POST"
  payload_format_version = "2.0"
}

# -----------------------------------------------------------------------------
# Integration: API Lambda (checkout, quotes, vendor updates)
# -----------------------------------------------------------------------------
resource "aws_apigatewayv2_integration" "api" {
  api_id                 = aws_apigatewayv2_api.renderer.id
  integration_type       = "AWS_PROXY"
  integration_uri        = var.api_invoke_arn
  integration_method     = "POST"
  payload_format_version = "1.0"
}

# -----------------------------------------------------------------------------
# Integration: Stripe Webhook Lambda
# -----------------------------------------------------------------------------
resource "aws_apigatewayv2_integration" "stripe_webhook" {
  api_id                 = aws_apigatewayv2_api.renderer.id
  integration_type       = "AWS_PROXY"
  integration_uri        = var.stripe_webhook_invoke_arn
  integration_method     = "POST"
  payload_format_version = "1.0"
}

# -----------------------------------------------------------------------------
# Routes: Renderer (GET)
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
# Routes: API Lambda (POST)
# -----------------------------------------------------------------------------
resource "aws_apigatewayv2_route" "checkout" {
  api_id    = aws_apigatewayv2_api.renderer.id
  route_key = "POST /api/checkout/sessions"
  target    = "integrations/${aws_apigatewayv2_integration.api.id}"
}

# -----------------------------------------------------------------------------
# Routes: Stripe Webhook (POST)
# -----------------------------------------------------------------------------
resource "aws_apigatewayv2_route" "stripe_webhook" {
  api_id    = aws_apigatewayv2_api.renderer.id
  route_key = "POST /api/stripe/webhook"
  target    = "integrations/${aws_apigatewayv2_integration.stripe_webhook.id}"
}

# -----------------------------------------------------------------------------
# Lambda permissions: allow API Gateway to invoke each Lambda
# -----------------------------------------------------------------------------
resource "aws_lambda_permission" "api_gateway_renderer" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.renderer_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.renderer.execution_arn}/*/*"
}

resource "aws_lambda_permission" "api_gateway_api" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.api_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.renderer.execution_arn}/*/*"
}

resource "aws_lambda_permission" "api_gateway_stripe_webhook" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.stripe_webhook_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.renderer.execution_arn}/*/*"
}
