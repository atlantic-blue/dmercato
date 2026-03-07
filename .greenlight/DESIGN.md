# System Design: Dmercato

## Requirements

### Functional

**FR-1: View vendor page**
- User navigates to `dmercato.com/{slug}` and receives a fully server-side rendered HTML page
- Page includes: hero section (split layout with vendor name/tagline left, primary photo right), story section, product gallery (4-column grid), market calendar with upcoming dates, quote request form, "More in {city}" section
- HTML is self-contained: inline CSS, no external stylesheet blocking render
- SEO metadata is complete: `<title>`, `<meta description>`, Open Graph tags, canonical URL, JSON-LD (LocalBusiness + Product schemas)
- CloudFront caches rendered pages for 60 seconds
- If vendor slug does not exist, return 404 with a styled error page
- Page is fully responsive (mobile bottom nav, stacked layouts on small screens)

**FR-2: Submit quote request**
- User fills out a form on the vendor page: name (required), email (required), phone (optional), event type (select: corporate, birthday, wedding, market, other), guest count (optional), event date (optional), message (required)
- On submit, system creates a `quoteRequests` record with `read: false`
- System sends transactional email to vendor via SES with quote details
- User sees a confirmation message on the page
- Rate limited: max 5 quote requests per IP per hour
- Input validation: email format, message length (10-2000 chars), name length (1-200 chars)

**FR-3: Vendor logs in**
- Vendor enters their email on the admin login page
- System looks up a tenant by email; if found, generates a magic link token (UUID), stores it in `magicLinks` table with 15-minute TTL, sends email via SES
- Vendor clicks link, system validates token (exists, not expired), creates session in `sessions` table (30-day TTL), sets HttpOnly/Secure/SameSite=Strict cookie, redirects to admin dashboard
- If token is expired or invalid, show "Link expired" with option to request a new one
- If email is not associated with any vendor, show generic "If an account exists, we sent a link" (no user enumeration)

**FR-4: Vendor manages page**
- Authenticated vendor can edit their profile: name, tagline, story (max 500 chars), city, country, categories, social links (Instagram, TikTok, Facebook, website)
- Vendor can upload photos: primary photo and gallery photos via presigned S3 URLs. Upload flow: frontend requests presigned URL from API, frontend uploads directly to S3, frontend confirms upload with the asset key
- Vendor can manage products: add/edit/delete products (name, description, price in pence/cents, currency, image, available toggle, display order). Products are stored as a nested array in the tenant record
- Vendor can manage market dates: add/edit/delete upcoming market appearances (date, market name, location, address). Market dates stored as nested array in tenant record
- All edits trigger CloudFront cache invalidation for `/{slug}` and `/sitemap*`
- Changes are immediately visible on next uncached page load (within 60 seconds due to cache TTL)

**FR-5: Vendor views quote requests**
- Authenticated vendor sees a list of quote requests sorted by `createdAt` descending
- Each request shows: name, email, event type, date, guest count, message, read/unread status, timestamp
- Vendor can mark a request as read (PATCH `read: true`)
- Unread count shown in navigation
- Paginated: 20 per page, cursor-based pagination using DynamoDB `LastEvaluatedKey`

### Non-Functional

| Requirement | Target | Rationale |
|-------------|--------|-----------|
| Page load (vendor page) | < 1.5s TTFB globally | CloudFront edge cache + Lambda SSR |
| Concurrent users | 50 at launch, 500 at 6 months | Serverless scales automatically |
| Availability | 99.5% (managed services SLA) | No custom HA infrastructure needed |
| Cold start (Lambda) | < 3s acceptable | arm64 + small bundles mitigate |
| API response time | < 500ms p95 | DynamoDB single-digit-ms reads |
| Photo upload | < 10MB per image | S3 presigned URL with size constraint |
| SEO | Google indexable within 1 week | SSR + sitemap + JSON-LD |
| Email delivery | SES production access required | Sandbox limits to verified emails only |

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
| Vendor pages | No external CSS or JS required for initial render (inline CSS) |
| Budget | Free tier where possible. SES, DynamoDB on-demand, Lambda free tier |
| Team | Solo developer |
| Timeline | V1 deployed within 2-3 weeks, V2 within 2 weeks after V1 |

