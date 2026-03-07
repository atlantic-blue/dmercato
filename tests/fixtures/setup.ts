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
process.env.AWS_REGION = 'ap-southeast-2';
