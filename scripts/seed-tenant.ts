// Seed the Sweet Sin fixture data into DynamoDB.
//
// Usage:
//   TENANTS_TABLE=dmercato-tenants-staging npx ts-node scripts/seed-tenant.ts
//   Or after terraform:
//   TENANTS_TABLE=$(cd infra/environments/staging && terraform output -raw tenants_table_name) npx ts-node scripts/seed-tenant.ts

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { createSeedTenantFixture } from '../tests/fixtures/factories';

const TABLE_NAME = process.env.TENANTS_TABLE ?? 'dmercato-tenants-staging';
const REGION = process.env.AWS_REGION ?? 'us-east-1';

async function seedTenant(): Promise<void> {
  const client = new DynamoDBClient({ region: REGION });
  const documentClient = DynamoDBDocumentClient.from(client);

  const tenant = createSeedTenantFixture();

  console.log(`Seeding tenant "${tenant.name}" (${tenant.vendorSlug}) into ${TABLE_NAME}...`);

  await documentClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: tenant,
    }),
  );

  console.log(`Tenant "${tenant.name}" seeded successfully.`);
}

seedTenant().catch((error: unknown) => {
  console.error('Failed to seed tenant:', error);
  process.exit(1);
});