### Out of Scope

These are explicitly NOT part of the MVP (V1 + V2):

- **Marketplace homepage / city pages / category pages** (V3, post-validation)
- **Search** (V3)
- **Checkout / payments** (V4, Stripe Connect)
- **Custom domain provisioning** (V5, Route53 + ACM + Step Functions)
- **Photo resize post-processing** (future, S3 event trigger)
- **OpenSearch** (future, only needed at thousands of vendors)
- **In-app messaging** for quote responses
- **Vendor analytics dashboard**
- **Multiple regions / languages**
- **Mobile native apps**
- **Vendor-to-vendor messaging**
- **Review / rating system**
- **Inventory management**
- **Shipping / delivery integration**

## Technical Decisions

| Decision | Chosen | Rejected | Rationale |
|----------|--------|----------|-----------|
| Database | DynamoDB (5 tables) | PostgreSQL (RDS), Aurora Serverless | Serverless-native, zero connection management, pay-per-request scales to zero, no VPC needed. Access patterns are simple key-value lookups and sparse GSI queries |
| Data modelling | Products and market dates nested in tenant record | Separate tables for products/dates | Eliminates joins. A vendor page is a single GetItem. Product count is small (< 50 per vendor). Atomic updates via DynamoDB expressions |
| SSR approach | Lambda SSR on every request (cached 60s) | Static site generation (SSG), ISR | Vendor data changes need to reflect within 60 seconds. SSG would require a rebuild pipeline. Lambda + CloudFront cache gives SSR with CDN performance |
| Vendor page CSS | Inline CSS in HTML response | External stylesheet, CSS-in-JS, Tailwind | Zero render-blocking requests. Single HTTP response contains everything needed. Vendor pages are self-contained documents |
| Auth mechanism | Magic link (email) | Password-based, OAuth/social login | Target users are non-technical market vendors. No password to remember. Email is already verified. Simpler to implement and more secure than passwords |
| Session storage | DynamoDB with TTL | JWT (stateless), Redis | Revocable sessions (important for security). DynamoDB TTL auto-cleans expired sessions. No Redis infrastructure to manage. JWT refresh token complexity avoided |
| API style | REST via API Gateway HTTP API | GraphQL, gRPC, REST API (v1) | HTTP API is simpler and cheaper than REST API v1. No need for GraphQL complexity with predictable data shapes. Standard REST conventions understood by all tooling |
| Monorepo tooling | npm workspaces | Turborepo, Nx, Lerna, pnpm | npm workspaces is zero-dependency, built into Node.js. Project has < 10 packages. No need for advanced build caching or task orchestration at this scale |
| Testing framework | Jest | Vitest, Mocha, AVA | Mature ecosystem, excellent TypeScript support, built-in mocking. Well-documented patterns for mocking AWS SDK. Team familiarity |
| IaC | Terraform with modules | CDK, SAM, Pulumi, SST | Declarative, cloud-agnostic syntax. Explicit resource management. No abstraction layer hiding AWS details. State management is well-understood |
| Frontend framework | React + Vite (admin SPA) | Next.js, Remix, Astro | Admin dashboard is a private SPA, not SEO-critical. Vite for fast dev experience. React for ecosystem and component libraries. No SSR needed for admin |
| URL routing | Subdirectory (`dmercato.com/{slug}`) | Subdomain (`{slug}.dmercato.com`) | Simpler DNS (single A record). Better SEO (domain authority concentrates). No wildcard certificate needed. CloudFront single distribution. Easier to reason about |
| Cache strategy | CloudFront 60s vendor pages, 1yr assets, no-cache API | Longer cache with invalidation-on-write only | 60s balances freshness with performance. Invalidation-on-write as belt-and-suspenders. Assets are content-addressed (hashed filenames) so 1yr is safe |
| Email service | SES | SendGrid, Mailgun, Postmark | AWS-native, cheapest option, integrates with IAM. Only sending transactional emails (magic links, quote notifications). No marketing email needs |
| Photo storage | S3 with presigned upload URLs | Direct upload through API, Cloudinary | Presigned URLs offload bandwidth from Lambda. S3 is cheapest storage. CloudFront serves photos at edge. No third-party dependency |
| Primary key strategy | UUID v4 for records, vendorSlug (string) for tenants | Auto-increment, ULID, nanoid | UUID is universally supported and collision-resistant. vendorSlug as PK for tenants enables direct URL-to-database lookup without an index |

