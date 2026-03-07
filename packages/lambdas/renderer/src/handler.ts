import { getTenantBySlug } from '@dmercato/db';
import { generateSeoMetadata } from './seo';
import { renderHtmlTemplate, render404Page, render500Page } from './template';

interface ApiGatewayV2Event {
  rawPath: string;
  requestContext?: {
    http?: { method: string; path: string };
  };
  [key: string]: unknown;
}

interface HandlerInput {
  path?: string;
  rawPath?: string;
  requestContext?: ApiGatewayV2Event['requestContext'];
}

interface HandlerOutput {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' https://js.stripe.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' https:; connect-src 'self' https://api.stripe.com; frame-src https://js.stripe.com",
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

function extractSlug(path: string): string {
  return path.replace(/^\//, '').split('/')[0] ?? '';
}

function buildSuccessResponse(body: string): HandlerOutput {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=60',
      ...SECURITY_HEADERS,
    },
    body,
  };
}

function buildNotFoundResponse(): HandlerOutput {
  return {
    statusCode: 404,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
      ...SECURITY_HEADERS,
    },
    body: render404Page(),
  };
}

function buildErrorResponse(): HandlerOutput {
  return {
    statusCode: 500,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
      ...SECURITY_HEADERS,
    },
    body: render500Page(),
  };
}

export async function handler(event: HandlerInput): Promise<HandlerOutput> {
  const path = event.rawPath ?? event.path ?? '';
  const slug = extractSlug(path);

  if (!slug) {
    return buildNotFoundResponse();
  }

  try {
    const tenant = await getTenantBySlug({ vendorSlug: slug });

    if (!tenant) {
      return buildNotFoundResponse();
    }

    const baseUrl = process.env.BASE_URL ?? 'https://dmercato.com';
    const assetsBaseUrl = `${baseUrl}/assets`;

    const seoMetadata = generateSeoMetadata({ tenant, baseUrl });
    const body = renderHtmlTemplate({ tenant, seoMetadata, assetsBaseUrl });

    return buildSuccessResponse(body);
  } catch (_error: unknown) {
    return buildErrorResponse();
  }
}
