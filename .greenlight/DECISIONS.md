# Technical Decision Log: Dmercato

Decisions are numbered sequentially. Each records the context, options considered, chosen approach, and rationale. Decisions are immutable once recorded -- new decisions can supersede old ones but the original record remains.

---

## DEC-001: DynamoDB with nested documents over separate tables

**Date:** 2026-03-06
**Status:** Accepted
**Category:** Data Model

### Context

Vendor pages display products and market dates inline. The question is whether products and market dates should be separate DynamoDB tables with their own PKs, or nested arrays within the tenant record.

### Options

| Option | Pros | Cons |
|--------|------|------|
| **A: Nested arrays in tenant** | Single GetItem fetches entire page. Atomic updates. No joins. Simpler access patterns | 400KB item limit. Can't query individual products. Must read-modify-write for updates |
| B: Separate tables | Unlimited products. Can query/filter products independently. Individual item updates | Multiple reads for page render. Transaction needed for consistency. More tables to manage |
| C: Single-table design (all entities in one table) | Advanced DynamoDB pattern. Flexible access patterns | Over-engineered for 5 tables. Harder to reason about. GSI overloading complexity not justified |

### Decision

**Option A: Nested arrays in tenant record.**

### Rationale

- A vendor page is a single read operation: `GetItem(vendorSlug)`. This is the highest-frequency access pattern
- Product count per vendor is small (estimated < 50). At ~1KB per product, that is ~50KB -- well under the 400KB item limit
- Market dates are even smaller (< 20 per vendor per year)
- The read-modify-write trade-off for admin updates is acceptable because updates are infrequent (vendor edits their page occasionally) while reads are constant (every page view)
- Separate tables would mean N+1 reads for every page render or require BatchGetItem, adding latency and complexity
- If a vendor somehow approaches the 400KB limit, we can migrate products to a separate table later. This is a reversible decision

### Consequences

- Vendor update operations must use DynamoDB `UpdateExpression` with `SET` to avoid overwriting concurrent changes
- Product ordering is managed via the `order` field in each product object
- No ability to query "all products across all vendors" without a table scan. This is acceptable because that use case does not exist in V1-V2

---

## DEC-002: Lambda SSR over static site generation

**Date:** 2026-03-06
**Status:** Accepted
**Category:** Rendering

### Context

Vendor pages need to be server-rendered for SEO (Google must see full HTML). Two main approaches: generate static HTML at build/write time (SSG), or render on each request via Lambda (SSR).

### Options

| Option | Pros | Cons |
|--------|------|------|
| **A: Lambda SSR + CloudFront cache** | Changes reflect within 60s. No build pipeline. Simple deployment. Works for any number of vendors | Lambda cold starts. Compute cost per request (mitigated by cache). Slightly more complex than static files |
| B: Static site generation (S3) | Zero compute cost. Fastest possible TTFB. No cold starts | Requires rebuild pipeline on every vendor edit. Rebuild latency (minutes, not seconds). S3 invalidation complexity. Build system is another moving part |
| C: Next.js/Remix on Lambda | Framework-level SSR with hydration. Rich client-side interactivity | Massive bundle size. Slow cold starts. Framework overhead for what is essentially a read-only page. Overkill |

### Decision

**Option A: Lambda SSR with CloudFront 60-second cache.**

### Rationale

- Vendor pages are read-heavy, write-infrequent. CloudFront absorbs the vast majority of traffic
- After the first request, subsequent requests within 60 seconds hit the cache (zero Lambda invocation)
- Changes reflect within 60 seconds naturally, plus explicit CloudFront invalidation on writes as belt-and-suspenders
- No build pipeline needed. The Lambda always renders from current DynamoDB data
- SSG would require an event-driven rebuild system (DynamoDB Streams -> Lambda -> S3 -> invalidate). More moving parts for no real benefit at this scale
- Vendor pages are read-only documents with no client-side interactivity, so no hydration is needed. Plain HTML + inline CSS is the optimal format

### Consequences

- Lambda cold starts are the main latency risk. Mitigated by: arm64 runtime, minimal dependencies, small bundle size, CloudFront cache absorbing repeat traffic
- If cold starts become a problem, provisioned concurrency can be added without architecture changes
- Renderer Lambda must be stateless and fast. No heavy template engines. String concatenation or a lightweight template approach

