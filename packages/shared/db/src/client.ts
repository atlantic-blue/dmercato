import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const baseClient = new DynamoDBClient({
  region: process.env.AWS_REGION ?? 'us-east-1',
});

export const docClient = DynamoDBDocumentClient.from(baseClient, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});
