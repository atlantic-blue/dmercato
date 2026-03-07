import { validateEmail } from './validate-email';
import { validateVendorSlug } from './validate-vendor-slug';

interface ValidationFieldError {
  field: string;
  message: string;
  code: string;
}

interface ValidationResult {
  valid: boolean;
  errors: ValidationFieldError[];
}

const KNOWN_FIELDS = new Set([
  'vendorSlug',
  'items',
  'customerName',
  'customerEmail',
  'customerPhone',
  'fulfilmentMethod',
  'deliveryNotes',
  'requestedDate',
  'requestedTime',
]);

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
const VALID_FULFILMENT_METHODS = new Set(['takeout', 'delivery']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function checkRequiredString(
  input: Record<string, unknown>,
  field: string,
  errors: ValidationFieldError[],
): string | null {
  const value = input[field];

  if (value === undefined || value === null || value === '') {
    errors.push({ field, message: `${field} is required`, code: 'REQUIRED' });
    return null;
  }

  if (typeof value !== 'string') {
    errors.push({ field, message: `${field} must be a string`, code: 'INVALID_FORMAT' });
    return null;
  }

  return value;
}

const ITEMS_MAX_COUNT = 50;

function validateItemFields(
  item: Record<string, unknown>,
  errors: ValidationFieldError[],
): void {
  const productId = item.productId;
  if (productId === undefined || productId === null) {
    errors.push({ field: 'items.productId', message: 'item productId is required', code: 'REQUIRED' });
  } else if (typeof productId !== 'string') {
    errors.push({ field: 'items.productId', message: 'item productId must be a string', code: 'INVALID_FORMAT' });
  }

  const quantity = item.quantity;
  if (quantity === undefined || quantity === null) {
    errors.push({ field: 'items.quantity', message: 'item quantity is required', code: 'REQUIRED' });
  } else if (typeof quantity !== 'number' || !Number.isInteger(quantity)) {
    errors.push({ field: 'items.quantity', message: 'item quantity must be an integer', code: 'INVALID_VALUE' });
  } else if (quantity <= 0) {
    errors.push({ field: 'items.quantity', message: 'item quantity must be positive', code: 'INVALID_VALUE' });
  }
}

function validateItems(
  input: Record<string, unknown>,
  errors: ValidationFieldError[],
): void {
  const items = input.items;

  if (items === undefined || items === null) {
    errors.push({ field: 'items', message: 'items is required', code: 'REQUIRED' });
    return;
  }

  if (!Array.isArray(items)) {
    errors.push({ field: 'items', message: 'items must be an array', code: 'INVALID_FORMAT' });
    return;
  }

  if (items.length === 0) {
    errors.push({ field: 'items', message: 'items must not be empty', code: 'REQUIRED' });
    return;
  }

  if (items.length > ITEMS_MAX_COUNT) {
    errors.push({ field: 'items', message: `items must not exceed ${ITEMS_MAX_COUNT}`, code: 'TOO_MANY' });
    return;
  }

  for (const item of items) {
    if (!isRecord(item)) {
      errors.push({ field: 'items', message: 'each item must be an object', code: 'INVALID_FORMAT' });
      continue;
    }
    validateItemFields(item, errors);
  }
}

function validateUnknownFields(
  input: Record<string, unknown>,
  errors: ValidationFieldError[],
): void {
  for (const key of Object.keys(input)) {
    if (!KNOWN_FIELDS.has(key)) {
      errors.push({ field: key, message: `unknown field: ${key}`, code: 'UNKNOWN_FIELD' });
    }
  }
}

function validateStringLength(
  input: Record<string, unknown>,
  field: string,
  maxLength: number,
  errors: ValidationFieldError[],
): void {
  const value = input[field];
  if (typeof value === 'string' && value.length > maxLength) {
    errors.push({ field, message: `${field} must not exceed ${maxLength} characters`, code: 'TOO_LONG' });
  }
}

export function validateCheckoutInput(input: unknown): ValidationResult {
  const errors: ValidationFieldError[] = [];

  if (!isRecord(input)) {
    errors.push({ field: 'body', message: 'request body must be an object', code: 'INVALID_FORMAT' });
    return { valid: false, errors };
  }

  validateUnknownFields(input, errors);

  const vendorSlug = checkRequiredString(input, 'vendorSlug', errors);
  if (vendorSlug && !validateVendorSlug(vendorSlug)) {
    errors.push({ field: 'vendorSlug', message: 'vendorSlug has invalid format', code: 'INVALID_FORMAT' });
  }

  checkRequiredString(input, 'customerName', errors);
  validateStringLength(input, 'customerName', 200, errors);

  const customerEmail = checkRequiredString(input, 'customerEmail', errors);
  if (customerEmail && !validateEmail(customerEmail)) {
    errors.push({ field: 'customerEmail', message: 'customerEmail is not a valid email', code: 'INVALID_FORMAT' });
  }

  if (input.customerPhone !== undefined) {
    validateStringLength(input, 'customerPhone', 30, errors);
  }

  const fulfilmentMethod = checkRequiredString(input, 'fulfilmentMethod', errors);
  if (fulfilmentMethod && !VALID_FULFILMENT_METHODS.has(fulfilmentMethod)) {
    errors.push({ field: 'fulfilmentMethod', message: 'fulfilmentMethod must be takeout or delivery', code: 'INVALID_VALUE' });
  }

  const requestedDate = checkRequiredString(input, 'requestedDate', errors);
  if (requestedDate && !DATE_REGEX.test(requestedDate)) {
    errors.push({ field: 'requestedDate', message: 'requestedDate must be YYYY-MM-DD', code: 'INVALID_FORMAT' });
  }

  if (input.deliveryNotes !== undefined) {
    validateStringLength(input, 'deliveryNotes', 500, errors);
  }

  const requestedTime = checkRequiredString(input, 'requestedTime', errors);
  if (requestedTime && !TIME_REGEX.test(requestedTime)) {
    errors.push({ field: 'requestedTime', message: 'requestedTime must be HH:MM 24h format', code: 'INVALID_FORMAT' });
  }

  validateItems(input, errors);

  return { valid: errors.length === 0, errors };
}