---

## DEC-003: Magic link authentication over passwords

**Date:** 2026-03-06
**Status:** Accepted
**Category:** Authentication

### Context

Vendors need to log in to manage their pages. The auth mechanism needs to be simple for non-technical market vendors.

### Options

| Option | Pros | Cons |
|--------|------|------|
| **A: Magic link (email)** | No password to remember. Email is verified by definition. Simple UX. No password storage/hashing. Resistant to credential stuffing | Requires email access to log in. 15-min token expiry window. Depends on email delivery reliability |
| B: Email + password | Familiar pattern. Works without email access after initial setup | Password storage (hashing, salting). Password reset flow. Users forget passwords. Credential stuffing risk. More complex implementation |
| C: OAuth (Google/Facebook) | Delegated auth. No password management | Not all vendors have Google accounts. Facebook OAuth is declining. Third-party dependency. More complex for a B2B tool |

### Decision

**Option A: Magic link authentication.**

### Rationale

- Target users are market vendors, not software developers. They want to update their page quickly, not manage credentials
- Magic links eliminate an entire class of security concerns: password storage, password resets, brute force attacks, credential reuse
- Email verification is built-in: if you can receive the magic link, your email is verified
- Implementation is straightforward: generate token, store with TTL, send email, validate on click, create session
- The 15-minute expiry is a feature, not a bug: short-lived tokens reduce exposure if email is compromised
- 30-day sessions mean vendors rarely need to re-authenticate. One magic link click per month

### Consequences

- SES must be in production mode (not sandbox) for magic links to work with unverified email addresses
- Magic link emails must not land in spam. DKIM + SPF + DMARC configuration via SES is critical
- If a vendor loses access to their email, there is no self-service recovery. This is a manual support case (acceptable at current scale)
- Rate limiting on magic link requests (3/hour/email) prevents abuse

---

## DEC-004: Monorepo with npm workspaces

**Date:** 2026-03-06
**Status:** Accepted
**Category:** Repository Structure

### Context

The project has multiple packages: Lambda functions, shared types, shared DB client, frontend SPA, and infrastructure. These need to be in a single repository with dependency management between them.

### Options

| Option | Pros | Cons |
|--------|------|------|
| **A: npm workspaces** | Zero additional dependencies. Built into Node.js/npm. Simple `package.json` config. Works with standard npm commands | No advanced build caching. No parallel task execution (without scripts). Less sophisticated than dedicated tools |
| B: Turborepo | Build caching. Parallel task execution. Dependency-aware task scheduling | Additional dependency. Configuration overhead. Overkill for < 10 packages. Another tool to learn/maintain |
| C: Nx | Most powerful monorepo tool. Affected-based testing. Remote caching | Heavy. Significant configuration. Enterprise-scale tool for a solo-dev project. Steep learning curve |
| D: pnpm workspaces | Faster installs. Strict dependency isolation. Disk-efficient | Different package manager. Some ecosystem compatibility issues. Team unfamiliarity |

### Decision

**Option A: npm workspaces.**

### Rationale

- The project has approximately 8 packages. This is not a scale that benefits from advanced build caching or parallel task orchestration
- npm workspaces is zero-dependency: it ships with Node.js. No additional toolchain to install, configure, or update
- Workspace linking (`packages/lambdas/renderer` can import from `packages/shared/types`) works out of the box
- If the project grows to a point where build times are a bottleneck, migrating to Turborepo is straightforward (it layers on top of npm workspaces)
- Solo developer: the primary bottleneck is development speed, not CI caching

### Consequences

- `package.json` at root declares workspaces: `["packages/*", "packages/lambdas/*", "packages/shared/*"]`
- Each package has its own `package.json` and `tsconfig.json`
- Shared packages are referenced via workspace protocol: `"@dmercato/types": "workspace:*"`
- Lambda bundling (esbuild) must resolve workspace dependencies and bundle them into a single file

---

## DEC-005: Jest for testing

**Date:** 2026-03-06
**Status:** Accepted
**Category:** Testing

### Context

TDD-first methodology requires a testing framework that supports TypeScript, mocking (especially AWS SDK), and fast iteration.

### Options

