/**
 * Test data factories for Dmercato.
 * Use these to create consistent test data across all packages.
 */

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
    email: 'oscar@sweetsin.com.au',
    stripeAccountId: null,
    stripeOnboardingComplete: false,
    customDomain: null,
    domainStatus: 'none' as const,
    domainOperationId: null,
    domainCertificateArn: null,
    plan: 'active' as const,
    billingInterval: 'monthly' as const,
    stripeSubscriptionId: '',
    createdAt: '2026-03-06T00:00:00.000Z',
    updatedAt: '2026-03-06T00:00:00.000Z',
    ...overrides,
  };
}

export function createProductFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'prod-001',
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
  return {
    id: 'md-001',
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
