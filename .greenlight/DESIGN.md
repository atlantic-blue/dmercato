# System Design: Dmercato

## Requirements

### Functional

**FR-1: View vendor page with product catalogue**
- User navigates to `dmercato.com/{slug}` and receives a fully server-side rendered HTML page
- Page includes: hero section (split layout with vendor name/tagline left, primary photo right), story section, product catalogue (4-column grid with prices and add-to-cart buttons), market calendar with upcoming dates, operational hours/schedule, delivery and takeout availability info, quote request form, "More in {city}" section
- Products display name, description, price (formatted with currency symbol), and availability status
- Add-to-cart button on each available product. Cart state is managed client-side (localStorage). Cart summary/drawer shows selected items, quantities, subtotal
- Delivery/takeout options shown based on vendor settings: if delivery is enabled, delivery fee is displayed; available fulfilment methods are visible before checkout
- HTML is self-contained: inline CSS, minimal inline JS for cart functionality only
- SEO metadata is complete: `<title>`, `<meta description>`, Open Graph tags, canonical URL, JSON-LD (LocalBusiness + Product schemas with prices)
- CloudFront caches rendered pages for 60 seconds
- If vendor slug does not exist, return 404 with a styled error page
- Page is fully responsive (mobile bottom nav, stacked layouts on small screens)

**FR-2: Purchase products (checkout)**
- Customer builds a cart on the vendor page (client-side, localStorage)
- Customer clicks checkout, provides: name (required), email (required), phone (optional), delivery notes (optional)
- Customer selects fulfilment method: takeout or delivery (if vendor offers both). If delivery, vendor-set delivery fee is added to total
- Customer selects a delivery/pickup date and time slot from the vendor's operational schedule (only future dates/times where the vendor is marked as operational)
- System creates a Stripe Checkout Session via Stripe Connect (destination charge): full amount goes to vendor's connected account, platform fee is deducted as `application_fee_amount`
- Customer is redirected to Stripe-hosted checkout page for payment
- On successful payment, Stripe webhook fires: system creates an order record in DynamoDB with status "paid", items, customer info, delivery details, and Stripe payment intent ID
- System sends receipt email to customer via SES (order summary, items, total, delivery/pickup details)
- System sends order notification email to vendor via SES (items, quantities, customer name, delivery notes, requested date/time, total, payment status)
- Customer is redirected back to vendor page with a confirmation message
- If payment fails or is abandoned, no order is created
- Rate limited: max 10 checkout sessions per IP per hour

**FR-3: Submit quote request**
- User fills out a form on the vendor page: name (required), email (required), phone (optional), event type (select: corporate, birthday, wedding, market, other), guest count (optional), event date (optional), message (required)
- On submit, system creates a `quoteRequests` record with `read: false`
- System sends transactional email to vendor via SES with quote details
- User sees a confirmation message on the page
- Rate limited: max 5 quote requests per IP per hour
- Input validation: email format, message length (10-2000 chars), name length (1-200 chars)
- Quote requests are a SEPARATE business stream from orders -- they come from the enquiry form for custom events, not from product purchases

**FR-4: Vendor logs in**
- Vendor enters their email on the admin login page
- System looks up a tenant by email; if found, generates a magic link token (UUID), stores it in `magicLinks` table with 15-minute TTL, sends email via SES
- Vendor clicks link, system validates token (exists, not expired), creates session in `sessions` table (30-day TTL), sets HttpOnly/Secure/SameSite=Strict cookie, redirects to admin dashboard
- If token is expired or invalid, show "Link expired" with option to request a new one
- If email is not associated with any vendor, show generic "If an account exists, we sent a link" (no user enumeration)

**FR-5: Vendor manages page, products, and schedule**
- Authenticated vendor can edit their profile: name, tagline, story (max 500 chars), city, country, categories, social links (Instagram, TikTok, Facebook, website)
- Vendor can upload photos: primary photo and gallery photos via presigned S3 URLs. Upload flow: frontend requests presigned URL from API, frontend uploads directly to S3, frontend confirms upload with the asset key
- Vendor can manage products: add/edit/delete products (name, description, price in pence/cents, currency, image, available toggle, display order). Products are stored as a nested array in the tenant record
- Vendor can manage their operational schedule: set specific dates and time slots when they are operational (e.g., "Saturday 9:00-15:00", "Sunday 10:00-14:00"). This schedule determines which delivery/pickup date+time slots are available to customers during checkout. Schedule stored as nested array in tenant record
- Vendor can configure delivery settings: enable/disable delivery, set delivery fee (in pence/cents), enable/disable takeout
- All edits trigger CloudFront cache invalidation for `/{slug}` and `/sitemap*`
- Changes are immediately visible on next uncached page load (within 60 seconds due to cache TTL)

**FR-6: Vendor views and manages orders**
- Authenticated vendor sees a list of orders in admin, sorted by `createdAt` descending (newest first)
- Order list is paginated (20 per page, cursor-based pagination)
- Order list is filterable by status: all, paid, fulfilled, refunded
- Each order in the list shows: order ID (shortened), customer name, item count, total, status, date
- Vendor can click an order to see full detail: all items with quantities and prices, subtotal, delivery fee (if applicable), total, customer name, email, phone, delivery notes, requested date/time, fulfilment method (takeout/delivery), Stripe payment status
- Vendor can mark an order as "fulfilled" (PATCH status from "paid" to "fulfilled")
- Orders are a SEPARATE navigation item and admin view from quote requests