| Option | Pros | Cons |
|--------|------|------|
| **A: Jest** | Mature ecosystem. Excellent AWS SDK mocking patterns. Built-in assertion library. Snapshot testing. Wide community support. Well-documented | Slower than Vitest. CJS/ESM configuration can be tricky. Heavier |
| B: Vitest | Fast (Vite-powered). Native ESM. Compatible with Jest API. Modern | Younger ecosystem. Fewer documented patterns for AWS SDK mocking. Some edge cases with module mocking |
| C: Mocha + Chai + Sinon | Flexible. Composable. Well-established | Three separate libraries to configure. More boilerplate. No built-in mocking |

### Decision

**Option A: Jest.**

### Rationale

- AWS SDK v3 mocking has well-established patterns with Jest (`jest.mock`, `aws-sdk-client-mock` library)
- The project will lean heavily on mocking DynamoDB, S3, SES, and CloudFront SDK calls. Jest's mocking system is the most documented for this
- Greenlight config already specifies Jest (`"command": "npx jest"`)
- Test execution speed is not the bottleneck: individual test files run in < 1 second. Full suite will have < 100 tests in V1/V2
- Vitest would be a reasonable alternative, but the marginal speed improvement does not justify the ecosystem risk for AWS SDK mocking patterns

### Consequences

- `jest.config.ts` at root with `projects` configuration for each package
- TypeScript transform via `ts-jest` or `@swc/jest` (prefer `@swc/jest` for speed)
- AWS SDK mocks using `aws-sdk-client-mock` library for type-safe DynamoDB/S3/SES mocking
- Test files co-located with source: `src/handlers/vendors.test.ts` alongside `src/handlers/vendors.ts`

---

## DEC-006: Inline CSS for vendor pages

**Date:** 2026-03-06
**Status:** Accepted
**Category:** Frontend / Performance

### Context

Vendor pages are the public-facing product. They must load fast, render without JavaScript, and be fully self-contained for SEO. The CSS strategy affects all of these.

### Options

| Option | Pros | Cons |
|--------|------|------|
| **A: Inline CSS in HTML** | Zero additional HTTP requests. Page renders immediately on first byte. No FOUC. Self-contained document. Works with JavaScript disabled | CSS not cached separately. Larger HTML payload. CSS duplicated on every page load |
| B: External stylesheet (S3/CloudFront) | Cached across page views. Smaller HTML. Standard approach | Additional HTTP request. Render-blocking. FOUC risk. Cache invalidation complexity |
| C: CSS-in-JS (styled-components, emotion) | Component-scoped styles. Dynamic theming | Requires JavaScript. SSR extraction is complex. Runtime overhead. Framework dependency |
| D: Tailwind CSS | Utility-first. Small production builds. Consistent design tokens | Build step required. Class soup in HTML. Still needs external stylesheet or extraction |

### Decision

**Option A: Inline CSS in the HTML response.**

### Rationale

- A vendor page is a single HTTP response. Inline CSS means the browser can render the page on the very first byte received, with no additional round trips
- The CSS for a vendor page is small (estimated 5-15KB). The bandwidth cost of duplicating it per page view is negligible compared to the performance benefit
- CloudFront caches the complete HTML+CSS response for 60 seconds. Within that window, there is no duplication cost at all
- External stylesheets create a render-blocking request. On a 3G connection (common at outdoor markets where vendors might demo their page), this adds 200-500ms of blank screen
- Vendor pages do not need JavaScript. They are read-only documents. Inline CSS keeps them fully functional with JavaScript disabled
- No build pipeline, no CSS framework, no class naming conventions. The Renderer Lambda concatenates CSS strings. Simple

### Consequences

- CSS is maintained as template strings in the Renderer Lambda codebase
- Design tokens (colors, fonts, spacing) are TypeScript constants imported by the renderer
- Changes to CSS require Lambda redeployment (not just a CDN cache bust). Acceptable because CSS changes are infrequent and deploy is fast
- If vendor pages become complex enough to warrant a component system, this decision can be revisited. For now, the pages are templates, not applications

---

## DEC-007: CloudFront cache strategy

**Date:** 2026-03-06
**Status:** Accepted
**Category:** CDN / Performance

### Context

CloudFront sits in front of all origins. Cache policy determines the balance between freshness and performance.

### Decision