## Architecture

### System Overview

Dmercato is a serverless multi-tenant platform running entirely on AWS. The system has three main traffic paths:

1. **Public path:** Browser requests vendor pages via CloudFront. CloudFront either serves from cache or invokes the Renderer Lambda to produce SSR HTML. Static assets (photos, admin SPA) are served from S3 via CloudFront.

2. **API path:** The admin SPA and vendor page forms make API calls through CloudFront (`/api/*`) which routes to API Gateway HTTP API, which invokes the appropriate Lambda handler.

3. **Background path:** Sitemap Lambda runs on a schedule (daily) to regenerate sitemap XML files in S3. Cache Invalidator Lambda is triggered by API writes to invalidate stale CloudFront paths.

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
- Renders complete HTML with inline CSS, SEO metadata, JSON-LD
- Returns HTML string with appropriate cache headers
- Memory: 1024MB, Timeout: 30s, arm64

**API Lambda** (`packages/lambdas/api/`)
- Single Lambda with internal routing by path + method
- Handlers: vendors, quote-requests, photos (presigned URLs)
- Session validation via `withAuth()` middleware for protected routes
- Memory: 512MB, Timeout: 10s, arm64

**Auth Lambda** (`packages/lambdas/auth/`)
- POST `/api/auth/request` -- generate magic link, store token, send email
- GET `/api/auth/verify` -- validate token, create session, set cookie, redirect
- Memory: 512MB, Timeout: 10s, arm64

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
- Point-in-time recovery on tenants table

**S3** (3 buckets per environment)
- `dmercato-assets-{env}` -- vendor photos (public via CloudFront, versioning enabled)
- `dmercato-admin-{env}` -- admin SPA build (private, CloudFront OAI)
- `dmercato-sitemaps-{env}` -- sitemap XML (public via CloudFront)

**SES**
- Verified domain: dmercato.com
- Sending identity: noreply@dmercato.com
- Templates: magic link email, quote request notification

**SSM Parameter Store**
- All secrets and configuration: SES config, table names, bucket names, CloudFront distribution ID

### Architecture Diagram (text)

