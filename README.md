# Dmercato

Multi-tenant marketplace and website platform for market vendors. Each vendor gets a page at `dmercato.com/{slug}` that functions as both their standalone website and their marketplace listing.

## Stack

- **Runtime:** TypeScript, Node.js 20.x (arm64 Lambda)
- **Infrastructure:** Terraform, AWS (Lambda, DynamoDB, API Gateway, CloudFront, S3, SES)
- **Frontend:** React + Vite (admin SPA)
- **Testing:** Jest with AWS SDK mocks

## Structure

```
packages/           # Application code
  shared/types/     # Shared TypeScript interfaces
  shared/db/        # DynamoDB client + helpers
  lambdas/renderer/ # SSR vendor pages
  lambdas/api/      # REST API handlers
  lambdas/auth/     # Magic link authentication
  lambdas/sitemap/  # Sitemap generation
  frontend/admin/   # Admin dashboard SPA
infra/              # Terraform modules + environments
```

## Development

```bash
npm install
npm test
npm run typecheck
```