| Path | Cache TTL | Rationale |
|------|-----------|-----------|
| `/{slug}` (vendor pages) | 60 seconds | Balances freshness with performance. Vendor edits reflect within 1 minute. Explicit invalidation on write as backup |
| `/api/*` | No cache | API responses are dynamic, user-specific, or mutation results. Must not be cached |
| `/admin/*` | No cache (HTML), 1 year (hashed assets) | SPA `index.html` must always be fresh. JS/CSS bundles are content-hashed so 1yr is safe |
| `/assets/*` | 1 year | Vendor photos. S3 keys include content hash or are versioned. Cache-bust by changing the key |
| `/sitemap*` | 1 hour | Sitemaps regenerate daily. 1hr cache means at most 1hr stale after regeneration |

### Rationale

- 60 seconds for vendor pages is the sweet spot: 98%+ of traffic is served from cache (since most vendors get fewer than 1 visit per minute), and the rare cache miss fetches fresh data
- Explicit CloudFront invalidation on vendor update is belt-and-suspenders. Even without it, data is at most 60 seconds stale
- API must never be cached: responses include user-specific data (session-based), and mutations must reach the backend
- Admin SPA uses content-hashed filenames from Vite build, so `main.a1b2c3.js` can be cached forever. Only `index.html` needs to be uncached

### Consequences

- Cache Invalidator Lambda is invoked on vendor update to invalidate `/{slug}` and `/sitemap*`
- CloudFront invalidation has a ~10 second propagation delay. Combined with 60s TTL, worst case is ~70 seconds of stale content. Acceptable
- Cost: CloudFront invalidation is free for the first 1,000 paths/month. With < 100 vendors making occasional edits, this is well within limits

---

## DEC-008: Subdirectory routing over subdomains

**Date:** 2026-03-06
**Status:** Accepted
**Category:** URL Architecture

### Context

Each vendor needs a URL. The two main patterns are `dmercato.com/{slug}` (subdirectory) and `{slug}.dmercato.com` (subdomain).

### Options

| Option | Pros | Cons |
|--------|------|------|
| **A: Subdirectory (`dmercato.com/{slug}`)** | Single CloudFront distribution. Single SSL cert. SEO authority concentrates on one domain. Simpler DNS. No wildcard cert needed | Must reserve paths (/api, /admin, etc.). Slug collision with future routes |
| B: Subdomain (`{slug}.dmercato.com`) | Clean separation. No path collision. Each vendor feels like their own site | Wildcard SSL cert needed. More complex CloudFront (or multiple distributions). SEO authority diluted across subdomains. DNS wildcard record. Cookie scope complexity |

### Decision

**Option A: Subdirectory routing.**

### Rationale

- SEO is a primary value proposition. Google treats subdomains as potentially separate sites, diluting domain authority. Subdirectories concentrate all authority on `dmercato.com`
- One CloudFront distribution, one SSL certificate, one DNS record. Operationally simpler
- Path reservation is a solved problem: `/api`, `/admin`, `/assets`, `/sitemap`, and a handful of other reserved slugs are validated at vendor creation time
- Custom domains (V5) give vendors their own identity when they want it. Until then, subdirectories are the right default
- Cookie scope is straightforward: session cookie on `dmercato.com` works for all paths

### Consequences

- Vendor slugs must be validated against reserved paths on creation
- Reserved paths list: `api`, `admin`, `assets`, `sitemap`, `robots.txt`, `favicon.ico`, `www`, `search`, plus any future marketplace routes (city names handled in V3)
- Renderer Lambda receives all non-reserved paths and looks up the slug in DynamoDB. 404 for unknown slugs

---

## DEC-009: Stripe Connect with Express accounts and destination charges

**Date:** 2026-03-07
**Status:** Accepted
**Category:** Payments
**Supersedes:** Part of original design had payments deferred to V4

### Context

The MVP scope now includes checkout and payments. Vendors sell products on their page and need to receive payments. The platform needs to collect a fee on each transaction.

### Options