**FR-7: Vendor manages customers (CRM)**
- Authenticated vendor sees a customer list in admin, derived from orders
- Customer list shows: name, email, total amount spent, order count, last order date
- Customer list is sorted by total spent descending (best customers first)
- Customer list is paginated (20 per page, cursor-based)
- Vendor can click a customer to see their order history
- Vendor can send an email to a customer (simple text email via SES, from the vendor's notification address)

**FR-8: Vendor views and manages quote requests**
- Authenticated vendor sees a list of quote requests sorted by `createdAt` descending
- Each request shows: name, email, event type, date, guest count, message, read/unread status, timestamp
- Vendor can mark a request as read (PATCH `read: true`)
- Unread count shown in navigation
- Paginated: 20 per page, cursor-based pagination using DynamoDB `LastEvaluatedKey`
- Quote requests are a SEPARATE navigation item and admin view from orders

**FR-9: Vendor manages Stripe account**
- Vendor initiates Stripe Connect onboarding from admin dashboard
- System creates a Stripe Connect Express account (if not already created), generates an Account Link URL, redirects vendor to Stripe-hosted onboarding
- After onboarding, vendor is redirected back to admin dashboard. System checks account status (charges_enabled) and updates tenant record
- Vendor can access Stripe Express dashboard (login link) to manage payouts, view balance, update bank details
- If vendor has not completed Stripe onboarding, checkout is disabled on their public page (products are visible but "add to cart" is not functional)

**FR-10: Vendor manages market calendar**
- Vendor can add/edit/delete market dates from a dedicated calendar page in admin
- Each market date has: date (YYYY-MM-DD), market name, location, address
- Market dates are stored as nested array in tenant record (separate from operational schedule)
- Market calendar is a SEPARATE admin page from the operational schedule settings (which live in the profile/settings page)

### Non-Functional

| Requirement | Target | Rationale |
|-------------|--------|-----------|
| Page load (vendor page) | < 1.5s TTFB globally | CloudFront edge cache + Lambda SSR |
| Concurrent users | 50 at launch, 500 at 6 months | Serverless scales automatically |
| Availability | 99.5% (managed services SLA) | No custom HA infrastructure needed |
| Cold start (Lambda) | < 3s acceptable | arm64 + small bundles mitigate |
| API response time | < 500ms p95 | DynamoDB single-digit-ms reads |
| Checkout latency | < 2s to Stripe redirect | Single Stripe API call + DynamoDB write |
| Photo upload | < 10MB per image | S3 presigned URL with size constraint |
| SEO | Google indexable within 1 week | SSR + sitemap + JSON-LD |
| Email delivery | SES production access required | Sandbox limits to verified emails only |
| Stripe webhook | < 30s processing | Lambda timeout handles Stripe's retry window |
| Order email delivery | < 60s after payment confirmation | SES send triggered by webhook handler |

### Constraints

| Constraint | Detail |
|------------|--------|
| Cloud provider | AWS only. No Vercel, Railway, or managed platforms |
| Language | TypeScript everywhere (Lambda, frontend, tooling) |
| IaC | Terraform only. No CDK, SAM, or Pulumi |
| Compute model | Serverless-first (Lambda, API Gateway, DynamoDB, S3, SES) |
| No ORMs | Direct DynamoDB DocumentClient calls via shared `db` package |
| No GraphQL | REST API via API Gateway HTTP API |
| Secrets | SSM Parameter Store only. Never in code, env files, or TF state |
| Testing | TDD-first. Jest with AWS SDK mocks. Tests before implementation |
| Repository | Monorepo. `packages/` for code, `infra/` for Terraform |
| IAM | Each Lambda gets its own least-privilege IAM role |
| Vendor pages | No external CSS or JS required for initial render (inline CSS). Minimal inline JS for cart only |
| Budget | Free tier where possible. SES, DynamoDB on-demand, Lambda free tier. Stripe fees are pass-through |
| Team | Solo developer |
| Payment processor | Stripe Connect (Express accounts, destination charges) |

### Out of Scope

These are explicitly NOT part of the MVP (10-slice scope):

- **Marketplace homepage / city pages / category pages** (post-validation, needs vendor density)
- **Search** (DynamoDB scan is fine for < 100 vendors)
- **Custom domain provisioning** (Route53 + ACM + Step Functions, post-validation)
- **Photo resize post-processing** (S3 event trigger + Sharp Lambda, nice-to-have)
- **Vendor analytics dashboard** (CloudFront logs + aggregation, value-add)
- **In-app messaging** for quote responses (vendors use email for now)
- **Multiple regions / languages** (English only for launch)
- **Mobile native apps**
- **Vendor-to-vendor messaging**
- **Review / rating system**
- **Inventory management** (product availability toggle is sufficient for MVP)
- **Shipping / third-party delivery integration** (vendor handles their own delivery)
- **Subscription billing for vendors** (vendor platform fee model TBD post-validation)
- **Refund processing through admin** (vendor uses Stripe dashboard directly)
- **Multi-currency per vendor** (each vendor sets one currency)
- **Discount codes / coupons**
- **Customer accounts / login** (customers are identified by email per order, no accounts)

## Technical Decisions

| Decision | Chosen | Rejected | Rationale |
|----------|--------|----------|-----------|
| Database | DynamoDB (5 tables) | PostgreSQL (RDS), Aurora Serverless | Serverless-native, zero connection management, pay-per-request scales to zero, no VPC needed. Access patterns are simple key-value lookups and sparse GSI queries |
| Data modelling | Products, market dates, and operational schedule nested in tenant record | Separate tables for products/dates/schedule | Eliminates joins. A vendor page is a single GetItem. Product count is small (< 50 per vendor). Atomic updates via DynamoDB expressions |
| SSR approach | Lambda SSR on every request (cached 60s) | Static site generation (SSG), ISR | Vendor data changes need to reflect within 60 seconds. SSG would require a rebuild pipeline. Lambda + CloudFront cache gives SSR with CDN performance |
| Vendor page CSS | Inline CSS in HTML response | External stylesheet, CSS-in-JS, Tailwind | Zero render-blocking requests. Single HTTP response contains everything needed. Vendor pages are self-contained documents |
| Vendor page JS | Minimal inline JS for cart only | No JS, full React hydration | Cart requires client-side state (add/remove items, quantities, localStorage). Inline script keeps it self-contained. No framework needed for a cart drawer |
| Auth mechanism | Magic link (email) | Password-based, OAuth/social login | Target users are non-technical market vendors. No password to remember. Email is already verified. Simpler to implement and more secure than passwords |
| Session storage | DynamoDB with TTL | JWT (stateless), Redis | Revocable sessions (important for security). DynamoDB TTL auto-cleans expired sessions. No Redis infrastructure to manage. JWT refresh token complexity avoided |
| API style | REST via API Gateway HTTP API | GraphQL, gRPC, REST API (v1) | HTTP API is simpler and cheaper than REST API v1. No need for GraphQL complexity with predictable data shapes. Standard REST conventions understood by all tooling |
| Payment processor | Stripe Connect (Express, destination charges) | Stripe direct, PayPal, Square | Stripe Connect handles vendor onboarding, KYC, payouts. Express accounts mean Stripe-hosted onboarding (minimal UI to build). Destination charges let platform collect fee automatically |
| Stripe account type | Express | Standard, Custom | Express: Stripe-hosted onboarding (no custom KYC forms), Stripe-hosted dashboard for payouts. Least implementation burden. Custom would require building KYC UI. Standard gives too much vendor control over pricing |
| Charge type | Destination charges | Direct charges, separate charges and transfers | Destination charges: payment is created on platform, transferred to vendor. Platform fee via application_fee_amount. Simplest model for a marketplace. Single payment intent, automatic fee split |
| Checkout flow | Stripe Checkout (hosted) | Custom payment form, Stripe Elements | Stripe-hosted checkout page handles card input, 3D Secure, error handling, PCI compliance. Zero PCI scope for our platform. Fastest to implement. Proven conversion |
| Stripe webhook | Dedicated Lambda | Same API Lambda | Webhook handler has different auth (Stripe signature verification), different IAM needs, and must be idempotent. Separate Lambda keeps concerns isolated |
| Customer data model | Derived from orders (aggregated at query time) | Separate customers table | Customers are identified by email from order records. No customer accounts or login. Aggregation (total spent, order count) computed from order query. Avoids data sync issues between customer and order tables |
| Operational schedule | Nested in tenant record | Separate table, third-party calendar | Small data size (< 20 time slots per week). Always read with vendor data for page render. Same access pattern as products |
| Order notifications | SES transactional emails (receipt + vendor notification) | Push notifications, SMS, in-app | Email is the baseline. All customers have email (required for checkout). All vendors have email (used for login). SES is already in the stack. No additional service needed |
| Monorepo tooling | npm workspaces | Turborepo, Nx, Lerna, pnpm | npm workspaces is zero-dependency, built into Node.js. Project has < 10 packages. No need for advanced build caching or task orchestration at this scale |
| Testing framework | Jest | Vitest, Mocha, AVA | Mature ecosystem, excellent TypeScript support, built-in mocking. Well-documented patterns for mocking AWS SDK. Team familiarity |
| IaC | Terraform with modules | CDK, SAM, Pulumi, SST | Declarative, cloud-agnostic syntax. Explicit resource management. No abstraction layer hiding AWS details. State management is well-understood |
| Frontend framework | React + Vite (admin SPA) | Next.js, Remix, Astro | Admin dashboard is a private SPA, not SEO-critical. Vite for fast dev experience. React for ecosystem and component libraries. No SSR needed for admin |
| URL routing | Subdirectory (`dmercato.com/{slug}`) | Subdomain (`{slug}.dmercato.com`) | Simpler DNS (single A record). Better SEO (domain authority concentrates). No wildcard certificate needed. CloudFront single distribution. Easier to reason about |
| Cache strategy | CloudFront 60s vendor pages, 1yr assets, no-cache API | Longer cache with invalidation-on-write only | 60s balances freshness with performance. Invalidation-on-write as belt-and-suspenders. Assets are content-addressed (hashed filenames) so 1yr is safe |
| Email service | SES | SendGrid, Mailgun, Postmark | AWS-native, cheapest option, integrates with IAM. Sending transactional emails (magic links, quote notifications, order receipts, vendor notifications). No marketing email needs |
| Photo storage | S3 with presigned upload URLs | Direct upload through API, Cloudinary | Presigned URLs offload bandwidth from Lambda. S3 is cheapest storage. CloudFront serves photos at edge. No third-party dependency |
| Primary key strategy | UUID v4 for records, vendorSlug (string) for tenants | Auto-increment, ULID, nanoid | UUID is universally supported and collision-resistant. vendorSlug as PK for tenants enables direct URL-to-database lookup without an index |

## Architecture

### System Overview

Dmercato is a serverless multi-tenant platform running entirely on AWS with Stripe Connect for payments. The system has four main traffic paths:

1. **Public path:** Browser requests vendor pages via CloudFront. CloudFront either serves from cache or invokes the Renderer Lambda to produce SSR HTML (including product catalogue with cart UI). Static assets (photos, admin SPA) are served from S3 via CloudFront.

2. **API path:** The admin SPA, vendor page cart/checkout, and vendor page forms make API calls through CloudFront (`/api/*`) which routes to API Gateway HTTP API, which invokes the appropriate Lambda handler.

3. **Webhook path:** Stripe sends payment webhook events to a dedicated endpoint (`/api/stripe/webhook`). The Stripe Webhook Lambda validates the Stripe signature, processes the event, creates order records, and triggers email notifications.

4. **Background path:** Sitemap Lambda runs on a schedule (daily) to regenerate sitemap XML files in S3. Cache Invalidator Lambda is triggered by API writes to invalidate stale CloudFront paths.

### Component Breakdown

**CloudFront Distribution** (single distribution, `dmercato.com`)
- Origin 1: Renderer Lambda (default `/*`)
- Origin 2: API Gateway (`/api/*`)
- Origin 3: Admin SPA S3 bucket (`/admin/*`)
- Origin 4: Assets S3 bucket (`/assets/*`)
- Origin 5: Sitemaps S3 bucket (`/sitemap*`)
- Behaviours: cache policies per origin, HTTPS only, HTTP/2

**Renderer Lambda** (`packages/lambdas/renderer/`)
- Receives CloudFront requests for `/{slug}`
- Reads tenant from DynamoDB (single GetItem)
- Renders complete HTML with inline CSS, minimal inline JS (cart), SEO metadata, JSON-LD (including Product schema with prices)
- Product catalogue section: product cards with name, description, price, add-to-cart button (disabled if vendor has not completed Stripe onboarding)
- Cart drawer: item list, quantities, subtotal, delivery fee (if applicable), checkout button
- Returns HTML string with appropriate cache headers
- Memory: 1024MB, Timeout: 30s, arm64

**API Lambda** (`packages/lambdas/api/`)
- Single Lambda with internal routing by path + method
- Handlers: vendors, quote-requests, photos (presigned URLs), checkout, orders, customers, stripe-account
- Session validation via `withAuth()` middleware for protected routes
- Memory: 512MB, Timeout: 10s, arm64

**Auth Lambda** (`packages/lambdas/auth/`)
- POST `/api/auth/request` -- generate magic link, store token, send email
- GET `/api/auth/verify` -- validate token, create session, set cookie, redirect
- POST `/api/auth/logout` -- delete session, clear cookie
- Memory: 512MB, Timeout: 10s, arm64

**Stripe Webhook Lambda** (`packages/lambdas/stripe-webhook/`)
- POST `/api/stripe/webhook` -- receives Stripe webhook events
- Validates Stripe signature using webhook secret from SSM
- Handles `checkout.session.completed` event: creates order record in DynamoDB, sends receipt email to customer, sends notification email to vendor
- Handles `account.updated` event: updates tenant Stripe onboarding status
- Must be idempotent (Stripe retries failed deliveries)
- Memory: 512MB, Timeout: 30s, arm64

**Sitemap Lambda** (`packages/lambdas/sitemap/`)
- Scheduled (EventBridge, daily)
- Scans tenants table, generates sitemap XML files
- Writes to sitemaps S3 bucket
- Three files: sitemap-index.xml, sitemap-vendors.xml, sitemap-cities.xml
- Memory: 512MB, Timeout: 30s, arm64

**Cache Invalidator Lambda** (`packages/lambdas/cache-invalidator/`)
- Invoked programmatically by API Lambda after writes
- Creates CloudFront invalidation for affected paths
- Memory: 256MB, Timeout: 10s, arm64

**DynamoDB** (5 tables, all PAY_PER_REQUEST)
- tenants, orders, quoteRequests, sessions, magicLinks
- Point-in-time recovery on tenants and orders tables

**S3** (3 buckets per environment)
- `dmercato-assets-{env}` -- vendor photos (public via CloudFront, versioning enabled)
- `dmercato-admin-{env}` -- admin SPA build (private, CloudFront OAI)
- `dmercato-sitemaps-{env}` -- sitemap XML (public via CloudFront)

**SES**
- Verified domain: dmercato.com
- Sending identity: noreply@dmercato.com
- Templates: magic link email, quote request notification, order receipt (customer), order notification (vendor), customer email (vendor-initiated)

**SSM Parameter Store**
- All secrets and configuration: SES config, table names, bucket names, CloudFront distribution ID, Stripe secret key, Stripe webhook secret, platform fee percentage

**Stripe Connect**
- Platform account: dmercato (holds platform fee)
- Connected accounts: Express type (one per vendor)
- Destination charges: payment created on platform, transferred to vendor minus application_fee_amount
- Stripe Checkout Sessions: Stripe-hosted payment page (zero PCI scope)

### Architecture Diagram (text)

```
Browser
  |
  v
CloudFront (dmercato.com)
  |
  |-- /{slug}         --> Renderer Lambda --> DynamoDB (tenants)
  |-- /api/*          --> API Gateway HTTP API
  |                        |-- /api/vendors/*          --> API Lambda --> DynamoDB
  |                        |-- /api/quote-requests/*   --> API Lambda --> DynamoDB + SES
  |                        |-- /api/auth/*             --> Auth Lambda --> DynamoDB + SES
  |                        |-- /api/vendors/*/photos   --> API Lambda --> S3 (presign)
  |                        |-- /api/checkout/*         --> API Lambda --> Stripe + DynamoDB
  |                        |-- /api/orders/*           --> API Lambda --> DynamoDB
  |                        |-- /api/customers/*        --> API Lambda --> DynamoDB + SES
  |                        |-- /api/stripe/webhook     --> Stripe Webhook Lambda --> DynamoDB + SES
  |                        |-- /api/stripe/account/*   --> API Lambda --> Stripe + DynamoDB
  |-- /admin/*        --> S3 (admin SPA)
  |-- /assets/*       --> S3 (vendor photos)
  |-- /sitemap*       --> S3 (sitemaps)

Stripe --> /api/stripe/webhook (webhook events: checkout.session.completed, account.updated)

EventBridge (daily) --> Sitemap Lambda --> DynamoDB (scan) + S3 (write)

API Lambda (on write) --> Cache Invalidator Lambda --> CloudFront (invalidate)
```

## Data Model

### tenants

| Attribute | Type | Notes |
|-----------|------|-------|
| vendorSlug | S (PK) | URL-safe slug, e.g. "sweet-sin" |
| name | S | Display name |
| tagline | S | One-line description |
| story | S | Max 500 chars |
| city | S | Lowercase, e.g. "adelaide" |
| country | S | ISO 3166-1 alpha-2, e.g. "AU" |
| categories | L(S) | e.g. ["desserts", "catering"] |
| primaryPhotoKey | S | S3 object key |
| photoKeys | L(S) | Additional gallery photo S3 keys |
| socialLinks | M | instagram, tiktok, facebook, website (all optional) |
| products | L(M) | Nested Product objects |
| marketDates | L(M) | Nested MarketDate objects |
| operationalSchedule | L(M) | Nested OperationalSlot objects (days/times the vendor is operational) |
| deliveryEnabled | BOOL | Whether vendor offers delivery |
| deliveryFee | N | Delivery fee in pence/cents (integer). 0 if free delivery |
| takeoutEnabled | BOOL | Whether vendor offers takeout/pickup |
| email | S | Vendor contact / login email |
| stripeAccountId | S/NULL | Stripe Connect Express account ID |
| stripeOnboardingComplete | BOOL | Whether vendor has completed Stripe onboarding (charges_enabled) |
| customDomain | S/NULL | Custom domain (future) |
| domainStatus | S | "none" / "registering" / "provisioning" / "active" / "failed" |
| domainOperationId | S/NULL | Route53 operation (future) |
| domainCertificateArn | S/NULL | ACM cert (future) |
| plan | S | "active" / "cancelled" |
| createdAt | S | ISO 8601 |
| updatedAt | S | ISO 8601 |

**GSIs:**
- `city-index`: PK = city (for future city pages)
- `domainStatus-index`: PK = domainStatus (for domain provisioning monitoring, future)

**Nested: Product**

| Field | Type | Notes |
|-------|------|-------|
| id | S | UUID v4 |
| name | S | 1-200 chars |
| description | S | 0-1000 chars |
| price | N | In pence/cents (integer) |
| currency | S | "gbp" / "aud" / "usd" |
| imageKey | S | S3 object key |
| available | BOOL | |
| order | N | Display order (0-based) |

**Nested: MarketDate**

| Field | Type | Notes |
|-------|------|-------|
| id | S | UUID v4 |
| date | S | ISO date (YYYY-MM-DD) |
| marketName | S | |
| location | S | Venue / area name |
| address | S | Full address |

**Nested: OperationalSlot**

| Field | Type | Notes |
|-------|------|-------|
| id | S | UUID v4 |
| dayOfWeek | N | 0 (Sunday) - 6 (Saturday) |
| startTime | S | HH:MM (24h format), e.g. "09:00" |
| endTime | S | HH:MM (24h format), e.g. "15:00" |
| specificDate | S/NULL | Optional: override for a specific date (YYYY-MM-DD). When set, this slot applies only to this date, not the recurring day |

The operational schedule works as follows: recurring slots define the vendor's regular weekly schedule (e.g., "every Saturday 09:00-15:00"). Specific-date overrides allow the vendor to add one-off operational dates or mark a usually-operational day as closed (by not having a slot for that date). The checkout flow uses this schedule to present available date+time slots to the customer.

### orders

| Attribute | Type | Notes |
|-----------|------|-------|
| orderId | S (PK) | UUID v4 |
| vendorSlug | S | Links to tenant |
| customerName | S | Customer's name |
| customerEmail | S | Customer's email |
| customerPhone | S/NULL | Optional |
| items | L(M) | OrderItem objects |
| subtotal | N | In pence/cents (sum of items) |
| deliveryFee | N | In pence/cents (0 if takeout) |
| total | N | subtotal + deliveryFee |
| platformFee | N | In pence/cents (application_fee_amount) |
| currency | S | "gbp" / "aud" / "usd" |
| fulfilmentMethod | S | "takeout" / "delivery" |
| deliveryNotes | S/NULL | Customer's delivery instructions |
| requestedDate | S | ISO date (YYYY-MM-DD) |
| requestedTime | S | HH:MM (24h), the start of the selected time slot |
| stripeCheckoutSessionId | S | Stripe Checkout Session ID |
| stripePaymentIntentId | S | Stripe Payment Intent ID (from webhook) |
| status | S | "paid" / "fulfilled" / "refunded" |
| createdAt | S | ISO 8601 |
| updatedAt | S | ISO 8601 |

**GSI:** `vendorSlug-createdAt-index` (PK = vendorSlug, SK = createdAt)

This GSI supports the primary access pattern: vendor views their orders sorted by date, newest first.

**Nested: OrderItem**

| Field | Type | Notes |
|-------|------|-------|
| productId | S | UUID v4 (references Product.id at time of purchase) |
| name | S | Product name (snapshotted at purchase time) |
| price | N | Unit price in pence/cents (snapshotted at purchase time) |
| quantity | N | Positive integer |
| subtotal | N | price * quantity |

### quoteRequests

| Attribute | Type | Notes |
|-----------|------|-------|
| requestId | S (PK) | UUID v4 |
| vendorSlug | S | Links to tenant |
| name | S | Requester name |
| email | S | Requester email |
| phone | S (optional) | |
| eventType | S | "corporate" / "birthday" / "wedding" / "market" / "other" |
| guestCount | N (optional) | |
| eventDate | S (optional) | ISO date |
| message | S | 10-2000 chars |
| read | BOOL | Default false |
| createdAt | S | ISO 8601 |

**GSI:** `vendorSlug-createdAt-index` (PK = vendorSlug, SK = createdAt)

### sessions

| Attribute | Type | Notes |
|-----------|------|-------|
| token | S (PK) | UUID v4 |
| vendorSlug | S | Links to tenant |
| createdAt | S | ISO 8601 |
| expiresAt | N | Unix epoch (TTL attribute), 30 days from creation |

### magicLinks

| Attribute | Type | Notes |
|-----------|------|-------|
| token | S (PK) | UUID v4 |
| vendorSlug | S | Links to tenant |
| email | S | |
| createdAt | S | ISO 8601 |
| expiresAt | N | Unix epoch (TTL attribute), 15 minutes from creation |

## API Surface

All API routes are served under `/api/` via CloudFront -> API Gateway HTTP API.

Response envelope for all API endpoints:
```
Success: { data: T, meta?: { cursor?: string, count?: number } }
Error:   { error: { code: string, message: string } }
```

### Public Endpoints

**GET /api/vendors/{slug}**
- Returns vendor data as JSON (used by admin SPA, not for public page render)
- Response: `{ data: Tenant }`
- 404 if slug not found

**POST /api/quote-requests**
- Body: `{ vendorSlug, name, email, phone?, eventType, guestCount?, eventDate?, message }`
- Validates all fields, creates record, sends notification email
- Response: `{ data: { requestId, createdAt } }`
- 400 for validation errors, 404 if vendor slug not found
- Rate limit: 5/hour per IP

**POST /api/checkout/sessions**
- Body: `{ vendorSlug, items: [{ productId, quantity }], customerName, customerEmail, customerPhone?, fulfilmentMethod, deliveryNotes?, requestedDate, requestedTime }`
- Validates items against current product data (prices, availability)
- Validates requestedDate + requestedTime against vendor's operational schedule
- Calculates subtotal, delivery fee (if delivery), total, platform fee
- Creates Stripe Checkout Session with destination charge to vendor's connected account
- Response: `{ data: { checkoutSessionId, checkoutUrl } }`
- 400 for validation errors, 404 if vendor not found, 409 if vendor has not completed Stripe onboarding
- Rate limit: 10/hour per IP

**POST /api/stripe/webhook**
- Stripe webhook endpoint. No auth cookie -- verified by Stripe signature
- Handles `checkout.session.completed`: creates order in DynamoDB, sends receipt to customer, sends notification to vendor
- Handles `account.updated`: updates vendor Stripe onboarding status in tenant record
- Returns 200 on success, 400 on signature failure
- Must be idempotent: check if order already exists before creating

**POST /api/auth/request**
- Body: `{ email }`
- Generates magic link token, stores in magicLinks table, sends email via SES
- Response: `{ data: { sent: true } }` (always, to prevent user enumeration)

**GET /api/auth/verify?token={token}**
- Validates token from magicLinks table (exists + not expired)
- Creates session, sets cookie, deletes magic link token
- Redirects to `/admin/` with 302
- If invalid/expired: redirects to `/admin/login?error=expired`

### Authenticated Endpoints (require session cookie)

All authenticated endpoints validate the session cookie via `withAuth()` middleware. The middleware extracts the session token from the cookie, looks it up in the sessions table, verifies it has not expired, and attaches the `vendorSlug` to the request context. Returns 401 if session is missing/invalid/expired.

**PUT /api/vendors/{slug}**
- Body: partial Tenant update (name, tagline, story, city, country, categories, socialLinks, products, marketDates, operationalSchedule, deliveryEnabled, deliveryFee, takeoutEnabled)
- Vendor can only update their own record (slug must match session's vendorSlug)
- Response: `{ data: Tenant }`
- Triggers cache invalidation for `/{slug}` and `/sitemap*`
- 403 if slug does not match session

**GET /api/orders/{slug}**
- Returns paginated list of orders for the vendor
- Query params: `limit` (default 20, max 50), `cursor` (opaque pagination token), `status` (optional filter: "paid" / "fulfilled" / "refunded")
- Response: `{ data: Order[], meta: { cursor?: string } }`
- 403 if slug does not match session

**GET /api/orders/{slug}/{orderId}**
- Returns full order detail
- Response: `{ data: Order }`
- 403 if slug does not match session, 404 if order not found

**PUT /api/orders/{slug}/{orderId}**
- Body: `{ status: "fulfilled" }`
- Marks an order as fulfilled (only "paid" -> "fulfilled" transition allowed)
- Response: `{ data: Order }`
- 403 if slug does not match session, 404 if order not found, 409 if order is not in "paid" status

**GET /api/customers/{slug}**
- Returns paginated customer list derived from orders
- Each customer: `{ email, name, totalSpent, orderCount, lastOrderDate }`
- Query params: `limit` (default 20, max 50), `cursor` (opaque pagination token)
- Sorted by totalSpent descending
- Response: `{ data: Customer[], meta: { cursor?: string } }`
- 403 if slug does not match session

**POST /api/customers/{slug}/email**
- Body: `{ customerEmail, subject, message }`
- Sends a text email to the customer via SES (from noreply@dmercato.com, reply-to set to vendor's email)
- Response: `{ data: { sent: true } }`
- 403 if slug does not match session
- Rate limit: 20 emails/hour per vendor

**GET /api/quote-requests/{slug}**
- Returns paginated list of quote requests for the vendor
- Query params: `limit` (default 20, max 50), `cursor` (opaque pagination token)
- Response: `{ data: QuoteRequest[], meta: { cursor?: string } }`
- 403 if slug does not match session

**PUT /api/quote-requests/{slug}/{requestId}**
- Body: `{ read: true }`
- Marks a quote request as read
- Response: `{ data: QuoteRequest }`
- 403 if slug does not match session, 404 if request not found

**POST /api/vendors/{slug}/photos/upload-url**
- Body: `{ filename, contentType }` (contentType must be image/jpeg, image/png, or image/webp)
- Returns presigned S3 PUT URL (expires in 5 minutes) and the resulting asset key
- Response: `{ data: { uploadUrl, assetKey } }`
- 403 if slug does not match session
- Max file size enforced via presigned URL conditions: 10MB

**POST /api/stripe/account/{slug}/onboarding**
- Creates Stripe Express connected account (if not exists), generates Account Link URL
- Response: `{ data: { onboardingUrl } }`
- 403 if slug does not match session

**GET /api/stripe/account/{slug}/dashboard**
- Generates Stripe Express dashboard login link
- Response: `{ data: { dashboardUrl } }`
- 403 if slug does not match session, 409 if Stripe onboarding not complete

**POST /api/auth/logout**
- Deletes session from sessions table, clears cookie
- Response: `{ data: { loggedOut: true } }`

### SSR Endpoint (CloudFront default origin)

**GET /{slug}**
- Handled by Renderer Lambda (not API Gateway)
- Returns full HTML document with inline CSS, minimal inline JS (cart), SEO metadata, JSON-LD
- Product catalogue with prices, add-to-cart buttons (disabled if Stripe not onboarded)
- Cache-Control: `public, max-age=60`
- 404 for unknown slugs (styled error page)

### Reserved Paths

These paths are handled by CloudFront behaviours and never reach the Renderer Lambda:
- `/api/*` -- API Gateway
- `/admin/*` -- Admin SPA (S3)
- `/assets/*` -- Vendor photos (S3)
- `/sitemap*` -- Sitemaps (S3)
- `/robots.txt` -- S3 (sitemaps bucket)

## Security

### Authentication
- Magic link: one-time-use token sent via email, 15-minute TTL, deleted after use
- Session: HttpOnly, Secure, SameSite=Strict cookie containing opaque session token
- Session stored in DynamoDB with 30-day TTL, auto-cleaned by DynamoDB TTL
- No password storage anywhere in the system
- Stripe webhook: verified by Stripe signature (HMAC SHA-256) using webhook secret from SSM

### Authorization
- `withAuth()` middleware HOF wraps all authenticated Lambda handlers
- Middleware extracts session token from cookie, validates against sessions table
- Vendor can only access/modify their own data (vendorSlug from session must match URL slug)
- No role-based access control needed for MVP (single role: vendor)
- Stripe webhook endpoint has no session auth -- verified by Stripe signature only

### Payment Security
- Zero PCI scope: Stripe Checkout handles all card data. No card numbers touch our servers
- Stripe Checkout Sessions have server-side price validation: prices are read from DynamoDB when creating the session, not trusted from the client
- Stripe webhook signature verification prevents forged events
- Idempotent webhook handler: order creation checks for existing orderId before writing (prevents duplicate orders on Stripe retries)
- Platform fee calculated server-side, not by client

### Secrets Management
- All secrets stored in AWS SSM Parameter Store (SecureString for sensitive values)
- Lambda functions read from SSM at cold start and cache in memory
- Never in environment variables committed to code, never in Terraform state files
- Terraform references SSM paths, not values
- Stripe secret key and webhook secret stored in SSM

### Input Validation
- All API endpoints validate request bodies against schemas
- Reject unknown fields
- Typed validation: email format, string lengths, enum values, number ranges
- Vendor slug validated as URL-safe (alphanumeric + hyphens, 3-50 chars)
- File upload: content type whitelist (image/jpeg, image/png, image/webp), 10MB max
- Checkout: items validated against current product data (price, availability, existence)
- Checkout: requested date/time validated against vendor operational schedule

### Rate Limiting
- Quote request submission: 5 per hour per IP (tracked in-memory per Lambda instance + API Gateway throttling)
- Checkout session creation: 10 per hour per IP
- Magic link request: 3 per hour per email (tracked in DynamoDB via conditional write)
- Customer email: 20 per hour per vendor
- API Gateway default throttle: 1000 requests/second burst, 500 steady-state

### CORS
- Allowed origins: `https://dmercato.com`, `https://www.dmercato.com`, `http://localhost:5173` (dev only)
- Allowed methods: GET, POST, PUT, OPTIONS
- Allowed headers: Content-Type, Authorization, Cookie
- Credentials: true (for cookie-based auth)
- Configured at API Gateway level

### Infrastructure Security
- Each Lambda has its own IAM role with least-privilege policies
- Stripe Webhook Lambda IAM: DynamoDB write (orders), DynamoDB read/write (tenants), SES send
- S3 buckets: private by default, public access only through CloudFront OAI/OAC
- DynamoDB: no public access, IAM-only
- CloudFront: HTTPS only, TLS 1.2 minimum, HSTS headers
- No VPC needed (all services are AWS-managed with IAM auth)

### Threat Considerations
- **Slug squatting:** Reserved paths (`api`, `admin`, `assets`, `sitemap`, `robots.txt`, `favicon.ico`, `www`, `search`) cannot be used as vendor slugs. Validation rejects these
- **Email enumeration:** Magic link request always returns success regardless of whether email exists
- **Session fixation:** New session token generated on every login. Old sessions remain valid (vendor may have multiple devices)
- **CSRF:** SameSite=Strict cookie prevents cross-origin requests carrying credentials
- **XSS in SSR:** All vendor-provided content is HTML-escaped during rendering. No raw HTML injection
- **S3 direct access:** Presigned URLs expire in 5 minutes, scoped to specific key and content type
- **Price manipulation:** Checkout creates Stripe session with server-side prices from DynamoDB, never trusting client-submitted prices. Cart total is recalculated server-side
- **Duplicate orders:** Webhook handler is idempotent -- checks for existing order by stripeCheckoutSessionId before creating
- **Webhook replay:** Stripe signature verification with timestamp tolerance (default 5 minutes) prevents replay attacks

## Deployment

### Environments
- **staging:** Full replica of production. Used for testing before production deploys. Separate AWS account or resource prefix
- **prod:** Production environment at dmercato.com

### Infrastructure
- Terraform manages all resources via modules in `infra/modules/`
- Environment-specific configs in `infra/environments/staging/` and `infra/environments/prod/`
- State stored in S3 backend with DynamoDB locking
- `terraform plan` before every apply, reviewed manually

### Build and Deploy Pipeline
1. **Lambda build:** TypeScript compiled to JavaScript, bundled with esbuild (tree-shaking, single file output per Lambda), zipped
2. **Admin SPA build:** `vite build` produces static assets with content-hashed filenames
3. **Deploy Lambdas:** Upload zip to S3, update Lambda function code via Terraform or AWS CLI
4. **Deploy Admin SPA:** Sync build output to admin S3 bucket, invalidate `/admin/*` in CloudFront
5. **Deploy Infrastructure:** `terraform apply` for any resource changes

### CI/CD
- GitHub Actions with OIDC authentication to AWS
- Staging: auto-deploy on push to main
- Production: manual trigger (workflow_dispatch) after staging verification
- Pipeline: lint -> test -> build -> deploy staging -> (manual gate) -> deploy prod

### CloudFront Configuration
- Single distribution serving all origins
- HTTPS only with ACM certificate for `dmercato.com` and `*.dmercato.com`
- Cache behaviours:
  - `/{slug}` (default): 60s cache, origin = Renderer Lambda
  - `/api/*`: no cache, origin = API Gateway
  - `/admin/*`: no cache (SPA with content-hashed assets), origin = Admin S3
  - `/assets/*`: 1 year cache (content-addressed), origin = Assets S3
  - `/sitemap*`: 1 hour cache, origin = Sitemaps S3

### Monitoring
- CloudWatch Logs for all Lambdas (structured JSON logging)
- CloudWatch Metrics: Lambda errors, duration, throttles
- CloudFront access logs to S3 (optional, can enable later)
- DynamoDB consumed capacity metrics
- CloudWatch Alarms: Lambda error rate > 5%, Renderer p99 latency > 5s, Stripe Webhook Lambda error rate > 1%

## Design System

### Brand

| Token | Value |
|-------|-------|
| Primary | #ec5b13 (terracotta) |
| Logo accent | #C4622D (darker terracotta) |
| Background light | #f8f6f6 |
| Background dark | #221610 |
| Text dark | #1A1A18 |
| Text light | #FFFFFF |
| Text muted | #6b6b6b |
| Border | #e0e0e0 |
| Success | #2D8A4E (green, for order confirmations) |
| Warning | #D4A017 (amber, for pending states) |
| Error | #C0392B (red, for errors and alerts) |

### Typography

| Role | Font | Weight | Style |
|------|------|--------|-------|
| Display / headings | Cormorant Garamond | 300 (light) | Normal + italic for emphasis |
| Body | Public Sans | 400 | Normal |
| UI labels | Helvetica Neue | 400 | Uppercase, letter-spacing 0.2-0.3em, font-size 10px |
| Prices / numbers | Public Sans | 600 | Normal |

Google Fonts loaded: Cormorant Garamond (300, 300i, 400, 600) + Public Sans (400, 600).

### Design Language

- **Sharp edges:** No border-radius on cards, inputs, or containers. Exception: fully round buttons/pills use 50% radius
- **Uppercase tracking labels:** Section headings, nav items, category chips -- all uppercase, wide letter-spacing (0.2-0.3em), small font size (10-11px)
- **Bottom-border inputs:** Form inputs have only a bottom border, no full box border. Focus state: terracotta bottom border
- **Grayscale-to-color:** Product images display in grayscale, transition to color on hover
- **Split layouts:** Hero sections use split-screen (content left, full-bleed image right)
- **Terracotta accents:** CTAs, active states, links, decorative elements use primary terracotta
- **Generous whitespace:** Sections have large vertical padding (80-120px)
- **Dark footer:** Background dark with light text, minimal links
- **Status indicators:** Paid orders = terracotta dot, fulfilled = green dot, refunded = muted dot. Unread quotes = terracotta dot, read = no dot

### Vendor Page Layout

1. **Sticky nav:** Logo left, section links center (About, Products, Market dates, Events), quote CTA right. Scrolls to sections
2. **Hero:** Split layout. Left side: large serif vendor name (48-64px), tagline in italic, category chips (uppercase, bordered), CTA button. Right side: full-bleed primary photo
3. **Story section:** Serif blockquote with the vendor's story. Light background
4. **Products section:** 4-column grid (2-col on tablet, 1-col on mobile). Cards: image (aspect-ratio 4/5, grayscale default, color on hover), product name, price, "Add to cart" button (terracotta, disabled if Stripe not onboarded). Cart drawer slides in from right with item list, quantities (+/- controls), subtotal, checkout button
5. **Checkout section (in cart drawer):** Customer name, email, phone fields. Fulfilment method toggle (takeout/delivery). Delivery fee shown if delivery selected. Date/time picker showing available slots from vendor's operational schedule. Delivery notes textarea (if delivery). "Pay now" button redirects to Stripe Checkout
6. **Market calendar:** Large italic date numbers, market name, location, address. Pulse dot indicator on next upcoming date. Past dates collapsed/hidden
7. **Quote form:** Bottom-border inputs, terracotta submit button, event type dropdown, guest count, event date picker, message textarea
8. **"More in {city}" strip:** Terracotta background, white text, placeholder for future city page link
9. **Footer:** Dark background, logo, copyright, minimal links
10. **Mobile bottom nav:** Fixed bottom bar with section links (About, Products, Dates, Quote). Cart icon with item count badge

### Admin Dashboard Layout

1. **Sidebar:** Vendor photo (circular), vendor name, nav links: Dashboard, Orders, Customers, Quote Requests, Profile, Calendar, Stripe Account, Logout. Collapsible on mobile. Unread badge on Quote Requests
2. **Dashboard tab:** Quick stats: total orders, total revenue, pending orders count, unread quote requests. Recent orders list (last 5). Quick links to manage sections
3. **Orders tab:** Table view with columns: order ID (short), customer, items count, total, status (coloured dot + label), date. Status filter buttons (All, Paid, Fulfilled, Refunded). Click row to expand order detail: full item list with quantities/prices, customer info, delivery info, requested date/time, payment status. "Mark Fulfilled" button on paid orders. Pagination controls
4. **Customers tab:** Table view: name, email, total spent, order count, last order date. Click to see customer's order history. "Send Email" button opens modal with subject + message fields. Sorted by total spent descending. Pagination
5. **Quote Requests tab:** Table/list view with columns: name, event type, date, status (read/unread dot), timestamp. Click to expand full details. Mark as read action. Pagination controls
6. **Profile tab:** Bottom-border inputs for all fields. Photo upload zones (drag-and-drop or click). Category chips with add/remove. Social link inputs with platform icons. Products section with add/edit/delete cards. Operational schedule section: weekly recurring slots (day + time range), add/remove. Delivery settings: enable/disable toggles, delivery fee input. Save button
7. **Calendar tab:** List of market dates, each as a card with date, market name, location, address. Add new button. Edit/delete actions. Past dates in collapsed section
8. **Stripe Account tab:** Onboarding status (complete/incomplete). If incomplete: "Connect with Stripe" button starts onboarding. If complete: "Open Stripe Dashboard" link to manage payouts. Account status indicator

### Responsive Breakpoints

| Breakpoint | Width | Notes |
|------------|-------|-------|
| Mobile | < 768px | Single column, bottom nav, stacked hero, cart as full-screen overlay |
| Tablet | 768-1024px | 2-column products, side-by-side hero |
| Desktop | > 1024px | Full layout, 4-column products, split hero, cart as side drawer |

## Deferred

| Item | Why Deferred |
|------|--------------|
| Marketplace homepage | Needs multiple vendors to be meaningful. Post-validation |
| City pages | Needs vendor density per city. Post-validation |
| Category pages | Needs vendor volume. Post-validation |
| Search | DynamoDB scan is fine for < 100 vendors. OpenSearch if scaling |
| Custom domain provisioning | Complex (Route53 + ACM + Step Functions + Lambda@Edge). Post-validation |
| Photo resize pipeline | S3 event trigger + Sharp Lambda. Nice optimization, not blocking |
| Vendor analytics | CloudFront logs + aggregation. Value-add, not core |
| In-app messaging | Vendors can use email for now. Quote form captures the lead |
| Multi-language | Single language (English) for launch |
| Subscription billing | Vendor platform fee model TBD after validation. Manual invoicing or Stripe billing post-MVP |
| Refund processing via admin | Vendor uses Stripe Express dashboard directly for refunds |
| Discount codes / coupons | Post-validation, when there is proven purchase volume |
| Customer accounts | Customers identified by email per order. No accounts needed for MVP |
| Inventory management | Product availability toggle is sufficient. No stock counts |
| SMS notifications | Email covers all notification needs for MVP |
| Order status tracking page | Customer gets receipt email. No live tracking needed yet |

## User Decisions

These decisions were locked during the specification and design phases:

| Area | Decision |
|------|----------|
| URL structure | `dmercato.com/{slug}` (subdirectory, not subdomain) |
| Auth method | Magic link only, no password option |
| Vendor page rendering | SSR with inline CSS, minimal inline JS for cart only |
| Cache TTL | 60s for vendor pages, immediate invalidation on write as backup |
| Product storage | Nested array in tenant record (not separate table) |
| Market date storage | Nested array in tenant record (not separate table) |
| Operational schedule storage | Nested array in tenant record (recurring weekly slots + date-specific overrides) |
| Quote form fields | name, email, phone, eventType, guestCount, eventDate, message |
| Event types | corporate, birthday, wedding, market, other |
| First vendor | Oscar (Sweet Sin, Adelaide, AU) -- seed data |
| Business streams | Orders and Quote Requests are SEPARATE streams with separate admin views and navigation |
| Payment processor | Stripe Connect (Express accounts, destination charges) |
| Checkout flow | Stripe-hosted Checkout (zero PCI scope) |
| Platform fee | application_fee_amount on destination charges (percentage TBD, stored in SSM) |
| Fulfilment options | Takeout and/or delivery, vendor-configurable. Delivery fee set by vendor |
| Customer model | No customer accounts. Customers derived from order records (email as identifier) |
| Order email notifications | Receipt to customer + notification to vendor, both via SES on webhook |
| Design aesthetic | Editorial/magazine -- serif headings, sharp edges, terracotta accents |
| Font pairing | Cormorant Garamond (display) + Public Sans (body) |
| Mobile pattern | Bottom nav on vendor pages, collapsible sidebar on admin |
