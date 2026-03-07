import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { Tenant, DatabaseError } from '@dmercato/types';
import { docClient } from './client';

interface GetTenantBySlugInput {
  vendorSlug: string;
}

export async function getTenantBySlug(
  input: GetTenantBySlugInput
): Promise<Tenant | null> {
  const tableName = process.env.TENANTS_TABLE;
  if (!tableName) {
    throw new DatabaseError('TENANTS_TABLE environment variable is not set');
  }

  try {
    const result = await docClient.send(
      new GetCommand({
        TableName: tableName,
        Key: { vendorSlug: input.vendorSlug },
      })
    );

    if (!result.Item) {
      return null;
    }

    return result.Item as Tenant;
  } catch (error) {
    if (error instanceof DatabaseError) {
      throw error;
    }
    throw new DatabaseError(
      `Failed to get tenant by slug: ${input.vendorSlug}`,
      error
    );
  }
}