| Option | Pros | Cons |
|--------|------|------|
| **A: Stripe Connect Express + destination charges** | Stripe-hosted onboarding (minimal UI). Stripe-hosted dashboard for payouts. Platform fee via application_fee_amount. Zero PCI scope with Checkout Sessions. Lowest implementation burden | Less control over onboarding UX. Stripe branding on onboarding/dashboard. Express account limitations (no full API access for vendor) |
| B: Stripe Connect Standard + direct charges | Vendor has full Stripe dashboard. Direct relationship with Stripe. Most flexibility | Vendor controls pricing and refunds directly. Platform has less control. Harder to enforce fee structure. Complex for non-technical vendors |
| C: Stripe Connect Custom + API onboarding | Full control over onboarding UX. Custom dashboard. Maximum flexibility | Must build KYC collection forms. Must build payout dashboard. Significantly more development. Regulatory compliance burden on platform |
| D: PayPal Commerce Platform | Alternative payment processor. Wide consumer adoption | Less developer-friendly API. More complex fee structures. Slower payouts. Less ecosystem tooling |

### Decision

**Option A: Stripe Connect Express with destination charges and Stripe Checkout Sessions.**

### Rationale

- Express accounts use Stripe-hosted onboarding: vendor clicks a link, fills out KYC on Stripe's form, and is onboarded. The platform builds zero KYC UI
- Express accounts have a Stripe-hosted dashboard for payout management: vendor clicks a login link and manages their bank details and payouts on Stripe's UI. The platform builds zero payout UI
- Destination charges mean the payment is created on the platform account and transferred to the vendor minus the platform fee. One API call handles the fee split
- Stripe Checkout Sessions handle the entire payment UI: card input, 3D Secure, error states, PCI compliance. Zero PCI scope for the platform
- This is the lowest-effort path to a working payment system. Stripe handles onboarding, payment UI, fee splitting, and payout management. The platform handles order creation and notification
- The main trade-off (Stripe-branded onboarding) is acceptable for MVP. Vendors care about receiving payments, not about the branding on the setup flow

### Consequences

- Platform needs a Stripe account in Connect mode
- Each vendor gets a Stripe Express connected account
- Stripe secret key and webhook signing secret stored in SSM
- New Lambda: Stripe Webhook handler (separate from API Lambda for isolation)
- Vendor page cart functionality requires minimal inline JS (localStorage for cart state)
- If vendor has not completed Stripe onboarding, add-to-cart is disabled on their public page
- Refund processing is done by the vendor through Stripe's Express dashboard, not through the admin UI (MVP simplification)

---

## DEC-010: Orders and Quote Requests as separate business streams

**Date:** 2026-03-07
**Status:** Accepted
**Category:** Business Model

### Context

The platform has two types of customer interactions: purchasing products from the catalogue (orders) and requesting custom event catering quotes (quote requests). The question is whether these should be unified or kept separate.

### Options

| Option | Pros | Cons |
|--------|------|------|
| **A: Separate streams** | Clear mental model for vendors. Different workflows (orders are transactional, quotes are conversational). Different data shapes. Different statuses. Different admin views | Two navigation items instead of one. Two sets of API endpoints. Slightly more admin UI to build |
| B: Unified "enquiries" | Single admin view. Simpler navigation. Less UI surface | Confusing: an order for 12 cookies and a quote for a corporate event for 200 people are very different things. Forced to genericise the data model. Status transitions differ |

### Decision

**Option A: Separate business streams with separate admin views.**

### Rationale

- Orders and quote requests have fundamentally different lifecycles. An order is: paid -> fulfilled. A quote request is: unread -> read -> (vendor responds externally via email). Merging them forces awkward status gymnastics
- The data shapes are different. An order has items, quantities, prices, payment info, delivery details. A quote request has event type, guest count, message. Unifying them means either a bloated generic model or two sub-types pretending to be one
- Vendors think about these differently. "I have 5 orders to pack today" is a different mental task from "I have 2 enquiries about catering". Separate views match the vendor's mental model
- The cost of separation is small: two nav items, two list views. The cost of merging is ongoing confusion

### Consequences

- Admin sidebar has separate "Orders" and "Quote Requests" navigation items
- Two separate DynamoDB tables (orders, quoteRequests) with their own GSIs
- Separate API endpoint groups: `/api/orders/*` and `/api/quote-requests/*`
- Dashboard quick stats include counts from both streams

---

## DEC-011: Operational schedule over simple market dates for delivery slots

**Date:** 2026-03-07
**Status:** Accepted
**Category:** Data Model

### Context

