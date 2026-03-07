locals {
  deletion_protection = var.environment == "prod"
}

# -----------------------------------------------------------------------------
# Tenants table
# PK: vendorSlug (S), PITR enabled
# GSIs: city-index, domainStatus-index
# -----------------------------------------------------------------------------
resource "aws_dynamodb_table" "tenants" {
  name         = "${var.project_name}-tenants-${var.environment}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "vendorSlug"

  deletion_protection_enabled = local.deletion_protection

  attribute {
    name = "vendorSlug"
    type = "S"
  }

  attribute {
    name = "city"
    type = "S"
  }

  attribute {
    name = "domainStatus"
    type = "S"
  }

  global_secondary_index {
    name            = "city-index"
    hash_key        = "city"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "domainStatus-index"
    hash_key        = "domainStatus"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = var.tags
}

# -----------------------------------------------------------------------------
# Quote Requests table
# PK: requestId (S)
# GSI: vendorSlug-createdAt-index (PK: vendorSlug, SK: createdAt)
# -----------------------------------------------------------------------------
resource "aws_dynamodb_table" "quote_requests" {
  name         = "${var.project_name}-quoteRequests-${var.environment}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "requestId"

  deletion_protection_enabled = local.deletion_protection

  attribute {
    name = "requestId"
    type = "S"
  }

  attribute {
    name = "vendorSlug"
    type = "S"
  }

  attribute {
    name = "createdAt"
    type = "S"
  }

  global_secondary_index {
    name            = "vendorSlug-createdAt-index"
    hash_key        = "vendorSlug"
    range_key       = "createdAt"
    projection_type = "ALL"
  }

  tags = var.tags
}

# -----------------------------------------------------------------------------
# Orders table
# PK: orderId (S)
# GSI: vendorSlug-createdAt-index (PK: vendorSlug, SK: createdAt)
# -----------------------------------------------------------------------------
resource "aws_dynamodb_table" "orders" {
  name         = "${var.project_name}-orders-${var.environment}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "orderId"

  deletion_protection_enabled = local.deletion_protection

  attribute {
    name = "orderId"
    type = "S"
  }

  attribute {
    name = "vendorSlug"
    type = "S"
  }

  attribute {
    name = "createdAt"
    type = "S"
  }

  global_secondary_index {
    name            = "vendorSlug-createdAt-index"
    hash_key        = "vendorSlug"
    range_key       = "createdAt"
    projection_type = "ALL"
  }

  tags = var.tags
}

# -----------------------------------------------------------------------------
# Sessions table
# PK: token (S), TTL on expiresAt
# -----------------------------------------------------------------------------
resource "aws_dynamodb_table" "sessions" {
  name         = "${var.project_name}-sessions-${var.environment}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "token"

  deletion_protection_enabled = local.deletion_protection

  attribute {
    name = "token"
    type = "S"
  }

  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  tags = var.tags
}

# -----------------------------------------------------------------------------
# Magic Links table
# PK: token (S), TTL on expiresAt
# -----------------------------------------------------------------------------
resource "aws_dynamodb_table" "magic_links" {
  name         = "${var.project_name}-magicLinks-${var.environment}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "token"

  deletion_protection_enabled = local.deletion_protection

  attribute {
    name = "token"
    type = "S"
  }

  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  tags = var.tags
}

# -----------------------------------------------------------------------------
# SSM Parameters for table names
# -----------------------------------------------------------------------------
resource "aws_ssm_parameter" "table_names" {
  for_each = {
    tenants        = aws_dynamodb_table.tenants.name
    quote_requests = aws_dynamodb_table.quote_requests.name
    orders         = aws_dynamodb_table.orders.name
    sessions       = aws_dynamodb_table.sessions.name
    magic_links    = aws_dynamodb_table.magic_links.name
  }

  name  = "/${var.project_name}/${var.environment}/dynamodb/${each.key}/table-name"
  type  = "String"
  value = each.value

  tags = var.tags
}
