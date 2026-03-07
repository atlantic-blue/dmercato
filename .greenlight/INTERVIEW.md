# Project Interview

## Value Proposition
Multi-tenant marketplace and website platform for market vendors — each vendor gets a page at dmercato.com/{slug} that functions as both their standalone website and marketplace listing. A Linktree replacement that actually does something: full site with shop, market calendar, quote form, and Google indexing for £8/month (or £6/month annual) with custom domain included.

## Users
Market vendors, pop-up stalls, and artisan sellers. First vendor: Oscar (Sweet Sin — cookie dough & fresas con crema, Adelaide, Australia).

## MVP Scope
1. **View vendor page** — SSR at dmercato.com/{slug} with full SEO (meta tags, JSON-LD, canonical), inline CSS, market calendar, product gallery, quote form, "More in {city}" section
2. **Submit quote request** — form on vendor page with email notification to vendor via SES
3. **Vendor logs in** — magic link auth (no passwords), session cookie, 30-day TTL
4. **Vendor manages page** — profile, products, market dates, photos (presigned S3 upload), social links, categories, city
5. **Vendor views quote requests** — list with read/unread, sort, expand details

Validation gate: Do not build past V2 without 5 vendors active, 1 real enquiry, 1 market organiser referral. 60-day deadline from V1 launch.

## Stack
- **Runtime:** Node.js 20.x (TypeScript), arm64 Lambda
- **Infrastructure:** Terraform (no CDK/SAM/Pulumi)
- **Database:** DynamoDB (5 tables: tenants, orders, quoteRequests, sessions, magicLinks)
- **Compute:** AWS Lambda (serverless-first)
- **CDN:** CloudFront (S3 origins + Lambda origins)
- **API:** API Gateway HTTP API
- **Email:** SES (transactional)
- **Payments:** Stripe Connect (V4, deferred)
- **Domains:** Route53 Domains API + ACM + Step Functions (V5, deferred)
- **Frontend:** React + Vite (admin SPA)
- **Testing:** Jest with AWS SDK mocks
- **Monorepo:** packages/ for code, infra/ for Terraform

## Constraints
- AWS only — no Vercel, Railway, or managed platforms
- TypeScript everywhere — Lambda handlers, frontend, tooling, scripts
- Terraform for all IaC
- Serverless-first — no EC2, no ECS, no containers
- No ORMs, no GraphQL, no AppSync
- All secrets in SSM Parameter Store — never in code or Terraform state
- TDD-first via Greenlight
- Monorepo with packages/ and infra/
- Each Lambda gets its own IAM role with least-privilege policies
- No external stylesheets or JS required for initial vendor page render (inline CSS)

## Deferred Ideas
- **V3 — Marketplace:** Homepage, city/category pages, search (post-validation)
- **V4 — Checkout:** Stripe Connect payments, orders (post-validation)
- **V5 — Domain provisioning:** Custom domains via Route53, Step Functions state machine, Lambda@Edge routing (post-validation)
- Photo resize post-processor (S3 event trigger)
- OpenSearch for search at scale (thousands of vendors)
- In-app messaging for quote responses
- Vendor analytics dashboard
- Multiple marketplace regions/languages

## Design Assets
Existing designs in `designs/` folder:
- `logo/dmercato-logo-preview.html` — Logo design
- `vendor_profile_sweet_sin/` — Vendor page design (HTML + screenshot)
- `marketplace_homepage/` — Homepage design (HTML + screenshot)
- `city_marketplace_adelaide/` — City page design (HTML + screenshot)
- `vendor_dashboard_profile/` — Admin dashboard profile tab (HTML + screenshot)
- `vendor_dashboard_market_calendar/` — Admin dashboard calendar tab (HTML + screenshot)

## Data Model Summary
- **tenants** — PK: vendorSlug, GSIs: city-index, domainStatus-index
- **orders** — PK: orderId, GSI: vendorSlug-createdAt-index
- **quoteRequests** — PK: requestId, GSI: vendorSlug-createdAt-index
- **sessions** — PK: token, TTL: expiresAt (30 days)
- **magicLinks** — PK: token, TTL: expiresAt (15 min)