Customers need to select a delivery/pickup date and time when checking out. The system needs to know when the vendor is operational. The old design had only market dates (specific dates at specific markets). The new checkout flow requires a more general concept: when is the vendor available for orders?

### Options

| Option | Pros | Cons |
|--------|------|------|
| **A: Operational schedule (recurring weekly + date overrides)** | Covers recurring patterns ("every Saturday 9-3"). Covers one-offs ("special Sunday market on March 15"). Flexible enough for varied vendor schedules. Checkout can compute available slots | Must handle recurrence logic in checkout slot calculation. Slightly more complex data model |
| B: Explicit date listing (vendor adds each date manually) | Simple data model. No recurrence logic | Vendor must manually add every operational date. Tedious for weekly vendors. Easy to forget to add dates. Poor UX |
| C: Calendar integration (Google Calendar sync) | Vendor uses familiar tool. Real-time sync | Third-party dependency. OAuth complexity. Sync failures. Over-engineered for MVP |

### Decision

**Option A: Operational schedule with recurring weekly slots and optional date-specific overrides.**

### Rationale

- Most market vendors have a regular schedule: "Saturday 9:00-15:00" or "Friday and Saturday 10:00-16:00". Recurring weekly slots capture this with one setup
- Date-specific overrides handle exceptions: a special Sunday market, or closing on a holiday. The vendor adds/removes individual dates as needed
- The checkout flow computes available slots by: (1) generating dates from recurring weekly schedule, (2) applying date-specific overrides, (3) filtering to future dates only, (4) presenting as date+time picker
- This is separate from market dates (which are public calendar entries showing where the vendor will be physically located). Operational schedule is about when the vendor can fulfil orders
- Explicit date listing (Option B) would be tedious: a vendor who operates every Saturday would need to add 52 dates per year

### Consequences

- `operationalSchedule` nested array in tenant record with OperationalSlot objects
- Each slot has: dayOfWeek (0-6), startTime, endTime, and optional specificDate for overrides
- Checkout handler implements slot calculation logic: given a vendor's schedule, produce available date+time slots for the next N days
- Market dates remain separate: they are displayed on the public page as a calendar of physical market appearances
- Operational schedule is managed in the Profile tab of admin (alongside delivery settings)

---

## DEC-012: Customer CRM derived from orders, no separate customer table

**Date:** 2026-03-07
**Status:** Accepted
**Category:** Data Model

### Context

Vendors want to see their customer list: who has bought from them, how much they've spent, how many orders they've placed. The question is whether to maintain a separate customers table or derive customer data from orders.

### Options

| Option | Pros | Cons |
|--------|------|------|
| **A: Derived from orders (query-time aggregation)** | No data sync. Single source of truth (orders). No extra table. Always consistent. No write amplification on new orders | Query-time aggregation is slower than pre-computed. Must scan all orders to compute customer stats |
| B: Separate customers table (materialised view) | Fast reads. Pre-computed stats. Can add customer-specific data (notes, tags) | Must update customer record on every new order (write amplification). Sync bugs possible. Extra table to maintain. Customer deduplication logic needed |

### Decision

**Option A: Derive customer data from orders at query time.**

### Rationale

- At MVP scale (< 1000 orders per vendor), aggregating customer stats from orders is fast. DynamoDB GSI query by vendorSlug returns all orders, and in-memory aggregation by email produces the customer list
- No data sync issues: customer stats are always exactly correct because they're computed from the actual orders
- No write amplification: creating an order is a single DynamoDB PutItem, not PutItem + UpdateItem on a customer record
- If scale becomes a problem, a materialised view (DynamoDB Streams -> aggregation Lambda -> customers table) can be added later without changing the API contract
- Customer identity is email-based (no customer accounts), which keeps the model simple

### Consequences

- `GET /api/customers/{slug}` queries the orders GSI for all vendor orders, then aggregates by customerEmail in the Lambda handler
- Customer list response includes: name, email, totalSpent, orderCount, lastOrderDate
- Performance is bounded by order count per vendor. At 1000 orders with ~100 unique customers, this is < 1 second
- If order volume grows significantly, add DynamoDB Streams + aggregation. The API contract stays the same
- No customer notes or tags in MVP. Email is the only way to reach customers

---

## DEC-013: Minimal inline JS for cart functionality

