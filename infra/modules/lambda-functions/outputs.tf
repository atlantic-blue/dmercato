output "renderer_function_name" {
  description = "Name of the renderer Lambda function"
  value       = aws_lambda_function.renderer.function_name
}

output "renderer_function_arn" {
  description = "ARN of the renderer Lambda function"
  value       = aws_lambda_function.renderer.arn
}

output "renderer_invoke_arn" {
  description = "Invoke ARN of the renderer Lambda function (for API Gateway integration)"
  value       = aws_lambda_function.renderer.invoke_arn
}
