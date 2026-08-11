import Stripe from 'stripe';
import { getTenantBySlug } from '@dmercato/db';
import { Tenant, Product, OperationalSlot, MarketDate } from '@dmercato/types';
import { encodeItems, assertWithinStripeLimits } from '@dmercato/checkout-metadata';

interface CheckoutRequestItem {
  productId: string;
  quantity: number;
}

export interface CheckoutRequestBody {
  vendorSlug: string;
  items: CheckoutRequestItem[];
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  fulfilmentMethod: 'takeout' | 'delivery';
  deliveryNotes?: string;
  requestedDate: string;
  requestedTime: string;
}

interface LambdaResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

const JSON_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
};

function jsonResponse(statusCode: number, body: Record<string, unknown>): LambdaResponse {
  return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(body) };
}

function errorResponse(statusCode: number, code: string, message: string): LambdaResponse {
  return jsonResponse(statusCode, { error: { code, message } });
}

function resolveProducts(
  requestItems: CheckoutRequestItem[],
  vendorProducts: Product[],
): { resolved: Array<Product & { quantity: number }>; errors: string[] } {
  const resolved: Array<Product & { quantity: number }> = [];
  const errors: string[] = [];

  for (const requestItem of requestItems) {
    const product = vendorProducts.find((p) => p.id === requestItem.productId);
    if (!product) {
      errors.push(`Product ${requestItem.productId} not found`);
      continue;
    }
    if (!product.available) {
      errors.push(`Product ${requestItem.productId} is not available`);
      continue;
    }
    resolved.push({ ...product, quantity: requestItem.quantity });
  }

  return { resolved, errors };
}

function isWithinSchedule(
  schedule: OperationalSlot[],
  marketDates: MarketDate[],
  dateString: string,
  timeString: string,
): boolean {
  if (marketDates.some((md) => md.date === dateString)) {
    return true;
  }

  const dayOfWeek = new Date(dateString + 'T00:00:00Z').getUTCDay();

  return schedule.some(
    (slot) =>
      slot.dayOfWeek === dayOfWeek &&
      timeString >= slot.startTime &&
      timeString < slot.endTime,
  );
}

function calculatePlatformFee(total: number): number {
  const feePercent = parseInt(process.env.PLATFORM_FEE_PERCENT ?? '5', 10);
  return Math.round(total * (feePercent / 100));
}

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const rateLimitRecords: Record<string, number[]> = {};

function getRecentRequests(sourceIp: string): number[] {
  const now = Date.now();
  const timestamps = rateLimitRecords[sourceIp] ?? [];
  return timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
}

function isRateLimited(sourceIp: string): boolean {
  return getRecentRequests(sourceIp).length >= RATE_LIMIT_MAX;
}

function recordRateLimitEntry(sourceIp: string): void {
  const recent = getRecentRequests(sourceIp);
  recent.push(Date.now());
  rateLimitRecords[sourceIp] = recent;
}

function validateFulfilment(tenant: Tenant, method: string): string | null {
  if (method === 'delivery' && !tenant.deliveryEnabled) {
    return 'Delivery is not available for this vendor';
  }
  if (method === 'takeout' && !tenant.takeoutEnabled) {
    return 'Takeout is not available for this vendor';
  }
  return null;
}

export function buildItemsMetadataChunks(products: Array<Product & { quantity: number }>): Record<string, string> {
  return encodeItems(products.map((p) => ({ productId: p.id, quantity: p.quantity, price: p.price })));
}

function buildMetadata(
  body: CheckoutRequestBody,
  itemsChunks: Record<string, string>,
  amounts: { subtotal: number; deliveryFee: number; total: number; platformFee: number; currency: string },
): Record<string, string> {
  return {
    vendorSlug: body.vendorSlug,
    customerName: body.customerName,
    customerEmail: body.customerEmail,
    customerPhone: body.customerPhone ?? '',
    ...itemsChunks,
    subtotal: String(amounts.subtotal),
    deliveryFee: String(amounts.deliveryFee),
    total: String(amounts.total),
    platformFee: String(amounts.platformFee),
    currency: amounts.currency,
    fulfilmentMethod: body.fulfilmentMethod,
    deliveryNotes: body.deliveryNotes ?? '',
    requestedDate: body.requestedDate,
    requestedTime: body.requestedTime,
  };
}