**Date:** 2026-03-07
**Status:** Accepted
**Category:** Frontend / Performance
**Extends:** DEC-006 (Inline CSS)

### Context

The original design had zero JavaScript on vendor pages. Adding checkout requires cart functionality: add/remove items, quantity management, and localStorage persistence. The question is how to add this without breaking the self-contained nature of vendor pages.

### Options

| Option | Pros | Cons |
|--------|------|------|
| **A: Minimal inline JS (vanilla, in `<script>` tag)** | Self-contained. No framework. Small footprint (~2-5KB). Works with inline CSS approach. No external dependencies | Must write vanilla JS for cart UI. No component model. Manual DOM manipulation |
| B: React hydration (partial) | Component model. Familiar framework. Reuse admin SPA patterns | Massive bundle increase. Hydration latency. Framework overhead for a cart drawer. Breaks self-contained principle |
| C: Alpine.js / Petite-Vue | Lightweight interactivity. Declarative. Small bundle (~15KB) | External dependency. Another framework to learn. Still adds to page weight |
| D: Web Components | Standards-based. Encapsulated. No framework | Browser support concerns. Verbose API. Harder to test. Over-engineered for a cart |

### Decision

**Option A: Minimal inline vanilla JS in a `<script>` tag at the end of the HTML body.**

### Rationale

