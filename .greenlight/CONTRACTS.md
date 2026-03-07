# Contracts: Dmercato

All typed contracts for the dmercato MVP. Each contract represents a boundary where two things communicate. Contracts are the source of truth for test writers and implementers.

---

## Table of Contents

1. [Shared Types](#shared-types) (S-2, S-3, S-4, S-5)
2. [DB Package -- Tenants](#db-package--tenants) (S-2)
3. [DB Package -- Orders](#db-package--orders) (S-3, S-7)
4. [DB Package -- Quote Requests](#db-package--quote-requests) (S-4, S-8)
5. [DB Package -- Sessions](#db-package--sessions) (S-5)
6. [DB Package -- Magic Links](#db-package--magic-links) (S-5)
7. [Renderer Lambda](#renderer-lambda) (S-2)
8. [API Lambda -- Checkout](#api-lambda--checkout) (S-3)
9. [Stripe Webhook Lambda](#stripe-webhook-lambda) (S-3)
10. [Email -- Order Notifications](#email--order-notifications) (S-3)
11. [API Lambda -- Quote Requests](#api-lambda--quote-requests) (S-4, S-8)
12. [Auth Lambda](#auth-lambda) (S-5)
13. [Auth Middleware](#auth-middleware) (S-5)
14. [API Lambda -- Vendors](#api-lambda--vendors) (S-6)
15. [API Lambda -- Photos](#api-lambda--photos) (S-6)
16. [Cache Invalidator Lambda](#cache-invalidator-lambda) (S-6)
17. [API Lambda -- Orders](#api-lambda--orders) (S-7)
18. [API Lambda -- Customers](#api-lambda--customers) (S-7)
19. [API Lambda -- Stripe Account](#api-lambda--stripe-account) (S-9)
20. [Sitemap Lambda](#sitemap-lambda) (S-10)
21. [API Lambda Internal Routing](#api-lambda-internal-routing) (S-4)
22. [Terraform Infrastructure](#terraform-infrastructure) (S-2)
23. [Seed Data](#seed-data) (S-2)
24. [Admin SPA](#admin-spa) (S-5, S-6, S-7, S-8, S-9)

---

## Shared Types

### Contract: Tenant

**Boundary:** Shared types package -- consumed by all packages
**Slice:** S-2

**Definition:**
```typescript
interface SocialLinks {
  instagram?: string   // URL or handle
  tiktok?: string      // URL or handle
  facebook?: string    // URL or handle
  website?: string     // Full URL with protocol
}

interface Product {
  id: string            // UUID v4
  name: string          // 1-200 chars
  description: string   // 0-1000 chars
  price: number         // Integer, pence/cents, >= 0
  currency: string      // "gbp" | "aud" | "usd"
  imageKey: string      // S3 object key
  available: boolean
  order: number         // 0-based display order, integer >= 0
}

interface MarketDate {
  id: string            // UUID v4
  date: string          // ISO date YYYY-MM-DD
  marketName: string    // 1-200 chars
  location: string      // 1-200 chars
  address: string       // 1-500 chars
}

interface OperationalSlot {
  id: string            // UUID v4
  dayOfWeek: number     // 0 (Sunday) - 6 (Saturday)
  startTime: string     // HH:MM 24h format, e.g. "09:00"
  endTime: string       // HH:MM 24h format, e.g. "15:00"
  specificDate?: string // Optional YYYY-MM-DD override for a single date
}

type DomainStatus = 'none' | 'registering' | 'provisioning' | 'active' | 'failed'

interface Tenant {
  vendorSlug: string               // PK, 3-50 chars, lowercase alphanumeric + hyphens
  name: string                     // 1-200 chars
  tagline: string                  // 0-300 chars
  story: string                    // 0-500 chars
  city: string                     // Lowercase, 1-100 chars
  country: string                  // ISO 3166-1 alpha-2, exactly 2 uppercase chars
  categories: string[]             // 0-20 items, each 1-50 chars lowercase
  primaryPhotoKey: string          // S3 object key
  photoKeys: string[]              // 0-50 items, S3 object keys
  socialLinks: SocialLinks
  products: Product[]              // 0-50 items
  marketDates: MarketDate[]        // 0-100 items
  operationalSchedule: OperationalSlot[]  // 0-50 items, vendor's recurring + specific-date time slots
  deliveryEnabled: boolean         // Whether vendor offers delivery
  deliveryFee: number              // Delivery fee in pence/cents (integer, >= 0). 0 if free delivery
  takeoutEnabled: boolean          // Whether vendor offers takeout/pickup
  email: string                    // Valid email format
  stripeAccountId: string | null
  stripeOnboardingComplete: boolean
  customDomain: string | null
  domainStatus: DomainStatus
  domainOperationId: string | null
  domainCertificateArn: string | null
  plan: 'active' | 'cancelled'
  createdAt: string                // ISO 8601 UTC
  updatedAt: string                // ISO 8601 UTC
}
```

**Invariants:**
- vendorSlug must not be a reserved path: `api`, `admin`, `assets`, `sitemap`, `robots.txt`, `favicon.ico`, `www`, `search`
- vendorSlug is URL-safe: lowercase alphanumeric and hyphens only, 3-50 chars, must not start or end with a hyphen
- All timestamps are ISO 8601 UTC strings
- Product IDs, MarketDate IDs, and OperationalSlot IDs are UUID v4
- Product prices are non-negative integers (pence/cents)
- currency values are lowercase three-letter codes
- country values are uppercase two-letter ISO codes
- deliveryFee is a non-negative integer (pence/cents)
- OperationalSlot.dayOfWeek is an integer 0-6
- OperationalSlot times are in HH:MM 24h format

**Verification:** auto
**Dependencies:** None

---

### Contract: Order

**Boundary:** Shared types package -- consumed by API Lambda, Stripe Webhook Lambda, DB package, Admin SPA
**Slice:** S-3

**Definition:**
```typescript
interface OrderItem {
  productId: string    // UUID v4, references Product.id at time of purchase
  name: string         // Product name (snapshotted at purchase time)
  price: number        // Unit price in pence/cents (snapshotted at purchase time)
  quantity: number     // Positive integer
  subtotal: number     // price * quantity
}

type OrderStatus = 'paid' | 'fulfilled' | 'refunded'
type FulfilmentMethod = 'takeout' | 'delivery'

interface Order {
  orderId: string             // UUID v4, PK
  vendorSlug: string          // Links to tenant
  customerName: string        // 1-200 chars
  customerEmail: string       // Valid email
  customerPhone?: string      // Optional, 0-30 chars
  items: OrderItem[]          // 1+ items
  subtotal: number            // Sum of item subtotals, pence/cents
  deliveryFee: number         // 0 if takeout, vendor's fee if delivery
  total: number               // subtotal + deliveryFee
  platformFee: number         // application_fee_amount in pence/cents
  currency: string            // "gbp" | "aud" | "usd"
  fulfilmentMethod: FulfilmentMethod
  deliveryNotes?: string      // Optional customer delivery instructions
  requestedDate: string       // ISO date YYYY-MM-DD
  requestedTime: string       // HH:MM 24h format
  stripeCheckoutSessionId: string
  stripePaymentIntentId: string
  status: OrderStatus
  createdAt: string           // ISO 8601 UTC
  updatedAt: string           // ISO 8601 UTC
}
```

**Invariants:**
- orderId is UUID v4
- items array has at least one item
- subtotal equals sum of all item subtotals
- total equals subtotal + deliveryFee
- deliveryFee is 0 when fulfilmentMethod is "takeout"
- Each item subtotal equals item price * item quantity
- status transitions: only "paid" -> "fulfilled" is allowed via the API
- Prices are snapshotted at purchase time (not references to current product prices)
- All monetary values are non-negative integers (pence/cents)

**Verification:** auto
**Dependencies:** None

---

### Contract: QuoteRequest

**Boundary:** Shared types package -- consumed by API Lambda, DB package, Admin SPA
**Slice:** S-4

**Definition:**
```typescript
type EventType = 'corporate' | 'birthday' | 'wedding' | 'market' | 'other'

interface QuoteRequest {
  requestId: string       // UUID v4
  vendorSlug: string      // Links to tenant
  name: string            // 1-200 chars
  email: string           // Valid email format
  phone?: string          // Optional, 0-30 chars
  eventType: EventType
  guestCount?: number     // Optional, positive integer, 1-10000
  eventDate?: string      // Optional, ISO date YYYY-MM-DD
  message: string         // 10-2000 chars
  read: boolean           // Default false
  createdAt: string       // ISO 8601 UTC
}
```

**Invariants:**
- requestId is UUID v4
- read defaults to false on creation
- message length is 10-2000 characters
- eventType is one of the five allowed values
- guestCount, when present, is a positive integer

**Verification:** auto
**Dependencies:** None

---

### Contract: Session

**Boundary:** Shared types package -- consumed by Auth Lambda, DB package
**Slice:** S-5

**Definition:**
```typescript
interface Session {
  token: string          // UUID v4, PK
  vendorSlug: string     // Links to tenant
  createdAt: string      // ISO 8601 UTC
  expiresAt: number      // Unix epoch seconds, 30 days from creation
}
```

**Invariants:**
- token is UUID v4
- expiresAt is always 30 days after createdAt (2,592,000 seconds)
- DynamoDB TTL attribute is expiresAt

**Verification:** auto
**Dependencies:** None

---

### Contract: MagicLink

**Boundary:** Shared types package -- consumed by Auth Lambda, DB package
**Slice:** S-5

**Definition:**
```typescript
interface MagicLink {
  token: string          // UUID v4, PK
  vendorSlug: string     // Links to tenant
  email: string          // Vendor email
  createdAt: string      // ISO 8601 UTC
  expiresAt: number      // Unix epoch seconds, 15 min from creation
}
```

**Invariants:**
- token is UUID v4
- expiresAt is always 15 minutes after createdAt (900 seconds)
- DynamoDB TTL attribute is expiresAt
- Token is single-use: deleted after successful verification

**Verification:** auto
**Dependencies:** None

---

### Contract: ApiResponse

**Boundary:** Shared types package -- consumed by all Lambda handlers and Admin SPA
**Slice:** S-3

**Definition:**
```typescript
interface ApiSuccessResponse<T> {
  data: T
  meta?: {
    cursor?: string      // Opaque pagination token (base64-encoded LastEvaluatedKey)
    count?: number       // Total count when available
  }
}

interface ApiErrorResponse {
  error: {
    code: string         // Machine-readable error code e.g. "VALIDATION_ERROR"
    message: string      // Human-readable description
  }
}

type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse
```

**Invariants:**
- Every API response is either a success (has `data` field) or an error (has `error` field), never both
- Error responses never contain a `data` field
- Success responses never contain an `error` field
- HTTP status codes match error semantics: 400 = client error, 401 = unauthenticated, 403 = forbidden, 404 = not found, 409 = conflict, 429 = rate limited, 500 = server error

**Verification:** auto
**Dependencies:** None

---

### Contract: InputValidation

**Boundary:** Shared types package -- validation functions consumed by Lambda handlers
**Slice:** S-3

**Definition:**
```typescript
interface ValidationResult {
  valid: boolean
  errors: ValidationFieldError[]
}

interface ValidationFieldError {
  field: string          // Dot-path to the invalid field e.g. "items.0.quantity"
  message: string        // Human-readable reason
  code: string           // Machine-readable code e.g. "REQUIRED", "TOO_LONG", "INVALID_FORMAT"
}

// Exported validation functions
function validateCheckoutInput(input: unknown): ValidationResult
function validateQuoteRequestInput(input: unknown): ValidationResult
function validateVendorUpdateInput(input: unknown): ValidationResult
function validatePhotoUploadInput(input: unknown): ValidationResult
function validateEmail(email: unknown): boolean
function validateVendorSlug(slug: unknown): boolean
```

**Errors:**
| Error | Code | When |
|-------|------|------|
| Required field missing | REQUIRED | A required field is null, undefined, or empty string |
| String too long | TOO_LONG | String exceeds max length for that field |
| String too short | TOO_SHORT | String below min length for that field |
| Invalid format | INVALID_FORMAT | Email, date, slug, or URL fails format check |
| Invalid value | INVALID_VALUE | Enum value not in allowed set, number out of range |
| Unknown field | UNKNOWN_FIELD | Request body contains a field not in the schema |

**Invariants:**
- Validation functions accept `unknown` and perform type narrowing
- Validation never throws -- always returns a ValidationResult
- All validation errors include field path, message, and code
- Unknown fields in request bodies are rejected
- Empty strings are treated as missing for required fields

**Verification:** auto
**Dependencies:** None

---

## DB Package -- Tenants

### Contract: GetTenantBySlug

**Boundary:** DB package -> DynamoDB (tenants table)
**Slice:** S-2

**Input:**
```typescript
interface GetTenantBySlugInput {
  vendorSlug: string     // PK lookup
}
```

**Output:**
```typescript
// Returns Tenant or null if not found
type GetTenantBySlugOutput = Tenant | null
```

**Errors:**
| Error | When |
|-------|------|
| DatabaseError | DynamoDB call fails (network, throttle, etc.) |

**Invariants:**
- Uses GetItem on PK (vendorSlug), not a scan
- Returns null for non-existent slugs, does not throw
- Returns the full Tenant object with all fields

**Verification:** auto
**Dependencies:** Tenant (S-2)

---

### Contract: UpdateTenant

**Boundary:** DB package -> DynamoDB (tenants table)
**Slice:** S-6

**Input:**
```typescript
interface UpdateTenantInput {
  vendorSlug: string     // PK -- identifies which tenant to update
  updates: Partial<Pick<Tenant,
    'name' | 'tagline' | 'story' | 'city' | 'country' |
    'categories' | 'primaryPhotoKey' | 'photoKeys' |
    'socialLinks' | 'products' | 'marketDates' |
    'operationalSchedule' | 'deliveryEnabled' | 'deliveryFee' | 'takeoutEnabled' |
    'stripeAccountId' | 'stripeOnboardingComplete'
  >>
}
```

**Output:**
```typescript
// Returns the full updated Tenant
type UpdateTenantOutput = Tenant
```

**Errors:**
| Error | When |
|-------|------|
| TenantNotFoundError | vendorSlug does not exist in the table |
| DatabaseError | DynamoDB call fails |

**Invariants:**
- Always sets updatedAt to current UTC timestamp
- Uses DynamoDB UpdateExpression (not PutItem) to avoid overwriting fields not in the update
- ConditionExpression ensures the item exists (attribute_exists(vendorSlug))
- email, plan, domain fields are NOT updatable through this function (except stripeAccountId and stripeOnboardingComplete which are set by the Stripe flows)
- Returns the full tenant after update (ReturnValues: ALL_NEW)

**Verification:** auto
**Dependencies:** Tenant (S-2)

---

### Contract: GetTenantByEmail

**Boundary:** DB package -> DynamoDB (tenants table)
**Slice:** S-5

**Input:**
```typescript
interface GetTenantByEmailInput {
  email: string
}
```

**Output:**
```typescript
// Returns Tenant or null if no tenant has this email
type GetTenantByEmailOutput = Tenant | null
```

**Errors:**
| Error | When |
|-------|------|
| DatabaseError | DynamoDB call fails |

**Invariants:**
- Since email is not a PK or GSI key, this performs a scan with filter on email
- In MVP with few vendors, scan is acceptable
- Returns null if no matching tenant found

**Verification:** auto
**Dependencies:** Tenant (S-2)

---

### Contract: ScanAllTenants

**Boundary:** DB package -> DynamoDB (tenants table)
**Slice:** S-10

**Input:**
```typescript
// No meaningful input -- scans all tenants
interface ScanAllTenantsInput {
  limit?: number         // Default: no limit (full scan for sitemap)
}
```

**Output:**
```typescript
interface ScanAllTenantsOutput {
  tenants: Pick<Tenant, 'vendorSlug' | 'city' | 'updatedAt'>[]
}
```

**Errors:**
| Error | When |
|-------|------|
| DatabaseError | DynamoDB call fails |

**Invariants:**
- Projects only the fields needed (vendorSlug, city, updatedAt) to minimize read capacity
- Handles pagination internally (follows all LastEvaluatedKey pages)
- Returns empty array when table is empty

**Verification:** auto
**Dependencies:** Tenant (S-2)

---

## DB Package -- Orders

### Contract: CreateOrder

**Boundary:** DB package -> DynamoDB (orders table)
**Slice:** S-3

**Input:**
```typescript
interface CreateOrderInput {
  vendorSlug: string
  customerName: string
  customerEmail: string
  customerPhone?: string
  items: OrderItem[]
  subtotal: number
  deliveryFee: number
  total: number
  platformFee: number
  currency: string
  fulfilmentMethod: FulfilmentMethod
  deliveryNotes?: string
  requestedDate: string
  requestedTime: string
  stripeCheckoutSessionId: string
  stripePaymentIntentId: string
}
```

**Output:**
```typescript
interface CreateOrderOutput {
  orderId: string        // Generated UUID v4
  createdAt: string      // ISO 8601 UTC
}
```

**Errors:**
| Error | When |
|-------|------|
| DatabaseError | DynamoDB PutItem fails |
| DuplicateOrderError | Order with same stripeCheckoutSessionId already exists |

**Invariants:**
- Generates a new UUID v4 for orderId
- Sets createdAt and updatedAt to current UTC timestamp
- Sets status to "paid"
- Uses ConditionExpression on a GSI or secondary check to prevent duplicate orders from webhook retries (checks stripeCheckoutSessionId)
- Does NOT validate vendorSlug existence (caller's responsibility)

**Verification:** auto
**Dependencies:** Order (S-3)

---

### Contract: GetOrdersByVendor

**Boundary:** DB package -> DynamoDB (orders table, vendorSlug-createdAt-index GSI)
**Slice:** S-7

**Input:**
```typescript
interface GetOrdersByVendorInput {
  vendorSlug: string
  limit?: number         // Default 20, max 50
  cursor?: string        // Opaque pagination token
  status?: OrderStatus   // Optional filter: "paid" | "fulfilled" | "refunded"
}
```

**Output:**
```typescript
interface GetOrdersByVendorOutput {
  orders: Order[]
  cursor?: string        // Present if more results exist
}
```

**Errors:**
| Error | When |
|-------|------|
| DatabaseError | DynamoDB query fails |

**Invariants:**
- Uses vendorSlug-createdAt-index GSI
- Results sorted by createdAt descending (ScanIndexForward: false)
- When status filter is provided, applies FilterExpression
- Returns empty array when no orders exist
- Cursor is base64-encoded DynamoDB LastEvaluatedKey
- Limit is clamped to 1-50 range

**Verification:** auto
**Dependencies:** Order (S-3)

---

### Contract: GetOrderDetail

**Boundary:** DB package -> DynamoDB (orders table)
**Slice:** S-7

**Input:**
```typescript
interface GetOrderDetailInput {
  orderId: string
}
```

**Output:**
```typescript
// Returns full Order or null if not found
type GetOrderDetailOutput = Order | null
```

**Errors:**
| Error | When |
|-------|------|
| DatabaseError | DynamoDB GetItem fails |

**Invariants:**
- Uses GetItem on PK (orderId)
- Returns null if order does not exist, does not throw
- Returns the complete Order with all fields

**Verification:** auto
**Dependencies:** Order (S-3)

---

### Contract: UpdateOrderStatus

**Boundary:** DB package -> DynamoDB (orders table)
**Slice:** S-7

**Input:**
```typescript
interface UpdateOrderStatusInput {
  orderId: string
  vendorSlug: string     // For authorization condition
  status: 'fulfilled'    // Only valid target status via API
}
```

**Output:**
```typescript
// Returns the updated Order
type UpdateOrderStatusOutput = Order
```

**Errors:**
| Error | When |
|-------|------|
| OrderNotFoundError | orderId does not exist or vendorSlug does not match |
| InvalidStatusTransitionError | Order is not in "paid" status |
| DatabaseError | DynamoDB call fails |

**Invariants:**
- ConditionExpression: attribute_exists(orderId) AND vendorSlug = :vendorSlug AND status = :paid
- Only "paid" -> "fulfilled" transition is allowed
- Sets updatedAt to current UTC timestamp
- Returns updated order (ReturnValues: ALL_NEW)

**Verification:** auto
**Dependencies:** Order (S-3)

---

## DB Package -- Quote Requests

### Contract: CreateQuoteRequest

**Boundary:** DB package -> DynamoDB (quoteRequests table)
**Slice:** S-4

**Input:**
```typescript
interface CreateQuoteRequestInput {
  vendorSlug: string
  name: string
  email: string
  phone?: string
  eventType: EventType
  guestCount?: number
  eventDate?: string
  message: string
}
```

**Output:**
```typescript
interface CreateQuoteRequestOutput {
  requestId: string      // Generated UUID v4
  createdAt: string      // ISO 8601 UTC
}
```

**Errors:**
| Error | When |
|-------|------|
| DatabaseError | DynamoDB PutItem fails |

**Invariants:**
- Generates a new UUID v4 for requestId
- Sets createdAt to current UTC timestamp
- Sets read to false
- Does NOT validate that vendorSlug exists (caller's responsibility)

**Verification:** auto
**Dependencies:** QuoteRequest (S-4)

---

### Contract: GetQuoteRequestsByVendor

**Boundary:** DB package -> DynamoDB (quoteRequests table, vendorSlug-createdAt-index GSI)
**Slice:** S-8

**Input:**
```typescript
interface GetQuoteRequestsByVendorInput {
  vendorSlug: string
  limit?: number         // Default 20, max 50
  cursor?: string        // Opaque pagination token
}
```

**Output:**
```typescript
interface GetQuoteRequestsByVendorOutput {
  quoteRequests: QuoteRequest[]
  cursor?: string        // Present if more results exist
}
```

**Errors:**
| Error | When |
|-------|------|
| DatabaseError | DynamoDB query fails |

**Invariants:**
- Uses vendorSlug-createdAt-index GSI
- Results sorted by createdAt descending (ScanIndexForward: false)
- Returns empty array when no quote requests exist
- Cursor is base64-encoded DynamoDB LastEvaluatedKey
- Limit is clamped to 1-50 range

**Verification:** auto
**Dependencies:** QuoteRequest (S-4)

---

### Contract: MarkQuoteRequestRead

**Boundary:** DB package -> DynamoDB (quoteRequests table)
**Slice:** S-8

**Input:**
```typescript
interface MarkQuoteRequestReadInput {
  requestId: string
  vendorSlug: string     // Used for authorization check in condition
}
```

**Output:**
```typescript
// Returns the updated QuoteRequest
type MarkQuoteRequestReadOutput = QuoteRequest
```

**Errors:**
| Error | When |
|-------|------|
| QuoteRequestNotFoundError | requestId does not exist or vendorSlug does not match |
| DatabaseError | DynamoDB call fails |

**Invariants:**
- ConditionExpression: attribute_exists(requestId) AND vendorSlug = :vendorSlug
- Sets read to true
- Returns updated item (ReturnValues: ALL_NEW)
- Idempotent: marking an already-read request as read succeeds without error

**Verification:** auto
**Dependencies:** QuoteRequest (S-4)

---

## DB Package -- Sessions

### Contract: CreateSession

**Boundary:** DB package -> DynamoDB (sessions table)
**Slice:** S-5

**Input:**
```typescript
interface CreateSessionInput {
  vendorSlug: string
}
```

**Output:**
```typescript
interface CreateSessionOutput {
  token: string          // Generated UUID v4
  expiresAt: number      // Unix epoch, 30 days from now
}
```

**Errors:**
| Error | When |
|-------|------|
| DatabaseError | DynamoDB PutItem fails |

**Invariants:**
- Generates a new UUID v4 for token
- Sets createdAt to current UTC timestamp
- Sets expiresAt to 30 days (2,592,000 seconds) from now
- expiresAt is used as DynamoDB TTL attribute

**Verification:** auto
**Dependencies:** Session (S-5)

---

### Contract: GetSession

**Boundary:** DB package -> DynamoDB (sessions table)
**Slice:** S-5

**Input:**
```typescript
interface GetSessionInput {
  token: string
}
```

**Output:**
```typescript
// Returns Session or null if not found or expired
type GetSessionOutput = Session | null
```

**Errors:**
| Error | When |
|-------|------|
| DatabaseError | DynamoDB GetItem fails |

**Invariants:**
- Uses GetItem on PK (token)
- Returns null if token does not exist
- Returns null if session has expired (expiresAt < current time), even if DynamoDB TTL has not yet cleaned it up
- Never returns an expired session

**Verification:** auto
**Dependencies:** Session (S-5)

---

### Contract: DeleteSession

**Boundary:** DB package -> DynamoDB (sessions table)
**Slice:** S-5

**Input:**
```typescript
interface DeleteSessionInput {
  token: string
}
```

**Output:**
```typescript
// Returns void. Idempotent -- deleting a non-existent session is not an error
type DeleteSessionOutput = void
```

**Errors:**
| Error | When |
|-------|------|
| DatabaseError | DynamoDB DeleteItem fails |

**Invariants:**
- Idempotent: no error if token does not exist
- Uses DeleteItem, not a conditional delete

**Verification:** auto
**Dependencies:** Session (S-5)

---

## DB Package -- Magic Links

### Contract: CreateMagicLink

**Boundary:** DB package -> DynamoDB (magicLinks table)
**Slice:** S-5

**Input:**
```typescript
interface CreateMagicLinkInput {
  vendorSlug: string
  email: string
}
```

**Output:**
```typescript
interface CreateMagicLinkOutput {
  token: string          // Generated UUID v4
  expiresAt: number      // Unix epoch, 15 min from now
}
```

**Errors:**
| Error | When |
|-------|------|
| DatabaseError | DynamoDB PutItem fails |

**Invariants:**
- Generates a new UUID v4 for token
- Sets createdAt to current UTC timestamp
- Sets expiresAt to 15 minutes (900 seconds) from now
- expiresAt is used as DynamoDB TTL attribute

**Verification:** auto
**Dependencies:** MagicLink (S-5)

---

### Contract: GetAndDeleteMagicLink

**Boundary:** DB package -> DynamoDB (magicLinks table)
**Slice:** S-5

**Input:**
```typescript
interface GetAndDeleteMagicLinkInput {
  token: string
}
```

**Output:**
```typescript
// Returns MagicLink or null if not found / expired
type GetAndDeleteMagicLinkOutput = MagicLink | null
```

**Errors:**
| Error | When |
|-------|------|
| DatabaseError | DynamoDB call fails |

**Invariants:**
- Atomically reads and deletes the magic link (DeleteItem with ReturnValues: ALL_OLD)
- Returns null if token does not exist
- Returns null if token has expired (expiresAt < current time), and still deletes it
- Token is single-use: after this call, the same token cannot be used again
- Atomicity prevents race conditions (two simultaneous verifications of the same token)

**Verification:** auto
**Dependencies:** MagicLink (S-5)

---

## Renderer Lambda

### Contract: RenderVendorPage

**Boundary:** CloudFront -> Renderer Lambda
**Slice:** S-2

**Input:**
```typescript
// Lambda receives a CloudFront or API Gateway V2 event
// The relevant field is the path, which contains the vendor slug
interface RenderVendorPageInput {
  path: string           // e.g. "/sweet-sin" -- extract slug by removing leading "/"
}
```

**Output:**
```typescript
interface RenderVendorPageOutput {
  statusCode: 200 | 404
  headers: {
    'Content-Type': 'text/html; charset=utf-8'
    'Cache-Control': 'public, max-age=60'
    'X-Content-Type-Options': 'nosniff'
    'X-Frame-Options': 'DENY'
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
  }
  body: string           // Complete HTML document
}
```

**Errors:**
| Error | Status | When |
|-------|--------|------|
| VendorNotFound | 404 | Slug does not match any tenant in DynamoDB |
| InternalError | 500 | DynamoDB read fails or renderer throws |

**Invariants:**
- 200 response body is a complete, valid HTML5 document (starts with `<!DOCTYPE html>`)
- HTML includes inline CSS (no external stylesheet `<link>` tags)
- HTML includes `<title>` tag with vendor name
- HTML includes `<meta name="description">` with vendor tagline
- HTML includes Open Graph tags: og:title, og:description, og:image, og:url, og:type
- HTML includes canonical URL: `<link rel="canonical" href="https://dmercato.com/{slug}">`
- HTML includes JSON-LD script tag with LocalBusiness schema
- HTML includes JSON-LD for each product (Product schema with prices) when products exist
- Product cards include name, description, price, and add-to-cart button
- Add-to-cart buttons are disabled if vendor stripeOnboardingComplete is false
- Cart drawer includes item list, quantities, subtotal, delivery fee (if applicable), checkout button
- Checkout section in cart drawer includes: customer name, email, phone fields, fulfilment method toggle, date/time picker from operational schedule, delivery notes (if delivery), and "Pay now" button
- Operational hours/schedule section renders the vendor's operational slots
- Delivery/takeout availability is displayed based on vendor settings
- 404 response body is a styled error page (not raw text)
- All vendor-provided content is HTML-escaped to prevent XSS
- No external JavaScript is required for the page to render
- Minimal inline JS handles cart functionality (localStorage-based)
- Cache-Control is `public, max-age=60` for 200, `no-cache` for 404

**Security:**
- Auth: public
- Input validation: slug extracted from path, validated for format
- XSS: all vendor content HTML-escaped

**Verification:** verify
**Acceptance Criteria:**
- Vendor page renders a complete HTML document with the vendor's name, tagline, story, products with prices, market dates, operational schedule, and delivery/takeout options
- Page includes all SEO metadata (title, description, OG tags, canonical, JSON-LD with Product schemas)
- CSS is fully inline with no external stylesheet requests
- Product cards display add-to-cart buttons (disabled when Stripe not onboarded)
- Cart drawer functions: add items, adjust quantities, see subtotal, select fulfilment method, pick date/time from operational schedule
- Non-existent slugs return a styled 404 page

**Steps:**
- Run `curl -s https://staging.dmercato.com/sweet-sin` and verify HTML contains Oscar's vendor data with products and prices
- View page source and confirm no `<link rel="stylesheet">` tags exist
- Run `curl -s -o /dev/null -w "%{http_code}" https://staging.dmercato.com/nonexistent` and verify 404
- Open the page in a browser, add a product to cart, verify cart drawer shows item with correct price

**Dependencies:** GetTenantBySlug (S-2), Tenant (S-2)

---

### Contract: GenerateSeoMetadata

**Boundary:** Internal to Renderer Lambda -- renderer module -> SEO module
**Slice:** S-2

**Input:**
```typescript
interface GenerateSeoMetadataInput {
  tenant: Tenant
  baseUrl: string        // "https://dmercato.com"
}
```

**Output:**
```typescript
interface SeoMetadata {
  title: string                    // "{name} | Dmercato"
  description: string              // Vendor tagline, truncated to 160 chars
  canonicalUrl: string             // "{baseUrl}/{vendorSlug}"
  ogTags: {
    'og:title': string
    'og:description': string
    'og:image': string             // Primary photo URL via CloudFront
    'og:url': string
    'og:type': 'website'
  }
  jsonLd: object                   // LocalBusiness schema + Product schemas
}
```

**Invariants:**
- Title format is always `{name} | Dmercato`
- Description is truncated to 160 characters with ellipsis if longer
- og:image uses the CloudFront assets URL, not a direct S3 URL
- JSON-LD conforms to schema.org LocalBusiness type
- JSON-LD includes Product items with prices only when products array is non-empty

**Verification:** auto
**Dependencies:** Tenant (S-2)

---

### Contract: RenderHtmlTemplate

**Boundary:** Internal to Renderer Lambda -- handler -> template module
**Slice:** S-2

**Input:**
```typescript
interface RenderHtmlTemplateInput {
  tenant: Tenant
  seoMetadata: SeoMetadata
  assetsBaseUrl: string    // "https://dmercato.com/assets"
}
```

**Output:**
```typescript
// Returns a complete HTML string
type RenderHtmlTemplateOutput = string
```

**Invariants:**
- Output starts with `<!DOCTYPE html>`
- Output includes `<html lang="en">`
- Output includes inline `<style>` block(s) -- no `<link rel="stylesheet">`
- All sections present: nav, hero, story, products (if any), market calendar (if any), quote form, more-in-city strip, footer
- Mobile bottom nav is included in the HTML
- Google Fonts are loaded via `<link rel="preconnect">` and `<link href="fonts.googleapis.com">`
- All user-provided strings are HTML-escaped
- Cart drawer HTML with inline JS for localStorage-based cart management
- Checkout form fields within cart drawer

**Verification:** auto
**Dependencies:** Tenant (S-2), GenerateSeoMetadata (S-2)

---

## API Lambda -- Checkout

### Contract: CreateCheckoutSession

**Boundary:** API Gateway -> API Lambda (POST /api/checkout/sessions)
**Slice:** S-3

**Input:**
```typescript
// HTTP POST /api/checkout/sessions
// Public endpoint, no auth required
interface CreateCheckoutSessionInput {
  body: {
    vendorSlug: string
    items: Array<{
      productId: string      // Must reference an existing, available product
      quantity: number        // Positive integer, >= 1
    }>
    customerName: string     // 1-200 chars
    customerEmail: string    // Valid email
    customerPhone?: string   // Optional, 0-30 chars
    fulfilmentMethod: FulfilmentMethod   // "takeout" | "delivery"
    deliveryNotes?: string   // Optional, 0-1000 chars
    requestedDate: string    // ISO date YYYY-MM-DD
    requestedTime: string    // HH:MM 24h format
  }
  sourceIp: string           // For rate limiting
}
```

**Output:**
```typescript
// 200: { data: { checkoutSessionId: string, checkoutUrl: string } }
interface CreateCheckoutSessionOutput {
  statusCode: 200 | 400 | 404 | 409 | 429 | 500
  headers: { 'Content-Type': 'application/json' }
  body: string   // JSON-serialized ApiResponse<{ checkoutSessionId: string, checkoutUrl: string }>
}
```

**Errors:**
| Error | Status | When |
|-------|--------|------|
| ValidationError | 400 | Request body fails validation (missing fields, invalid formats, invalid product IDs, product not available, invalid date/time) |
| VendorNotFound | 404 | vendorSlug does not match any tenant |
| StripeNotOnboarded | 409 | Vendor has not completed Stripe Connect onboarding |
| RateLimited | 429 | More than 10 checkout sessions from this IP per hour |
| InternalError | 500 | Stripe API or DynamoDB failure |

**Side effects:**
- Reads tenant from DynamoDB to validate products, prices, schedule, and Stripe account
- Creates a Stripe Checkout Session with destination charge to vendor's connected account

**Invariants:**
- Prices are read from DynamoDB at request time, NEVER trusted from the client
- Each item's productId must reference an existing product in the vendor's products array
- Each referenced product must have `available: true`
- Subtotal is calculated server-side as sum of (product.price * quantity)
- If fulfilmentMethod is "delivery", deliveryFee is read from vendor's deliveryFee field; vendor must have deliveryEnabled = true
- If fulfilmentMethod is "takeout", vendor must have takeoutEnabled = true; deliveryFee is 0
- requestedDate + requestedTime must fall within the vendor's operational schedule
- Total = subtotal + deliveryFee
- Platform fee (application_fee_amount) is calculated as a percentage of total, read from SSM config
- Stripe Checkout Session uses destination charges: `payment_intent_data.transfer_data.destination` = vendor's stripeAccountId
- Success URL redirects back to vendor page with confirmation query param
- Cancel URL redirects back to vendor page

**Security:**
- Auth: public
- Input validation: validateCheckoutInput
- Rate limit: 10/hour/IP
- Server-side price validation prevents price manipulation

**Verification:** verify
**Acceptance Criteria:**
- Valid checkout request returns a Stripe Checkout Session URL
- Customer is redirected to Stripe-hosted checkout page
- Prices in the Stripe session match server-side DynamoDB prices, not client-submitted values
- Checkout for vendor without Stripe onboarding returns 409
- Invalid product IDs or unavailable products return 400
- Requested date/time outside operational schedule returns 400

**Steps:**
- POST /api/checkout/sessions with valid items for sweet-sin, verify 200 with checkoutUrl
- Open the checkoutUrl and verify Stripe Checkout page shows correct items and total
- POST with a productId that does not exist, verify 400
- POST with delivery method when vendor has deliveryEnabled = false, verify 400

**Dependencies:** GetTenantBySlug (S-2), ApiResponse (S-3), InputValidation (S-3)

---

## Stripe Webhook Lambda

### Contract: StripeWebhookHandler

**Boundary:** Stripe -> Stripe Webhook Lambda (POST /api/stripe/webhook)
**Slice:** S-3

**Input:**
```typescript
// HTTP POST /api/stripe/webhook
// Stripe sends raw body + Stripe-Signature header
interface StripeWebhookHandlerInput {
  headers: {
    'stripe-signature': string   // Stripe webhook signature
  }
  body: string                   // Raw JSON body (NOT parsed -- needed for signature verification)
}
```

**Output:**
```typescript
interface StripeWebhookHandlerOutput {
  statusCode: 200 | 400 | 500
  headers: { 'Content-Type': 'application/json' }
  body: string   // { received: true } on success
}
```

**Errors:**
| Error | Status | When |
|-------|--------|------|
| InvalidSignature | 400 | Stripe signature verification fails |
| InternalError | 500 | Database write or email send fails |

**Side effects (checkout.session.completed):**
- Creates order record in DynamoDB with status "paid"
- Sends receipt email to customer via SES
- Sends order notification email to vendor via SES

**Side effects (account.updated):**
- Updates tenant stripeOnboardingComplete based on charges_enabled status

**Invariants:**
- Stripe signature is verified using webhook secret from SSM before processing
- Handler is idempotent: checks if order with same stripeCheckoutSessionId already exists before creating
- If order already exists (duplicate webhook), returns 200 without creating duplicate
- Raw request body is used for signature verification (not parsed JSON)
- checkout.session.completed: extracts customer info, items, and amounts from Stripe session metadata
- account.updated: only updates stripeOnboardingComplete field on the tenant record
- Email failures do not cause the webhook to return an error (best-effort email)
- Unhandled event types return 200 (acknowledge receipt, no processing)

**Security:**
- Auth: Stripe signature verification (no session cookie)
- Webhook secret from SSM Parameter Store

**Verification:** verify
**Acceptance Criteria:**
- Successful Stripe payment creates an order record in DynamoDB with status "paid"
- Customer receives a receipt email with order details
- Vendor receives a notification email with order details and delivery info
- Duplicate webhook delivery does not create duplicate orders
- Invalid Stripe signature returns 400

**Steps:**
- Complete a Stripe test payment, verify order appears in DynamoDB
- Check customer email for receipt with items and total
- Check vendor email for notification with items, customer info, and delivery details
- Send the same webhook event again, verify no duplicate order is created

**Dependencies:** CreateOrder (S-3), SendOrderConfirmationEmail (S-3), SendVendorOrderNotificationEmail (S-3), GetTenantBySlug (S-2), UpdateTenant (S-6)

---

## Email -- Order Notifications

### Contract: SendOrderConfirmationEmail

**Boundary:** Stripe Webhook Lambda -> SES
**Slice:** S-3

**Input:**
```typescript
interface SendOrderConfirmationEmailInput {
  customerEmail: string
  customerName: string
  order: {
    orderId: string
    items: OrderItem[]
    subtotal: number
    deliveryFee: number
    total: number
    currency: string
    fulfilmentMethod: FulfilmentMethod
    requestedDate: string
    requestedTime: string
    deliveryNotes?: string
  }
  vendorName: string
}
```

**Output:**
```typescript
interface SendOrderConfirmationEmailOutput {
  messageId: string          // SES message ID
}
```

**Errors:**
| Error | When |
|-------|------|
| EmailSendError | SES API call fails |

**Invariants:**
- From address is always `noreply@dmercato.com`
- Subject: `Your order from {vendorName} - #{orderId short}`
- Email body includes: item list with quantities and prices, subtotal, delivery fee (if applicable), total, fulfilment method, requested date/time, delivery notes (if present)
- Prices are formatted with currency symbol (e.g. "$12.50" not "1250")
- This function does not throw on failure -- returns the error for caller to handle

**Verification:** auto
**Dependencies:** Order (S-3)

---

### Contract: SendVendorOrderNotificationEmail

**Boundary:** Stripe Webhook Lambda -> SES
**Slice:** S-3

**Input:**
```typescript
interface SendVendorOrderNotificationEmailInput {
  vendorEmail: string
  vendorName: string
  order: {
    orderId: string
    customerName: string
    customerEmail: string
    customerPhone?: string
    items: OrderItem[]
    subtotal: number
    deliveryFee: number
    total: number
    currency: string
    fulfilmentMethod: FulfilmentMethod
    deliveryNotes?: string
    requestedDate: string
    requestedTime: string
  }
}
```

**Output:**
```typescript
interface SendVendorOrderNotificationEmailOutput {
  messageId: string          // SES message ID
}
```

**Errors:**
| Error | When |
|-------|------|
| EmailSendError | SES API call fails |

**Invariants:**
- From address is always `noreply@dmercato.com`
- Subject: `New order from {customerName} - #{orderId short}`
- Email body includes: item list with quantities and prices, customer name, email, phone (if provided), delivery notes (if provided), requested date/time, fulfilment method, total, payment status
- This function does not throw on failure -- returns the error for caller to handle

**Verification:** auto
**Dependencies:** Order (S-3)

---

## API Lambda -- Quote Requests

### Contract: SubmitQuoteRequestHandler

**Boundary:** API Gateway -> API Lambda (POST /api/quote-requests)
**Slice:** S-4

**Input:**
```typescript
// HTTP POST /api/quote-requests
// Public endpoint, no auth required
interface SubmitQuoteRequestHandlerInput {
  body: {
    vendorSlug: string
    name: string          // 1-200 chars
    email: string         // Valid email
    phone?: string        // 0-30 chars
    eventType: EventType  // 'corporate' | 'birthday' | 'wedding' | 'market' | 'other'
    guestCount?: number   // 1-10000
    eventDate?: string    // ISO date YYYY-MM-DD
    message: string       // 10-2000 chars
  }
  sourceIp: string        // For rate limiting
}
```

**Output:**
```typescript
// 201: { data: { requestId: string, createdAt: string } }
interface SubmitQuoteRequestHandlerOutput {
  statusCode: 201 | 400 | 404 | 429 | 500
  headers: { 'Content-Type': 'application/json' }
  body: string   // JSON-serialized ApiResponse<{ requestId: string, createdAt: string }>
}
```

**Errors:**
| Error | Status | When |
|-------|--------|------|
| ValidationError | 400 | Request body fails validation |
| VendorNotFound | 404 | vendorSlug does not match any tenant |
| RateLimited | 429 | More than 5 requests from this IP in the last hour |
| InternalError | 500 | Database write or email send fails |

**Side effects:**
- Creates a QuoteRequest record in DynamoDB with read: false
- Sends notification email to vendor's email address via SES

**Invariants:**
- vendorSlug must reference an existing tenant (verified before creating)
- Email notification is sent after successful DynamoDB write (not before)
- If email send fails, the quote request is still created (best-effort email)
- Rate limit: 5 submissions per IP per hour
- Response includes only requestId and createdAt, not the full quote request

**Security:**
- Auth: public
- Input validation: validateQuoteRequestInput
- Rate limit: 5/hour/IP

**Verification:** verify
**Acceptance Criteria:**
- Submitting a valid quote request returns 201 with requestId
- Vendor receives an email notification with the quote details
- Invalid inputs return 400 with field-level errors
- Submitting to a non-existent vendor returns 404
- Sixth submission from same IP within an hour returns 429

**Steps:**
- POST /api/quote-requests with valid body for sweet-sin, verify 201
- Check vendor email inbox for notification
- POST with missing required fields, verify 400 response lists each missing field

**Dependencies:** CreateQuoteRequest (S-4), GetTenantBySlug (S-2), SendQuoteNotificationEmail (S-4), InputValidation (S-3), ApiResponse (S-3)

---

### Contract: SendQuoteNotificationEmail

**Boundary:** API Lambda -> SES
**Slice:** S-4

**Input:**
```typescript
interface SendQuoteNotificationEmailInput {
  vendorEmail: string        // Recipient
  vendorName: string         // For email personalization
  quoteRequest: {
    name: string
    email: string
    phone?: string
    eventType: EventType
    guestCount?: number
    eventDate?: string
    message: string
  }
}
```

**Output:**
```typescript
interface SendQuoteNotificationEmailOutput {
  messageId: string          // SES message ID
}
```

**Errors:**
| Error | When |
|-------|------|
| EmailSendError | SES API call fails |

**Invariants:**
- From address is always `noreply@dmercato.com`
- Subject includes the requester's name: `New quote request from {name}`
- Email body includes all quote request fields
- Email is plain text (not HTML) for deliverability
- This function does not throw on failure -- returns the error for caller to handle

**Verification:** auto
**Dependencies:** None (SES is an external boundary)

---

### Contract: GetQuoteRequestsHandler

**Boundary:** API Gateway -> API Lambda (GET /api/quote-requests/{slug})
**Slice:** S-8

**Input:**
```typescript
// HTTP GET /api/quote-requests/{slug}?limit=20&cursor=abc
// Requires session cookie
interface GetQuoteRequestsHandlerInput {
  pathParameters: {
    slug: string
  }
  queryStringParameters?: {
    limit?: string       // Parsed to number, default 20, max 50
    cursor?: string      // Opaque pagination token
  }
}
```

**Output:**
```typescript
// 200: { data: QuoteRequest[], meta: { cursor?: string } }
interface GetQuoteRequestsHandlerOutput {
  statusCode: 200 | 401 | 403 | 500
  headers: { 'Content-Type': 'application/json' }
  body: string   // JSON-serialized ApiResponse<QuoteRequest[]>
}
```

**Errors:**
| Error | Status | When |
|-------|--------|------|
| Unauthenticated | 401 | No valid session cookie |
| Forbidden | 403 | Session vendorSlug does not match URL slug |
| InternalError | 500 | Database query fails |

**Invariants:**
- Results sorted by createdAt descending (newest first)
- Empty results return `{ data: [], meta: {} }`, not an error
- Vendor can only see their own quote requests

**Security:**
- Auth: required (session cookie via withAuth middleware)
- Authorization: slug must match session vendorSlug

**Verification:** verify
**Acceptance Criteria:**
- Vendor sees their quote requests sorted newest first
- Pagination works with cursor parameter
- Unauthorized access to another vendor's quotes returns 403

**Dependencies:** GetQuoteRequestsByVendor (S-8), WithAuth (S-5)

---

### Contract: MarkQuoteRequestReadHandler

**Boundary:** API Gateway -> API Lambda (PUT /api/quote-requests/{slug}/{requestId})
**Slice:** S-8

**Input:**
```typescript
// HTTP PUT /api/quote-requests/{slug}/{requestId}
// Requires session cookie
interface MarkQuoteRequestReadHandlerInput {
  pathParameters: {
    slug: string
    requestId: string
  }
  body: {
    read: true           // Only valid value
  }
}
```

**Output:**
```typescript
// 200: { data: QuoteRequest }
interface MarkQuoteRequestReadHandlerOutput {
  statusCode: 200 | 400 | 401 | 403 | 404 | 500
  headers: { 'Content-Type': 'application/json' }
  body: string   // JSON-serialized ApiResponse<QuoteRequest>
}
```

**Errors:**
| Error | Status | When |
|-------|--------|------|
| ValidationError | 400 | Body is missing `read: true` or has extra fields |
| Unauthenticated | 401 | No valid session cookie |
| Forbidden | 403 | Session vendorSlug does not match URL slug |
| NotFound | 404 | requestId not found or belongs to different vendor |
| InternalError | 500 | Database update fails |

**Invariants:**
- Only `{ read: true }` is accepted as a body (no other fields, no `read: false`)
- Idempotent: marking an already-read request returns 200 with the request

**Security:**
- Auth: required (session cookie via withAuth middleware)
- Authorization: slug must match session vendorSlug

**Verification:** auto
**Dependencies:** MarkQuoteRequestRead (S-8), WithAuth (S-5)

---

## Auth Lambda

### Contract: RequestMagicLinkHandler

**Boundary:** API Gateway -> Auth Lambda (POST /api/auth/request)
**Slice:** S-5

**Input:**
```typescript
// HTTP POST /api/auth/request
interface RequestMagicLinkHandlerInput {
  body: {
    email: string         // Email to send magic link to
  }
  sourceIp: string        // For rate limiting context
}
```

**Output:**
```typescript
// Always 200: { data: { sent: true } }
// Response is the same whether or not the email exists in the system
interface RequestMagicLinkHandlerOutput {
  statusCode: 200 | 400 | 429 | 500
  headers: { 'Content-Type': 'application/json' }
  body: string   // JSON-serialized ApiResponse<{ sent: true }>
}
```

**Errors:**
| Error | Status | When |
|-------|--------|------|
| ValidationError | 400 | Email is missing or malformed |
| RateLimited | 429 | More than 3 requests for this email in the last hour |
| InternalError | 500 | Database or SES failure |

**Side effects:**
- If email matches a tenant: creates MagicLink record in DynamoDB, sends magic link email via SES
- If email does NOT match a tenant: does nothing (no record created, no email sent)

**Invariants:**
- Response is ALWAYS `{ data: { sent: true } }` for 200 status, regardless of whether the email exists. This prevents user enumeration
- Rate limit is per email address, not per IP: 3 requests per hour per email
- Magic link URL format: `https://dmercato.com/api/auth/verify?token={token}`
- Email subject: `Your Dmercato login link`
- Email is plain text for deliverability

**Security:**
- Auth: public
- Rate limit: 3/hour/email

**Verification:** verify
**Acceptance Criteria:**
- Submitting a valid vendor email returns 200 and sends a magic link email
- Submitting a non-vendor email returns 200 (no email sent, no enumeration)
- Response is always identical regardless of email existence
- Fourth request for same email within an hour returns 429

**Steps:**
- POST /api/auth/request with Oscar's email, verify 200
- Check Oscar's email inbox for magic link
- POST /api/auth/request with random@example.com, verify same 200 response shape

**Dependencies:** GetTenantByEmail (S-5), CreateMagicLink (S-5), SendMagicLinkEmail (S-5)

---

### Contract: VerifyMagicLinkHandler

**Boundary:** API Gateway -> Auth Lambda (GET /api/auth/verify?token={token})
**Slice:** S-5

**Input:**
```typescript
// HTTP GET /api/auth/verify?token={token}
interface VerifyMagicLinkHandlerInput {
  queryStringParameters: {
    token: string
  }
}
```

**Output:**
```typescript
// Success: 302 redirect to /admin/ with Set-Cookie header
// Failure: 302 redirect to /admin/login?error=expired
interface VerifyMagicLinkHandlerOutput {
  statusCode: 302
  headers: {
    Location: string             // "/admin/" on success, "/admin/login?error=expired" on failure
    'Set-Cookie'?: string        // Present only on success
  }
}
```

**Errors:**
| Error | Redirect To | When |
|-------|-------------|------|
| TokenExpired | /admin/login?error=expired | Token TTL has passed |
| TokenNotFound | /admin/login?error=expired | Token does not exist (already used or invalid) |
| InternalError | /admin/login?error=error | Database failure |

**Side effects:**
- On success: deletes magic link from DynamoDB, creates session in DynamoDB, sets session cookie
- On failure: no side effects

**Invariants:**
- Magic link token is deleted BEFORE session is created (single-use enforcement)
- Session cookie attributes: HttpOnly, Secure, SameSite=Strict, Path=/, Max-Age=2592000 (30 days)
- Cookie name: `dmercato_session`
- Cookie value: the session token (UUID v4)
- This endpoint always returns a 302 redirect, never a JSON response
- Expired tokens redirect to the same URL as invalid tokens (no information leakage)

**Security:**
- Auth: public (this IS the auth mechanism)
- Token is single-use (atomically consumed)

**Verification:** verify
**Acceptance Criteria:**
- Clicking a valid magic link creates a session and redirects to /admin/
- Browser has a dmercato_session cookie after successful verification
- Using the same magic link again redirects to the expired error page
- Expired tokens redirect to the error page

**Steps:**
- Request a magic link, extract the token from the email
- GET /api/auth/verify?token={token}, verify 302 redirect to /admin/ with Set-Cookie
- GET /api/auth/verify?token={same-token}, verify 302 redirect to /admin/login?error=expired

**Dependencies:** GetAndDeleteMagicLink (S-5), CreateSession (S-5)

---

### Contract: SendMagicLinkEmail

**Boundary:** Auth Lambda -> SES
**Slice:** S-5

**Input:**
```typescript
interface SendMagicLinkEmailInput {
  email: string
  magicLinkUrl: string     // Full URL: https://dmercato.com/api/auth/verify?token={token}
  vendorName: string       // For personalization
}
```

**Output:**
```typescript
interface SendMagicLinkEmailOutput {
  messageId: string        // SES message ID
}
```

**Errors:**
| Error | When |
|-------|------|
| EmailSendError | SES API call fails |

**Invariants:**
- From address: `noreply@dmercato.com`
- Subject: `Your Dmercato login link`
- Body includes the magic link URL as a clickable link
- Body mentions the 15-minute expiry
- Email is plain text for deliverability

**Verification:** auto
**Dependencies:** None (SES is an external boundary)

---

### Contract: LogoutHandler

**Boundary:** API Gateway -> Auth Lambda (POST /api/auth/logout)
**Slice:** S-5

**Input:**
```typescript
// HTTP POST /api/auth/logout
// Requires session cookie
interface LogoutHandlerInput {
  cookies: {
    dmercato_session: string
  }
}
```

**Output:**
```typescript
// 200: { data: { loggedOut: true } }
interface LogoutHandlerOutput {
  statusCode: 200 | 500
  headers: {
    'Content-Type': 'application/json'
    'Set-Cookie': string   // Clears the session cookie
  }
  body: string   // JSON-serialized ApiResponse<{ loggedOut: true }>
}
```

**Errors:**
| Error | Status | When |
|-------|--------|------|
| InternalError | 500 | Database delete fails |

**Side effects:**
- Deletes session from DynamoDB sessions table
- Clears dmercato_session cookie (Max-Age=0)

**Invariants:**
- Always returns 200 even if session does not exist (idempotent logout)
- Cookie is cleared with: HttpOnly, Secure, SameSite=Strict, Path=/, Max-Age=0
- Does not require withAuth middleware (handles its own cookie parsing -- a missing/invalid cookie still returns 200)

**Verification:** auto
**Dependencies:** DeleteSession (S-5)

---

## Auth Middleware

### Contract: WithAuth

**Boundary:** API Lambda handler -> withAuth middleware HOF
**Slice:** S-5

**Input:**
```typescript
// withAuth wraps a handler function, adding session validation
// The wrapped handler receives an augmented event with vendorSlug

type AuthenticatedHandler = (
  event: APIGatewayProxyEventV2 & { auth: { vendorSlug: string } }
) => Promise<APIGatewayProxyResultV2>

type RawHandler = (
  event: APIGatewayProxyEventV2
) => Promise<APIGatewayProxyResultV2>

// The withAuth HOF
function withAuth(handler: AuthenticatedHandler): RawHandler
```

**Output:**
```typescript
// If session is valid: calls the wrapped handler with auth.vendorSlug attached
// If session is invalid/missing: returns 401 directly, handler is NOT called
interface WithAuthFailureOutput {
  statusCode: 401
  headers: { 'Content-Type': 'application/json' }
  body: string   // { error: { code: "UNAUTHENTICATED", message: "Invalid or expired session" } }
}
```

**Errors:**
| Error | Status | When |
|-------|--------|------|
| Unauthenticated | 401 | Cookie missing, cookie malformed, session not found, session expired |

**Invariants:**
- Extracts `dmercato_session` cookie from the request
- Looks up session in DynamoDB via GetSession
- If valid: attaches `auth.vendorSlug` to the event and calls the wrapped handler
- If invalid: returns 401 immediately, wrapped handler is NEVER invoked
- Does NOT perform authorization (slug matching) -- that is the handler's responsibility
- Cookie parsing handles the standard Cookie header format
- The 401 response body conforms to the ApiErrorResponse envelope

**Verification:** auto
**Dependencies:** GetSession (S-5), ApiResponse (S-3)

---

## API Lambda -- Vendors

### Contract: UpdateVendorHandler

**Boundary:** API Gateway -> API Lambda (PUT /api/vendors/{slug})
**Slice:** S-6

**Input:**
```typescript
// HTTP PUT /api/vendors/{slug}
// Requires session cookie
interface UpdateVendorHandlerInput {
  pathParameters: {
    slug: string
  }
  body: Partial<Pick<Tenant,
    'name' | 'tagline' | 'story' | 'city' | 'country' |
    'categories' | 'primaryPhotoKey' | 'photoKeys' |
    'socialLinks' | 'products' | 'marketDates' |
    'operationalSchedule' | 'deliveryEnabled' | 'deliveryFee' | 'takeoutEnabled'
  >>
}
```

**Output:**
```typescript
// 200: { data: Tenant }
interface UpdateVendorHandlerOutput {
  statusCode: 200 | 400 | 401 | 403 | 404 | 500
  headers: { 'Content-Type': 'application/json' }
  body: string   // JSON-serialized ApiResponse<Tenant>
}
```

**Errors:**
| Error | Status | When |
|-------|--------|------|
| ValidationError | 400 | Request body fails validation |
| Unauthenticated | 401 | No valid session cookie |
| Forbidden | 403 | Session vendorSlug does not match URL slug |
| VendorNotFound | 404 | Slug does not exist |
| InternalError | 500 | Database or cache invalidation error |

**Side effects:**
- Updates tenant record in DynamoDB
- Invokes Cache Invalidator Lambda for paths: `/{slug}`, `/sitemap*`

**Invariants:**
- Vendor can only update their own record (session vendorSlug must match URL slug)
- Only whitelisted fields can be updated (no email, plan, stripe, domain updates through this endpoint)
- updatedAt is set automatically
- Unknown fields in request body are rejected
- Cache invalidation is fire-and-forget (failure does not fail the update)

**Security:**
- Auth: required (session cookie via withAuth middleware)
- Input validation: validateVendorUpdateInput
- Authorization: slug must match session vendorSlug

**Verification:** verify
**Acceptance Criteria:**
- Vendor can update their profile fields and see changes reflected on their public page
- Updates to unauthorized vendor slugs are rejected with 403
- Invalid field values are rejected with 400 and specific field-level errors
- Cache invalidation triggers after successful update

**Steps:**
- Log in as Oscar, PUT /api/vendors/sweet-sin with updated tagline, verify 200 response
- PUT /api/vendors/other-vendor with Oscar's session, verify 403
- PUT /api/vendors/sweet-sin with invalid data (story > 500 chars), verify 400

**Dependencies:** UpdateTenant (S-6), WithAuth (S-5), InvalidateCloudFrontPaths (S-6), InputValidation (S-3)

---

## API Lambda -- Photos

### Contract: GetPhotoUploadUrlHandler

**Boundary:** API Gateway -> API Lambda (POST /api/vendors/{slug}/photos/upload-url)
**Slice:** S-6

**Input:**
```typescript
// HTTP POST /api/vendors/{slug}/photos/upload-url
// Requires session cookie
interface GetPhotoUploadUrlHandlerInput {
  pathParameters: {
    slug: string
  }
  body: {
    filename: string       // Original filename, used for extension extraction
    contentType: string    // Must be: image/jpeg, image/png, or image/webp
  }
}
```

**Output:**
```typescript
// 200: { data: { uploadUrl: string, assetKey: string } }
interface GetPhotoUploadUrlHandlerOutput {
  statusCode: 200 | 400 | 401 | 403 | 500
  headers: { 'Content-Type': 'application/json' }
  body: string   // JSON-serialized ApiResponse<{ uploadUrl: string, assetKey: string }>
}
```

**Errors:**
| Error | Status | When |
|-------|--------|------|
| ValidationError | 400 | Missing filename/contentType, or contentType not in allowed list |
| Unauthenticated | 401 | No valid session cookie |
| Forbidden | 403 | Session vendorSlug does not match URL slug |
| InternalError | 500 | S3 presign fails |

**Invariants:**
- contentType must be one of: `image/jpeg`, `image/png`, `image/webp`
- assetKey format: `{vendorSlug}/{uuid}.{extension}` (extension derived from contentType)
- Presigned URL expires in 5 minutes (300 seconds)
- Presigned URL includes Content-Length condition: max 10MB (10,485,760 bytes)
- Presigned URL includes Content-Type condition matching the requested contentType
- uploadUrl is a presigned S3 PUT URL for the assets bucket
- The assetKey is returned so the client can update the tenant record with it after upload

**Security:**
- Auth: required (session cookie via withAuth middleware)
- Authorization: slug must match session vendorSlug
- Input validation: validatePhotoUploadInput

**Verification:** verify
**Acceptance Criteria:**
- Vendor receives a presigned URL and asset key for valid image uploads
- Uploading a file to the presigned URL succeeds
- Invalid content types are rejected with 400
- Presigned URL expires after 5 minutes

**Steps:**
- POST /api/vendors/sweet-sin/photos/upload-url with { filename: "photo.jpg", contentType: "image/jpeg" }, verify 200
- Use the returned uploadUrl to PUT a test image, verify S3 accepts it
- POST with contentType "application/pdf", verify 400

**Dependencies:** WithAuth (S-5)

---

## Cache Invalidator Lambda

### Contract: InvalidateCloudFrontPaths

**Boundary:** API Lambda -> Cache Invalidator Lambda (invoked programmatically via Lambda invoke)
**Slice:** S-6

**Input:**
```typescript
interface InvalidateCloudFrontPathsInput {
  paths: string[]          // CloudFront paths to invalidate, e.g. ["/sweet-sin", "/sitemap*"]
  distributionId: string   // CloudFront distribution ID (from SSM)
}
```

**Output:**
```typescript
interface InvalidateCloudFrontPathsOutput {
  invalidationId: string   // CloudFront invalidation ID
}
```

**Errors:**
| Error | When |
|-------|------|
| InvalidationError | CloudFront API call fails |
| InvalidPathError | paths array is empty |

**Invariants:**
- paths array must have at least one item
- Each path must start with `/`
- CloudFront wildcard paths are supported (e.g. `/sitemap*`)
- Creates a single CloudFront invalidation request with all paths batched
- CallerReference is a unique string (timestamp + random) to prevent duplicate invalidations being silently ignored

**Verification:** auto
**Dependencies:** None (CloudFront is an external boundary)

---

## API Lambda -- Orders

### Contract: GetOrdersByVendorHandler

**Boundary:** API Gateway -> API Lambda (GET /api/orders/{slug})
**Slice:** S-7

**Input:**
```typescript
// HTTP GET /api/orders/{slug}?limit=20&cursor=abc&status=paid
// Requires session cookie
interface GetOrdersByVendorHandlerInput {
  pathParameters: {
    slug: string
  }
  queryStringParameters?: {
    limit?: string       // Parsed to number, default 20, max 50
    cursor?: string      // Opaque pagination token
    status?: string      // Optional filter: "paid" | "fulfilled" | "refunded"
  }
}
```

**Output:**
```typescript
// 200: { data: Order[], meta: { cursor?: string } }
interface GetOrdersByVendorHandlerOutput {
  statusCode: 200 | 401 | 403 | 500
  headers: { 'Content-Type': 'application/json' }
  body: string   // JSON-serialized ApiResponse<Order[]>
}
```

**Errors:**
| Error | Status | When |
|-------|--------|------|
| Unauthenticated | 401 | No valid session cookie |
| Forbidden | 403 | Session vendorSlug does not match URL slug |
| InternalError | 500 | Database query fails |

**Invariants:**
- Results sorted by createdAt descending (newest first)
- Empty results return `{ data: [], meta: {} }`, not an error
- Vendor can only see their own orders
- Status filter is validated against allowed values

**Security:**
- Auth: required (session cookie via withAuth middleware)
- Authorization: slug must match session vendorSlug

**Verification:** verify
**Acceptance Criteria:**
- Vendor sees their orders sorted newest first
- Pagination works with cursor parameter
- Status filter shows only orders matching the selected status
- Unauthorized access to another vendor's orders returns 403

**Dependencies:** GetOrdersByVendor (S-7), WithAuth (S-5)

---

### Contract: GetOrderDetailHandler

**Boundary:** API Gateway -> API Lambda (GET /api/orders/{slug}/{orderId})
**Slice:** S-7

**Input:**
```typescript
// HTTP GET /api/orders/{slug}/{orderId}
// Requires session cookie
interface GetOrderDetailHandlerInput {
  pathParameters: {
    slug: string
    orderId: string
  }
}
```

**Output:**
```typescript
// 200: { data: Order }
interface GetOrderDetailHandlerOutput {
  statusCode: 200 | 401 | 403 | 404 | 500
  headers: { 'Content-Type': 'application/json' }
  body: string   // JSON-serialized ApiResponse<Order>
}
```

**Errors:**
| Error | Status | When |
|-------|--------|------|
| Unauthenticated | 401 | No valid session cookie |
| Forbidden | 403 | Session vendorSlug does not match URL slug, or order's vendorSlug does not match |
| NotFound | 404 | orderId does not exist |
| InternalError | 500 | Database query fails |

**Invariants:**
- Order's vendorSlug must match both the URL slug and the session vendorSlug
- Returns the complete order with all fields including items, customer info, delivery details

**Security:**
- Auth: required (session cookie via withAuth middleware)
- Authorization: slug must match session vendorSlug AND order's vendorSlug

**Verification:** auto
**Dependencies:** GetOrderDetail (S-7), WithAuth (S-5)

---

### Contract: UpdateOrderStatusHandler

**Boundary:** API Gateway -> API Lambda (PUT /api/orders/{slug}/{orderId})
**Slice:** S-7

**Input:**
```typescript
// HTTP PUT /api/orders/{slug}/{orderId}
// Requires session cookie
interface UpdateOrderStatusHandlerInput {
  pathParameters: {
    slug: string
    orderId: string
  }
  body: {
    status: 'fulfilled'    // Only valid value
  }
}
```

**Output:**
```typescript
// 200: { data: Order }
interface UpdateOrderStatusHandlerOutput {
  statusCode: 200 | 400 | 401 | 403 | 404 | 409 | 500
  headers: { 'Content-Type': 'application/json' }
  body: string   // JSON-serialized ApiResponse<Order>
}
```

**Errors:**
| Error | Status | When |
|-------|--------|------|
| ValidationError | 400 | Body is missing `status: "fulfilled"` or has extra fields |
| Unauthenticated | 401 | No valid session cookie |
| Forbidden | 403 | Session vendorSlug does not match URL slug |
| NotFound | 404 | orderId does not exist or belongs to different vendor |
| InvalidStatusTransition | 409 | Order is not in "paid" status |
| InternalError | 500 | Database update fails |

**Invariants:**
- Only `{ status: "fulfilled" }` is accepted as a body
- Only "paid" -> "fulfilled" transition is allowed; already fulfilled or refunded orders return 409

**Security:**
- Auth: required (session cookie via withAuth middleware)
- Authorization: slug must match session vendorSlug

**Verification:** verify
**Acceptance Criteria:**
- Vendor can mark a "paid" order as "fulfilled"
- Attempting to fulfil an already-fulfilled order returns 409
- The order detail view shows the updated status after marking as fulfilled

**Steps:**
- PUT /api/orders/sweet-sin/{orderId} with { status: "fulfilled" }, verify 200
- PUT the same order again, verify 409

**Dependencies:** UpdateOrderStatus (S-7), WithAuth (S-5)

---

## API Lambda -- Customers

### Contract: GetCustomersByVendor

**Boundary:** API Gateway -> API Lambda (GET /api/customers/{slug})
**Slice:** S-7

**Input:**
```typescript
// HTTP GET /api/customers/{slug}?limit=20&cursor=abc
// Requires session cookie
interface GetCustomersByVendorInput {
  pathParameters: {
    slug: string
  }
  queryStringParameters?: {
    limit?: string       // Parsed to number, default 20, max 50
    cursor?: string      // Opaque pagination token
  }
}
```

**Output:**
```typescript
interface Customer {
  email: string
  name: string
  totalSpent: number       // Aggregate across all orders, pence/cents
  orderCount: number       // Total number of orders
  lastOrderDate: string    // ISO 8601 UTC of most recent order
}

// 200: { data: Customer[], meta: { cursor?: string } }
interface GetCustomersByVendorOutput {
  statusCode: 200 | 401 | 403 | 500
  headers: { 'Content-Type': 'application/json' }
  body: string   // JSON-serialized ApiResponse<Customer[]>
}
```

**Errors:**
| Error | Status | When |
|-------|--------|------|
| Unauthenticated | 401 | No valid session cookie |
| Forbidden | 403 | Session vendorSlug does not match URL slug |
| InternalError | 500 | Database query fails |

**Invariants:**
- Customers are derived from orders (aggregated at query time, not stored separately)
- Sorted by totalSpent descending (best customers first)
- Grouped by customerEmail (same email = same customer)
- Returns empty array when vendor has no orders

**Security:**
- Auth: required (session cookie via withAuth middleware)
- Authorization: slug must match session vendorSlug

**Verification:** verify
**Acceptance Criteria:**
- Vendor sees a list of customers derived from their orders
- Customers are sorted by total spent (highest first)
- Each customer shows name, email, total spent, order count, and last order date
- Pagination works correctly

**Dependencies:** GetOrdersByVendor (S-7), WithAuth (S-5)

---

### Contract: SendCustomerEmail

**Boundary:** API Gateway -> API Lambda (POST /api/customers/{slug}/email)
**Slice:** S-7

**Input:**
```typescript
// HTTP POST /api/customers/{slug}/email
// Requires session cookie
interface SendCustomerEmailInput {
  pathParameters: {
    slug: string
  }
  body: {
    customerEmail: string    // Recipient email
    subject: string          // 1-200 chars
    message: string          // 1-5000 chars
  }
}
```

**Output:**
```typescript
// 200: { data: { sent: true } }
interface SendCustomerEmailOutput {
  statusCode: 200 | 400 | 401 | 403 | 429 | 500
  headers: { 'Content-Type': 'application/json' }
  body: string   // JSON-serialized ApiResponse<{ sent: true }>
}
```

**Errors:**
| Error | Status | When |
|-------|--------|------|
| ValidationError | 400 | Missing or invalid fields |
| Unauthenticated | 401 | No valid session cookie |
| Forbidden | 403 | Session vendorSlug does not match URL slug |
| RateLimited | 429 | More than 20 emails per hour for this vendor |
| InternalError | 500 | SES send fails |

**Invariants:**
- From address: `noreply@dmercato.com`
- Reply-To is set to the vendor's email address
- Email is plain text
- Rate limit: 20 emails per hour per vendor

**Security:**
- Auth: required (session cookie via withAuth middleware)
- Authorization: slug must match session vendorSlug
- Rate limit: 20/hour/vendor

**Verification:** verify
**Acceptance Criteria:**
- Vendor can send an email to a customer
- Customer receives the email with correct subject and message
- Reply-To is set to the vendor's email
- 21st email in an hour returns 429

**Dependencies:** WithAuth (S-5), GetTenantBySlug (S-2)

---

## API Lambda -- Stripe Account

### Contract: StripeConnectOnboarding

**Boundary:** API Gateway -> API Lambda (POST /api/stripe/account/{slug}/onboarding)
**Slice:** S-9

**Input:**
```typescript
// HTTP POST /api/stripe/account/{slug}/onboarding
// Requires session cookie
interface StripeConnectOnboardingInput {
  pathParameters: {
    slug: string
  }
}
```

**Output:**
```typescript
// 200: { data: { onboardingUrl: string } }
interface StripeConnectOnboardingOutput {
  statusCode: 200 | 401 | 403 | 500
  headers: { 'Content-Type': 'application/json' }
  body: string   // JSON-serialized ApiResponse<{ onboardingUrl: string }>
}
```

**Errors:**
| Error | Status | When |
|-------|--------|------|
| Unauthenticated | 401 | No valid session cookie |
| Forbidden | 403 | Session vendorSlug does not match URL slug |
| InternalError | 500 | Stripe API or DynamoDB failure |

**Side effects:**
- Creates a Stripe Connect Express account if tenant does not have one (stripe.accounts.create)
- Saves stripeAccountId to tenant record in DynamoDB
- Generates Account Link URL for Stripe-hosted onboarding (stripe.accountLinks.create)

**Invariants:**
- If tenant already has a stripeAccountId, skips account creation and generates a new Account Link
- Account type is "express" (Stripe-hosted onboarding and dashboard)
- Refresh URL redirects back to admin Stripe account page
- Return URL redirects back to admin Stripe account page with success param
- Account Link URL has limited validity (set by Stripe, typically a few minutes)

**Security:**
- Auth: required (session cookie via withAuth middleware)
- Authorization: slug must match session vendorSlug

**Verification:** verify
**Acceptance Criteria:**
- Vendor receives a Stripe onboarding URL
- Following the URL opens Stripe-hosted onboarding
- After completing onboarding, vendor is redirected back to admin
- Re-requesting onboarding generates a new URL (does not create duplicate account)

**Steps:**
- POST /api/stripe/account/sweet-sin/onboarding, verify 200 with onboardingUrl
- Open onboardingUrl in browser, verify Stripe onboarding page loads
- Complete onboarding with Stripe test data, verify redirect back to admin

**Dependencies:** WithAuth (S-5), GetTenantBySlug (S-2), UpdateTenant (S-6)

---

### Contract: GetStripeAccountLink

**Boundary:** API Gateway -> API Lambda (GET /api/stripe/account/{slug}/dashboard)
**Slice:** S-9

**Input:**
```typescript
// HTTP GET /api/stripe/account/{slug}/dashboard
// Requires session cookie
interface GetStripeAccountLinkInput {
  pathParameters: {
    slug: string
  }
}
```

**Output:**
```typescript
// 200: { data: { dashboardUrl: string } }
interface GetStripeAccountLinkOutput {
  statusCode: 200 | 401 | 403 | 409 | 500
  headers: { 'Content-Type': 'application/json' }
  body: string   // JSON-serialized ApiResponse<{ dashboardUrl: string }>
}
```

**Errors:**
| Error | Status | When |
|-------|--------|------|
| Unauthenticated | 401 | No valid session cookie |
| Forbidden | 403 | Session vendorSlug does not match URL slug |
| StripeNotOnboarded | 409 | Vendor has not completed Stripe onboarding |
| InternalError | 500 | Stripe API failure |

**Invariants:**
- Generates a Stripe Express dashboard login link (stripe.accounts.createLoginLink)
- Dashboard link allows vendor to manage payouts, view balance, update bank details
- Link is single-use and time-limited (set by Stripe)
- Vendor must have stripeOnboardingComplete = true

**Security:**
- Auth: required (session cookie via withAuth middleware)
- Authorization: slug must match session vendorSlug

**Verification:** verify
**Acceptance Criteria:**
- Vendor with completed onboarding receives a Stripe dashboard URL
- Following the URL opens the Stripe Express dashboard
- Vendor without onboarding gets 409

**Steps:**
- GET /api/stripe/account/sweet-sin/dashboard (after onboarding), verify 200 with dashboardUrl
- GET /api/stripe/account/sweet-sin/dashboard (before onboarding), verify 409

**Dependencies:** WithAuth (S-5), GetTenantBySlug (S-2)

---

## Sitemap Lambda

### Contract: GenerateSitemaps

**Boundary:** EventBridge (scheduled) -> Sitemap Lambda
**Slice:** S-10

**Input:**
```typescript
// Triggered by EventBridge scheduled rule (daily)
// No meaningful input -- the event is just a trigger
interface GenerateSitemapsInput {
  source: 'aws.events'    // EventBridge source
}
```

**Output:**
```typescript
// Lambda return value (not user-facing)
interface GenerateSitemapsOutput {
  filesWritten: string[]   // S3 keys of files written
  vendorCount: number      // Number of vendors included
}
```

**Side effects:**
- Scans all tenants from DynamoDB
- Writes 3 XML files to sitemaps S3 bucket:
  - `sitemap-index.xml` (sitemap index pointing to the other two)
  - `sitemap-vendors.xml` (one URL per vendor)
  - `sitemap-cities.xml` (one URL per unique city)

**Invariants:**
- sitemap-index.xml conforms to Sitemaps protocol (sitemaps.org)
- sitemap-vendors.xml lists each vendor at `https://dmercato.com/{slug}` with lastmod from updatedAt
- sitemap-cities.xml lists each unique city at `https://dmercato.com/{city}` (for future city pages)
- XML files are valid UTF-8 XML
- S3 objects have Content-Type: application/xml
- If DynamoDB scan returns zero tenants, sitemaps are still valid XML (empty urlsets)

**Errors:**
| Error | When |
|-------|------|
| DatabaseError | DynamoDB scan fails |
| S3WriteError | S3 PutObject fails |

**Verification:** verify
**Acceptance Criteria:**
- Sitemap files are accessible at dmercato.com/sitemap-index.xml
- sitemap-vendors.xml contains URLs for all vendors
- XML validates against the Sitemaps protocol schema

**Steps:**
- Trigger the Lambda manually or wait for scheduled execution
- Run `curl -s https://dmercato.com/sitemap-index.xml` and verify valid XML
- Verify sitemap-vendors.xml contains `/sweet-sin` URL

**Dependencies:** ScanAllTenants (S-10)

---

## API Lambda Internal Routing

### Contract: ApiLambdaRouter

**Boundary:** API Gateway event -> API Lambda internal router
**Slice:** S-4

**Definition:**
```typescript
// The API Lambda receives API Gateway V2 events and routes internally
interface RouteDefinition {
  method: 'GET' | 'POST' | 'PUT'
  pathPattern: string      // e.g. "/api/vendors/{slug}" using path params
  handler: (event: APIGatewayProxyEventV2) => Promise<APIGatewayProxyResultV2>
  auth: boolean            // If true, wrapped with withAuth
}

// Router matches method + path to a handler
function routeRequest(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2>
```

**Errors:**
| Error | Status | When |
|-------|--------|------|
| RouteNotFound | 404 | No route matches the method + path combination |
| MethodNotAllowed | 405 | Path matches but method does not |

**Invariants:**
- Router parses path parameters from the URL (e.g. `{slug}`, `{requestId}`, `{orderId}`)
- Unmatched routes return 404 with standard error envelope
- Router does NOT catch handler errors -- handlers return their own error responses
- CORS headers are handled at API Gateway level, not in the router
- New routes are added as slices expand the API surface

**Verification:** auto
**Dependencies:** ApiResponse (S-3)

---

## Terraform Infrastructure

### Contract: TerraformApiGateway

**Boundary:** Terraform IaC -> AWS API Gateway HTTP API
**Slice:** S-2

**Definition:**
```typescript
interface ApiGatewayDefinition {
  type: 'HTTP'    // API Gateway HTTP API (v2), not REST API (v1)
  routes: {
    // Initially: just the renderer route via CloudFront default origin
    // Routes are added incrementally as slices deploy
    'GET /api/vendors/{slug}': { integration: 'api-lambda' }
    'POST /api/quote-requests': { integration: 'api-lambda' }
    'POST /api/checkout/sessions': { integration: 'api-lambda' }
    'POST /api/stripe/webhook': { integration: 'stripe-webhook-lambda' }
    'POST /api/auth/request': { integration: 'auth-lambda' }
    'GET /api/auth/verify': { integration: 'auth-lambda' }
    'POST /api/auth/logout': { integration: 'auth-lambda' }
    'PUT /api/vendors/{slug}': { integration: 'api-lambda' }
    'GET /api/orders/{slug}': { integration: 'api-lambda' }
    'GET /api/orders/{slug}/{orderId}': { integration: 'api-lambda' }
    'PUT /api/orders/{slug}/{orderId}': { integration: 'api-lambda' }
    'GET /api/customers/{slug}': { integration: 'api-lambda' }
    'POST /api/customers/{slug}/email': { integration: 'api-lambda' }
    'GET /api/quote-requests/{slug}': { integration: 'api-lambda' }
    'PUT /api/quote-requests/{slug}/{requestId}': { integration: 'api-lambda' }
    'POST /api/vendors/{slug}/photos/upload-url': { integration: 'api-lambda' }
    'POST /api/stripe/account/{slug}/onboarding': { integration: 'api-lambda' }
    'GET /api/stripe/account/{slug}/dashboard': { integration: 'api-lambda' }
  }
  cors: {
    allowOrigins: ['https://dmercato.com', 'https://www.dmercato.com']
    allowMethods: ['GET', 'POST', 'PUT', 'OPTIONS']
    allowHeaders: ['Content-Type', 'Authorization', 'Cookie']
    allowCredentials: true
  }
  throttling: {
    burstLimit: 1000
    rateLimit: 500
  }
}
```

**Invariants:**
- API Gateway is HTTP API type (v2), not REST API (v1)
- CORS is configured at the API Gateway level
- Auth Lambda, API Lambda, and Stripe Webhook Lambda are separate integrations
- All routes are under /api/ prefix
- Throttling defaults protect against abuse

**Verification:** auto
**Dependencies:** None

---

### Contract: TerraformCloudFront

**Boundary:** Terraform IaC -> AWS CloudFront
**Slice:** S-2

**Definition:**
```typescript
interface CloudFrontDefinition {
  distribution: {
    aliases: ['dmercato.com', 'www.dmercato.com']
    defaultRootObject: undefined
    origins: {
      renderer: { type: 'lambda-function-url', domain: string }
      apiGateway: { type: 'http', domain: string }
      adminS3: { type: 's3', domain: string, oac: true }
      assetsS3: { type: 's3', domain: string, oac: true }
      sitemapsS3: { type: 's3', domain: string, oac: true }
    }
    cacheBehaviors: [
      { pathPattern: '/api/*', origin: 'apiGateway', cachePolicy: 'CachingDisabled', viewerProtocolPolicy: 'https-only' },
      { pathPattern: '/admin/*', origin: 'adminS3', cachePolicy: 'CachingDisabled', viewerProtocolPolicy: 'https-only' },
      { pathPattern: '/assets/*', origin: 'assetsS3', cacheTtl: 31536000, viewerProtocolPolicy: 'https-only' },
      { pathPattern: '/sitemap*', origin: 'sitemapsS3', cacheTtl: 3600, viewerProtocolPolicy: 'https-only' },
      { pathPattern: '/robots.txt', origin: 'sitemapsS3', cacheTtl: 86400, viewerProtocolPolicy: 'https-only' }
    ]
    defaultCacheBehavior: {
      origin: 'renderer'
      cacheTtl: 60
      viewerProtocolPolicy: 'https-only'
    }
    viewerCertificate: { acmCertificateArn: string, sslSupportMethod: 'sni-only', minimumProtocolVersion: 'TLSv1.2_2021' }
    httpVersion: 'http2'
    priceClass: 'PriceClass_All'
    securityHeaders: {
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
      'X-Content-Type-Options': 'nosniff'
      'X-Frame-Options': 'DENY'
    }
  }
}
```

**Invariants:**
- Single distribution serves all origins
- HTTPS only, HTTP is redirected
- TLS 1.2 minimum
- OAC for all S3 origins (no direct S3 access)
- API routes are never cached
- Vendor pages cached for 60 seconds
- Assets cached for 1 year (content-addressed)
- Security headers added via CloudFront response headers policy

**Verification:** verify
**Acceptance Criteria:**
- dmercato.com serves vendor pages via CloudFront
- /api/* routes reach API Gateway without caching
- /admin/* serves the admin SPA from S3
- /assets/* serves vendor photos from S3 with long cache
- HTTP requests redirect to HTTPS

**Steps:**
- Run `curl -I https://staging.dmercato.com/sweet-sin` and verify CloudFront headers
- Verify Strict-Transport-Security header is present
- Run `curl -I https://staging.dmercato.com/api/vendors/sweet-sin` and verify Cache-Control is not set (no caching)

**Dependencies:** TerraformApiGateway (S-2)

---

## Seed Data

### Contract: SeedTenantData

**Boundary:** Seed script -> DynamoDB (tenants table)
**Slice:** S-2

**Definition:**
```typescript
// Oscar's seed data for Sweet Sin, Adelaide
interface SeedTenant {
  vendorSlug: 'sweet-sin'
  name: 'Sweet Sin'
  tagline: string            // Oscar's tagline
  story: string              // Oscar's story (max 500 chars)
  city: 'adelaide'
  country: 'AU'
  categories: string[]       // e.g. ['desserts', 'catering', 'events']
  primaryPhotoKey: string    // Pre-uploaded to S3
  photoKeys: string[]
  socialLinks: SocialLinks
  products: Product[]        // At least 3 products with prices
  marketDates: MarketDate[]  // At least 1 upcoming market date
  operationalSchedule: OperationalSlot[]  // At least 2 operational slots
  deliveryEnabled: boolean
  deliveryFee: number
  takeoutEnabled: boolean
  email: string              // Oscar's email
  stripeAccountId: null
  stripeOnboardingComplete: false
  customDomain: null
  domainStatus: 'none'
  domainOperationId: null
  domainCertificateArn: null
  plan: 'active'
  createdAt: string          // ISO 8601
  updatedAt: string          // ISO 8601
}
```

**Invariants:**
- Seed script is idempotent: running it twice does not create duplicate data (uses PutItem which overwrites)
- Seed data conforms to the Tenant type contract
- Seed script reads table name from SSM or environment variable (not hardcoded)
- Seed script includes at least 3 products, 1 market date, and 2 operational slots for a realistic page render

**Verification:** verify
**Acceptance Criteria:**
- Running the seed script populates Oscar's data in DynamoDB
- dmercato.com/sweet-sin renders a complete vendor page with Oscar's data including products

**Steps:**
- Run the seed script targeting staging environment
- Verify the tenant appears in DynamoDB via AWS Console or CLI
- Visit the staging vendor page and verify products, market dates, and schedule are visible

**Dependencies:** Tenant (S-2)

---

## Admin SPA

### Contract: AdminAppRouting

**Boundary:** Browser -> Admin SPA (React Router)
**Slice:** S-5

**Definition:**
```typescript
// Route definitions for the admin SPA
interface AdminRoutes {
  '/admin/login': LoginPage              // Public
  '/admin/': DashboardPage               // Authenticated (redirects to /admin/login if no session)
  '/admin/orders': OrdersPage            // Authenticated
  '/admin/orders/:orderId': OrderDetailPage  // Authenticated
  '/admin/customers': CustomersPage      // Authenticated
  '/admin/quotes': QuotesPage            // Authenticated
  '/admin/profile': ProfilePage          // Authenticated
  '/admin/calendar': CalendarPage        // Authenticated
  '/admin/stripe': StripeAccountPage     // Authenticated
}
```

**Invariants:**
- All routes are under `/admin/`
- Unauthenticated users are redirected to `/admin/login`
- After successful magic link verification, user lands on `/admin/`
- Navigation sidebar is visible on all authenticated routes
- Login page is the only route accessible without a session
- Sidebar shows: Dashboard, Orders, Customers, Quote Requests (with unread badge), Profile, Calendar, Stripe Account, Logout

**Verification:** verify
**Acceptance Criteria:**
- Navigating to /admin/ without a session redirects to /admin/login
- After login, user sees the dashboard with sidebar navigation
- All sidebar links navigate to the correct pages
- Dashboard shows quick stats: total orders, total revenue, pending orders, unread quote requests

**Dependencies:** VerifyMagicLinkHandler (S-5)

---

### Contract: AdminAuthFlow

**Boundary:** Admin SPA -> Auth Lambda API
**Slice:** S-5

**Definition:**
```typescript
// Auth API calls made by the admin SPA
interface AdminAuthApi {
  requestMagicLink(email: string): Promise<{ data: { sent: true } }>
  logout(): Promise<{ data: { loggedOut: true } }>
}
```

**Invariants:**
- Login form submits email to POST /api/auth/request
- On success, shows "Check your email" message
- Session cookie is set by the verify endpoint (not by the SPA)
- SPA checks for valid session by making any authenticated API call (e.g. GET /api/vendors/{slug})
- Logout calls POST /api/auth/logout and redirects to /admin/login

**Verification:** verify
**Acceptance Criteria:**
- User can enter email and request a magic link
- After requesting, user sees "Check your email" confirmation
- After clicking magic link in email, user is redirected to /admin/ with active session
- Logout button clears session and returns to login page

**Dependencies:** RequestMagicLinkHandler (S-5), LogoutHandler (S-5)

---

### Contract: AdminProfilePage

**Boundary:** Admin SPA -> API Lambda (vendor update + photo upload)
**Slice:** S-6

**Definition:**
```typescript
// API calls made by the profile page
interface AdminProfileApi {
  getVendor(slug: string): Promise<ApiSuccessResponse<Tenant>>
  updateVendor(slug: string, updates: UpdateVendorHandlerInput['body']): Promise<ApiSuccessResponse<Tenant>>
  getUploadUrl(slug: string, filename: string, contentType: string): Promise<ApiSuccessResponse<{ uploadUrl: string, assetKey: string }>>
}
```

**Invariants:**
- Profile page loads current vendor data on mount via GET /api/vendors/{slug}
- Form fields are pre-populated with current values
- Save button sends PUT /api/vendors/{slug} with changed fields only
- Photo upload flow: request presigned URL, upload directly to S3, then update tenant record with new asset key
- Products are managed inline: add, edit, delete, reorder (with display order)
- Operational schedule management: add/remove recurring weekly slots (day + time range) and specific-date overrides
- Delivery settings: enable/disable toggles for delivery and takeout, delivery fee input
- Market dates are managed inline: add, edit, delete
- Social links are editable with platform-specific input fields
- Categories are managed as chips: add new, remove existing
- Validation errors are displayed at the field level
- Unsaved changes trigger a warning on navigation away

**Verification:** verify
**Acceptance Criteria:**
- Profile page displays all current vendor data in editable form fields
- Saving profile changes updates the vendor's public page
- Photos can be uploaded and appear in the gallery
- Products can be added, edited, deleted, and reordered
- Operational schedule can be configured with weekly slots and specific dates
- Delivery and takeout toggles work, delivery fee is editable
- Validation errors appear next to the invalid field

**Steps:**
- Navigate to /admin/profile, verify all fields are populated with current data
- Change the tagline, click Save, verify the public vendor page reflects the change
- Upload a new photo, verify it appears in the gallery section
- Add a new product with all fields, verify it appears in the products list
- Add an operational slot for Saturday 09:00-15:00, verify it appears in the schedule

**Dependencies:** UpdateVendorHandler (S-6), GetPhotoUploadUrlHandler (S-6)

---

### Contract: AdminOrdersPage

**Boundary:** Admin SPA -> API Lambda (orders)
**Slice:** S-7

**Definition:**
```typescript
// API calls made by the orders page
interface AdminOrdersApi {
  getOrders(slug: string, limit?: number, cursor?: string, status?: OrderStatus): Promise<ApiSuccessResponse<Order[]>>
  getOrderDetail(slug: string, orderId: string): Promise<ApiSuccessResponse<Order>>
  updateOrderStatus(slug: string, orderId: string, status: 'fulfilled'): Promise<ApiSuccessResponse<Order>>
}
```

**Invariants:**
- Orders page loads paginated orders on mount, sorted newest first
- Status filter buttons: All, Paid, Fulfilled, Refunded
- Each order row shows: short order ID, customer name, item count, total, status (coloured dot + label), date
- Click row to see full detail: items with quantities/prices, customer info, delivery info, requested date/time, payment status
- "Mark Fulfilled" button visible only on paid orders
- Pagination controls appear when more results exist

**Verification:** verify
**Acceptance Criteria:**
- Orders are displayed in a table sorted newest first
- Status filter buttons filter the list correctly
- Clicking an order shows full detail with all items and customer info
- "Mark Fulfilled" button updates the order status
- Pagination loads more results

**Steps:**
- Navigate to /admin/orders, verify orders appear in a table
- Click "Paid" filter, verify only paid orders are shown
- Click an order row, verify full detail view with items and customer info
- Click "Mark Fulfilled" on a paid order, verify status changes

**Dependencies:** GetOrdersByVendorHandler (S-7), GetOrderDetailHandler (S-7), UpdateOrderStatusHandler (S-7)

---

### Contract: AdminCustomersPage

**Boundary:** Admin SPA -> API Lambda (customers)
**Slice:** S-7

**Definition:**
```typescript
// API calls made by the customers page
interface AdminCustomersApi {
  getCustomers(slug: string, limit?: number, cursor?: string): Promise<ApiSuccessResponse<Customer[]>>
  sendEmail(slug: string, customerEmail: string, subject: string, message: string): Promise<ApiSuccessResponse<{ sent: true }>>
}
```

**Invariants:**
- Customers page loads paginated customer list sorted by total spent descending
- Each customer row shows: name, email, total spent, order count, last order date
- Click customer to see their order history
- "Send Email" button opens modal with subject + message fields
- Pagination controls appear when more results exist

**Verification:** verify
**Acceptance Criteria:**
- Customers are listed sorted by total spent (highest first)
- Each customer shows name, email, total spent, order count, last order date
- Send email modal sends an email to the customer
- Pagination works correctly

**Steps:**
- Navigate to /admin/customers, verify customer list appears sorted by total spent
- Click "Send Email" for a customer, compose and send, verify success message

**Dependencies:** GetCustomersByVendor (S-7), SendCustomerEmail (S-7)

---

### Contract: AdminQuotesPage

**Boundary:** Admin SPA -> API Lambda (quote requests)
**Slice:** S-8

**Definition:**
```typescript
// API calls made by the quotes page
interface AdminQuotesApi {
  getQuoteRequests(slug: string, limit?: number, cursor?: string): Promise<ApiSuccessResponse<QuoteRequest[]>>
  markQuoteRequestRead(slug: string, requestId: string): Promise<ApiSuccessResponse<QuoteRequest>>
}
```

**Invariants:**
- Quotes page loads paginated quote requests on mount
- Each quote request shows: name, email, event type, date, guest count, message, read/unread status, timestamp
- Unread requests are visually distinct (bold, dot indicator, or similar)
- Clicking a request expands it to show full details
- Expanding an unread request marks it as read via PUT
- Pagination controls appear when more results exist
- Unread count is shown in the sidebar navigation badge

**Verification:** verify
**Acceptance Criteria:**
- Quote requests are displayed sorted newest first
- Unread requests are visually distinguishable from read requests
- Expanding an unread request marks it as read
- Pagination loads more results when clicking next page
- Unread count in sidebar updates when requests are marked read

**Steps:**
- Navigate to /admin/quotes, verify quote requests are listed
- Click an unread request, verify it expands and the unread indicator disappears
- Verify unread count in sidebar decreases

**Dependencies:** GetQuoteRequestsHandler (S-8), MarkQuoteRequestReadHandler (S-8)

---

### Contract: AdminCalendarPage

**Boundary:** Admin SPA -> API Lambda (vendor update for marketDates)
**Slice:** S-9

**Definition:**
```typescript
// Calendar page reuses the vendor update API
// Market dates are managed as part of the tenant record
interface AdminCalendarApi {
  getVendor(slug: string): Promise<ApiSuccessResponse<Tenant>>
  updateVendor(slug: string, updates: { marketDates: MarketDate[] }): Promise<ApiSuccessResponse<Tenant>>
}
```

**Invariants:**
- Calendar page shows list of market dates sorted by date ascending
- Past dates are shown in a collapsed section
- Next upcoming date is visually highlighted
- Add/edit/delete operations modify the local marketDates array and save via PUT /api/vendors/{slug}
- Date picker is used for the date field
- Each market date card shows: date, market name, location, address

**Verification:** verify
**Acceptance Criteria:**
- Market dates are displayed in chronological order
- Past dates are collapsed by default
- Adding a new market date persists and appears in the list
- Editing an existing date updates the display
- Deleting a date removes it from the list

**Steps:**
- Navigate to /admin/calendar, verify existing market dates are shown
- Add a new market date with all fields, click Save, verify it appears sorted correctly
- Edit an existing date's location, verify it updates

**Dependencies:** UpdateVendorHandler (S-6)

---

### Contract: AdminStripePage

**Boundary:** Admin SPA -> API Lambda (Stripe account)
**Slice:** S-9

**Definition:**
```typescript
// API calls made by the Stripe account page
interface AdminStripeApi {
  startOnboarding(slug: string): Promise<ApiSuccessResponse<{ onboardingUrl: string }>>
  getDashboardLink(slug: string): Promise<ApiSuccessResponse<{ dashboardUrl: string }>>
  getVendor(slug: string): Promise<ApiSuccessResponse<Tenant>>
}
```

**Invariants:**
- Page shows current onboarding status (complete/incomplete) based on tenant stripeOnboardingComplete
- If incomplete: "Connect with Stripe" button triggers onboarding flow
- If complete: "Open Stripe Dashboard" button opens Stripe Express dashboard
- Status indicator shows charges_enabled status

**Verification:** verify
**Acceptance Criteria:**
- Vendor without Stripe sees "Connect with Stripe" button
- Clicking "Connect with Stripe" redirects to Stripe onboarding
- After onboarding, page shows "Open Stripe Dashboard" link
- Dashboard link opens Stripe Express dashboard

**Steps:**
- Navigate to /admin/stripe without onboarding, verify "Connect with Stripe" button
- Complete Stripe test onboarding, return to admin, verify status is complete
- Click "Open Stripe Dashboard", verify Stripe dashboard loads

**Dependencies:** StripeConnectOnboarding (S-9), GetStripeAccountLink (S-9)

---

## Global Invariants

These rules apply across ALL contracts and must ALWAYS be true:

1. **Timestamps:** All timestamps are ISO 8601 UTC strings (e.g. `2026-03-06T12:00:00.000Z`)
2. **IDs:** All generated IDs are UUID v4
3. **Response envelope:** All API responses use `{ data }` or `{ error: { code, message } }` -- never both, never neither
4. **Password absence:** No password field exists anywhere in the system. No hashing, no storage, no validation of passwords
5. **Vendor isolation:** Authenticated endpoints only return/modify data belonging to the session's vendorSlug
6. **HTML escaping:** All vendor-provided content rendered in HTML is escaped to prevent XSS
7. **No SELECT star:** DynamoDB operations project specific attributes where possible (especially scans)
8. **Secrets from SSM:** Table names, bucket names, distribution IDs, SES config, Stripe keys -- all read from SSM at cold start, cached in Lambda memory
9. **Structured logging:** All Lambdas use JSON-formatted log output with correlation IDs
10. **Error responses:** Never expose internal error details (stack traces, DynamoDB error messages) to clients. Log internally, return generic message
11. **Reserved slugs:** The following cannot be vendor slugs: `api`, `admin`, `assets`, `sitemap`, `robots.txt`, `favicon.ico`, `www`, `search`
12. **Price integrity:** All prices in Stripe Checkout Sessions are calculated server-side from DynamoDB data, never trusted from the client
13. **Idempotent webhooks:** Stripe webhook handler checks for existing orders before creating to handle retries safely
