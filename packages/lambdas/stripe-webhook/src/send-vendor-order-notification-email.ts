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

const CURRENCY_SYMBOLS: Record<string, string> = { aud: '$', gbp: '\u00A3', usd: '$' };

function formatCurrency(amount: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? '$';
  return `${symbol}${(amount / 100).toFixed(2)}`;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildVendorEmailHtml(input: SendVendorNotificationInput): string {
  const { order, vendorName } = input;
  const shortOrderId = order.orderId.slice(0, 8);

  const itemRows = order.items
    .map((item) => `
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;font-family:'Public Sans',Helvetica,Arial,sans-serif;font-size:14px;color:#1e293b">${escapeHtml(item.name)}</td>
                <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;font-family:'Public Sans',Helvetica,Arial,sans-serif;font-size:14px;color:#64748b;text-align:center">x${item.quantity}</td>
                <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;font-family:'Public Sans',Helvetica,Arial,sans-serif;font-size:14px;color:#1e293b;text-align:right;font-weight:600">${formatCurrency(item.subtotal, order.currency)}</td>
              </tr>`)
    .join('');

  const deliveryFeeRow = order.deliveryFee > 0 ? `
              <tr>
                <td colspan="2" style="padding:6px 0;font-family:'Public Sans',Helvetica,Arial,sans-serif;font-size:14px;color:#64748b">Delivery Fee</td>
                <td style="padding:6px 0;font-family:'Public Sans',Helvetica,Arial,sans-serif;font-size:14px;color:#64748b;text-align:right">${formatCurrency(order.deliveryFee, order.currency)}</td>
              </tr>` : '';

  const phoneRow = order.customerPhone ? `
                <tr>
                  <td style="padding:4px 0;font-family:'Public Sans',Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#64748b;width:80px">Phone</td>
                  <td style="padding:4px 0;font-family:'Public Sans',Helvetica,Arial,sans-serif;font-size:14px;color:#1e293b"><a href="tel:${escapeHtml(order.customerPhone)}" style="color:#ec5b13;text-decoration:none">${escapeHtml(order.customerPhone)}</a></td>
                </tr>` : '';

  const deliveryNotesSection = order.deliveryNotes ? `
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px">
            <tr>
              <td style="background:#f8f6f6;padding:16px;border-left:3px solid #ec5b13">
                <p style="margin:0 0 4px;font-family:'Public Sans',Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#64748b">Delivery Notes</p>
                <p style="margin:0;font-family:'Public Sans',Helvetica,Arial,sans-serif;font-size:14px;color:#1e293b">${escapeHtml(order.deliveryNotes)}</p>
              </td>
            </tr>
          </table>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f8f6f6;font-family:'Public Sans',Helvetica,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f6f6;padding:32px 16px">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e2e8f0">
          <!-- Header -->
          <tr>
            <td style="background:#ec5b13;padding:32px 40px;text-align:center">
              <h1 style="margin:0;font-family:Georgia,'Cormorant Garamond',serif;font-style:italic;font-weight:700;font-size:28px;color:#ffffff;line-height:1.2">New Order</h1>
              <p style="margin:8px 0 0;font-family:'Public Sans',Helvetica,Arial,sans-serif;font-size:12px;color:rgba(255,255,255,0.8);text-transform:uppercase;letter-spacing:0.2em">#${escapeHtml(shortOrderId)}</p>
            </td>
          </tr>
          <!-- Customer Info -->
          <tr>
            <td style="padding:32px 40px 0">
              <p style="margin:0 0 12px;font-family:'Public Sans',Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.3em;color:#64748b">Customer</p>
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:4px 0;font-family:'Public Sans',Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#64748b;width:80px">Name</td>
                  <td style="padding:4px 0;font-family:'Public Sans',Helvetica,Arial,sans-serif;font-size:14px;color:#1e293b;font-weight:600">${escapeHtml(order.customerName)}</td>
                </tr>
                <tr>
                  <td style="padding:4px 0;font-family:'Public Sans',Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#64748b;width:80px">Email</td>
                  <td style="padding:4px 0;font-family:'Public Sans',Helvetica,Arial,sans-serif;font-size:14px;color:#1e293b"><a href="mailto:${escapeHtml(order.customerEmail)}" style="color:#ec5b13;text-decoration:none">${escapeHtml(order.customerEmail)}</a></td>
                </tr>
                ${phoneRow}
              </table>
            </td>
          </tr>
          <!-- Items -->
          <tr>
            <td style="padding:24px 40px 0">
              <p style="margin:0 0 12px;font-family:'Public Sans',Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.3em;color:#64748b">Order Details</p>
              <table width="100%" cellpadding="0" cellspacing="0">
                ${itemRows}
              </table>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px">
                <tr>
                  <td colspan="2" style="padding:6px 0;font-family:'Public Sans',Helvetica,Arial,sans-serif;font-size:14px;color:#64748b">Subtotal</td>
                  <td style="padding:6px 0;font-family:'Public Sans',Helvetica,Arial,sans-serif;font-size:14px;color:#64748b;text-align:right">${formatCurrency(order.subtotal, order.currency)}</td>
                </tr>
                ${deliveryFeeRow}
                <tr>
                  <td colspan="2" style="padding:12px 0 6px;border-top:2px solid #1e293b;font-family:'Public Sans',Helvetica,Arial,sans-serif;font-size:16px;font-weight:700;color:#1e293b">Total</td>
                  <td style="padding:12px 0 6px;border-top:2px solid #1e293b;font-family:'Public Sans',Helvetica,Arial,sans-serif;font-size:16px;font-weight:700;color:#1e293b;text-align:right">${formatCurrency(order.total, order.currency)}</td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Fulfilment -->
          <tr>
            <td style="padding:24px 40px 0">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="50%" style="padding:12px 16px;background:#f8f6f6;vertical-align:top">
                    <p style="margin:0 0 4px;font-family:'Public Sans',Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#64748b">Fulfilment</p>
                    <p style="margin:0;font-family:'Public Sans',Helvetica,Arial,sans-serif;font-size:14px;color:#1e293b;text-transform:capitalize">${escapeHtml(order.fulfilmentMethod)}</p>
                  </td>
                  <td width="50%" style="padding:12px 16px;background:#f8f6f6;vertical-align:top">
                    <p style="margin:0 0 4px;font-family:'Public Sans',Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#64748b">Date &amp; Time</p>
                    <p style="margin:0;font-family:'Public Sans',Helvetica,Arial,sans-serif;font-size:14px;color:#1e293b">${escapeHtml(order.requestedDate)} at ${escapeHtml(order.requestedTime)}</p>
                  </td>
                </tr>
              </table>
              ${deliveryNotesSection}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:32px 40px;text-align:center">
              <p style="margin:0;font-family:'Public Sans',Helvetica,Arial,sans-serif;font-size:13px;color:#64748b;line-height:1.6">This is an automated order notification for ${escapeHtml(vendorName)}.</p>
            </td>
          </tr>
          <!-- Brand bar -->
          <tr>
            <td style="background:#221610;padding:16px;text-align:center">
              <p style="margin:0;font-family:Georgia,'Cormorant Garamond',serif;font-style:italic;font-weight:700;font-size:16px;color:#ffffff">dmercato</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildVendorEmailText(input: SendVendorNotificationInput): string {
  const { order } = input;
  const lines = [
    `New order from ${order.customerName}!`,
    `Order #${order.orderId.slice(0, 8)}`,
    '',
    `Customer: ${order.customerName}`,
    `Email: ${order.customerEmail}`,
  ];
  if (order.customerPhone) {
    lines.push(`Phone: ${order.customerPhone}`);
  }
  lines.push('');
  for (const item of order.items) {
    lines.push(`${item.name} x${item.quantity} — ${formatCurrency(item.subtotal, order.currency)}`);
  }
  lines.push('');
  lines.push(`Subtotal: ${formatCurrency(order.subtotal, order.currency)}`);
  if (order.deliveryFee > 0) {
    lines.push(`Delivery Fee: ${formatCurrency(order.deliveryFee, order.currency)}`);
  }
  lines.push(`Total: ${formatCurrency(order.total, order.currency)}`);
  lines.push('');
  lines.push(`Fulfilment: ${order.fulfilmentMethod}`);
  lines.push(`Date: ${order.requestedDate} at ${order.requestedTime}`);
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
          Body: {
            Html: { Data: buildVendorEmailHtml(input) },
            Text: { Data: buildVendorEmailText(input) },
          },
        },
      }),
    );

    return { messageId: result.MessageId ?? '' };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Email send failed';
    return { messageId: `error:${message}` };
  }
}
