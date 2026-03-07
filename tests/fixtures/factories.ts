/**
 * Test data factories for Dmercato.
 * Use these to create consistent test data across all packages.
 */

let productIdCounter = 0;
let marketDateIdCounter = 0;
let operationalSlotIdCounter = 0;
let orderItemCounter = 0;
let orderCounter = 0;
let checkoutInputCounter = 0;

/** Helper to sum subtotals from an array of items. */
function sumSubtotals(items: Array<{ subtotal: number }>): number {
  let total = 0;
  for (const item of items) {
    total += item.subtotal;
  }
  return total;
}

export function createOperationalSlotFixture(overrides: Record<string, unknown> = {}) {
  operationalSlotIdCounter++;
  return {
    id: `os-${String(operationalSlotIdCounter).padStart(3, '0')}`,
    dayOfWeek: 6, // Saturday
    startTime: '09:00',
    endTime: '15:00',
    ...overrides,
  };
}

export function createTenantFixture(overrides: Record<string, unknown> = {}) {
  return {
    vendorSlug: 'sweetsin',
    name: 'Sweet Sin',
    tagline: 'Cookie dough & fresas con crema',
    story: 'Founded in Adelaide, Sweet Sin crafts artisan cookies.',
    city: 'adelaide',
    country: 'AU',
    categories: ['food', 'desserts'],
    primaryPhotoKey: 'vendors/sweetsin/primary.jpg',
    photoKeys: ['vendors/sweetsin/primary.jpg'],
    socialLinks: {
      instagram: '@sweetsin_au',
    },
    products: [],
    marketDates: [],
    operationalSchedule: [],
    deliveryEnabled: false,
    deliveryFee: 0,
    takeoutEnabled: true,
    email: 'oscar@sweetsin.com.au',
    stripeAccountId: null,
    stripeOnboardingComplete: false,
    customDomain: null,
    domainStatus: 'none' as const,
    domainOperationId: null,
    domainCertificateArn: null,
    plan: 'active' as const,
    createdAt: '2026-03-06T00:00:00.000Z',
    updatedAt: '2026-03-06T00:00:00.000Z',
    ...overrides,
  };
}

export function createProductFixture(overrides: Record<string, unknown> = {}) {
  productIdCounter++;
  return {
    id: `prod-${String(productIdCounter).padStart(3, '0')}`,
    name: 'Midnight Sea Salt',
    description: 'Dark chocolate and sea salt cookie',
    price: 650,
    currency: 'aud',
    imageKey: 'vendors/sweetsin/products/midnight.jpg',
    available: true,
    order: 0,
    ...overrides,
  };
}

export function createMarketDateFixture(overrides: Record<string, unknown> = {}) {
  marketDateIdCounter++;
  return {
    id: `md-${String(marketDateIdCounter).padStart(3, '0')}`,
    date: '2026-04-12',
    marketName: 'Gilles at the Grounds',
    location: 'Wayville',
    address: 'Wayville Showgrounds, Adelaide SA 5034',
    ...overrides,
  };
}

export function createQuoteRequestFixture(overrides: Record<string, unknown> = {}) {
  return {
    requestId: 'qr-001',
    vendorSlug: 'sweetsin',
    name: 'Jane Doe',
    email: 'jane@example.com',
    eventType: 'corporate' as const,
    guestCount: 50,
    eventDate: '2026-05-15',
    message: 'Looking for cookie boxes for a corporate event.',
    read: false,
    createdAt: '2026-03-06T10:00:00.000Z',
    ...overrides,
  };
}

export function createSessionFixture(overrides: Record<string, unknown> = {}) {
  return {
    token: 'session-token-abc123',
    vendorSlug: 'sweetsin',
    email: 'oscar@sweetsin.com.au',
    expiresAt: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
    createdAt: '2026-03-06T00:00:00.000Z',
    ...overrides,
  };
}

/**
 * Creates a fully-populated tenant with products, market dates,
 * and operational schedule suitable for rendering tests.
 */
export function createFullTenantFixture(overrides: Record<string, unknown> = {}) {
  return createTenantFixture({
    products: [
      createProductFixture({ name: 'Midnight Sea Salt', price: 650, order: 0 }),
      createProductFixture({ name: 'Birthday Cake Bliss', price: 700, order: 1 }),
      createProductFixture({ name: 'Dulce de Leche Dream', price: 750, order: 2 }),
    ],
    marketDates: [
      createMarketDateFixture(),
    ],
    operationalSchedule: [
      createOperationalSlotFixture({ dayOfWeek: 5, startTime: '10:00', endTime: '18:00' }),
      createOperationalSlotFixture({ dayOfWeek: 6, startTime: '09:00', endTime: '15:00' }),
    ],
    deliveryEnabled: true,
    deliveryFee: 500,
    takeoutEnabled: true,
    ...overrides,
  });
}

