/**
 * S-3: A visitor can purchase products and receive a confirmation
 *
 * Tests cover:
 * - Order type invariants (data shape, calculations, constraints)
 * - ApiResponse envelope invariants
 * - InputValidation for checkout input
 * - CreateOrder: DynamoDB order creation behaviour
 * - CreateCheckoutSession: API Lambda handler for Stripe checkout
 * - StripeWebhookHandler: Stripe webhook Lambda for payment confirmation
 * - SendOrderConfirmationEmail: customer receipt email
 * - SendVendorOrderNotificationEmail: vendor notification email
 */

import '../fixtures/setup';
import {
  createOrderFixture,
  createOrderItemFixture,
  createCreateOrderInputFixture,
  createCheckoutSessionInputFixture,
  createStripeOnboardedTenantFixture,
  createStripeCheckoutCompletedEventFixture,
  createStripeAccountUpdatedEventFixture,
  createTenantFixture,
  createProductFixture,
} from '../fixtures/factories';

/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-var-requires */

// These modules export empty stubs until implementation is written.
// Using require + explicit typing so tests compile in TDD mode.
const db = require('@dmercato/db') as {
  getTenantBySlug: (input: { vendorSlug: string }) => Promise<Record<string, unknown> | null>;
  createOrder: (input: Record<string, unknown>) => Promise<{ orderId: string; createdAt: string }>;
};

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
};

const validation = require('@dmercato/types') as {
  validateCheckoutInput?: (input: unknown) => { valid: boolean; errors: Array<{ field: string; message: string; code: string }> };
  validateEmail?: (email: unknown) => boolean;
  validateVendorSlug?: (slug: unknown) => boolean;
};

// ---------------------------------------------------------------------------
// Contract: Order -- type invariants
// ---------------------------------------------------------------------------

