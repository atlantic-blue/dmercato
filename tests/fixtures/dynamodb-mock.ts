/**
 * DynamoDB mock setup for integration tests.
 * Intercepts DynamoDB DocumentClient commands and returns
 * appropriate responses based on the requested vendorSlug.
 *
 * Loaded via jest setupFiles before tests run.
 */
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import {
  createStripeOnboardedTenantFixture,
  createTenantFixture,
  createProductFixture,
  createOperationalSlotFixture,
} from './factories';

const ddbMock = mockClient(DynamoDBDocumentClient);

/**
 * Vendor fixtures for different test scenarios.
 * sweet-sin: fully onboarded, used for checkout success tests
 * no-stripe-vendor: exists but Stripe not onboarded (409)
 * stripe-error-vendor: onboarded but triggers Stripe API error (500)
 */
const vendorFixtures: Record<string, ReturnType<typeof createTenantFixture>> = {
  'sweet-sin': createStripeOnboardedTenantFixture({
    operationalSchedule: [
      createOperationalSlotFixture({ dayOfWeek: 0, startTime: '09:00', endTime: '15:00' }),
      createOperationalSlotFixture({ dayOfWeek: 5, startTime: '10:00', endTime: '18:00' }),
      createOperationalSlotFixture({ dayOfWeek: 6, startTime: '09:00', endTime: '15:00' }),
    ],
  }),
  'no-stripe-vendor': createTenantFixture({
    vendorSlug: 'no-stripe-vendor',
    name: 'No Stripe Vendor',
    stripeAccountId: null,
    stripeOnboardingComplete: false,
    products: [createProductFixture({ id: 'prod-ns-001', available: true })],
    operationalSchedule: [
      createOperationalSlotFixture({ dayOfWeek: 6, startTime: '09:00', endTime: '15:00' }),
    ],
    deliveryEnabled: true,
    deliveryFee: 500,
    takeoutEnabled: true,
  }),
  'stripe-error-vendor': createTenantFixture({
    vendorSlug: 'stripe-error-vendor',
    name: 'Stripe Error Vendor',
    stripeAccountId: 'acct_test_error_vendor',
    stripeOnboardingComplete: true,
    products: [
      createProductFixture({ id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', name: 'Lust', price: 650, available: true }),
      createProductFixture({ id: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e', name: 'Gluttony', price: 650, available: true }),
    ],
    operationalSchedule: [
      createOperationalSlotFixture({ dayOfWeek: 0, startTime: '09:00', endTime: '15:00' }),
      createOperationalSlotFixture({ dayOfWeek: 5, startTime: '10:00', endTime: '18:00' }),
      createOperationalSlotFixture({ dayOfWeek: 6, startTime: '09:00', endTime: '15:00' }),
    ],
    deliveryEnabled: true,
    deliveryFee: 500,
    takeoutEnabled: true,
  }),
};

// In-memory order store for PutCommand simulation
const orderStore = new Map<string, Record<string, unknown>>();

ddbMock.on(GetCommand).callsFake((input) => {
  const key = input.Key as Record<string, string> | undefined;
  const slug = key?.vendorSlug;

  if (slug === 'error-trigger' || slug === 'db-error-trigger') {
    throw new Error('DynamoDB service unavailable');
  }

  if (slug && vendorFixtures[slug]) {
    return { Item: vendorFixtures[slug] };
  }

  return { Item: undefined };
});

ddbMock.on(PutCommand).callsFake((input) => {
  const item = input.Item as Record<string, unknown> | undefined;

  if (!item) {
    return {};
  }

  // Simulate error for error-trigger vendorSlug
  if (item.vendorSlug === 'error-trigger') {
    throw new Error('DynamoDB service unavailable');
  }

  // Simulate conditional check for duplicate stripeCheckoutSessionId
  const sessionId = item.stripeCheckoutSessionId as string | undefined;
  if (sessionId && orderStore.has(sessionId)) {
    const error = new Error('The conditional request failed');
    error.name = 'ConditionalCheckFailedException';
    throw error;
  }

  // Store the order for duplicate detection
  if (sessionId) {
    orderStore.set(sessionId, item);
  }

  return {};
});

ddbMock.on(UpdateCommand).callsFake((_input) => {
  // Allow all updates to succeed (used for account.updated webhook)
  return {};
});

// Mock Stripe - must support both `require('stripe')` and `import Stripe from 'stripe'`
// with esModuleInterop. The __importDefault wrapper looks for `.default` on the module.
jest.mock('stripe', () => {
  const StripeMock = jest.fn().mockImplementation(() => ({
    checkout: {
      sessions: {
        create: jest.fn().mockImplementation((params: Record<string, unknown>) => {
          const metadata = params.metadata as Record<string, string> | undefined;
          const vendorSlug = metadata?.vendorSlug;

          if (vendorSlug === 'stripe-error-vendor') {
            throw new Error('Stripe API error');
          }

          return Promise.resolve({
            id: 'cs_test_mock_session_' + Date.now(),
            url: 'https://checkout.stripe.com/pay/cs_test_mock',
          });
        }),
      },
    },
    webhooks: {
      constructEvent: jest.fn().mockImplementation((body: string, signature: string, _secret: string) => {
        if (!signature || signature === 'invalid-signature') {
          throw new Error('No signatures found matching the expected signature for payload');
        }

        return JSON.parse(body);
      }),
    },
  }));

  // Support both `require('stripe')` and `import Stripe from 'stripe'`
  Object.assign(StripeMock, { default: StripeMock });
  return StripeMock;
});

// Mock AWS SES
jest.mock('@aws-sdk/client-ses', () => {
  return {
    SESClient: jest.fn().mockImplementation(() => ({
      send: jest.fn().mockImplementation((command: Record<string, unknown>) => {
        const input = command.input as Record<string, unknown> | undefined;
        const destination = input?.Destination as Record<string, unknown> | undefined;
        const toAddresses = destination?.ToAddresses as string[] | undefined;
        const toEmail = toAddresses?.[0];

        // Simulate SES error for specific email
        if (toEmail === 'ses-error-trigger@example.com') {
          throw new Error('SES service unavailable');
        }

        return Promise.resolve({
          MessageId: 'ses-mock-message-' + Date.now(),
        });
      }),
    })),
    SendEmailCommand: jest.fn().mockImplementation((input: unknown) => ({
      input,
    })),
  };
});
