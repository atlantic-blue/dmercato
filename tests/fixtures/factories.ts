/**
 * Test data factories for Dmercato.
 * Use these to create consistent test data across all packages.
 */

let productIdCounter = 0;
let marketDateIdCounter = 0;
let operationalSlotIdCounter = 0;

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
    tagline: 'Cookie dough & fresas con crema',
    story: 'Founded in Adelaide, Sweet Sin crafts artisan cookies and irresistible fresas con crema.',
    city: 'adelaide',
    country: 'AU',
    categories: ['food', 'desserts', 'cookies'],
    primaryPhotoKey: 'vendors/sweet-sin/primary.jpg',
    photoKeys: ['vendors/sweet-sin/primary.jpg', 'vendors/sweet-sin/gallery1.jpg'],
    socialLinks: {
      instagram: '@sweetsin_au',
      tiktok: '@sweetsin',
    },
    products: [
      createProductFixture({ id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', name: 'Midnight Sea Salt', price: 650, order: 0 }),
      createProductFixture({ id: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e', name: 'Birthday Cake Bliss', price: 700, order: 1 }),
      createProductFixture({ id: 'c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f', name: 'Dulce de Leche Dream', price: 750, order: 2 }),
    ],
    marketDates: [
      createMarketDateFixture({ id: 'd4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f8a' }),
    ],
    operationalSchedule: [
      createOperationalSlotFixture({ id: 'e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8a9b', dayOfWeek: 5, startTime: '10:00', endTime: '18:00' }),
      createOperationalSlotFixture({ id: 'f6a7b8c9-d0e1-4f2a-3b4c-5d6e7f8a9b0c', dayOfWeek: 6, startTime: '09:00', endTime: '15:00' }),
    ],
    deliveryEnabled: true,
    deliveryFee: 500,
    takeoutEnabled: true,
    email: 'oscar@sweetsin.com.au',
    stripeAccountId: null,
    stripeOnboardingComplete: false,
    customDomain: null,
    domainStatus: 'none',
    plan: 'active',
    createdAt: '2026-03-06T00:00:00.000Z',
    updatedAt: '2026-03-06T00:00:00.000Z',
  });
}