/**
 * Creates seed data conforming to the SeedTenantData contract.
 */
export function createSeedTenantFixture() {
  return createTenantFixture({
    vendorSlug: 'sweet-sin',
    name: 'Sweet Sin',
    tagline: 'Indulge in the sweet life — handmade cookie dough & fresas con crema',
    story: 'Sweet Sin is all about indulgence. We craft made-from-scratch cookie dough treats with rich, buttery flavours and irresistible chewy texture. From classic sins to heavenly virtues, our 14 unique flavours range from creamy and decadent to bold and fruity. Every bite is designed to be the sweetest sin you\'ll ever commit.',
    city: 'adelaide',
    country: 'AU',
    categories: ['food', 'desserts', 'cookies'],
    primaryPhotoKey: 'vendors/sweet-sin/primary.jpg',
    photoKeys: [
      'vendors/sweet-sin/primary.jpg',
      'vendors/sweet-sin/products/lust.jpg',
      'vendors/sweet-sin/products/gluttony.jpg',
    ],
    socialLinks: {
      instagram: '@sweetsin.au',
      facebook: 'https://facebook.com/profile.php?id=61563358870819',
    },
    products: [
      createProductFixture({ id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', name: 'Lust', description: 'Rich and creamy cookie dough with a seductive strawberry swirl', price: 650, order: 0, imageKey: 'vendors/sweet-sin/products/lust.jpg' }),
      createProductFixture({ id: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e', name: 'Gluttony', description: 'Triple chocolate overload — dark, milk, and white chocolate chunks', price: 650, order: 1, imageKey: 'vendors/sweet-sin/products/gluttony.jpg' }),
      createProductFixture({ id: 'c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f', name: 'Pride', description: 'Golden caramel cookie dough with a proud crunch of toasted pecans', price: 650, order: 2, imageKey: 'vendors/sweet-sin/products/pride.jpg' }),
      createProductFixture({ id: 'd4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7001', name: 'Greed', description: 'Peanut butter and Nutella — because one spread is never enough', price: 650, order: 3, imageKey: 'vendors/sweet-sin/products/greed.jpg' }),
      createProductFixture({ id: 'e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f0002', name: 'Sloth', description: 'Lazy Sunday cookie dough with cinnamon, oats, and brown sugar', price: 650, order: 4, imageKey: 'vendors/sweet-sin/products/sloth.jpg' }),
      createProductFixture({ id: 'f6a7b8c9-d0e1-4f2a-3b4c-5d6e7f8a0003', name: 'Envy', description: 'Matcha and white chocolate — green with envy', price: 650, order: 5, imageKey: 'vendors/sweet-sin/products/envy.jpg' }),
      createProductFixture({ id: '01b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b0004', name: 'Chastity', description: 'Pure vanilla bean cookie dough with a hint of honey', price: 650, order: 6, imageKey: 'vendors/sweet-sin/products/chastity.jpg' }),
      createProductFixture({ id: '02c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c0005', name: 'Temperance', description: 'Balanced dark chocolate and sea salt — restrained perfection', price: 650, order: 7, imageKey: 'vendors/sweet-sin/products/temperance.jpg' }),
      createProductFixture({ id: '03d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d0006', name: 'Kindness', description: 'Soft marshmallow and milk chocolate — a gentle treat', price: 650, order: 8, imageKey: 'vendors/sweet-sin/products/kindness.jpg' }),
      createProductFixture({ id: '04e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e0007', name: 'Patience', description: 'Slow-caramelised white chocolate and macadamia', price: 650, order: 9, imageKey: 'vendors/sweet-sin/products/patience.jpg' }),
      createProductFixture({ id: '05f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f0008', name: 'Humility', description: 'Simple butter cookie dough with a sprinkle of sea salt', price: 650, order: 10, imageKey: 'vendors/sweet-sin/products/humility.jpg' }),
      createProductFixture({ id: '06a7b8c9-d0e1-4f2a-3b4c-5d6e7f8a0009', name: 'Diligence', description: 'Espresso and dark chocolate — fuel for the devoted', price: 650, order: 11, imageKey: 'vendors/sweet-sin/products/diligence.jpg' }),
      createProductFixture({ id: '07b8c9d0-e1f2-4a3b-4c5d-6e7f8a9b0010', name: 'Generosity', description: 'Loaded with M&Ms, sprinkles, and white chocolate — sharing is caring', price: 650, order: 12, imageKey: 'vendors/sweet-sin/products/generosity.jpg' }),
      createProductFixture({ id: '08c9d0e1-f2a3-4b4c-5d6e-7f8a9b0c0011', name: 'Fresas con Crema', description: 'Our signature — fresh strawberries with sweet cream cookie dough', price: 700, order: 13, imageKey: 'vendors/sweet-sin/products/repollas.jpg' }),
    ],
    marketDates: [
      createMarketDateFixture({ id: 'd4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f8a', date: '2026-04-12', marketName: 'Gilles at the Grounds', location: 'Wayville', address: 'Wayville Showgrounds, Adelaide SA 5034' }),
      createMarketDateFixture({ id: 'e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8a9c', date: '2026-04-19', marketName: 'Willunga Farmers Market', location: 'Willunga', address: 'Willunga Town Centre, SA 5172' }),
    ],
    operationalSchedule: [
      createOperationalSlotFixture({ id: 'e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8a9b', dayOfWeek: 5, startTime: '10:00', endTime: '18:00' }),
      createOperationalSlotFixture({ id: 'f6a7b8c9-d0e1-4f2a-3b4c-5d6e7f8a9b0c', dayOfWeek: 6, startTime: '09:00', endTime: '15:00' }),
    ],
    deliveryEnabled: true,
    deliveryFee: 500,
    takeoutEnabled: true,
    email: 'oscar@sweetsin.com.au',
    stripeAccountId: 'acct_1PaE4OQjzqJXb0YW',
    stripeOnboardingComplete: true,
    customDomain: null,
    domainStatus: 'none',
    plan: 'active',
    createdAt: '2026-03-06T00:00:00.000Z',
    updatedAt: '2026-03-06T00:00:00.000Z',
  });
}

// ---------------------------------------------------------------------------
// S-3: Order and checkout factories
// ---------------------------------------------------------------------------

/**
 * Creates an OrderItem fixture for testing.
 */
export function createOrderItemFixture(overrides: Record<string, unknown> = {}) {
  orderItemCounter++;
  const price = (overrides.price as number) ?? 650;
  const quantity = (overrides.quantity as number) ?? 2;
  return {
    productId: `a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b${String(orderItemCounter).padStart(4, '0')}`,
    name: `Cookie ${orderItemCounter}`,
    price,
    quantity,
    subtotal: price * quantity,
    ...overrides,
  };
}

/**
 * Creates an Order fixture conforming to the Order contract.
 */
export function createOrderFixture(overrides: Record<string, unknown> = {}) {
  orderCounter++;
  const defaultItems = [
    createOrderItemFixture({ name: 'Lust', price: 650, quantity: 2 }),
    createOrderItemFixture({ name: 'Gluttony', price: 650, quantity: 1 }),
  ];
  const items = (overrides.items as Array<{ subtotal: number }>) ?? defaultItems;
  const subtotal = (overrides.subtotal as number) ?? sumSubtotals(items);
  const deliveryFee = (overrides.deliveryFee as number) ?? 500;
  const total = (overrides.total as number) ?? (subtotal + deliveryFee);

  return {
    orderId: `ord-${String(orderCounter).padStart(3, '0')}-a1b2c3d4-e5f6-4a7b-8c9d`,
    vendorSlug: 'sweet-sin',
    customerName: 'Jane Doe',
    customerEmail: `customer-${orderCounter}@example.com`,
    customerPhone: '+61412345678',
    items,
    subtotal,
    deliveryFee,
    total,
    platformFee: Math.round(total * 0.05),
    currency: 'aud',
    fulfilmentMethod: 'delivery' as const,
    deliveryNotes: 'Leave at front door',
    requestedDate: '2026-04-12',
    requestedTime: '10:00',
    stripeCheckoutSessionId: `cs_test_${orderCounter}_abc123`,
    stripePaymentIntentId: `pi_test_${orderCounter}_def456`,
    status: 'paid' as const,
    createdAt: '2026-03-07T10:00:00.000Z',
    updatedAt: '2026-03-07T10:00:00.000Z',
    ...overrides,
  };
}

/**
 * Creates a CreateOrderInput fixture (no orderId, status, timestamps -- those are generated).
 */
export function createCreateOrderInputFixture(overrides: Record<string, unknown> = {}) {
  const defaultItems = [
    createOrderItemFixture({ name: 'Lust', price: 650, quantity: 2 }),
    createOrderItemFixture({ name: 'Gluttony', price: 650, quantity: 1 }),
  ];
  const items = (overrides.items as Array<{ subtotal: number }>) ?? defaultItems;
  const subtotal = (overrides.subtotal as number) ?? sumSubtotals(items);
  const deliveryFee = (overrides.deliveryFee as number) ?? 500;
  const total = (overrides.total as number) ?? (subtotal + deliveryFee);

  return {
    vendorSlug: 'sweet-sin',
    customerName: 'Jane Doe',
    customerEmail: `customer-${++checkoutInputCounter}@example.com`,
    customerPhone: '+61412345678',
    items,
    subtotal,
    deliveryFee,
    total,
    platformFee: Math.round(total * 0.05),
    currency: 'aud',
    fulfilmentMethod: 'delivery' as const,
    deliveryNotes: 'Leave at front door',
    requestedDate: '2026-04-12',
    requestedTime: '10:00',
    stripeCheckoutSessionId: `cs_test_input_${checkoutInputCounter}_abc123`,
    stripePaymentIntentId: `pi_test_input_${checkoutInputCounter}_def456`,
    ...overrides,
  };
}

/**
 * Creates a CreateCheckoutSession request body fixture.
 */
export function createCheckoutSessionInputFixture(overrides: Record<string, unknown> = {}) {
  return {
    vendorSlug: 'sweet-sin',
    items: [
      { productId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', quantity: 2 },
      { productId: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e', quantity: 1 },
    ],
    customerName: 'Jane Doe',
    customerEmail: 'jane@example.com',
    customerPhone: '+61412345678',
    fulfilmentMethod: 'takeout' as const,
    requestedDate: '2026-04-12',
    requestedTime: '10:00',
    ...overrides,
  };
}

/**
 * Creates a Stripe-onboarded tenant fixture suitable for checkout tests.
 */
export function createStripeOnboardedTenantFixture(overrides: Record<string, unknown> = {}) {
  return createTenantFixture({
    vendorSlug: 'sweet-sin',
    name: 'Sweet Sin',
    email: 'oscar@sweetsin.com.au',
    stripeAccountId: 'acct_test_1234567890',
    stripeOnboardingComplete: true,
    deliveryEnabled: true,
    deliveryFee: 500,
    takeoutEnabled: true,
    products: [
      createProductFixture({ id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', name: 'Lust', price: 650, available: true }),
      createProductFixture({ id: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e', name: 'Gluttony', price: 650, available: true }),
      createProductFixture({ id: 'c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f', name: 'Pride', price: 650, available: false }),
    ],
    operationalSchedule: [
      createOperationalSlotFixture({ dayOfWeek: 6, startTime: '09:00', endTime: '15:00' }),
      createOperationalSlotFixture({ dayOfWeek: 5, startTime: '10:00', endTime: '18:00' }),
    ],
    ...overrides,
  });
}

/**
 * Creates a Stripe webhook event body fixture for checkout.session.completed.
 */
export function createStripeCheckoutCompletedEventFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'evt_test_checkout_completed_001',
    object: 'event',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_session_001',
        payment_intent: 'pi_test_payment_001',
        customer_details: {
          email: 'jane@example.com',
          name: 'Jane Doe',
        },
        metadata: {
          vendorSlug: 'sweet-sin',
          customerName: 'Jane Doe',
          customerEmail: 'jane@example.com',
          customerPhone: '+61412345678',
          items: JSON.stringify([
            { productId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', name: 'Lust', price: 650, quantity: 2, subtotal: 1300 },
          ]),
          subtotal: '1300',
          deliveryFee: '500',
          total: '1800',
          platformFee: '90',
          currency: 'aud',
          fulfilmentMethod: 'delivery',
          deliveryNotes: 'Leave at front door',
          requestedDate: '2026-04-12',
          requestedTime: '10:00',
        },
        amount_total: 1800,
        currency: 'aud',
      },
    },
    ...overrides,
  };
}

/**
 * Creates a Stripe webhook event body fixture for account.updated.
 */
export function createStripeAccountUpdatedEventFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'evt_test_account_updated_001',
    object: 'event',
    type: 'account.updated',
    data: {
      object: {
        id: 'acct_test_1234567890',
        charges_enabled: true,
      },
    },
    ...overrides,
  };
}
