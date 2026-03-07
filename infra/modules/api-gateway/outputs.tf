output "api_id" {
  description = "ID of the HTTP API Gateway"
  value       = aws_apigatewayv2_api.renderer.id
}

output "api_endpoint" {
  description = "Invoke URL of the HTTP API Gateway"
  value       = aws_apigatewayv2_api.renderer.api_endpoint
}

output "stage_id" {
  description = "ID of the default stage"
  value       = aws_apigatewayv2_stage.default.id
}