function buildLineItems(
  products: Array<Product & { quantity: number }>,
  currency: string,
  deliveryFee: number,
): Stripe.Checkout.SessionCreateParams.LineItem[] {
  const items: Stripe.Checkout.SessionCreateParams.LineItem[] = products.map((p) => ({
    price_data: { currency, product_data: { name: p.name }, unit_amount: p.price },
    quantity: p.quantity,
  }));

  if (deliveryFee > 0) {
    items.push({
      price_data: { currency, product_data: { name: 'Delivery Fee' }, unit_amount: deliveryFee },
      quantity: 1,
    });
  }

  return items;
}

function validateTenant(tenant: Tenant | null, body: CheckoutRequestBody): LambdaResponse | null {
  if (!tenant) {
    return errorResponse(404, 'VENDOR_NOT_FOUND', 'Vendor not found');
  }
  if (!tenant.stripeOnboardingComplete || !tenant.stripeAccountId) {
    return errorResponse(409, 'STRIPE_NOT_ONBOARDED', 'Vendor has not completed payment setup');
  }

  const fulfilmentError = validateFulfilment(tenant, body.fulfilmentMethod);
  if (fulfilmentError) {
    return errorResponse(400, 'FULFILMENT_UNAVAILABLE', fulfilmentError);
  }

  return null;
}

function validateProducts(body: CheckoutRequestBody, tenant: Tenant): { products: Array<Product & { quantity: number }>; error: LambdaResponse | null } {
  const { resolved, errors } = resolveProducts(body.items, tenant.products);
  if (errors.length > 0) {
    return { products: [], error: errorResponse(400, 'INVALID_PRODUCTS', errors.join('; ')) };
  }

  if (!isWithinSchedule(tenant.operationalSchedule, tenant.marketDates, body.requestedDate, body.requestedTime)) {
    return { products: [], error: errorResponse(400, 'OUT_OF_SCHEDULE', 'Requested date/time is outside vendor operating hours') };
  }

  return { products: resolved, error: null };
}

export async function handleCreateCheckoutSession(
  body: CheckoutRequestBody,
  sourceIp: string,
): Promise<LambdaResponse> {
  if (isRateLimited(sourceIp)) {
    return errorResponse(429, 'RATE_LIMITED', 'Too many requests');
  }

  const tenant = await getTenantBySlug({ vendorSlug: body.vendorSlug });

  const tenantError = validateTenant(tenant, body);
  if (tenantError) {
    return tenantError;
  }

  const { products, error: productError } = validateProducts(body, tenant!);
  if (productError) {
    return productError;
  }

  recordRateLimitEntry(sourceIp);
  return callStripeCheckout(tenant!, body, products);
}

async function callStripeCheckout(
  tenant: Tenant,
  body: CheckoutRequestBody,
  products: Array<Product & { quantity: number }>,
): Promise<LambdaResponse> {
  const subtotal = products.reduce((sum, p) => sum + p.price * p.quantity, 0);
  const deliveryFee = body.fulfilmentMethod === 'delivery' ? tenant.deliveryFee : 0;
  const total = subtotal + deliveryFee;
  const platformFee = calculatePlatformFee(total);
  const currency = tenant.products[0]?.currency ?? 'aud';

  const baseUrl = process.env.BASE_URL ?? 'https://dmercato.com';

  const itemsChunks = buildItemsMetadataChunks(products);
  const metadata = buildMetadata(body, itemsChunks, { subtotal, deliveryFee, total, platformFee, currency });
  assertWithinStripeLimits(metadata);
  const lineItems = buildLineItems(products, currency, deliveryFee);

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
      apiVersion: '2023-10-16' as Stripe.LatestApiVersion,
    });

    const session = await stripe.checkout.sessions.create({
      ui_mode: 'embedded',
      mode: 'payment',
      line_items: lineItems,
      return_url: `${baseUrl}/${body.vendorSlug}?order=confirmed&session_id={CHECKOUT_SESSION_ID}`,
      payment_intent_data: {
        application_fee_amount: platformFee,
        transfer_data: { destination: tenant.stripeAccountId! },
      },
      metadata,
    });

    return jsonResponse(200, { data: { checkoutSessionId: session.id, clientSecret: session.client_secret } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Stripe checkout error:', message);
    return errorResponse(500, 'STRIPE_ERROR', 'Payment processing failed');
  }
}
