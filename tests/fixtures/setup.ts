/**
 * Global test setup for Dmercato.
 * Configures environment variables and common mocks.
 */

process.env.TENANTS_TABLE = 'dmercato-tenants-test';
process.env.QUOTE_REQUESTS_TABLE = 'dmercato-quote-requests-test';
process.env.ORDERS_TABLE = 'dmercato-orders-test';
process.env.SESSIONS_TABLE = 'dmercato-sessions-test';
process.env.MAGIC_LINKS_TABLE = 'dmercato-magic-links-test';
process.env.ASSETS_BUCKET = 'dmercato-assets-test';
process.env.SITEMAPS_BUCKET = 'dmercato-sitemaps-test';
process.env.CLOUDFRONT_DISTRIBUTION_ID = 'ETEST123456';
process.env.SES_FROM_ADDRESS = 'noreply@dmercato.com';
process.env.BASE_URL = 'https://dmercato.com';
process.env.AWS_REGION = 'us-east-1';

// S-3: Stripe and checkout environment variables
process.env.STRIPE_SECRET_KEY = 'sk_test_fake_key_for_tests';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_fake_webhook_secret';
process.env.PLATFORM_FEE_PERCENT = '5';
process.env.CHECKOUT_SUCCESS_BASE_URL = 'https://dmercato.com';
process.env.CHECKOUT_CANCEL_BASE_URL = 'https://dmercato.com';
