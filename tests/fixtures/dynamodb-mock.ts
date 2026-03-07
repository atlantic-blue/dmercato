/**
 * DynamoDB mock setup for integration tests.
 * Intercepts DynamoDB DocumentClient commands and returns
 * appropriate responses based on the requested vendorSlug.
 *
 * Loaded via jest setupFiles before tests run.
 */
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { createSeedTenantFixture } from './factories';

const ddbMock = mockClient(DynamoDBDocumentClient);

ddbMock.on(GetCommand).callsFake((input) => {
  const key = input.Key as Record<string, string> | undefined;
  const slug = key?.vendorSlug;

  if (slug === 'error-trigger' || slug === 'db-error-trigger') {
    throw new Error('DynamoDB service unavailable');
  }

  if (slug === 'sweet-sin') {
    return { Item: createSeedTenantFixture() };
  }

  return { Item: undefined };
});
