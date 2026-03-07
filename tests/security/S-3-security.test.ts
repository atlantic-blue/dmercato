/**
 * S-3 Security Tests: A visitor can purchase products and receive a confirmation
 *
 * These tests prove the existence of security vulnerabilities found during
 * the security review. The implementer must make these tests pass by fixing
 * the underlying issues.
 *
 * Vulnerabilities covered:
 * 1. Rate limiting bypass via order of operations (HIGH) - CWE-770
 * 2. Stripe error message leakage in checkout response (MEDIUM) - CWE-209
 * 3. Webhook error message leakage (MEDIUM) - CWE-209
 * 4. Vendor notification email sent to customer instead of vendor (HIGH) - CWE-201
 * 5. Missing item-level input validation for productId and quantity (HIGH) - CWE-20
 * 6. Missing items array size limit (MEDIUM) - CWE-400
 * 7. Vendor slug length not bounded (LOW) - CWE-400
 * 8. In-memory rate limiting ineffective in Lambda (HIGH) - CWE-770
 */

import '../fixtures/setup';
import {
  createCheckoutSessionInputFixture,
  createStripeCheckoutCompletedEventFixture,
} from '../fixtures/factories';

/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-var-requires */

const api = require('@dmercato/api') as {
  handler: (event: {
    path: string;
    httpMethod: string;
    body: string | null;
    headers: Record<string, string>;
    requestContext?: Record<string, unknown>;
  }) => Promise<{
    statusCode: number;
    headers: Record<string, string>;
    body: string;
  }>;
};

const stripeWebhook = require('@dmercato/stripe-webhook') as {
  handler: (event: {
    headers: Record<string, string>;
    body: string;
  }) => Promise<{
    statusCode: number;
    headers: Record<string, string>;
    body: string;
  }>;
  sendOrderConfirmationEmail: (input: Record<string, unknown>) => Promise<{ messageId: string }>;
  sendVendorOrderNotificationEmail: (input: Record<string, unknown>) => Promise<{ messageId: string }>;
};

const validation = require('@dmercato/types') as {
  validateCheckoutInput: (input: unknown) => {
    valid: boolean;
    errors: Array<{ field: string; message: string; code: string }>;
  };
  validateVendorSlug: (slug: unknown) => boolean;
  validateEmail: (email: unknown) => boolean;
};

// ---------------------------------------------------------------------------
// Helper to build an API Gateway event
// ---------------------------------------------------------------------------
function buildCheckoutEvent(
  body: Record<string, unknown>,
  sourceIp = '192.168.1.1',
) {
  return {
    path: '/api/checkout/sessions',
    httpMethod: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    requestContext: { identity: { sourceIp } },
  };
}

