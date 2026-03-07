# -----------------------------------------------------------------------------
# Assets bucket
# Versioning enabled, CORS for presigned uploads
# -----------------------------------------------------------------------------
resource "aws_s3_bucket" "assets" {
  bucket = "${var.project_name}-assets-${var.environment}"

  tags = var.tags
}

resource "aws_s3_bucket_versioning" "assets" {
  bucket = aws_s3_bucket.assets.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_public_access_block" "assets" {
  bucket = aws_s3_bucket.assets.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_cors_configuration" "assets" {
  bucket = aws_s3_bucket.assets.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["PUT"]
    allowed_origins = ["https://dmercato.com", "https://*.dmercato.com"]
    max_age_seconds = 3600
  }
}

# -----------------------------------------------------------------------------
# Admin bucket
# No versioning
# -----------------------------------------------------------------------------
resource "aws_s3_bucket" "admin" {
  bucket = "${var.project_name}-admin-${var.environment}"

  tags = var.tags
}

resource "aws_s3_bucket_public_access_block" "admin" {
  bucket = aws_s3_bucket.admin.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# -----------------------------------------------------------------------------
# Sitemaps bucket
# No versioning
# -----------------------------------------------------------------------------
resource "aws_s3_bucket" "sitemaps" {
  bucket = "${var.project_name}-sitemaps-${var.environment}"

  tags = var.tags
}

resource "aws_s3_bucket_public_access_block" "sitemaps" {
  bucket = aws_s3_bucket.sitemaps.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# -----------------------------------------------------------------------------
# SSM Parameters for bucket names
# -----------------------------------------------------------------------------
resource "aws_ssm_parameter" "bucket_names" {
  for_each = {
    assets   = aws_s3_bucket.assets.id
    admin    = aws_s3_bucket.admin.id
    sitemaps = aws_s3_bucket.sitemaps.id
  }

  name  = "/${var.project_name}/${var.environment}/s3/${each.key}/bucket-name"
  type  = "String"
  value = each.value

  tags = var.tags
}
