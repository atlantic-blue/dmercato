import Stripe from 'stripe';
import { createOrder, getTenantBySlug } from '@dmercato/db';
import { DuplicateOrderError } from '@dmercato/types';
import { sendOrderConfirmationEmail } from './send-order-confirmation-email';
import { sendVendorOrderNotificationEmail } from './send-vendor-order-notification-email';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '@dmercato/db';

interface WebhookEvent {
  headers: Record<string, string>;
  body: string;
  isBase64Encoded?: boolean;
}

interface WebhookResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

const JSON_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
};

function jsonResponse(statusCode: number, body: Record<string, unknown>): WebhookResponse {
  return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(body) };
}

interface SessionMetadata {
  vendorSlug: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  subtotal: string;
  deliveryFee: string;
  total: string;
  platformFee: string;
  currency: string;
  fulfilmentMethod: string;
  deliveryNotes?: string;
  requestedDate: string;
  requestedTime: string;
  items_chunks: string;
  [key: string]: string | undefined;
}

interface ParsedOrderItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  subtotal: number;
}

function reassembleItems(metadata: SessionMetadata): Array<{ productId: string; quantity: number; price: number }> {
  const chunkCount = parseInt(metadata.items_chunks ?? '0', 10);
  const entries: string[] = [];
  for (let i = 0; i < chunkCount; i++) {
    const chunk = metadata[`items_${i}`] ?? '';
    if (chunk) {
      entries.push(...chunk.split('|'));
    }
  }
  return entries.map((entry) => {
    const parts = entry.split(':');
    return { productId: parts[0] ?? '', quantity: parseInt(parts[1] ?? '0', 10), price: parseInt(parts[2] ?? '0', 10) };
  });
}

function resolveOrderItems(
  rawItems: Array<{ productId: string; quantity: number; price: number }>,
  productMap: Map<string, string>,
): ParsedOrderItem[] {
  return rawItems.map((item) => ({
    productId: item.productId,
    name: productMap.get(item.productId) ?? item.productId,
    price: item.price,
    quantity: item.quantity,
    subtotal: item.price * item.quantity,
  }));
}

function parseMetadataAmounts(metadata: SessionMetadata) {
  return {
    rawItems: reassembleItems(metadata),
    subtotal: parseInt(metadata.subtotal, 10),
    deliveryFee: parseInt(metadata.deliveryFee, 10),
    total: parseInt(metadata.total, 10),
    platformFee: parseInt(metadata.platformFee, 10),
  };
}

function buildOrderData(
  orderId: string,
  metadata: SessionMetadata,
  amounts: { items: ParsedOrderItem[]; subtotal: number; deliveryFee: number; total: number; platformFee: number },
) {
  return {
    orderId,
    items: amounts.items,
    subtotal: amounts.subtotal,
    deliveryFee: amounts.deliveryFee,
    total: amounts.total,
    currency: metadata.currency,
    fulfilmentMethod: metadata.fulfilmentMethod,
    requestedDate: metadata.requestedDate,
    requestedTime: metadata.requestedTime,
    deliveryNotes: metadata.deliveryNotes || undefined,
    customerName: metadata.customerName,
    customerEmail: metadata.customerEmail,
    customerPhone: metadata.customerPhone || undefined,
  };
}

async function sendEmails(
  metadata: SessionMetadata,
  orderData: ReturnType<typeof buildOrderData>,
  vendorEmail: string,
): Promise<void> {
  await sendOrderConfirmationEmail({
    customerEmail: metadata.customerEmail,
    customerName: metadata.customerName,
    order: orderData,
    vendorName: metadata.vendorSlug,
  }).catch(() => {});

  await sendVendorOrderNotificationEmail({
    vendorEmail,
    vendorName: metadata.vendorSlug,
    order: orderData,
  }).catch(() => {});
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const metadata = session.metadata as unknown as SessionMetadata;
  const amounts = parseMetadataAmounts(metadata);

  try {
    const tenant = await getTenantBySlug({ vendorSlug: metadata.vendorSlug });
    const productMap = new Map<string, string>();
    if (tenant) {
      for (const product of tenant.products) {
        productMap.set(product.id, product.name);
      }
    }

    const items = resolveOrderItems(amounts.rawItems, productMap);

    const orderResult = await createOrder({
      vendorSlug: metadata.vendorSlug,
      customerName: metadata.customerName,
      customerEmail: metadata.customerEmail,
      customerPhone: metadata.customerPhone || undefined,
      items,
      subtotal: amounts.subtotal,
      deliveryFee: amounts.deliveryFee,
      total: amounts.total,
      platformFee: amounts.platformFee,
      currency: metadata.currency,
      fulfilmentMethod: metadata.fulfilmentMethod as 'takeout' | 'delivery',
      deliveryNotes: metadata.deliveryNotes || undefined,
      requestedDate: metadata.requestedDate,
      requestedTime: metadata.requestedTime,
      stripeCheckoutSessionId: session.id,
      stripePaymentIntentId: session.payment_intent as string,
    });

    const orderData = buildOrderData(orderResult.orderId, metadata, { ...amounts, items });
    const vendorEmail = tenant?.email ?? metadata.vendorSlug;
    await sendEmails(metadata, orderData, vendorEmail);
  } catch (error: unknown) {
    if (error instanceof DuplicateOrderError) {
      return;
    }
    throw error;
  }
}

async function handleAccountUpdated(account: Stripe.Account): Promise<void> {
  const tableName = process.env.TENANTS_TABLE;
  if (!tableName) {
    return;
  }

  await docClient.send(
    new UpdateCommand({
      TableName: tableName,
      Key: { stripeAccountId: account.id },
      UpdateExpression: 'SET stripeOnboardingComplete = :complete, updatedAt = :now',
      ExpressionAttributeValues: {
        ':complete': account.charges_enabled ?? false,
        ':now': new Date().toISOString(),
      },
    }),
  );
}

function verifySignature(body: string, signature: string): Stripe.Event {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error('Webhook secret not configured');
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
    apiVersion: '2023-10-16' as Stripe.LatestApiVersion,
  });

  return stripe.webhooks.constructEvent(body, signature, webhookSecret);
}

export async function handler(event: WebhookEvent): Promise<WebhookResponse> {
  const signature = event.headers['stripe-signature'];
  if (!signature) {
    console.error('Webhook missing stripe-signature header. Available headers:', Object.keys(event.headers).join(', '));
    return jsonResponse(400, { error: { code: 'MISSING_SIGNATURE', message: 'stripe-signature header is required' } });
  }

  const body = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf-8')
    : event.body;

  let stripeEvent: Stripe.Event;
  try {
    stripeEvent = verifySignature(body, signature);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Webhook signature verification failed:', message);
    return jsonResponse(400, { error: { code: 'INVALID_SIGNATURE', message: 'Invalid webhook signature' } });
  }

  try {
    switch (stripeEvent.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(stripeEvent.data.object as Stripe.Checkout.Session);
        break;
      case 'account.updated':
        await handleAccountUpdated(stripeEvent.data.object as Stripe.Account);
        break;
      default:
        break;
    }
    return jsonResponse(200, { data: { received: true } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Webhook handler error:', message);
    return jsonResponse(500, { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
  }
}
