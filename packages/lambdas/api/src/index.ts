import { validateCheckoutInput } from '@dmercato/types';
import { handleCreateCheckoutSession } from './handlers/create-checkout-session';

interface ApiGatewayEvent {
  path: string;
  httpMethod: string;
  body: string | null;
  headers: Record<string, string>;
  requestContext?: {
    identity?: {
      sourceIp?: string;
    };
  };
}

interface LambdaResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

const JSON_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
};

function errorResponse(statusCode: number, code: string, message: string): LambdaResponse {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify({ error: { code, message } }),
  };
}

function parseRequestBody(body: string | null): Record<string, unknown> | null {
  if (!body) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function extractSourceIp(event: ApiGatewayEvent): string {
  return event.requestContext?.identity?.sourceIp ?? 'unknown';
}

export async function handler(event: ApiGatewayEvent): Promise<LambdaResponse> {
  if (event.path === '/api/checkout/sessions' && event.httpMethod === 'POST') {
    return handleCheckoutRoute(event);
  }

  return errorResponse(404, 'NOT_FOUND', 'Route not found');
}

async function handleCheckoutRoute(event: ApiGatewayEvent): Promise<LambdaResponse> {
  const parsed = parseRequestBody(event.body);
  if (!parsed) {
    return errorResponse(400, 'INVALID_BODY', 'Request body must be valid JSON');
  }

  const validation = validateCheckoutInput(parsed);
  if (!validation.valid) {
    const firstError = validation.errors[0];
    return errorResponse(400, 'VALIDATION_ERROR', firstError?.message ?? 'Validation failed');
  }

  const sourceIp = extractSourceIp(event);

  return handleCreateCheckoutSession(
    parsed as unknown as Parameters<typeof handleCreateCheckoutSession>[0],
    sourceIp,
  );
}
