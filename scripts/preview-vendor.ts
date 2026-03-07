import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

// Import renderer functions directly (bypasses DynamoDB)
import { generateSeoMetadata } from '../packages/lambdas/renderer/src/seo';
import { renderHtmlTemplate } from '../packages/lambdas/renderer/src/template';

// Import the seed fixture
import { createSeedTenantFixture } from '../tests/fixtures/factories';
import { Tenant } from '../packages/shared/types/src/index';

const tenant = createSeedTenantFixture() as Tenant;
const baseUrl = 'https://dmercato.com';
const assetsBaseUrl = `${baseUrl}/assets`;

const seoMetadata = generateSeoMetadata({ tenant, baseUrl });
const html = renderHtmlTemplate({ tenant, seoMetadata, assetsBaseUrl });

const outPath = path.join('/tmp', 'dmercato-preview.html');
fs.writeFileSync(outPath, html, 'utf-8');

console.log(`Vendor page preview written to ${outPath}`);
console.log(`Vendor: ${tenant.name} (/${tenant.vendorSlug})`);
console.log(`Products: ${tenant.products.length}`);
console.log(`Market dates: ${tenant.marketDates.length}`);

// Open in default browser
const platform = process.platform;
if (platform === 'darwin') {
  execSync(`open ${outPath}`);
} else if (platform === 'linux') {
  execSync(`xdg-open ${outPath}`);
} else {
  console.log(`Open ${outPath} in your browser.`);
}
