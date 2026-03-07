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
