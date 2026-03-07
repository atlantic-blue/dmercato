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

output "api_function_name" {
  description = "Name of the API Lambda function"
  value       = aws_lambda_function.api.function_name
}

output "api_function_arn" {
  description = "ARN of the API Lambda function"
  value       = aws_lambda_function.api.arn
}

output "api_invoke_arn" {
  description = "Invoke ARN of the API Lambda function"
  value       = aws_lambda_function.api.invoke_arn
}

output "stripe_webhook_function_name" {
  description = "Name of the Stripe webhook Lambda function"
  value       = aws_lambda_function.stripe_webhook.function_name
}

output "stripe_webhook_function_arn" {
  description = "ARN of the Stripe webhook Lambda function"
  value       = aws_lambda_function.stripe_webhook.arn
}

output "stripe_webhook_invoke_arn" {
  description = "Invoke ARN of the Stripe webhook Lambda function"
  value       = aws_lambda_function.stripe_webhook.invoke_arn
}
