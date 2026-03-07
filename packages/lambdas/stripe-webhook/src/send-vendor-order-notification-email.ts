import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

interface OrderEmailItem {
  name: string;
  price: number;
  quantity: number;
  subtotal: number;
}

interface VendorOrderEmailData {
  orderId: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  items: OrderEmailItem[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  currency: string;
  fulfilmentMethod: string;
  requestedDate: string;
  requestedTime: string;
  deliveryNotes?: string;
}

interface SendVendorNotificationInput {
  vendorEmail: string;
  vendorName: string;
  order: VendorOrderEmailData;
}

function formatCurrency(amount: number, currency: string): string {
  const major = (amount / 100).toFixed(2);
  return `${major} ${currency.toUpperCase()}`;
}

function buildVendorEmailBody(input: SendVendorNotificationInput): string {
  const { order } = input;
  const itemLines = order.items
    .map((item) => `  ${item.name} x${item.quantity} - ${formatCurrency(item.subtotal, order.currency)}`)
    .join('\n');

  const lines = [
    `New order from ${order.customerName}!`,
    '',
    'Customer Info:',
    `  Name: ${order.customerName}`,
    `  Email: ${order.customerEmail}`,
  ];

  if (order.customerPhone) {
    lines.push(`  Phone: ${order.customerPhone}`);
  }

  lines.push('');
  lines.push('Order Details:');
  lines.push(itemLines);
  lines.push('');
  lines.push(`Subtotal: ${formatCurrency(order.subtotal, order.currency)}`);

  if (order.deliveryFee > 0) {
    lines.push(`Delivery Fee: ${formatCurrency(order.deliveryFee, order.currency)}`);
  }

  lines.push(`Total: ${formatCurrency(order.total, order.currency)}`);
  lines.push('');
  lines.push(`Fulfilment: ${order.fulfilmentMethod}`);
  lines.push(`Date: ${order.requestedDate}`);
  lines.push(`Time: ${order.requestedTime}`);

  if (order.deliveryNotes) {
    lines.push(`Delivery Notes: ${order.deliveryNotes}`);
  }

  return lines.join('\n');
}

export async function sendVendorOrderNotificationEmail(
  input: SendVendorNotificationInput,
): Promise<{ messageId: string }> {
  const fromAddress = process.env.SES_FROM_ADDRESS ?? 'noreply@dmercato.com';
  const shortOrderId = input.order.orderId.slice(0, 8);
  const subject = `New order from ${input.order.customerName} - #${shortOrderId}`;

  try {
    const sesClient = new SESClient({ region: process.env.AWS_REGION ?? 'us-east-1' });

    const result = await sesClient.send(
      new SendEmailCommand({
        Source: fromAddress,
        Destination: { ToAddresses: [input.vendorEmail] },
        Message: {
          Subject: { Data: subject },
          Body: { Text: { Data: buildVendorEmailBody(input) } },
        },
      }),
    );

    return { messageId: result.MessageId ?? '' };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Email send failed';
    return { messageId: `error:${message}` };
  }
}