- Cart functionality is small: add item, remove item, change quantity, calculate total, show/hide drawer, persist to localStorage, redirect to checkout. This is ~50-100 lines of vanilla JS
- Inline JS keeps the page self-contained: one HTTP response contains everything. Consistent with the inline CSS approach
- No framework dependency means zero download cost. The JS is in the HTML response, already cached by CloudFront
- The page still renders fully without JS (products are visible, just can't add to cart). Progressive enhancement
- React hydration for a cart drawer would add 40-100KB of framework code. Absurd for what is essentially a few DOM operations
- The vendor page is a document, not an application. A small script for cart interactivity is appropriate

### Consequences

- Cart JS is a template string in the Renderer Lambda, appended to the HTML as an inline `<script>` tag
- Cart state stored in localStorage keyed by vendorSlug (so carts don't mix between vendors)
- Checkout button makes a POST to `/api/checkout/sessions` and redirects to the returned Stripe Checkout URL
- If JS is disabled, products display without add-to-cart buttons (graceful degradation)
- Cart JS must be tested: integration tests verify cart + checkout flow works end-to-end

---

## DEC-014: No platform fee. The subscription is the revenue

**Date:** 2026-08-11
**Status:** Accepted
**Category:** Business Model
**Supersedes:** The fee portion of DEC-009

### Context

DEC-009 adopted Stripe Connect destination charges with an `application_fee_amount`, giving
the platform a cut of every vendor sale. Separately, the only paying customer this business
has ever had, Sweet Sin, pays 8 pounds a month and stays for two stated reasons: it is
cheaper than the alternatives, and it takes no commission on checkouts. Those two positions
cannot both hold.

### Decision

**The application fee is zero. Revenue is the subscription: 8 pounds a month or 80 pounds a
year, both as Stripe subscriptions.**

Stripe Connect Express and destination charges stay exactly as DEC-009 describes, because
that is how a vendor gets paid and how the platform stays out of PCI scope. Only the fee
changes.

### Rationale

- Taking no commission is the differentiator against Fresha at 20 percent, Booksy Boost at
  30, Treatwell at about 42, and Deliveroo and Uber Eats at roughly 30. A marketplace
  structurally cannot match it, because commission is its whole revenue model. Being cheaper
  is not a moat; taking nothing is.
- The one retained customer names it as a reason he stays. That is the only retention
  evidence in existence and it outranks a projection.
- At 8 pounds the price sits below the threshold where a merchant stops to evaluate, which
  is the strategy rather than a compromise.
- The mechanism to charge a fee remains implemented and set to zero, so this is reversible
  without code if the model ever changes.

### Consequences

- `application_fee_amount` is zero on every destination charge, and a test asserts it,
  so nobody can reintroduce a fee accidentally.
- Vendors keep 100 percent of their sales minus Stripe's own processing.
- Platform revenue depends entirely on subscription conversion and retention, which makes
  churn the number the model is most sensitive to and the one to instrument first.

---

## DEC-015: Onboarding is a menu photograph, not an empty editor

**Date:** 2026-08-11
**Status:** Accepted
**Category:** Onboarding / Product

### Context

The predecessor product failed for a reason that has nothing to do with its market: the
founder had to build Sweet Sin's shop himself, because the merchant could not. Creation
defeated them. Editing did not, and the same merchant has maintained his own prices daily
for years. At 8 pounds a month a founder in the loop is a loss rather than a sale, so a
merchant who cannot self serve is not a customer.

### Decision

**A vendor photographs their physical menu and receives a complete populated shop.** They
never meet an empty editor. They only ever adjust something that already exists.

Fallbacks, in order: retake the photo with framing guidance, or type products by hand.

### Rationale

- Every micro food business already has a menu as an image, because they send it on
  WhatsApp. It needs no third party permission, no scraping, and no platform that can revoke
  access, and the data is better than anything scraped from a social profile.
- Editing an existing thing is proven to work with this audience. Creating from nothing is
  proven not to.
- The bar is a live shop with real products in under five minutes, unaided. Shopify and Wix
  are hours; Square Online is most of an hour.

### Consequences

- A new slice ahead of the existing admin work, since nothing downstream matters until a
  stranger can publish alone.
- Extraction runs on Bedrock, which the account already uses.
- Extraction is fallible by nature, so the review step is part of the flow rather than an
  error path, and must never present a wrong reading as a failure of the product.
- Designs for all seven screens exist at `atlantic-blue/maistro` under `v3/designs/`.

---

## DEC-016: Existing vendor URLs are permanent, so both routing shapes coexist

**Date:** 2026-08-11
**Status:** Accepted
**Category:** URL Architecture
**Extends:** DEC-008

### Context

DEC-008 chose subdirectory routing for SEO concentration and that reasoning still holds. But
Sweet Sin has been live at `sweetsin.maistro.live` for years. That address is in his
Instagram bio, in his customers' messages, and on anything he has printed.

### Decision

**Subdirectory routing remains the default for new vendors. Existing vendor URLs are never
changed.** `maistro.live` keeps serving indefinitely, independent of the rebrand.

### Rationale

- A merchant's address belongs to the merchant. Breaking it costs them customers, silently,
  and they will not know why.
- The cost of keeping an old distribution serving is pennies a month.

### Consequences

- `maistro.live` and its distribution, origin and host mapping stay running and are treated
  as out of scope for any cleanup.
- Migration for an existing vendor is opt in and only ever additive: a new address that
  works alongside the old one, never instead of it.

---

## DEC-017: Acceptance tests drive the real application, because mocks already shipped six bugs

**Date:** 2026-08-11
**Status:** Accepted
**Category:** Testing
**Extends:** DEC-005

### Context

`BUG-REPORT-S3.md` records six production blocking bugs that shipped after 250 tests passed:
API Gateway header casing, base64 encoded bodies, Stripe's 500 character metadata limit, a
metadata format mismatch between the checkout producer and the webhook consumer, a Content
Security Policy that blocked Stripe.js, and a live mode connected account under test mode
keys. Its own conclusion is that SDK level mocking hid every one of them.

### Decision

**Jest stays for unit and handler tests. A Playwright acceptance suite, with Cucumber feature
files as the inventory of what the product does, drives a really deployed environment against
real Stripe test mode.**

### Rationale

- Each of the six bugs lived in the seam between components, which is precisely where a
  mocked test cannot look. A suite that drives the real thing would have caught all six.
- Feature files double as the specification of what exists, which is what makes "every
  feature accounted for" checkable rather than aspirational.
- Playwright rather than Cypress because the journeys cross origins, being the admin
  application, the public shop and Stripe, and because device emulation matters when the
  target device is a phone.

### Consequences

- **The harness fails a run that discovers zero scenarios**, and asserts a minimum scenario
  count. A runner that finds nothing to do reports success otherwise, which is
  indistinguishable from passing.
- Every bug in `BUG-REPORT-S3.md` gets a scenario that fails against the original defect.
- Producer and consumer boundaries get a round trip scenario, so the metadata mismatch class
  cannot recur.
- At least one fixture is production scale, being the full catalogue rather than two items,
  since the metadata limit was invisible at small sizes.
- Test fixtures assert they target Stripe test mode, so a live mode account id cannot be
  seeded again.
