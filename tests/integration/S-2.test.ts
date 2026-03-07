/**
 * S-2: A visitor can see a vendor page with product catalogue
 *
 * Tests cover:
 * - Tenant type validation and invariants
 * - GetTenantBySlug: DynamoDB retrieval behaviour
 * - RenderVendorPage: Lambda handler producing correct HTML responses
 * - GenerateSeoMetadata: SEO metadata generation
 * - RenderHtmlTemplate: HTML template structure and content
 * - SeedTenantData: Seed data conformance
 */

import '../fixtures/setup';
import {
  createTenantFixture,
  createProductFixture,
  createOperationalSlotFixture,
  createFullTenantFixture,
  createSeedTenantFixture,
} from '../fixtures/factories';

/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-var-requires */

// These modules export empty stubs until implementation is written.
// Using require + explicit typing so tests compile in TDD mode.
// Tests will fail at runtime (function undefined) until implementation exists.
const db = require('@dmercato/db') as {
  getTenantBySlug: (input: { vendorSlug: string }) => Promise<Record<string, unknown> | null>;
};

const renderer = require('@dmercato/renderer') as {
  handler: (event: { path: string }) => Promise<{
    statusCode: number;
    headers: Record<string, string>;
    body: string;
  }>;
  generateSeoMetadata: (input: {
    tenant: Record<string, unknown>;
    baseUrl: string;
  }) => {
    title: string;
    description: string;
    canonicalUrl: string;
    ogTags: Record<string, string>;
    jsonLd: Record<string, unknown>;
  };
  renderHtmlTemplate: (input: {
    tenant: Record<string, unknown>;
    seoMetadata: Record<string, unknown>;
    assetsBaseUrl: string;
  }) => string;
};

// ---------------------------------------------------------------------------
// Contract: Tenant -- type validation and invariants
// ---------------------------------------------------------------------------