```
Browser
  |
  v
CloudFront (dmercato.com)
  |
  |-- /{slug}         --> Renderer Lambda --> DynamoDB (tenants)
  |-- /api/*          --> API Gateway HTTP API
  |                        |-- /api/vendors/*        --> API Lambda --> DynamoDB
  |                        |-- /api/quote-requests/* --> API Lambda --> DynamoDB + SES
  |                        |-- /api/auth/*           --> Auth Lambda --> DynamoDB + SES
  |                        |-- /api/vendors/*/photos --> API Lambda --> S3 (presign)
  |-- /admin/*        --> S3 (admin SPA)
  |-- /assets/*       --> S3 (vendor photos)
  |-- /sitemap*       --> S3 (sitemaps)

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
| email | S | Vendor contact / login email |
| stripeAccountId | S/NULL | Stripe Connect (V4) |
| stripeOnboardingComplete | BOOL | Stripe (V4) |
| customDomain | S/NULL | Custom domain (V5) |
| domainStatus | S | "none" / "registering" / "provisioning" / "active" / "failed" |
| domainOperationId | S/NULL | Route53 operation (V5) |
| domainCertificateArn | S/NULL | ACM cert (V5) |
| plan | S | "active" / "cancelled" |
| billingInterval | S | "monthly" / "annual" |
| stripeSubscriptionId | S | Stripe subscription (V4) |
| createdAt | S | ISO 8601 |
| updatedAt | S | ISO 8601 |

**GSIs:**
- `city-index`: PK = city (for future city pages, V3)
- `domainStatus-index`: PK = domainStatus (for domain provisioning monitoring, V5)

**Nested: Product**

| Field | Type | Notes |
|-------|------|-------|
| id | S | UUID v4 |
| name | S | |
| description | S | |
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

### orders (V4, table created but unused until checkout)

| Attribute | Type | Notes |
|-----------|------|-------|
| orderId | S (PK) | UUID v4 |
| vendorSlug | S | |
| customerEmail | S | |
| items | L(M) | OrderItem objects |
| subtotal | N | In pence/cents |
| platformFee | N | In pence/cents |
| currency | S | |
| stripePaymentIntentId | S | |
| status | S | "pending" / "paid" / "fulfilled" / "refunded" |
| createdAt | S | ISO 8601 |
| updatedAt | S | ISO 8601 |

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
- Body: partial Tenant update (name, tagline, story, city, country, categories, socialLinks, products, marketDates)
- Vendor can only update their own record (slug must match session's vendorSlug)
- Response: `{ data: Tenant }`
- Triggers cache invalidation for `/{slug}` and `/sitemap*`
- 403 if slug does not match session

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

**POST /api/auth/logout**
- Deletes session from sessions table, clears cookie
- Response: `{ data: { loggedOut: true } }`

### SSR Endpoint (CloudFront default origin)

**GET /{slug}**
- Handled by Renderer Lambda (not API Gateway)
- Returns full HTML document with inline CSS, SEO metadata, JSON-LD
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

### Authorization
- `withAuth()` middleware HOF wraps all authenticated Lambda handlers
- Middleware extracts session token from cookie, validates against sessions table
- Vendor can only access/modify their own data (vendorSlug from session must match URL slug)
- No role-based access control needed for MVP (single role: vendor)

### Secrets Management
- All secrets stored in AWS SSM Parameter Store (SecureString for sensitive values)
- Lambda functions read from SSM at cold start and cache in memory
- Never in environment variables committed to code, never in Terraform state files
- Terraform references SSM paths, not values

### Input Validation
- All API endpoints validate request bodies against schemas
- Reject unknown fields
- Typed validation: email format, string lengths, enum values, number ranges
- Vendor slug validated as URL-safe (alphanumeric + hyphens, 3-50 chars)
- File upload: content type whitelist (image/jpeg, image/png, image/webp), 10MB max

### Rate Limiting
- Quote request submission: 5 per hour per IP (tracked in-memory per Lambda instance + API Gateway throttling)
- Magic link request: 3 per hour per email (tracked in DynamoDB via conditional write)
- API Gateway default throttle: 1000 requests/second burst, 500 steady-state

### CORS
- Allowed origins: `https://dmercato.com`, `https://www.dmercato.com`, `http://localhost:5173` (dev only)
- Allowed methods: GET, POST, PUT, OPTIONS
- Allowed headers: Content-Type, Authorization, Cookie
- Credentials: true (for cookie-based auth)
- Configured at API Gateway level

### Infrastructure Security
- Each Lambda has its own IAM role with least-privilege policies
- S3 buckets: private by default, public access only through CloudFront OAI/OAC
- DynamoDB: no public access, IAM-only
- CloudFront: HTTPS only, TLS 1.2 minimum, HSTS headers
- No VPC needed (all services are AWS-managed with IAM auth)

### Threat Considerations
- **Slug squatting:** Reserved paths (`api`, `admin`, `assets`, `sitemap`, `www`) cannot be used as vendor slugs. Validation rejects these
- **Email enumeration:** Magic link request always returns success regardless of whether email exists
- **Session fixation:** New session token generated on every login. Old sessions remain valid (vendor may have multiple devices)
- **CSRF:** SameSite=Strict cookie prevents cross-origin requests carrying credentials
- **XSS in SSR:** All vendor-provided content is HTML-escaped during rendering. No raw HTML injection
- **S3 direct access:** Presigned URLs expire in 5 minutes, scoped to specific key and content type

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

### CI/CD (initial approach)
- Manual deploys from local machine for V1/V2 (solo developer)
- Script-based: `scripts/deploy.sh staging` and `scripts/deploy.sh prod`
- Future: GitHub Actions pipeline with plan-on-PR, apply-on-merge

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
- CloudWatch Alarms: Lambda error rate > 5%, Renderer p99 latency > 5s

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

### Vendor Page Layout

