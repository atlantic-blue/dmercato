import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

interface OrderEmailItem {
  name: string;
  price: number;
  quantity: number;
  subtotal: number;
}

interface OrderEmailData {
  orderId: string;
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

interface SendOrderConfirmationEmailInput {
  customerEmail: string;
  customerName: string;
  order: OrderEmailData;
  vendorName: string;
}

function formatCurrency(amount: number, currency: string): string {
  const major = (amount / 100).toFixed(2);
  return `${major} ${currency.toUpperCase()}`;
}

function buildOrderEmailBody(input: SendOrderConfirmationEmailInput): string {
  const { order, vendorName } = input;
  const itemLines = order.items
    .map((item) => `  ${item.name} x${item.quantity} - ${formatCurrency(item.subtotal, order.currency)}`)
    .join('\n');

  const lines = [
    `Thank you for your order from ${vendorName}!`,
    '',
    'Order Details:',
    itemLines,
    '',
    `Subtotal: ${formatCurrency(order.subtotal, order.currency)}`,
  ];

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

export async function sendOrderConfirmationEmail(
  input: SendOrderConfirmationEmailInput,
): Promise<{ messageId: string }> {
  const fromAddress = process.env.SES_FROM_ADDRESS ?? 'noreply@dmercato.com';
  const shortOrderId = input.order.orderId.slice(0, 8);
  const subject = `Your order from ${input.vendorName} - #${shortOrderId}`;

  try {
    const sesClient = new SESClient({ region: process.env.AWS_REGION ?? 'us-east-1' });

    const result = await sesClient.send(
      new SendEmailCommand({
        Source: fromAddress,
        Destination: { ToAddresses: [input.customerEmail] },
        Message: {
          Subject: { Data: subject },
          Body: { Text: { Data: buildOrderEmailBody(input) } },
        },
      }),
    );

    return { messageId: result.MessageId ?? '' };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Email send failed';
    return { messageId: `error:${message}` };
  }
}
