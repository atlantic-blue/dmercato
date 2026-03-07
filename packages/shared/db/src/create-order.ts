import { randomUUID } from 'crypto';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { DatabaseError, DuplicateOrderError } from '@dmercato/types';
import { docClient } from './client';

interface CreateOrderInput {
  vendorSlug: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  items: Array<{
    productId: string;
    name: string;
    price: number;
    quantity: number;
    subtotal: number;
  }>;
  subtotal: number;
  deliveryFee: number;
  total: number;
  platformFee: number;
  currency: string;
  fulfilmentMethod: 'takeout' | 'delivery';
  deliveryNotes?: string;
  requestedDate: string;
  requestedTime: string;
  stripeCheckoutSessionId: string;
  stripePaymentIntentId: string;
}

interface CreateOrderOutput {
  orderId: string;
  createdAt: string;
}

export async function createOrder(
  input: CreateOrderInput,
): Promise<CreateOrderOutput> {
  const tableName = process.env.ORDERS_TABLE;
  if (!tableName) {
    throw new DatabaseError('ORDERS_TABLE environment variable is not set');
  }

  const orderId = randomUUID();
  const now = new Date().toISOString();

  const item = {
    orderId,
    vendorSlug: input.vendorSlug,
    customerName: input.customerName,
    customerEmail: input.customerEmail,
    customerPhone: input.customerPhone,
    items: input.items,
    subtotal: input.subtotal,
    deliveryFee: input.deliveryFee,
    total: input.total,
    platformFee: input.platformFee,
    currency: input.currency,
    fulfilmentMethod: input.fulfilmentMethod,
    deliveryNotes: input.deliveryNotes,
    requestedDate: input.requestedDate,
    requestedTime: input.requestedTime,
    stripeCheckoutSessionId: input.stripeCheckoutSessionId,
    stripePaymentIntentId: input.stripePaymentIntentId,
    status: 'paid' as const,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await docClient.send(
      new PutCommand({
        TableName: tableName,
        Item: item,
      }),
    );
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
      throw new DuplicateOrderError(
        `Order with stripeCheckoutSessionId ${input.stripeCheckoutSessionId} already exists`,
      );
    }
    throw new DatabaseError(
      `Failed to create order: ${orderId}`,
      error,
    );
  }

  return { orderId, createdAt: now };
}