1. **Sticky nav:** Logo left, section links center (About, Products, Market dates, Events), quote CTA right. Scrolls to sections
2. **Hero:** Split layout. Left side: large serif vendor name (48-64px), tagline in italic, category chips (uppercase, bordered), CTA button. Right side: full-bleed primary photo
3. **Story section:** Serif blockquote with the vendor's story. Light background
4. **Products section:** 4-column grid (2-col on tablet, 1-col on mobile). Cards: image (aspect-ratio 4/5, grayscale default, color on hover), product name, price. No border-radius
5. **Market calendar:** Large italic date numbers, market name, location, address. Pulse dot indicator on next upcoming date. Past dates collapsed/hidden
6. **Quote form:** Bottom-border inputs, terracotta submit button, event type dropdown, guest count, event date picker, message textarea
7. **"More in {city}" strip:** Terracotta background, white text, placeholder for future city page link
8. **Footer:** Dark background, logo, copyright, minimal links
9. **Mobile bottom nav:** Fixed bottom bar with section links (About, Products, Dates, Quote)

### Admin Dashboard Layout

1. **Sidebar:** Vendor photo (circular), vendor name, nav links (Profile, Calendar, Quote Requests, Logout). Collapsible on mobile
2. **Profile tab:** Bottom-border inputs for all fields. Photo upload zones (drag-and-drop or click). Category chips with add/remove. Social link inputs with platform icons. Products section with add/edit/delete cards. Save button
3. **Calendar tab:** List of market dates, each as a card with date, market name, location, address. Add new button. Edit/delete actions. Drag to reorder. Past dates in collapsed section
4. **Quote requests tab:** Table/list view with columns: name, event type, date, status (read/unread dot), timestamp. Click to expand full details. Mark as read action. Pagination controls

### Responsive Breakpoints

| Breakpoint | Width | Notes |
|------------|-------|-------|
| Mobile | < 768px | Single column, bottom nav, stacked hero |
| Tablet | 768-1024px | 2-column products, side-by-side hero |
| Desktop | > 1024px | Full layout, 4-column products, split hero |

## Deferred

| Item | Version | Why Deferred |
|------|---------|--------------|
| Marketplace homepage | V3 | Needs multiple vendors to be meaningful. Behind validation gate |
| City pages | V3 | Needs vendor density per city. Behind validation gate |
| Category pages | V3 | Needs vendor volume. Behind validation gate |
| Search | V3 | DynamoDB scan is fine for < 100 vendors. OpenSearch if scaling |
| Stripe Connect payments | V4 | Revenue feature, build after proven demand |
| Order management | V4 | Depends on Stripe Connect |
| Custom domain provisioning | V5 | Complex (Route53 + ACM + Step Functions + Lambda@Edge). Build after paying subscribers |
| Photo resize pipeline | Post-V2 | S3 event trigger + Sharp Lambda. Nice optimization, not blocking |
| Vendor analytics | Post-V5 | CloudFront logs + aggregation. Value-add, not core |
| In-app messaging | Post-V5 | Vendors can use email for now. Quote form captures the lead |
| Multi-language | Post-V5 | Single language (English) for Australian launch |

## User Decisions

These decisions were locked during the specification phase:

| Area | Decision |
|------|----------|
| URL structure | `dmercato.com/{slug}` (subdirectory, not subdomain) |
| Pricing | Monthly at 8 GBP, annual at 6 GBP/month (72 GBP/year) |
| Auth method | Magic link only, no password option |
| Vendor page rendering | SSR with inline CSS, no external dependencies |
| Cache TTL | 60s for vendor pages, immediate invalidation on write as backup |
| Product storage | Nested array in tenant record (not separate table) |
| Market date storage | Nested array in tenant record (not separate table) |
| Quote form fields | name, email, phone, eventType, guestCount, eventDate, message |
| Event types | corporate, birthday, wedding, market, other |
| First vendor | Oscar (Sweet Sin, Adelaide, AU) -- seed data |
| Validation gate | 5 vendors, 1 enquiry, 1 referral within 60 days of V1 launch |
| Build order | V1 (public pages) -> V2 (admin) -> validate -> V3/V4/V5 |
| Design aesthetic | Editorial/magazine -- serif headings, sharp edges, terracotta accents |
| Font pairing | Cormorant Garamond (display) + Public Sans (body) |
| Mobile pattern | Bottom nav on vendor pages, collapsible sidebar on admin |