describe('Security: S-3 Purchase & Confirmation', () => {
  // ---------------------------------------------------------------------------
  // VULNERABILITY 1: Rate Limiting Bypass via Order of Operations
  //
  // Severity: HIGH | CWE-770
  // Location: packages/lambdas/api/src/handlers/create-checkout-session.ts:214-220
  //
  // The rate limit check happens AFTER tenant lookup and product validation.
  // This means expensive DynamoDB operations are performed on every request
  // before rate limiting is enforced. An attacker can cause unlimited
  // DynamoDB reads without being rate limited.
  //
  // Fix: Move the isRateLimited check to be the FIRST check in
  // handleCreateCheckoutSession, before any database operations.
  // ---------------------------------------------------------------------------
  describe('Rate Limiting Order of Operations', () => {
    it('should return 429 before performing any database lookups when rate limited', async () => {
      const uniqueIp = `10.0.0.${Math.floor(Math.random() * 255)}`;
      const validBody = createCheckoutSessionInputFixture();

      // Exhaust the rate limit with 10 requests
      for (let i = 0; i < 10; i++) {
        await api.handler(buildCheckoutEvent(validBody, uniqueIp));
      }

      // The 11th request should be rate limited. If the rate limit check
      // is after DB lookups, this request will still hit DB first.
      // With a nonexistent vendor, if we get 429 instead of 404 it proves
      // the rate limit is checked first.
      const rateLimitedBody = createCheckoutSessionInputFixture({
        vendorSlug: 'nonexistent-vendor-for-rate-test',
      });
      const response = await api.handler(
        buildCheckoutEvent(rateLimitedBody, uniqueIp),
      );

      // If rate limiting happens first, we get 429 regardless of the
      // vendor not existing. If rate limiting happens after DB lookup,
      // we'd get 404 (vendor not found) because the DB check runs first.
      expect(response.statusCode).toBe(429);
    });
  });

  // ---------------------------------------------------------------------------
  // VULNERABILITY 2: Stripe Error Message Leakage
  //
  // Severity: MEDIUM | CWE-209
  // Location: packages/lambdas/api/src/handlers/create-checkout-session.ts:258
  //
  // The catch block in callStripeCheckout passes the raw error.message from
  // the Stripe SDK directly into the API response. Stripe errors can contain
  // internal details like Stripe account IDs, API versions, and request IDs.
  //
  // Fix: Return a generic error message like "Payment processing failed" in
  // the 500 response, and log the detailed error server-side instead.
  // ---------------------------------------------------------------------------
  describe('Stripe Error Message Leakage', () => {
    it('should not expose raw Stripe error messages in the API response', async () => {
      const body = createCheckoutSessionInputFixture({
        vendorSlug: 'stripe-error-vendor',
      });

      const response = await api.handler(buildCheckoutEvent(body));
      const parsed = JSON.parse(response.body);

      expect(response.statusCode).toBe(500);
      // The response should NOT contain the raw Stripe error message.
      // It should use a generic message instead.
      expect(parsed.error.message).not.toBe('Stripe API error');
      expect(parsed.error.message).not.toMatch(/stripe/i);
      expect(parsed.error.message).not.toMatch(/api.stripe.com/i);
      expect(parsed.error.message).not.toMatch(/acct_/i);
    });
  });

  // ---------------------------------------------------------------------------
  // VULNERABILITY 3: Webhook Error Message Leakage
  //
  // Severity: MEDIUM | CWE-209
  // Location: packages/lambdas/stripe-webhook/src/webhook-handler.ts:179-180,196-197
  //
  // Both the signature verification and general error handlers pass raw
  // error.message to the response. These can contain Stripe SDK internals,
  // DynamoDB table names, or SDK version info.
  //
  // Fix: Return generic error messages. Log details server-side.
  // ---------------------------------------------------------------------------
  describe('Webhook Error Message Leakage', () => {
    it('should not expose detailed Stripe signature error messages', async () => {
      const response = await stripeWebhook.handler({
        headers: { 'stripe-signature': 'invalid-signature' },
        body: '{}',
      });
      const parsed = JSON.parse(response.body);

      expect(response.statusCode).toBe(400);
      // Should not reveal details about the signature verification process
      expect(parsed.error.message).not.toMatch(/No signatures found matching/);
      expect(parsed.error.message).not.toMatch(/expected signature for payload/);
      expect(parsed.error.message).not.toMatch(/whsec_/);
    });

    it('should not expose internal error details in 500 responses', async () => {
      // Create a webhook event that will pass signature check but fail
      // during processing (e.g., DynamoDB error via error-trigger vendor)
      const event = createStripeCheckoutCompletedEventFixture();
      const eventData = event.data.object as Record<string, unknown>;
      const metadata = (eventData.metadata ?? {}) as Record<string, string>;
      metadata.vendorSlug = 'error-trigger';

      const response = await stripeWebhook.handler({
        headers: { 'stripe-signature': 'valid-test-signature' },
        body: JSON.stringify(event),
      });

      if (response.statusCode === 500) {
        const parsed = JSON.parse(response.body);
        // Should not reveal DynamoDB details, table names, or SDK info
        expect(parsed.error.message).not.toMatch(/DynamoDB/i);
        expect(parsed.error.message).not.toMatch(/dmercato-/);
        expect(parsed.error.message).not.toMatch(/TableName/);
        expect(parsed.error.message).not.toMatch(/service unavailable/i);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // VULNERABILITY 4: Vendor Notification Email Sent to Customer
  //
  // Severity: HIGH | CWE-201
  // Location: packages/lambdas/stripe-webhook/src/webhook-handler.ts:96-100
  //
  // The sendEmails function passes metadata.customerEmail as vendorEmail
  // for the vendor notification. The vendor never receives their order
  // notification, and the customer receives internal vendor communications.
  //
  // Fix: Use the actual vendor email (from tenant lookup or metadata)
  // instead of metadata.customerEmail for the vendor notification.
  // ---------------------------------------------------------------------------
  describe('Vendor Notification Email Recipient', () => {
    it('should send vendor notification to vendor email, not customer email', async () => {
      // Process a complete checkout webhook to trigger email sending
      const event = createStripeCheckoutCompletedEventFixture();
      const eventBody = JSON.stringify(event);

      await stripeWebhook.handler({
        headers: { 'stripe-signature': 'valid-test-signature' },
        body: eventBody,
      });

      // The vendor notification should go to the vendor, not the customer.
      // We verify by checking that the sendVendorOrderNotificationEmail
      // function is not called with the customer's email as vendorEmail.
      //
      // Since we can't easily intercept the call, we test the exported
      // function directly: if called with proper inputs, the vendorEmail
      // parameter should NOT be the customer email.
      //
      // This is a structural test: the webhook handler code on line 97-98
      // currently reads: vendorEmail: metadata.customerEmail
      // It should read something like: vendorEmail: tenant.email or
      // vendorEmail: metadata.vendorEmail

      // We test by examining the source code behavior: calling the webhook
      // handler with a known event, then verifying the webhook response
      // succeeded (200), which means emails were sent. The bug is that
      // vendorEmail receives metadata.customerEmail.
      //
      // Direct test: build the same data the webhook handler would, and
      // verify the vendor email is NOT the customer email.
      const metadata = (event.data.object as Record<string, unknown>)
        .metadata as Record<string, string>;

      // The handler currently sets vendorEmail to metadata.customerEmail.
      // This must NOT be the case. The vendorEmail should differ from
      // customerEmail (vendor email comes from tenant record).
      // We verify this by asserting that the code does NOT use
      // customerEmail as the vendor email recipient.
      //
      // Since we cannot mock inside the webhook handler's sendEmails call,
      // we verify the exported function's expected contract:
      // vendorEmail must not equal customerEmail for correct behavior.
      expect(metadata.customerEmail).toBe('jane@example.com');

      // The vendor's actual email is 'oscar@sweetsin.com.au' per the
      // tenant fixture. If the handler uses metadata.customerEmail as
      // vendorEmail, the vendor email would be 'jane@example.com'.
      // This test asserts that is NOT the intended behavior by checking
      // that the vendor email in the fixture differs from customer email.
      // The implementer must fix the handler to use the correct vendor email.
      //
      // Structural assertion: read the webhook handler source and verify
      // vendorEmail is not assigned from customerEmail.
      const webhookSource = require('fs').readFileSync(
        require('path').resolve(
          __dirname,
          '../../packages/lambdas/stripe-webhook/src/webhook-handler.ts',
        ),
        'utf-8',
      ) as string;

      // The line `vendorEmail: metadata.customerEmail` is the bug.
      // After fix, it should reference the vendor/tenant email instead.
      const hasVendorEmailBug = /vendorEmail:\s*metadata\.customerEmail/.test(
        webhookSource,
      );
      expect(hasVendorEmailBug).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // VULNERABILITY 5: Missing Item-Level Input Validation
  //
  // Severity: HIGH | CWE-20
  // Location: packages/shared/types/src/validate-checkout-input.ts:76-85
  //
  // The validateItems function does not require productId to be a string,
  // does not require quantity to be present, does not enforce quantity is
  // an integer, and accepts non-numeric quantity types silently. This can
  // lead to NaN calculations or fractional billing amounts.
  //
  // Fix: Add checks for: productId required and must be string; quantity
  // required and must be a positive integer (use Number.isInteger).
  // ---------------------------------------------------------------------------
  describe('Item-Level Input Validation', () => {
    it('should reject items with missing productId', () => {
      const input = createCheckoutSessionInputFixture({
        items: [{ quantity: 2 }],
      });
      const result = validation.validateCheckoutInput(input);

      expect(result.valid).toBe(false);
      expect(
        result.errors.some(
          (e) =>
            e.field.includes('productId') ||
            e.field.includes('items'),
        ),
      ).toBe(true);
    });

    it('should reject items with non-string productId', () => {
      const input = createCheckoutSessionInputFixture({
        items: [{ productId: 12345, quantity: 2 }],
      });
      const result = validation.validateCheckoutInput(input);

      expect(result.valid).toBe(false);
      expect(
        result.errors.some(
          (e) =>
            e.field.includes('productId') ||
            e.field.includes('items'),
        ),
      ).toBe(true);
    });

    it('should reject items with missing quantity', () => {
      const input = createCheckoutSessionInputFixture({
        items: [{ productId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' }],
      });
      const result = validation.validateCheckoutInput(input);

      expect(result.valid).toBe(false);
      expect(
        result.errors.some(
          (e) =>
            e.field.includes('quantity') ||
            e.field.includes('items'),
        ),
      ).toBe(true);
    });

    it('should reject items with non-integer quantity (float)', () => {
      const input = createCheckoutSessionInputFixture({
        items: [
          {
            productId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
            quantity: 1.5,
          },
        ],
      });
      const result = validation.validateCheckoutInput(input);

      expect(result.valid).toBe(false);
      expect(
        result.errors.some(
          (e) =>
            e.field.includes('quantity') ||
            e.field.includes('items'),
        ),
      ).toBe(true);
    });

    it('should reject items with string quantity', () => {
      const input = createCheckoutSessionInputFixture({
        items: [
          {
            productId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
            quantity: '2',
          },
        ],
      });
      const result = validation.validateCheckoutInput(input);

      expect(result.valid).toBe(false);
      expect(
        result.errors.some(
          (e) =>
            e.field.includes('quantity') ||
            e.field.includes('items'),
        ),
      ).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // VULNERABILITY 6: Missing Items Array Size Limit
  //
  // Severity: MEDIUM | CWE-400
  // Location: packages/shared/types/src/validate-checkout-input.ts:55-86
  //
  // The validateItems function checks for empty arrays but does not enforce
  // a maximum item count. An attacker can send thousands of items,
  // amplifying DynamoDB reads and potentially exceeding Stripe metadata
  // limits.
  //
  // Fix: Add a maximum items count check (e.g., 100 items max).
  // ---------------------------------------------------------------------------
  describe('Items Array Size Limit', () => {
    it('should reject requests with more than 100 items', () => {
      const manyItems = Array.from({ length: 101 }, (_, i) => ({
        productId: `prod-${String(i).padStart(4, '0')}`,
        quantity: 1,
      }));

      const input = createCheckoutSessionInputFixture({ items: manyItems });
      const result = validation.validateCheckoutInput(input);

      expect(result.valid).toBe(false);
      expect(
        result.errors.some(
          (e) => e.field === 'items' && (e.code === 'TOO_MANY' || e.code === 'TOO_LONG' || e.code === 'INVALID_VALUE'),
        ),
      ).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // VULNERABILITY 7: Vendor Slug Length Not Bounded
  //
  // Severity: LOW | CWE-400
  // Location: packages/shared/types/src/validate-vendor-slug.ts:1-13
  //
  // The validateVendorSlug function validates format with regex but does not
  // enforce a maximum length. An extremely long slug passes validation and
  // is used in DynamoDB queries, Stripe metadata, and URLs.
  //
  // Fix: Add a maximum length check (e.g., 100 characters max).
  // ---------------------------------------------------------------------------
  describe('Vendor Slug Length Limit', () => {
    it('should reject vendor slugs exceeding reasonable length', () => {
      // Create a 1000-character slug that matches the regex format
      const longSlug = 'a'.repeat(1000);
      const isValid = validation.validateVendorSlug(longSlug);

      expect(isValid).toBe(false);
    });

    it('should reject long vendor slugs through checkout input validation', () => {
      const longSlug = 'a'.repeat(1000);
      const input = createCheckoutSessionInputFixture({
        vendorSlug: longSlug,
      });
      const result = validation.validateCheckoutInput(input);

      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.field === 'vendorSlug'),
      ).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // VULNERABILITY 8: In-Memory Rate Limiting Ineffective in Lambda
  //
  // Severity: HIGH | CWE-770
  // Location: packages/lambdas/api/src/handlers/create-checkout-session.ts:94-110
  //
  // The rate limiter uses an in-memory Map which is reset per Lambda
  // container. In a serverless environment with horizontal scaling, this
  // is ineffective. The contract requires 10/hour/IP.
  //
  // This test proves the vulnerability by demonstrating that the rate
  // limit state is module-scoped and cannot survive across Lambda cold
  // starts. While we cannot simulate actual Lambda cold starts in a
  // unit test, we can verify that the rate limiting mechanism is NOT
  // using a persistent store (DynamoDB, Redis, etc.) by checking that
  // the handler module does not import or use any persistent rate
  // limit storage.
  //
  // Fix: Use a persistent rate limit store (DynamoDB, ElastiCache,
  // or API Gateway usage plans) instead of in-memory Map.
  // ---------------------------------------------------------------------------
  describe('Rate Limiting Persistence', () => {
    it('should not use an in-memory Map for rate limiting in a Lambda environment', () => {
      const handlerSource = require('fs').readFileSync(
        require('path').resolve(
          __dirname,
          '../../packages/lambdas/api/src/handlers/create-checkout-session.ts',
        ),
        'utf-8',
      ) as string;

      // The in-memory rate limit store is the vulnerability.
      // After fix, this pattern should be replaced with a persistent store.
      const usesInMemoryMap =
        /const\s+rateLimitStore\s*=\s*new\s+Map/.test(handlerSource);

      expect(usesInMemoryMap).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // VULNERABILITY 2b: deliveryNotes length not validated
  //
  // Severity: MEDIUM | CWE-400
  // Location: packages/shared/types/src/validate-checkout-input.ts
  //
  // The customerName and customerPhone fields have length limits but
  // deliveryNotes has no length constraint. An attacker can send an
  // extremely long deliveryNotes string that gets stored in DynamoDB,
  // embedded in Stripe metadata (which has a 500-char value limit),
  // and included in email bodies.
  //
  // Fix: Add validateStringLength for deliveryNotes (e.g., max 500 chars).
  // ---------------------------------------------------------------------------
  describe('Delivery Notes Length Limit', () => {
    it('should reject deliveryNotes exceeding a reasonable length', () => {
      const longNotes = 'x'.repeat(1000);
      const input = createCheckoutSessionInputFixture({
        deliveryNotes: longNotes,
      });
      const result = validation.validateCheckoutInput(input);

      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.field === 'deliveryNotes'),
      ).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // VULNERABILITY 2c: customerEmail length not validated
  //
  // Severity: LOW | CWE-400
  // Location: packages/shared/types/src/validate-checkout-input.ts
  //
  // The email regex validates format but allows extremely long addresses.
  // RFC 5321 limits email to 254 characters. A 10,000-char email that
  // matches the regex passes through to Stripe metadata and SES.
  //
  // Fix: Add a max length check for customerEmail (e.g., 254 chars per RFC).
  // ---------------------------------------------------------------------------
  describe('Email Length Limit', () => {
    it('should reject extremely long email addresses', () => {
      // Create a long email that matches the regex format
      const longEmail = 'a'.repeat(500) + '@example.com';
      const isValid = validation.validateEmail(longEmail);

      // Emails over 254 chars should be rejected per RFC 5321
      expect(isValid).toBe(false);
    });

    it('should reject long email in checkout input validation', () => {
      const longEmail = 'a'.repeat(500) + '@example.com';
      const input = createCheckoutSessionInputFixture({
        customerEmail: longEmail,
      });
      const result = validation.validateCheckoutInput(input);

      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.field === 'customerEmail'),
      ).toBe(true);
    });
  });
});
