#!/usr/bin/env bash
set -euo pipefail

# Bootstrap Terraform remote state backend
# Creates S3 bucket + DynamoDB lock table that Terraform itself cannot manage

PROJECT="dmercato"
REGION="us-east-1"
ENV="${1:-staging}"

STATE_BUCKET="${PROJECT}-terraform-state-${ENV}"
LOCK_TABLE="${PROJECT}-terraform-locks-${ENV}"

echo "Bootstrapping Terraform backend for ${ENV}..."
echo "  State bucket: ${STATE_BUCKET}"
echo "  Lock table:   ${LOCK_TABLE}"
echo "  Region:       ${REGION}"
echo ""

# Create S3 bucket for state
if aws s3api head-bucket --bucket "${STATE_BUCKET}" 2>/dev/null; then
  echo "State bucket already exists: ${STATE_BUCKET}"
else
  echo "Creating state bucket: ${STATE_BUCKET}"
  if [ "${REGION}" = "us-east-1" ]; then
    aws s3api create-bucket \
      --bucket "${STATE_BUCKET}" \
      --region "${REGION}"
  else
    aws s3api create-bucket \
      --bucket "${STATE_BUCKET}" \
      --region "${REGION}" \
      --create-bucket-configuration LocationConstraint="${REGION}"
  fi

  aws s3api put-bucket-versioning \
    --bucket "${STATE_BUCKET}" \
    --versioning-configuration Status=Enabled

  aws s3api put-bucket-encryption \
    --bucket "${STATE_BUCKET}" \
    --server-side-encryption-configuration '{
      "Rules": [{"ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"}}]
    }'

  aws s3api put-public-access-block \
    --bucket "${STATE_BUCKET}" \
    --public-access-block-configuration \
      BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

  aws s3api put-bucket-tagging \
    --bucket "${STATE_BUCKET}" \
    --tagging "TagSet=[{Key=Project,Value=${PROJECT}},{Key=Environment,Value=${ENV}},{Key=ManagedBy,Value=bootstrap}]"

  echo "State bucket created."
fi

# Create DynamoDB table for locking
if aws dynamodb describe-table --table-name "${LOCK_TABLE}" --region "${REGION}" >/dev/null 2>&1; then
  echo "Lock table already exists: ${LOCK_TABLE}"
else
  echo "Creating lock table: ${LOCK_TABLE}"
  aws dynamodb create-table \
    --table-name "${LOCK_TABLE}" \
    --attribute-definitions AttributeName=LockID,AttributeType=S \
    --key-schema AttributeName=LockID,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    --region "${REGION}" \
    --tags Key=Project,Value="${PROJECT}" Key=Environment,Value="${ENV}" Key=ManagedBy,Value=bootstrap

  aws dynamodb wait table-exists --table-name "${LOCK_TABLE}" --region "${REGION}"
  echo "Lock table created."
fi

echo ""
echo "Bootstrap complete for ${ENV}. You can now run:"
echo "  make tf-init ENV=${ENV}"