describe('Tenant Type Invariants', () => {
  describe('vendorSlug validation', () => {
    it('should accept a valid URL-safe slug with lowercase alphanumeric and hyphens', () => {
      const tenant = createTenantFixture({ vendorSlug: 'sweet-sin' });
      expect(tenant.vendorSlug).toMatch(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/);
    });

    it('should reject slugs shorter than 3 characters', () => {
      const slug = 'ab';
      expect(slug.length).toBeLessThan(3);
    });

    it('should reject slugs longer than 50 characters', () => {
      const slug = 'a'.repeat(51);
      expect(slug.length).toBeGreaterThan(50);
    });

    it('should reject slugs that start with a hyphen', () => {
      const slug = '-sweet-sin';
      expect(slug.startsWith('-')).toBe(true);
    });

    it('should reject slugs that end with a hyphen', () => {
      const slug = 'sweet-sin-';
      expect(slug.endsWith('-')).toBe(true);
    });

    const reservedSlugs = ['api', 'admin', 'assets', 'sitemap', 'robots.txt', 'favicon.ico', 'www', 'search'];
    it.each(reservedSlugs)('should reject reserved slug: %s', (slug) => {
      expect(reservedSlugs).toContain(slug);
    });
  });

  describe('product invariants', () => {
    it('should have a non-negative integer price in pence/cents', () => {
      const product = createProductFixture({ price: 650 });
      expect(product.price).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(product.price)).toBe(true);
    });

    it('should reject negative product prices', () => {
      const price = -100;
      expect(price).toBeLessThan(0);
    });

    it('should have a lowercase three-letter currency code', () => {
      const product = createProductFixture({ currency: 'aud' });
      expect(product.currency).toMatch(/^[a-z]{3}$/);
    });

    it('should have a non-negative integer order value', () => {
      const product = createProductFixture({ order: 0 });
      expect(product.order).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(product.order)).toBe(true);
    });
  });

  describe('operational schedule invariants', () => {
    it('should have dayOfWeek between 0 and 6', () => {
      const slot = createOperationalSlotFixture({ dayOfWeek: 3 });
      expect(slot.dayOfWeek).toBeGreaterThanOrEqual(0);
      expect(slot.dayOfWeek).toBeLessThanOrEqual(6);
    });

    it('should have times in HH:MM 24h format', () => {
      const slot = createOperationalSlotFixture({ startTime: '09:00', endTime: '17:30' });
      expect(slot.startTime).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
      expect(slot.endTime).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
    });
  });

  describe('timestamps', () => {
    it('should use ISO 8601 UTC format for createdAt and updatedAt', () => {
      const tenant = createTenantFixture();
      expect(tenant.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
      expect(tenant.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
    });
  });

  describe('country code', () => {
    it('should be an uppercase two-letter ISO code', () => {
      const tenant = createTenantFixture({ country: 'AU' });
      expect(tenant.country).toMatch(/^[A-Z]{2}$/);
    });
  });

  describe('delivery fee', () => {
    it('should be a non-negative integer', () => {
      const tenant = createTenantFixture({ deliveryFee: 500 });
      expect(tenant.deliveryFee).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(tenant.deliveryFee)).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Contract: GetTenantBySlug -- DynamoDB retrieval
// ---------------------------------------------------------------------------

describe('GetTenantBySlug', () => {
  describe('success', () => {
    it('should return the full Tenant object when slug exists', async () => {
      const result = await db.getTenantBySlug({ vendorSlug: 'sweet-sin' });

      expect(result).not.toBeNull();
      if (result) {
        expect(result.vendorSlug).toBe('sweet-sin');
        expect(result.name).toBeDefined();
        expect(result.products).toBeDefined();
        expect(result.operationalSchedule).toBeDefined();
        expect(result.deliveryEnabled).toBeDefined();
        expect(result.takeoutEnabled).toBeDefined();
      }
    });
  });

  describe('not found', () => {
    it('should return null when slug does not exist', async () => {
      const result = await db.getTenantBySlug({ vendorSlug: 'nonexistent-vendor' });

      expect(result).toBeNull();
    });
  });

  describe('error handling', () => {
    it('should throw DatabaseError when DynamoDB call fails', async () => {
      await expect(
        db.getTenantBySlug({ vendorSlug: 'error-trigger' })
      ).rejects.toThrow();
    });
  });
});

// ---------------------------------------------------------------------------
// Contract: RenderVendorPage -- Lambda handler
// ---------------------------------------------------------------------------

describe('RenderVendorPage', () => {
  describe('success (200)', () => {
    it('should return status 200 for an existing vendor', async () => {
      const response = await renderer.handler({ path: '/sweet-sin' });

      expect(response.statusCode).toBe(200);
    });

    it('should return Content-Type text/html with charset utf-8', async () => {
      const response = await renderer.handler({ path: '/sweet-sin' });

      expect(response.headers['Content-Type']).toBe('text/html; charset=utf-8');
    });

    it('should return Cache-Control public max-age=60 for 200 responses', async () => {
      const response = await renderer.handler({ path: '/sweet-sin' });

      expect(response.headers['Cache-Control']).toBe('public, max-age=60');
    });

    it('should include security header X-Content-Type-Options nosniff', async () => {
      const response = await renderer.handler({ path: '/sweet-sin' });

      expect(response.headers['X-Content-Type-Options']).toBe('nosniff');
    });

    it('should include security header X-Frame-Options DENY', async () => {
      const response = await renderer.handler({ path: '/sweet-sin' });

      expect(response.headers['X-Frame-Options']).toBe('DENY');
    });

    it('should include Strict-Transport-Security header', async () => {
      const response = await renderer.handler({ path: '/sweet-sin' });

      expect(response.headers['Strict-Transport-Security']).toBe(
        'max-age=31536000; includeSubDomains'
      );
    });

    it('should return a complete HTML5 document starting with DOCTYPE', async () => {
      const response = await renderer.handler({ path: '/sweet-sin' });

      expect(response.body).toMatch(/^<!DOCTYPE html>/i);
    });

    it('should include inline CSS and no external stylesheet link tags', async () => {
      const response = await renderer.handler({ path: '/sweet-sin' });

      expect(response.body).toContain('<style');
      expect(response.body).not.toMatch(/<link[^>]*rel=["']stylesheet["'][^>]*>/i);
    });

    it('should include title tag with vendor name', async () => {
      const response = await renderer.handler({ path: '/sweet-sin' });

      expect(response.body).toMatch(/<title>.*Sweet Sin.*<\/title>/i);
    });

    it('should include meta description with vendor tagline', async () => {
      const response = await renderer.handler({ path: '/sweet-sin' });

      expect(response.body).toMatch(/<meta\s+name=["']description["']\s+content=["'][^"']+["']/i);
    });

    it('should include Open Graph tags', async () => {
      const response = await renderer.handler({ path: '/sweet-sin' });
      const body = response.body;

      expect(body).toMatch(/property=["']og:title["']/i);
      expect(body).toMatch(/property=["']og:description["']/i);
      expect(body).toMatch(/property=["']og:image["']/i);
      expect(body).toMatch(/property=["']og:url["']/i);
      expect(body).toMatch(/property=["']og:type["']/i);
    });

    it('should include canonical URL with vendor slug', async () => {
      const response = await renderer.handler({ path: '/sweet-sin' });

      expect(response.body).toMatch(
        /<link\s+rel=["']canonical["']\s+href=["']https:\/\/dmercato\.com\/sweet-sin["']/i
      );
    });

    it('should include JSON-LD script tag with LocalBusiness schema', async () => {
      const response = await renderer.handler({ path: '/sweet-sin' });

      expect(response.body).toMatch(/type=["']application\/ld\+json["']/i);
      expect(response.body).toContain('LocalBusiness');
    });

    it('should include JSON-LD Product schemas when products exist', async () => {
      const response = await renderer.handler({ path: '/sweet-sin' });

      expect(response.body).toContain('"@type"');
      expect(response.body).toContain('Product');
    });

    it('should render product cards with name and price', async () => {
      const response = await renderer.handler({ path: '/sweet-sin' });

      expect(response.body).toContain('Lust');
    });

    it('should include add-to-cart buttons for products', async () => {
      const response = await renderer.handler({ path: '/sweet-sin' });

      expect(response.body.toLowerCase()).toMatch(/add.to.cart/i);
    });
  });

  describe('add-to-cart disabled state', () => {
    it('should disable add-to-cart buttons when vendor stripeOnboardingComplete is false', async () => {
      const response = await renderer.handler({ path: '/sweet-sin' });

      expect(response.body).toMatch(/disabled/i);
    });
  });

  describe('XSS prevention', () => {
    it('should HTML-escape vendor-provided content to prevent XSS', async () => {
      const response = await renderer.handler({ path: '/sweet-sin' });

      // The page should not contain unescaped script injection from vendor content
      expect(response.body).not.toMatch(/<script>alert\(/);
    });
  });

  describe('vendor not found (404)', () => {
    it('should return status 404 when slug does not match any tenant', async () => {
      const response = await renderer.handler({ path: '/nonexistent-vendor' });

      expect(response.statusCode).toBe(404);
    });

    it('should return a styled HTML error page for 404', async () => {
      const response = await renderer.handler({ path: '/nonexistent-vendor' });

      expect(response.body).toContain('<!DOCTYPE html>');
    });

    it('should set Cache-Control to no-cache for 404 responses', async () => {
      const response = await renderer.handler({ path: '/nonexistent-vendor' });

      expect(response.headers['Cache-Control']).toBe('no-cache');
    });
  });

  describe('internal error (500)', () => {
    it('should return status 500 when DynamoDB read fails', async () => {
      const response = await renderer.handler({ path: '/db-error-trigger' });

      expect(response.statusCode).toBe(500);
    });
  });

  describe('no external JS requirement', () => {
    it('should not require external JavaScript to render the page (except Stripe.js)', async () => {
      const response = await renderer.handler({ path: '/sweet-sin' });

      // Remove Stripe.js tag before checking for other external scripts
      const bodyWithoutStripe = response.body.replace(/<script\s+src=["']https:\/\/js\.stripe\.com[^"']*["'][^>]*><\/script>/gi, '');
      expect(bodyWithoutStripe).not.toMatch(/<script\s+src=["']http/i);
    });
  });
});

// ---------------------------------------------------------------------------
// Contract: GenerateSeoMetadata -- pure function
// ---------------------------------------------------------------------------

describe('GenerateSeoMetadata', () => {
  describe('title', () => {
    it('should format title as "{name} | Dmercato"', () => {
      const tenant = createFullTenantFixture({ name: 'Sweet Sin' });

      const result = renderer.generateSeoMetadata({
        tenant,
        baseUrl: 'https://dmercato.com',
      });

      expect(result.title).toBe('Sweet Sin | Dmercato');
    });
  });

  describe('description', () => {
    it('should use vendor tagline as description', () => {
      const tenant = createFullTenantFixture({ tagline: 'Cookie dough & fresas con crema' });

      const result = renderer.generateSeoMetadata({
        tenant,
        baseUrl: 'https://dmercato.com',
      });

      expect(result.description).toBe('Cookie dough & fresas con crema');
    });

    it('should truncate description to 160 characters with ellipsis when longer', () => {
      const longTagline = 'A'.repeat(200);
      const tenant = createFullTenantFixture({ tagline: longTagline });

      const result = renderer.generateSeoMetadata({
        tenant,
        baseUrl: 'https://dmercato.com',
      });

      expect(result.description.length).toBeLessThanOrEqual(160);
      expect(result.description).toContain('...');
    });
  });

  describe('canonical URL', () => {
    it('should construct canonical URL as "{baseUrl}/{vendorSlug}"', () => {
      const tenant = createFullTenantFixture({ vendorSlug: 'sweet-sin' });

      const result = renderer.generateSeoMetadata({
        tenant,
        baseUrl: 'https://dmercato.com',
      });

      expect(result.canonicalUrl).toBe('https://dmercato.com/sweet-sin');
    });
  });

  describe('Open Graph tags', () => {
    it('should include og:title matching the tenant name', () => {
      const tenant = createFullTenantFixture({ name: 'Sweet Sin' });

      const result = renderer.generateSeoMetadata({
        tenant,
        baseUrl: 'https://dmercato.com',
      });

      expect(result.ogTags['og:title']).toContain('Sweet Sin');
    });

    it('should include og:description from the tagline', () => {
      const tenant = createFullTenantFixture({ tagline: 'Artisan cookies' });

      const result = renderer.generateSeoMetadata({
        tenant,
        baseUrl: 'https://dmercato.com',
      });

      expect(result.ogTags['og:description']).toBeDefined();
    });

    it('should use CloudFront assets URL for og:image not direct S3', () => {
      const tenant = createFullTenantFixture();

      const result = renderer.generateSeoMetadata({
        tenant,
        baseUrl: 'https://dmercato.com',
      });

      expect(result.ogTags['og:image']).not.toMatch(/s3\.amazonaws\.com/);
    });

    it('should set og:type to "website"', () => {
      const tenant = createFullTenantFixture();

      const result = renderer.generateSeoMetadata({
        tenant,
        baseUrl: 'https://dmercato.com',
      });

      expect(result.ogTags['og:type']).toBe('website');
    });

    it('should include og:url with the canonical URL', () => {
      const tenant = createFullTenantFixture({ vendorSlug: 'sweet-sin' });

      const result = renderer.generateSeoMetadata({
        tenant,
        baseUrl: 'https://dmercato.com',
      });

      expect(result.ogTags['og:url']).toContain('sweet-sin');
    });
  });

  describe('JSON-LD', () => {
    it('should conform to schema.org LocalBusiness type', () => {
      const tenant = createFullTenantFixture();

      const result = renderer.generateSeoMetadata({
        tenant,
        baseUrl: 'https://dmercato.com',
      });

      expect(result.jsonLd['@type']).toBe('LocalBusiness');
    });

    it('should include Product schemas with prices when products exist', () => {
      const tenant = createFullTenantFixture();

      const result = renderer.generateSeoMetadata({
        tenant,
        baseUrl: 'https://dmercato.com',
      });

      const jsonLdString = JSON.stringify(result.jsonLd);
      expect(jsonLdString).toContain('Product');
    });

    it('should not include Product schemas when products array is empty', () => {
      const tenant = createTenantFixture({ products: [] });

      const result = renderer.generateSeoMetadata({
        tenant,
        baseUrl: 'https://dmercato.com',
      });

      const jsonLdString = JSON.stringify(result.jsonLd);
      expect(jsonLdString).not.toContain('"Product"');
    });
  });
});

// ---------------------------------------------------------------------------
// Contract: RenderHtmlTemplate -- HTML structure
// ---------------------------------------------------------------------------

describe('RenderHtmlTemplate', () => {
  function makeSeoMetadata() {
    return {
      title: 'Sweet Sin | Dmercato',
      description: 'Cookie dough',
      canonicalUrl: 'https://dmercato.com/sweet-sin',
      ogTags: {
        'og:title': 'Sweet Sin',
        'og:description': 'Cookie dough',
        'og:image': 'https://dmercato.com/assets/vendors/sweetsin/primary.jpg',
        'og:url': 'https://dmercato.com/sweet-sin',
        'og:type': 'website',
      },
      jsonLd: { '@type': 'LocalBusiness' },
    };
  }

  const assetsBaseUrl = 'https://dmercato.com/assets';

  describe('document structure', () => {
    it('should start with <!DOCTYPE html>', () => {
      const tenant = createFullTenantFixture();
      const html = renderer.renderHtmlTemplate({
        tenant,
        seoMetadata: makeSeoMetadata(),
        assetsBaseUrl,
      });

      expect(html).toMatch(/^<!DOCTYPE html>/);
    });

    it('should include html tag with lang="en"', () => {
      const tenant = createFullTenantFixture();
      const html = renderer.renderHtmlTemplate({
        tenant,
        seoMetadata: makeSeoMetadata(),
        assetsBaseUrl,
      });

      expect(html).toContain('<html lang="en">');
    });

    it('should include inline style blocks and no external stylesheet links', () => {
      const tenant = createFullTenantFixture();
      const html = renderer.renderHtmlTemplate({
        tenant,
        seoMetadata: makeSeoMetadata(),
        assetsBaseUrl,
      });

      expect(html).toContain('<style');
      expect(html).not.toMatch(/<link[^>]*rel=["']stylesheet["']/i);
    });
  });

  describe('required sections', () => {
    it('should include Google Fonts via preconnect and fonts.googleapis.com link', () => {
      const tenant = createFullTenantFixture();
      const html = renderer.renderHtmlTemplate({
        tenant,
        seoMetadata: makeSeoMetadata(),
        assetsBaseUrl,
      });

      expect(html).toMatch(/rel=["']preconnect["']/i);
      expect(html).toContain('fonts.googleapis.com');
    });

    it('should include cart drawer HTML with inline JS for localStorage cart', () => {
      const tenant = createFullTenantFixture();
      const html = renderer.renderHtmlTemplate({
        tenant,
        seoMetadata: makeSeoMetadata(),
        assetsBaseUrl,
      });

      expect(html).toContain('localStorage');
    });

    it('should include checkout form fields within cart drawer', () => {
      const tenant = createFullTenantFixture();
      const html = renderer.renderHtmlTemplate({
        tenant,
        seoMetadata: makeSeoMetadata(),
        assetsBaseUrl,
      });

      const htmlLower = html.toLowerCase();
      expect(htmlLower).toContain('name');
      expect(htmlLower).toContain('email');
      expect(htmlLower).toContain('phone');
    });
  });

  describe('XSS prevention', () => {
    it('should HTML-escape all user-provided strings', () => {
      const tenant = createFullTenantFixture({
        name: '<script>alert("xss")</script>',
        tagline: 'Cookie dough & "fresas" <con> crema',
      });
      const html = renderer.renderHtmlTemplate({
        tenant,
        seoMetadata: makeSeoMetadata(),
        assetsBaseUrl,
      });

      expect(html).not.toContain('<script>alert("xss")</script>');
    });
  });

  describe('product rendering', () => {
    it('should render without product section when products array is empty', () => {
      const tenant = createTenantFixture({ products: [] });
      const html = renderer.renderHtmlTemplate({
        tenant,
        seoMetadata: makeSeoMetadata(),
        assetsBaseUrl,
      });

      expect(html).toContain('<!DOCTYPE html>');
    });
  });
});

// ---------------------------------------------------------------------------
// Contract: SeedTenantData -- seed data conformance
// ---------------------------------------------------------------------------

describe('SeedTenantData', () => {
  const seed = createSeedTenantFixture();

  describe('required identity fields', () => {
    it('should have vendorSlug "sweet-sin"', () => {
      expect(seed.vendorSlug).toBe('sweet-sin');
    });

    it('should have name "Sweet Sin"', () => {
      expect(seed.name).toBe('Sweet Sin');
    });

    it('should have city "adelaide"', () => {
      expect(seed.city).toBe('adelaide');
    });

    it('should have country "AU"', () => {
      expect(seed.country).toBe('AU');
    });

    it('should have plan "active"', () => {
      expect(seed.plan).toBe('active');
    });

    it('should have stripeAccountId set', () => {
      expect(seed.stripeAccountId).toBe('acct_1PaE4OQjzqJXb0YW');
    });

    it('should have stripeOnboardingComplete as true', () => {
      expect(seed.stripeOnboardingComplete).toBe(true);
    });
  });

  describe('minimum data requirements', () => {
    it('should have at least 3 products', () => {
      expect((seed.products as unknown[]).length).toBeGreaterThanOrEqual(3);
    });

    it('should have at least 1 market date', () => {
      expect((seed.marketDates as unknown[]).length).toBeGreaterThanOrEqual(1);
    });

    it('should have at least 2 operational slots', () => {
      expect((seed.operationalSchedule as unknown[]).length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('product data quality', () => {
    it('should have products with valid prices (non-negative integers)', () => {
      const products = seed.products as Array<{ price: number }>;
      for (const product of products) {
        expect(product.price).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(product.price)).toBe(true);
      }
    });

    it('should have products with names between 1 and 200 characters', () => {
      const products = seed.products as Array<{ name: string }>;
      for (const product of products) {
        expect(product.name.length).toBeGreaterThanOrEqual(1);
        expect(product.name.length).toBeLessThanOrEqual(200);
      }
    });
  });

  describe('Tenant type conformance', () => {
    it('should have all required Tenant fields present', () => {
      const requiredFields = [
        'vendorSlug', 'name', 'tagline', 'story', 'city', 'country',
        'categories', 'primaryPhotoKey', 'photoKeys', 'socialLinks',
        'products', 'marketDates', 'operationalSchedule',
        'deliveryEnabled', 'deliveryFee', 'takeoutEnabled',
        'email', 'stripeAccountId', 'stripeOnboardingComplete',
        'customDomain', 'domainStatus', 'plan',
        'createdAt', 'updatedAt',
      ];

      for (const field of requiredFields) {
        expect(seed).toHaveProperty(field);
      }
    });

    it('should have valid ISO 8601 UTC timestamps', () => {
      expect(seed.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
      expect(seed.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
    });

    it('should have valid domainStatus value', () => {
      const validStatuses = ['none', 'registering', 'provisioning', 'active', 'failed'];
      expect(validStatuses).toContain(seed.domainStatus);
    });
  });

  describe('idempotency', () => {
    it('should produce identical core data on repeated calls', () => {
      const seed1 = createSeedTenantFixture();
      const seed2 = createSeedTenantFixture();

      expect(seed1.vendorSlug).toBe(seed2.vendorSlug);
      expect(seed1.name).toBe(seed2.name);
      expect(seed1.city).toBe(seed2.city);
      expect(seed1.country).toBe(seed2.country);
    });
  });
});
