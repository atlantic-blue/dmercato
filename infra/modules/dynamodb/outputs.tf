output "tenants_table_name" {
  description = "Name of the tenants DynamoDB table"
  value       = aws_dynamodb_table.tenants.name
}

output "tenants_table_arn" {
  description = "ARN of the tenants DynamoDB table"
  value       = aws_dynamodb_table.tenants.arn
}

output "tenants_city_index_arn" {
  description = "ARN of the tenants city-index GSI"
  value       = "${aws_dynamodb_table.tenants.arn}/index/city-index"
}

output "tenants_domain_status_index_arn" {
  description = "ARN of the tenants domainStatus-index GSI"
  value       = "${aws_dynamodb_table.tenants.arn}/index/domainStatus-index"
}

output "quote_requests_table_name" {
  description = "Name of the quoteRequests DynamoDB table"
  value       = aws_dynamodb_table.quote_requests.name
}

output "quote_requests_table_arn" {
  description = "ARN of the quoteRequests DynamoDB table"
  value       = aws_dynamodb_table.quote_requests.arn
}

output "quote_requests_vendor_slug_index_arn" {
  description = "ARN of the quoteRequests vendorSlug-createdAt-index GSI"
  value       = "${aws_dynamodb_table.quote_requests.arn}/index/vendorSlug-createdAt-index"
}

output "orders_table_name" {
  description = "Name of the orders DynamoDB table"
  value       = aws_dynamodb_table.orders.name
}

output "orders_table_arn" {
  description = "ARN of the orders DynamoDB table"
  value       = aws_dynamodb_table.orders.arn
}

output "orders_vendor_slug_index_arn" {
  description = "ARN of the orders vendorSlug-createdAt-index GSI"
  value       = "${aws_dynamodb_table.orders.arn}/index/vendorSlug-createdAt-index"
}

output "sessions_table_name" {
  description = "Name of the sessions DynamoDB table"
  value       = aws_dynamodb_table.sessions.name
}

output "sessions_table_arn" {
  description = "ARN of the sessions DynamoDB table"
  value       = aws_dynamodb_table.sessions.arn
}

output "magic_links_table_name" {
  description = "Name of the magicLinks DynamoDB table"
  value       = aws_dynamodb_table.magic_links.name
}

output "magic_links_table_arn" {
  description = "ARN of the magicLinks DynamoDB table"
  value       = aws_dynamodb_table.magic_links.arn
}