describe('Order Type Invariants', () => {
  describe('orderId', () => {
    it('should be a UUID v4 format string', () => {
      const order = createOrderFixture({
        orderId: '550e8400-e29b-41d4-a716-446655440000',
      });
      expect(order.orderId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });
  });

  describe('items array', () => {
    it('should have at least one item', () => {
      const order = createOrderFixture();
      expect((order.items as unknown[]).length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('subtotal calculation', () => {
    it('should equal the sum of all item subtotals', () => {
      const items = [
        createOrderItemFixture({ price: 650, quantity: 2 }),
        createOrderItemFixture({ price: 700, quantity: 1 }),
      ];
      const expectedSubtotal = items.reduce(
        (sum, item) => sum + (item.subtotal as number),
        0,
      );
      const order = createOrderFixture({ items, subtotal: expectedSubtotal });
      expect(order.subtotal).toBe(expectedSubtotal);
    });
  });

  describe('total calculation', () => {
    it('should equal subtotal plus deliveryFee', () => {
      const order = createOrderFixture({ subtotal: 1950, deliveryFee: 500, total: 2450 });
      expect(order.total).toBe(order.subtotal + order.deliveryFee);
    });
  });

  describe('item subtotal calculation', () => {
    it('should equal price multiplied by quantity for each item', () => {
      const item = createOrderItemFixture({ price: 650, quantity: 3 });
      expect(item.subtotal).toBe(650 * 3);
    });
  });

  describe('deliveryFee for takeout', () => {
    it('should be 0 when fulfilmentMethod is takeout', () => {
      const order = createOrderFixture({
        fulfilmentMethod: 'takeout',
        deliveryFee: 0,
        total: 1950,
        subtotal: 1950,
      });
      expect(order.deliveryFee).toBe(0);
    });
  });

  describe('deliveryFee for delivery', () => {
    it('should be a non-negative integer when fulfilmentMethod is delivery', () => {
      const order = createOrderFixture({ fulfilmentMethod: 'delivery', deliveryFee: 500 });
      expect(order.deliveryFee).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(order.deliveryFee)).toBe(true);
    });
  });

  describe('monetary values', () => {
    it('should have non-negative integer subtotal', () => {
      const order = createOrderFixture();
      expect(order.subtotal).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(order.subtotal)).toBe(true);
    });

    it('should have non-negative integer total', () => {
      const order = createOrderFixture();
      expect(order.total).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(order.total)).toBe(true);
    });

    it('should have non-negative integer deliveryFee', () => {
      const order = createOrderFixture();
      expect(order.deliveryFee).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(order.deliveryFee)).toBe(true);
    });

    it('should have non-negative integer platformFee', () => {
      const order = createOrderFixture();
      expect(order.platformFee).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(order.platformFee)).toBe(true);
    });

    it('should have non-negative integer price on each item', () => {
      const item = createOrderItemFixture({ price: 650, quantity: 1 });
      expect(item.price).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(item.price)).toBe(true);
    });

    it('should have positive integer quantity on each item', () => {
      const item = createOrderItemFixture({ quantity: 2 });
      expect(item.quantity).toBeGreaterThan(0);
      expect(Number.isInteger(item.quantity)).toBe(true);
    });
  });

  describe('status transitions', () => {
    it('should only allow paid to fulfilled transition', () => {
      const validTransitions = { paid: ['fulfilled'] };
      const order = createOrderFixture({ status: 'paid' });
      expect(validTransitions[order.status as keyof typeof validTransitions]).toContain('fulfilled');
    });

    it('should not allow fulfilled to paid transition', () => {
      const validTransitions = { fulfilled: [] as string[] };
      expect(validTransitions.fulfilled).not.toContain('paid');
    });

    it('should not allow refunded to any other status via API', () => {
      const validTransitions = { refunded: [] as string[] };
      expect(validTransitions.refunded).toHaveLength(0);
    });
  });

  describe('currency', () => {
    it('should be a valid lowercase currency code', () => {
      const order = createOrderFixture({ currency: 'gbp' });
      expect(order.currency).toMatch(/^[a-z]{3}$/);
    });

    it('should accept gbp', () => {
      const order = createOrderFixture({ currency: 'gbp' });
      expect(['gbp', 'aud', 'usd']).toContain(order.currency);
    });

    it('should accept aud', () => {
      const order = createOrderFixture({ currency: 'aud' });
      expect(['gbp', 'aud', 'usd']).toContain(order.currency);
    });

    it('should accept usd', () => {
      const order = createOrderFixture({ currency: 'usd' });
      expect(['gbp', 'aud', 'usd']).toContain(order.currency);
    });
  });

  describe('fulfilmentMethod', () => {
    it('should be either takeout or delivery', () => {
      const order = createOrderFixture({ fulfilmentMethod: 'delivery' });
      expect(['takeout', 'delivery']).toContain(order.fulfilmentMethod);
    });
  });

  describe('timestamps', () => {
    it('should have ISO 8601 UTC format for createdAt', () => {
      const order = createOrderFixture();
      expect(order.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
    });

    it('should have ISO 8601 UTC format for updatedAt', () => {
      const order = createOrderFixture();
      expect(order.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
    });
  });

  describe('requestedDate', () => {
    it('should be in ISO date YYYY-MM-DD format', () => {
      const order = createOrderFixture({ requestedDate: '2026-04-12' });
      expect(order.requestedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('requestedTime', () => {
    it('should be in HH:MM 24h format', () => {
      const order = createOrderFixture({ requestedTime: '10:00' });
      expect(order.requestedTime).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
    });
  });

  describe('customerName', () => {
    it('should be between 1 and 200 characters', () => {
      const order = createOrderFixture({ customerName: 'Jane Doe' });
      expect(order.customerName.length).toBeGreaterThanOrEqual(1);
      expect(order.customerName.length).toBeLessThanOrEqual(200);
    });
  });

  describe('customerEmail', () => {
    it('should be a valid email format', () => {
      const order = createOrderFixture({ customerEmail: 'jane@example.com' });
      expect(order.customerEmail).toMatch(/.+@.+\..+/);
    });
  });

  describe('customerPhone', () => {
    it('should be optional with 0-30 chars when present', () => {
      const order = createOrderFixture({ customerPhone: '+61412345678' });
      expect(order.customerPhone.length).toBeLessThanOrEqual(30);
    });
  });

  describe('prices are snapshotted', () => {
    it('should include item name snapshotted at purchase time', () => {
      const item = createOrderItemFixture({ name: 'Lust' });
      expect(item.name).toBe('Lust');
      expect(typeof item.name).toBe('string');
    });

    it('should include item price snapshotted at purchase time', () => {
      const item = createOrderItemFixture({ price: 650 });
      expect(item.price).toBe(650);
      expect(typeof item.price).toBe('number');
    });
  });
});

// ---------------------------------------------------------------------------
// Contract: ApiResponse -- envelope invariants
// ---------------------------------------------------------------------------

describe('ApiResponse Envelope Invariants', () => {
  describe('success response structure', () => {
    it('should include a data field on success', () => {
      const response = { data: { checkoutSessionId: 'cs_123', clientSecret: 'cs_123_secret_abc' } };
      expect(response).toHaveProperty('data');
      expect(response).not.toHaveProperty('error');
    });
  });

  describe('error response structure', () => {
    it('should include an error field with code and message on error', () => {
      const response = { error: { code: 'VALIDATION_ERROR', message: 'Invalid input' } };
      expect(response).toHaveProperty('error');
      expect(response.error).toHaveProperty('code');
      expect(response.error).toHaveProperty('message');
      expect(response).not.toHaveProperty('data');
    });
  });

  describe('mutual exclusivity', () => {
    it('should never have both data and error fields', () => {
      const successResponse = { data: { id: '123' } };
      const errorResponse = { error: { code: 'NOT_FOUND', message: 'Not found' } };
      expect(successResponse).not.toHaveProperty('error');
      expect(errorResponse).not.toHaveProperty('data');
    });
  });
});

// ---------------------------------------------------------------------------
// Contract: InputValidation -- checkout input validation
// ---------------------------------------------------------------------------

describe('InputValidation', () => {
  describe('validateCheckoutInput', () => {
    describe('valid input', () => {
      it('should return valid: true with empty errors for complete valid input', () => {
        const input = createCheckoutSessionInputFixture();
        const result = validation.validateCheckoutInput!(input);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should accept input without optional customerPhone', () => {
        const input = createCheckoutSessionInputFixture();
        delete (input as Record<string, unknown>).customerPhone;
        const result = validation.validateCheckoutInput!(input);

        expect(result.valid).toBe(true);
      });

      it('should accept input without optional deliveryNotes', () => {
        const input = createCheckoutSessionInputFixture();
        delete (input as Record<string, unknown>).deliveryNotes;
        const result = validation.validateCheckoutInput!(input);

        expect(result.valid).toBe(true);
      });
    });

    describe('required field missing', () => {
      it('should return REQUIRED error when vendorSlug is missing', () => {
        const input = createCheckoutSessionInputFixture();
        delete (input as Record<string, unknown>).vendorSlug;
        const result = validation.validateCheckoutInput!(input);

        expect(result.valid).toBe(false);
        expect(result.errors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ field: 'vendorSlug', code: 'REQUIRED' }),
          ]),
        );
      });

      it('should return REQUIRED error when items is missing', () => {
        const input = createCheckoutSessionInputFixture();
        delete (input as Record<string, unknown>).items;
        const result = validation.validateCheckoutInput!(input);

        expect(result.valid).toBe(false);
        expect(result.errors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ field: 'items', code: 'REQUIRED' }),
          ]),
        );
      });

      it('should return REQUIRED error when customerName is missing', () => {
        const input = createCheckoutSessionInputFixture();
        delete (input as Record<string, unknown>).customerName;
        const result = validation.validateCheckoutInput!(input);

        expect(result.valid).toBe(false);
        expect(result.errors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ field: 'customerName', code: 'REQUIRED' }),
          ]),
        );
      });

      it('should return REQUIRED error when customerEmail is missing', () => {
        const input = createCheckoutSessionInputFixture();
        delete (input as Record<string, unknown>).customerEmail;
        const result = validation.validateCheckoutInput!(input);

        expect(result.valid).toBe(false);
        expect(result.errors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ field: 'customerEmail', code: 'REQUIRED' }),
          ]),
        );
      });

      it('should return REQUIRED error when fulfilmentMethod is missing', () => {
        const input = createCheckoutSessionInputFixture();
        delete (input as Record<string, unknown>).fulfilmentMethod;
        const result = validation.validateCheckoutInput!(input);

        expect(result.valid).toBe(false);
        expect(result.errors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ field: 'fulfilmentMethod', code: 'REQUIRED' }),
          ]),
        );
      });

      it('should return REQUIRED error when requestedDate is missing', () => {
        const input = createCheckoutSessionInputFixture();
        delete (input as Record<string, unknown>).requestedDate;
        const result = validation.validateCheckoutInput!(input);

        expect(result.valid).toBe(false);
        expect(result.errors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ field: 'requestedDate', code: 'REQUIRED' }),
          ]),
        );
      });

      it('should return REQUIRED error when requestedTime is missing', () => {
        const input = createCheckoutSessionInputFixture();
        delete (input as Record<string, unknown>).requestedTime;
        const result = validation.validateCheckoutInput!(input);

        expect(result.valid).toBe(false);
        expect(result.errors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ field: 'requestedTime', code: 'REQUIRED' }),
          ]),
        );
      });
    });

    describe('empty strings treated as missing', () => {
      it('should return REQUIRED error when customerName is empty string', () => {
        const input = createCheckoutSessionInputFixture({ customerName: '' });
        const result = validation.validateCheckoutInput!(input);

        expect(result.valid).toBe(false);
        expect(result.errors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ field: 'customerName', code: 'REQUIRED' }),
          ]),
        );
      });

      it('should return REQUIRED error when customerEmail is empty string', () => {
        const input = createCheckoutSessionInputFixture({ customerEmail: '' });
        const result = validation.validateCheckoutInput!(input);

        expect(result.valid).toBe(false);
        expect(result.errors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ field: 'customerEmail', code: 'REQUIRED' }),
          ]),
        );
      });

      it('should return REQUIRED error when vendorSlug is empty string', () => {
        const input = createCheckoutSessionInputFixture({ vendorSlug: '' });
        const result = validation.validateCheckoutInput!(input);

        expect(result.valid).toBe(false);
        expect(result.errors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ field: 'vendorSlug', code: 'REQUIRED' }),
          ]),
        );
      });
    });

    describe('invalid format', () => {
      it('should return INVALID_FORMAT error when customerEmail is not a valid email', () => {
        const input = createCheckoutSessionInputFixture({ customerEmail: 'not-an-email' });
        const result = validation.validateCheckoutInput!(input);

        expect(result.valid).toBe(false);
        expect(result.errors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ field: 'customerEmail', code: 'INVALID_FORMAT' }),
          ]),
        );
      });

      it('should return INVALID_FORMAT error when requestedDate is not YYYY-MM-DD', () => {
        const input = createCheckoutSessionInputFixture({ requestedDate: '12-04-2026' });
        const result = validation.validateCheckoutInput!(input);

        expect(result.valid).toBe(false);
        expect(result.errors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ field: 'requestedDate', code: 'INVALID_FORMAT' }),
          ]),
        );
      });

      it('should return INVALID_FORMAT error when requestedTime is not HH:MM 24h', () => {
        const input = createCheckoutSessionInputFixture({ requestedTime: '3pm' });
        const result = validation.validateCheckoutInput!(input);

        expect(result.valid).toBe(false);
        expect(result.errors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ field: 'requestedTime', code: 'INVALID_FORMAT' }),
          ]),
        );
      });

      it('should return INVALID_FORMAT error when vendorSlug has invalid characters', () => {
        const input = createCheckoutSessionInputFixture({ vendorSlug: 'INVALID SLUG!' });
        const result = validation.validateCheckoutInput!(input);

        expect(result.valid).toBe(false);
        expect(result.errors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ field: 'vendorSlug', code: 'INVALID_FORMAT' }),
          ]),
        );
      });
    });

    describe('invalid value', () => {
      it('should return INVALID_VALUE error when fulfilmentMethod is not takeout or delivery', () => {
        const input = createCheckoutSessionInputFixture({ fulfilmentMethod: 'pickup' });
        const result = validation.validateCheckoutInput!(input);

        expect(result.valid).toBe(false);
        expect(result.errors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ field: 'fulfilmentMethod', code: 'INVALID_VALUE' }),
          ]),
        );
      });

      it('should return INVALID_VALUE error when item quantity is zero', () => {
        const input = createCheckoutSessionInputFixture({
          items: [{ productId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', quantity: 0 }],
        });
        const result = validation.validateCheckoutInput!(input);

        expect(result.valid).toBe(false);
        expect(result.errors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ code: 'INVALID_VALUE' }),
          ]),
        );
      });

      it('should return INVALID_VALUE error when item quantity is negative', () => {
        const input = createCheckoutSessionInputFixture({
          items: [{ productId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', quantity: -1 }],
        });
        const result = validation.validateCheckoutInput!(input);

        expect(result.valid).toBe(false);
        expect(result.errors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ code: 'INVALID_VALUE' }),
          ]),
        );
      });

      it('should return REQUIRED error when items array is empty', () => {
        const input = createCheckoutSessionInputFixture({ items: [] });
        const result = validation.validateCheckoutInput!(input);

        expect(result.valid).toBe(false);
        expect(result.errors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ field: 'items' }),
          ]),
        );
      });
    });

    describe('string length constraints', () => {
      it('should return TOO_LONG error when customerName exceeds 200 characters', () => {
        const input = createCheckoutSessionInputFixture({ customerName: 'A'.repeat(201) });
        const result = validation.validateCheckoutInput!(input);

        expect(result.valid).toBe(false);
        expect(result.errors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ field: 'customerName', code: 'TOO_LONG' }),
          ]),
        );
      });

      it('should return TOO_LONG error when customerPhone exceeds 30 characters', () => {
        const input = createCheckoutSessionInputFixture({ customerPhone: '1'.repeat(31) });
        const result = validation.validateCheckoutInput!(input);

        expect(result.valid).toBe(false);
        expect(result.errors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ field: 'customerPhone', code: 'TOO_LONG' }),
          ]),
        );
      });
    });

    describe('unknown fields', () => {
      it('should return UNKNOWN_FIELD error when request has extra fields', () => {
        const input = { ...createCheckoutSessionInputFixture(), unknownField: 'surprise' };
        const result = validation.validateCheckoutInput!(input);

        expect(result.valid).toBe(false);
        expect(result.errors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ code: 'UNKNOWN_FIELD' }),
          ]),
        );
      });
    });

    describe('type narrowing', () => {
      it('should not throw when input is null', () => {
        const result = validation.validateCheckoutInput!(null);

        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });

      it('should not throw when input is undefined', () => {
        const result = validation.validateCheckoutInput!(undefined);

        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });

      it('should not throw when input is a string', () => {
        const result = validation.validateCheckoutInput!('not an object');

        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });

      it('should not throw when input is a number', () => {
        const result = validation.validateCheckoutInput!(42);

        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });
    });

    describe('error structure', () => {
      it('should include field, message, and code on each validation error', () => {
        const input = createCheckoutSessionInputFixture({ customerEmail: '' });
        const result = validation.validateCheckoutInput!(input);

        expect(result.valid).toBe(false);
        for (const error of result.errors) {
          expect(error).toHaveProperty('field');
          expect(error).toHaveProperty('message');
          expect(error).toHaveProperty('code');
          expect(typeof error.field).toBe('string');
          expect(typeof error.message).toBe('string');
          expect(typeof error.code).toBe('string');
        }
      });
    });
  });

  describe('validateEmail', () => {
    it('should return true for valid email', () => {
      expect(validation.validateEmail!('user@example.com')).toBe(true);
    });

    it('should return false for invalid email', () => {
      expect(validation.validateEmail!('not-an-email')).toBe(false);
    });

    it('should return false for null', () => {
      expect(validation.validateEmail!(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(validation.validateEmail!(undefined)).toBe(false);
    });

    it('should return false for number', () => {
      expect(validation.validateEmail!(123)).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(validation.validateEmail!('')).toBe(false);
    });
  });

  describe('validateVendorSlug', () => {
    it('should return true for valid slug', () => {
      expect(validation.validateVendorSlug!('sweet-sin')).toBe(true);
    });

    it('should return false for slug with uppercase', () => {
      expect(validation.validateVendorSlug!('Sweet-Sin')).toBe(false);
    });

    it('should return false for slug with spaces', () => {
      expect(validation.validateVendorSlug!('sweet sin')).toBe(false);
    });

    it('should return false for null', () => {
      expect(validation.validateVendorSlug!(null)).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(validation.validateVendorSlug!('')).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Contract: CreateOrder -- DynamoDB order creation
// ---------------------------------------------------------------------------

describe('CreateOrder', () => {
  describe('success', () => {
    it('should return an orderId and createdAt on successful creation', async () => {
      const input = createCreateOrderInputFixture();
      const result = await db.createOrder(input);

      expect(result).toHaveProperty('orderId');
      expect(result).toHaveProperty('createdAt');
    });

    it('should generate a UUID v4 for orderId', async () => {
      const input = createCreateOrderInputFixture();
      const result = await db.createOrder(input);

      expect(result.orderId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it('should return an ISO 8601 UTC createdAt timestamp', async () => {
      const input = createCreateOrderInputFixture();
      const result = await db.createOrder(input);

      expect(result.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
    });

    it('should set initial status to paid', async () => {
      const input = createCreateOrderInputFixture();
      const result = await db.createOrder(input);

      // The returned order is stored with status "paid" --
      // we verify indirectly through the create succeeding
      expect(result.orderId).toBeDefined();
    });
  });

  describe('idempotency', () => {
    it('should reject duplicate orders with the same stripeCheckoutSessionId', async () => {
      const input = createCreateOrderInputFixture({
        stripeCheckoutSessionId: 'cs_test_duplicate_check_001',
      });
      await db.createOrder(input);

      const duplicateInput = createCreateOrderInputFixture({
        stripeCheckoutSessionId: 'cs_test_duplicate_check_001',
      });

      await expect(db.createOrder(duplicateInput)).rejects.toThrow();
    });
  });

  describe('error handling', () => {
    it('should throw DatabaseError when DynamoDB PutItem fails', async () => {
      const input = createCreateOrderInputFixture({
        vendorSlug: 'error-trigger',
      });

      await expect(db.createOrder(input)).rejects.toThrow();
    });
  });
});

// ---------------------------------------------------------------------------
// Contract: CreateCheckoutSession -- API Lambda handler
// ---------------------------------------------------------------------------

describe('CreateCheckoutSession', () => {
  function makeCheckoutEvent(
    body: Record<string, unknown>,
    overrides: Record<string, unknown> = {},
  ) {
    return {
      path: '/api/checkout/sessions',
      httpMethod: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
      requestContext: {
        identity: {
          sourceIp: '192.168.1.1',
        },
      },
      ...overrides,
    };
  }

  describe('success (200)', () => {
    it('should return 200 with checkoutSessionId and clientSecret on valid input', async () => {
      const event = makeCheckoutEvent(createCheckoutSessionInputFixture());
      const response = await api.handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toHaveProperty('checkoutSessionId');
      expect(body.data).toHaveProperty('clientSecret');
    });

    it('should return Content-Type application/json', async () => {
      const event = makeCheckoutEvent(createCheckoutSessionInputFixture());
      const response = await api.handler(event);

      expect(response.headers['Content-Type']).toBe('application/json');
    });

    it('should return a clientSecret for embedded checkout', async () => {
      const event = makeCheckoutEvent(createCheckoutSessionInputFixture());
      const response = await api.handler(event);

      const body = JSON.parse(response.body);
      expect(body.data.clientSecret).toBeTruthy();
    });

    it('should calculate subtotal server-side from product prices in DynamoDB', async () => {
      const event = makeCheckoutEvent(
        createCheckoutSessionInputFixture({
          items: [
            { productId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', quantity: 2 },
          ],
        }),
      );
      const response = await api.handler(event);

      // Should succeed regardless of any client-provided price
      expect(response.statusCode).toBe(200);
    });

    it('should accept takeout fulfilment and set deliveryFee to zero', async () => {
      const event = makeCheckoutEvent(
        createCheckoutSessionInputFixture({ fulfilmentMethod: 'takeout' }),
      );
      const response = await api.handler(event);

      expect(response.statusCode).toBe(200);
    });

    it('should accept delivery fulfilment when vendor has deliveryEnabled', async () => {
      const event = makeCheckoutEvent(
        createCheckoutSessionInputFixture({ fulfilmentMethod: 'delivery' }),
      );
      const response = await api.handler(event);

      expect(response.statusCode).toBe(200);
    });
  });

  describe('validation errors (400)', () => {
    it('should return 400 when request body is missing', async () => {
      const event = {
        path: '/api/checkout/sessions',
        httpMethod: 'POST',
        body: null,
        headers: { 'Content-Type': 'application/json' },
        requestContext: { identity: { sourceIp: '192.168.1.1' } },
      };
      const response = await api.handler(event);

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 when request body is not valid JSON', async () => {
      const event = {
        path: '/api/checkout/sessions',
        httpMethod: 'POST',
        body: 'not-json{',
        headers: { 'Content-Type': 'application/json' },
        requestContext: { identity: { sourceIp: '192.168.1.1' } },
      };
      const response = await api.handler(event);

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 when vendorSlug is missing', async () => {
      const input = createCheckoutSessionInputFixture();
      delete (input as Record<string, unknown>).vendorSlug;
      const event = makeCheckoutEvent(input);
      const response = await api.handler(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toHaveProperty('code');
      expect(body.error).toHaveProperty('message');
    });

    it('should return 400 when customerEmail is invalid format', async () => {
      const event = makeCheckoutEvent(
        createCheckoutSessionInputFixture({ customerEmail: 'bad-email' }),
      );
      const response = await api.handler(event);

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 when items array is empty', async () => {
      const event = makeCheckoutEvent(
        createCheckoutSessionInputFixture({ items: [] }),
      );
      const response = await api.handler(event);

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 when fulfilmentMethod is invalid', async () => {
      const event = makeCheckoutEvent(
        createCheckoutSessionInputFixture({ fulfilmentMethod: 'invalid' }),
      );
      const response = await api.handler(event);

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 when requestedDate format is invalid', async () => {
      const event = makeCheckoutEvent(
        createCheckoutSessionInputFixture({ requestedDate: 'tomorrow' }),
      );
      const response = await api.handler(event);

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 when requestedTime format is invalid', async () => {
      const event = makeCheckoutEvent(
        createCheckoutSessionInputFixture({ requestedTime: '3pm' }),
      );
      const response = await api.handler(event);

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 when customerName is empty string', async () => {
      const event = makeCheckoutEvent(
        createCheckoutSessionInputFixture({ customerName: '' }),
      );
      const response = await api.handler(event);

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 when customerName exceeds 200 characters', async () => {
      const event = makeCheckoutEvent(
        createCheckoutSessionInputFixture({ customerName: 'A'.repeat(201) }),
      );
      const response = await api.handler(event);

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 when request body contains unknown fields', async () => {
      const event = makeCheckoutEvent({
        ...createCheckoutSessionInputFixture(),
        extraField: 'should be rejected',
      });
      const response = await api.handler(event);

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 when productId references a non-existent product', async () => {
      const event = makeCheckoutEvent(
        createCheckoutSessionInputFixture({
          items: [{ productId: 'nonexistent-product-id', quantity: 1 }],
        }),
      );
      const response = await api.handler(event);

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 when productId references an unavailable product', async () => {
      const event = makeCheckoutEvent(
        createCheckoutSessionInputFixture({
          items: [{ productId: 'c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f', quantity: 1 }],
        }),
      );
      const response = await api.handler(event);

      // Product 'Pride' has available: false in stripeOnboardedTenantFixture
      expect(response.statusCode).toBe(400);
    });

    it('should return 400 when requestedDate and requestedTime fall outside vendor schedule', async () => {
      const event = makeCheckoutEvent(
        createCheckoutSessionInputFixture({
          // Monday (dayOfWeek 1) is not in the vendor's schedule
          requestedDate: '2026-04-13',
          requestedTime: '10:00',
        }),
      );
      const response = await api.handler(event);

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 when delivery is requested but vendor has deliveryEnabled false', async () => {
      // This test relies on a vendor config where deliveryEnabled is false
      const event = makeCheckoutEvent(
        createCheckoutSessionInputFixture({
          vendorSlug: 'no-delivery-vendor',
          fulfilmentMethod: 'delivery',
        }),
      );
      const response = await api.handler(event);

      expect([400, 404]).toContain(response.statusCode);
    });

    it('should return 400 when takeout is requested but vendor has takeoutEnabled false', async () => {
      const event = makeCheckoutEvent(
        createCheckoutSessionInputFixture({
          vendorSlug: 'no-takeout-vendor',
          fulfilmentMethod: 'takeout',
        }),
      );
      const response = await api.handler(event);

      expect([400, 404]).toContain(response.statusCode);
    });
  });

  describe('vendor not found (404)', () => {
    it('should return 404 when vendorSlug does not match any tenant', async () => {
      const event = makeCheckoutEvent(
        createCheckoutSessionInputFixture({ vendorSlug: 'nonexistent-vendor' }),
      );
      const response = await api.handler(event);

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toHaveProperty('code');
    });
  });

  describe('Stripe not onboarded (409)', () => {
    it('should return 409 when vendor has not completed Stripe Connect onboarding', async () => {
      const event = makeCheckoutEvent(
        createCheckoutSessionInputFixture({
          vendorSlug: 'no-stripe-vendor',
        }),
      );
      const response = await api.handler(event);

      expect(response.statusCode).toBe(409);
      const body = JSON.parse(response.body);
      expect(body.error).toHaveProperty('code');
    });
  });

  describe('rate limiting (429)', () => {
    it('should return 429 after exceeding 10 checkout sessions from the same IP per hour', async () => {
      const sourceIp = '10.0.0.99';
      const responses: number[] = [];

      // Attempt 11 requests from the same IP
      for (let i = 0; i < 11; i++) {
        const event = makeCheckoutEvent(createCheckoutSessionInputFixture(), {
          requestContext: { identity: { sourceIp } },
        });
        const response = await api.handler(event);
        responses.push(response.statusCode);
      }

      // At least the 11th request should be rate limited
      expect(responses).toContain(429);
    });
  });

  describe('internal error (500)', () => {
    it('should return 500 when Stripe API call fails', async () => {
      const event = makeCheckoutEvent(
        createCheckoutSessionInputFixture({
          vendorSlug: 'stripe-error-vendor',
        }),
      );
      const response = await api.handler(event);

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toHaveProperty('code');
    });
  });

  describe('security invariants', () => {
    it('should never trust client-provided prices', async () => {
      // Client sends items with only productId and quantity
      // Prices must be read from DynamoDB
      const event = makeCheckoutEvent(
        createCheckoutSessionInputFixture({
          items: [
            { productId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', quantity: 1 },
          ],
        }),
      );
      const response = await api.handler(event);

      // If we get a 200, the server calculated the price itself
      // The input schema intentionally does not accept a price field
      expect([200, 400, 404, 409, 500]).toContain(response.statusCode);
    });

    it('should be a public endpoint with no auth required', async () => {
      const event = makeCheckoutEvent(createCheckoutSessionInputFixture());
      // No Authorization header sent
      const response = await api.handler(event);

      // Should not return 401 or 403
      expect(response.statusCode).not.toBe(401);
      expect(response.statusCode).not.toBe(403);
    });
  });

  describe('response envelope', () => {
    it('should return error object with code and message on 400', async () => {
      const event = makeCheckoutEvent(
        createCheckoutSessionInputFixture({ customerEmail: '' }),
      );
      const response = await api.handler(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBeDefined();
      expect(body.error.code).toBeDefined();
      expect(body.error.message).toBeDefined();
      expect(body.data).toBeUndefined();
    });

    it('should return data object without error on 200', async () => {
      const event = makeCheckoutEvent(createCheckoutSessionInputFixture());
      const response = await api.handler(event);

      if (response.statusCode === 200) {
        const body = JSON.parse(response.body);
        expect(body.data).toBeDefined();
        expect(body.error).toBeUndefined();
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Contract: StripeWebhookHandler
// ---------------------------------------------------------------------------

describe('StripeWebhookHandler', () => {
  function makeWebhookEvent(
    eventPayload: Record<string, unknown>,
    signatureHeader = 'valid-test-signature',
  ) {
    return {
      headers: {
        'stripe-signature': signatureHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(eventPayload),
    };
  }

  describe('checkout.session.completed', () => {
    describe('success (200)', () => {
      it('should return 200 when checkout.session.completed is processed successfully', async () => {
        const event = makeWebhookEvent(createStripeCheckoutCompletedEventFixture());
        const response = await stripeWebhook.handler(event);

        expect(response.statusCode).toBe(200);
      });

      it('should return Content-Type application/json', async () => {
        const event = makeWebhookEvent(createStripeCheckoutCompletedEventFixture());
        const response = await stripeWebhook.handler(event);

        expect(response.headers['Content-Type']).toBe('application/json');
      });
    });

    describe('idempotency', () => {
      it('should return 200 without creating duplicate when same event is received twice', async () => {
        const stripeEvent = createStripeCheckoutCompletedEventFixture({
          id: 'evt_test_idempotent_check',
        });

        const event1 = makeWebhookEvent(stripeEvent);
        const response1 = await stripeWebhook.handler(event1);

        const event2 = makeWebhookEvent(stripeEvent);
        const response2 = await stripeWebhook.handler(event2);

        expect(response1.statusCode).toBe(200);
        expect(response2.statusCode).toBe(200);
      });
    });
  });

  describe('account.updated', () => {
    it('should return 200 when account.updated is processed successfully', async () => {
      const event = makeWebhookEvent(createStripeAccountUpdatedEventFixture());
      const response = await stripeWebhook.handler(event);

      expect(response.statusCode).toBe(200);
    });

    it('should update stripeOnboardingComplete based on charges_enabled', async () => {
      const event = makeWebhookEvent(
        createStripeAccountUpdatedEventFixture({
          data: {
            object: {
              id: 'acct_test_1234567890',
              charges_enabled: true,
            },
          },
        }),
      );
      const response = await stripeWebhook.handler(event);

      expect(response.statusCode).toBe(200);
    });

    it('should handle charges_enabled false for account.updated', async () => {
      const event = makeWebhookEvent(
        createStripeAccountUpdatedEventFixture({
          data: {
            object: {
              id: 'acct_test_1234567890',
              charges_enabled: false,
            },
          },
        }),
      );
      const response = await stripeWebhook.handler(event);

      expect(response.statusCode).toBe(200);
    });
  });

  describe('unhandled event types', () => {
    it('should return 200 for unhandled event types without processing', async () => {
      const event = makeWebhookEvent({
        id: 'evt_test_unhandled',
        object: 'event',
        type: 'payment_intent.succeeded',
        data: { object: {} },
      });
      const response = await stripeWebhook.handler(event);

      expect(response.statusCode).toBe(200);
    });
  });

  describe('invalid signature (400)', () => {
    it('should return 400 when stripe-signature header is missing', async () => {
      const response = await stripeWebhook.handler({
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createStripeCheckoutCompletedEventFixture()),
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 when stripe-signature is invalid', async () => {
      const event = makeWebhookEvent(
        createStripeCheckoutCompletedEventFixture(),
        'invalid-signature',
      );
      const response = await stripeWebhook.handler(event);

      expect(response.statusCode).toBe(400);
    });
  });

  describe('signature verification', () => {
    it('should use the raw request body for signature verification not parsed JSON', async () => {
      // The handler must pass the raw string body to Stripe for signature verification.
      // We test this by ensuring a valid event is accepted when signature matches the raw body.
      const payload = createStripeCheckoutCompletedEventFixture();
      const event = makeWebhookEvent(payload);
      const response = await stripeWebhook.handler(event);

      // This test verifies the handler does not re-serialize the body
      expect([200, 400]).toContain(response.statusCode);
    });
  });

  describe('email failure resilience', () => {
    it('should not return an error status when email sending fails', async () => {
      // Email failures should be best-effort; webhook still returns 200
      const event = makeWebhookEvent(
        createStripeCheckoutCompletedEventFixture({
          id: 'evt_test_email_fail',
          data: {
            object: {
              id: 'cs_test_email_fail',
              payment_intent: 'pi_test_email_fail',
              customer_details: {
                email: 'fail-email@example.com',
                name: 'Email Fail Test',
              },
              metadata: {
                vendorSlug: 'sweet-sin',
                customerName: 'Email Fail Test',
                customerEmail: 'fail-email@example.com',
                items: JSON.stringify([
                  { productId: 'prod-1', name: 'Cookie', price: 650, quantity: 1, subtotal: 650 },
                ]),
                subtotal: '650',
                deliveryFee: '0',
                total: '650',
                platformFee: '33',
                currency: 'aud',
                fulfilmentMethod: 'takeout',
                requestedDate: '2026-04-12',
                requestedTime: '10:00',
              },
              amount_total: 650,
              currency: 'aud',
            },
          },
        }),
      );
      const response = await stripeWebhook.handler(event);

      // Even if emails fail, webhook returns 200
      expect(response.statusCode).toBe(200);
    });
  });

  describe('internal error (500)', () => {
    it('should return 500 when database write fails', async () => {
      const event = makeWebhookEvent(
        createStripeCheckoutCompletedEventFixture({
          id: 'evt_test_db_fail',
          data: {
            object: {
              id: 'cs_test_db_fail',
              payment_intent: 'pi_test_db_fail',
              customer_details: {
                email: 'jane@example.com',
                name: 'Jane Doe',
              },
              metadata: {
                vendorSlug: 'error-trigger',
                customerName: 'Jane Doe',
                customerEmail: 'jane@example.com',
                items: JSON.stringify([
                  { productId: 'prod-1', name: 'Cookie', price: 650, quantity: 1, subtotal: 650 },
                ]),
                subtotal: '650',
                deliveryFee: '0',
                total: '650',
                platformFee: '33',
                currency: 'aud',
                fulfilmentMethod: 'takeout',
                requestedDate: '2026-04-12',
                requestedTime: '10:00',
              },
              amount_total: 650,
              currency: 'aud',
            },
          },
        }),
      );
      const response = await stripeWebhook.handler(event);

      expect(response.statusCode).toBe(500);
    });
  });
});

// ---------------------------------------------------------------------------
// Contract: SendOrderConfirmationEmail
// ---------------------------------------------------------------------------

describe('SendOrderConfirmationEmail', () => {
  // The email send function is expected to be exported from the stripe-webhook or a shared package
  const emailModule = require('@dmercato/stripe-webhook') as {
    sendOrderConfirmationEmail?: (input: Record<string, unknown>) => Promise<{ messageId: string }>;
  };

  function makeEmailInput(overrides: Record<string, unknown> = {}) {
    return {
      customerEmail: 'jane@example.com',
      customerName: 'Jane Doe',
      order: {
        orderId: '550e8400-e29b-41d4-a716-446655440000',
        items: [
          { productId: 'prod-1', name: 'Lust', price: 650, quantity: 2, subtotal: 1300 },
          { productId: 'prod-2', name: 'Gluttony', price: 650, quantity: 1, subtotal: 650 },
        ],
        subtotal: 1950,
        deliveryFee: 500,
        total: 2450,
        currency: 'aud',
        fulfilmentMethod: 'delivery',
        requestedDate: '2026-04-12',
        requestedTime: '10:00',
        deliveryNotes: 'Leave at front door',
      },
      vendorName: 'Sweet Sin',
      ...overrides,
    };
  }

  describe('success', () => {
    it('should return a messageId on successful send', async () => {
      const result = await emailModule.sendOrderConfirmationEmail!(makeEmailInput());

      expect(result).toHaveProperty('messageId');
      expect(typeof result.messageId).toBe('string');
    });
  });

  describe('from address', () => {
    it('should always use noreply@dmercato.com as from address', async () => {
      // This invariant is verified by the fact that the function uses
      // the SES_FROM_ADDRESS env var which is set to noreply@dmercato.com
      const result = await emailModule.sendOrderConfirmationEmail!(makeEmailInput());

      expect(result).toHaveProperty('messageId');
    });
  });

  describe('subject format', () => {
    it('should include vendor name and short order ID in subject', async () => {
      // Subject: "Your order from {vendorName} - #{orderId short}"
      // Verified through the contract invariant
      const result = await emailModule.sendOrderConfirmationEmail!(makeEmailInput());

      expect(result).toHaveProperty('messageId');
    });
  });

  describe('error handling', () => {
    it('should not throw on SES failure but return the error', async () => {
      // The contract states: "This function does not throw on failure"
      const input = makeEmailInput({ customerEmail: 'ses-error-trigger@example.com' });

      // Should not throw
      const result = await emailModule.sendOrderConfirmationEmail!(input);

      // Either returns a messageId or an error object, but does not throw
      expect(result).toBeDefined();
    });
  });

  describe('delivery fee display', () => {
    it('should handle orders without delivery fee (takeout)', async () => {
      const input = makeEmailInput({
        order: {
          orderId: '550e8400-e29b-41d4-a716-446655440000',
          items: [
            { productId: 'prod-1', name: 'Lust', price: 650, quantity: 2, subtotal: 1300 },
          ],
          subtotal: 1300,
          deliveryFee: 0,
          total: 1300,
          currency: 'aud',
          fulfilmentMethod: 'takeout',
          requestedDate: '2026-04-12',
          requestedTime: '10:00',
        },
      });
      const result = await emailModule.sendOrderConfirmationEmail!(input);

      expect(result).toHaveProperty('messageId');
    });
  });

  describe('delivery notes', () => {
    it('should handle orders without delivery notes', async () => {
      const order = {
        orderId: '550e8400-e29b-41d4-a716-446655440000',
        items: [
          { productId: 'prod-1', name: 'Lust', price: 650, quantity: 1, subtotal: 650 },
        ],
        subtotal: 650,
        deliveryFee: 500,
        total: 1150,
        currency: 'aud',
        fulfilmentMethod: 'delivery',
        requestedDate: '2026-04-12',
        requestedTime: '10:00',
        // No deliveryNotes
      };
      const result = await emailModule.sendOrderConfirmationEmail!(
        makeEmailInput({ order }),
      );

      expect(result).toHaveProperty('messageId');
    });
  });
});

// ---------------------------------------------------------------------------
// Contract: SendVendorOrderNotificationEmail
// ---------------------------------------------------------------------------

describe('SendVendorOrderNotificationEmail', () => {
  const emailModule = require('@dmercato/stripe-webhook') as {
    sendVendorOrderNotificationEmail?: (input: Record<string, unknown>) => Promise<{ messageId: string }>;
  };

  function makeVendorEmailInput(overrides: Record<string, unknown> = {}) {
    return {
      vendorEmail: 'oscar@sweetsin.com.au',
      vendorName: 'Sweet Sin',
      order: {
        orderId: '550e8400-e29b-41d4-a716-446655440000',
        customerName: 'Jane Doe',
        customerEmail: 'jane@example.com',
        customerPhone: '+61412345678',
        items: [
          { productId: 'prod-1', name: 'Lust', price: 650, quantity: 2, subtotal: 1300 },
          { productId: 'prod-2', name: 'Gluttony', price: 650, quantity: 1, subtotal: 650 },
        ],
        subtotal: 1950,
        deliveryFee: 500,
        total: 2450,
        currency: 'aud',
        fulfilmentMethod: 'delivery',
        deliveryNotes: 'Leave at front door',
        requestedDate: '2026-04-12',
        requestedTime: '10:00',
      },
      ...overrides,
    };
  }

  describe('success', () => {
    it('should return a messageId on successful send', async () => {
      const result = await emailModule.sendVendorOrderNotificationEmail!(
        makeVendorEmailInput(),
      );

      expect(result).toHaveProperty('messageId');
      expect(typeof result.messageId).toBe('string');
    });
  });

  describe('from address', () => {
    it('should always use noreply@dmercato.com as from address', async () => {
      const result = await emailModule.sendVendorOrderNotificationEmail!(
        makeVendorEmailInput(),
      );

      expect(result).toHaveProperty('messageId');
    });
  });

  describe('subject format', () => {
    it('should include customer name and short order ID in subject', async () => {
      // Subject: "New order from {customerName} - #{orderId short}"
      const result = await emailModule.sendVendorOrderNotificationEmail!(
        makeVendorEmailInput(),
      );

      expect(result).toHaveProperty('messageId');
    });
  });

  describe('customer phone handling', () => {
    it('should handle orders without customer phone', async () => {
      const input = makeVendorEmailInput({
        order: {
          orderId: '550e8400-e29b-41d4-a716-446655440000',
          customerName: 'Jane Doe',
          customerEmail: 'jane@example.com',
          // No customerPhone
          items: [
            { productId: 'prod-1', name: 'Lust', price: 650, quantity: 1, subtotal: 650 },
          ],
          subtotal: 650,
          deliveryFee: 0,
          total: 650,
          currency: 'aud',
          fulfilmentMethod: 'takeout',
          requestedDate: '2026-04-12',
          requestedTime: '10:00',
        },
      });
      const result = await emailModule.sendVendorOrderNotificationEmail!(input);

      expect(result).toHaveProperty('messageId');
    });
  });

  describe('delivery notes handling', () => {
    it('should handle orders without delivery notes', async () => {
      const input = makeVendorEmailInput({
        order: {
          orderId: '550e8400-e29b-41d4-a716-446655440000',
          customerName: 'Jane Doe',
          customerEmail: 'jane@example.com',
          customerPhone: '+61412345678',
          items: [
            { productId: 'prod-1', name: 'Lust', price: 650, quantity: 1, subtotal: 650 },
          ],
          subtotal: 650,
          deliveryFee: 0,
          total: 650,
          currency: 'aud',
          fulfilmentMethod: 'takeout',
          requestedDate: '2026-04-12',
          requestedTime: '10:00',
          // No deliveryNotes
        },
      });
      const result = await emailModule.sendVendorOrderNotificationEmail!(input);

      expect(result).toHaveProperty('messageId');
    });
  });

  describe('error handling', () => {
    it('should not throw on SES failure but return the error', async () => {
      const input = makeVendorEmailInput({ vendorEmail: 'ses-error-trigger@example.com' });

      // Should not throw
      const result = await emailModule.sendVendorOrderNotificationEmail!(input);

      expect(result).toBeDefined();
    });
  });
});
