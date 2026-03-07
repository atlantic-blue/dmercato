# Dmercato — Multi-tenant marketplace platform
# Usage: make <target> [ENV=staging|prod]

ENV ?= staging
AWS_REGION ?= us-east-1
PROJECT ?= dmercato
DOMAIN_NAME ?= __unset__

TF_DOMAIN_FLAG := $(if $(filter __unset__,$(DOMAIN_NAME)),,$(TF_DOMAIN_FLAG))

TF_DIR := infra/environments/$(ENV)
IS_CI := $(CI)

define guard-prod
	@if [ "$(ENV)" = "prod" ] && [ -z "$(IS_CI)" ]; then \
		echo "ERROR: Production changes must go through CI. Push to main instead."; \
		exit 1; \
	fi
endef

# ─── Prerequisites ────────────────────────────────────────────────────────────

.PHONY: check-tools
check-tools:
	@command -v aws >/dev/null 2>&1 || { echo "aws CLI not found. Install: https://aws.amazon.com/cli/"; exit 1; }
	@command -v terraform >/dev/null 2>&1 || { echo "terraform not found. Install: https://developer.hashicorp.com/terraform/install"; exit 1; }
	@command -v node >/dev/null 2>&1 || { echo "node not found. Install Node 20+"; exit 1; }
	@echo "All tools available."

# ─── Bootstrap ────────────────────────────────────────────────────────────────

.PHONY: bootstrap
bootstrap: check-tools ## Create Terraform state backend (S3 + DynamoDB lock table)
	@bash scripts/bootstrap-terraform.sh $(ENV)

.PHONY: bootstrap-all
bootstrap-all: ## Bootstrap both staging and prod backends
	@bash scripts/bootstrap-terraform.sh staging
	@bash scripts/bootstrap-terraform.sh prod

# ─── Terraform ────────────────────────────────────────────────────────────────

.PHONY: tf-init
tf-init: ## Terraform init for ENV
	cd $(TF_DIR) && terraform init

.PHONY: tf-validate
tf-validate: tf-init ## Terraform validate for ENV
	cd $(TF_DIR) && terraform validate

.PHONY: tf-plan
tf-plan: tf-init ## Terraform plan for ENV
	cd $(TF_DIR) && terraform plan \
		-var="environment=$(ENV)" \
		-var="project_name=$(PROJECT)" \
		-var="aws_region=$(AWS_REGION)" \
		$(TF_DOMAIN_FLAG)

.PHONY: tf-apply
tf-apply: tf-init ## Terraform apply for ENV (blocked for prod outside CI)
	$(guard-prod)
	cd $(TF_DIR) && terraform apply -auto-approve \
		-var="environment=$(ENV)" \
		-var="project_name=$(PROJECT)" \
		-var="aws_region=$(AWS_REGION)" \
		$(TF_DOMAIN_FLAG)

.PHONY: tf-output
tf-output: ## Show Terraform outputs for ENV
	cd $(TF_DIR) && terraform output

.PHONY: tf-destroy
tf-destroy: ## Terraform destroy for ENV (blocked for prod outside CI)
	$(guard-prod)
	cd $(TF_DIR) && terraform destroy \
		-var="environment=$(ENV)" \
		-var="project_name=$(PROJECT)" \
		-var="aws_region=$(AWS_REGION)" \
		$(TF_DOMAIN_FLAG)

# ─── Application ──────────────────────────────────────────────────────────────

.PHONY: install
install: ## Install npm dependencies
	npm install

.PHONY: typecheck
typecheck: ## Run TypeScript type checking
	npm run typecheck

.PHONY: lint
lint: ## Run ESLint
	npm run lint

.PHONY: test
test: ## Run all tests
	npm test

.PHONY: test-coverage
test-coverage: ## Run tests with coverage
	npm run test:coverage

.PHONY: build
build: ## Build all packages
	npm run build

# ─── Build & Deploy ──────────────────────────────────────────────────────────

.PHONY: build-lambdas
build-lambdas: ## Bundle Lambda functions into dist/
	@bash scripts/build-lambdas.sh

.PHONY: deploy-lambda
deploy-lambda: build-lambdas ## Build and update renderer Lambda code
	$(guard-prod)
	aws lambda update-function-code \
		--function-name $(PROJECT)-renderer-$(ENV) \
		--zip-file fileb://dist/renderer.zip \
		--region $(AWS_REGION) \
		--no-cli-pager
	@echo "Lambda code deployed to $(PROJECT)-renderer-$(ENV)"

.PHONY: seed
seed: ## Seed Sweet Sin fixture data into DynamoDB
	TENANTS_TABLE=$(PROJECT)-tenants-$(ENV) AWS_REGION=$(AWS_REGION) npx ts-node scripts/seed-tenant.ts

# ─── Full Workflows ──────────────────────────────────────────────────────────

.PHONY: setup
setup: install bootstrap tf-apply ## Full first-time setup: install + bootstrap + deploy infra

.PHONY: deploy-infra
deploy-infra: tf-plan tf-apply ## Plan and apply Terraform for ENV

.PHONY: deploy
deploy: build-lambdas deploy-infra deploy-lambda ## Full deploy: build + infra + Lambda code

.PHONY: ci
ci: install typecheck lint test ## CI pipeline: install, typecheck, lint, test

# ─── Help ─────────────────────────────────────────────────────────────────────

.PHONY: help
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
