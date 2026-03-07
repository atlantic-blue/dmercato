export interface SocialLinks {
  instagram?: string;
  tiktok?: string;
  facebook?: string;
  website?: string;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  imageKey: string;
  available: boolean;
  order: number;
}

export interface MarketDate {
  id: string;
  date: string;
  marketName: string;
  location: string;
  address: string;
}

export interface OperationalSlot {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  specificDate?: string;
}

export type DomainStatus = 'none' | 'registering' | 'provisioning' | 'active' | 'failed';

export interface Tenant {
  vendorSlug: string;
  name: string;
  tagline: string;
  story: string;
  city: string;
  country: string;
  categories: string[];
  primaryPhotoKey: string;
  photoKeys: string[];
  socialLinks: SocialLinks;
  products: Product[];
  marketDates: MarketDate[];
  operationalSchedule: OperationalSlot[];
  deliveryEnabled: boolean;
  deliveryFee: number;
  takeoutEnabled: boolean;
  email: string;
  stripeAccountId: string | null;
  stripeOnboardingComplete: boolean;
  customDomain: string | null;
  domainStatus: DomainStatus;
  domainOperationId: string | null;
  domainCertificateArn: string | null;
  plan: 'active' | 'cancelled';
  createdAt: string;
  updatedAt: string;
}

export class DatabaseError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'DatabaseError';
  }
}

export class DuplicateOrderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DuplicateOrderError';
  }
}

export class EmailSendError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'EmailSendError';
  }
}

// ---------------------------------------------------------------------------
// Order types
// ---------------------------------------------------------------------------

export interface OrderItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  subtotal: number;
}

export type OrderStatus = 'paid' | 'fulfilled' | 'refunded';
export type FulfilmentMethod = 'takeout' | 'delivery';

export interface Order {
  orderId: string;
  vendorSlug: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  platformFee: number;
  currency: string;
  fulfilmentMethod: FulfilmentMethod;
  deliveryNotes?: string;
  requestedDate: string;
  requestedTime: string;
  stripeCheckoutSessionId: string;
  stripePaymentIntentId: string;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// API response types
// ---------------------------------------------------------------------------

export interface ApiSuccessResponse<T> {
  data: T;
  meta?: { cursor?: string; count?: number };
}

export interface ApiErrorResponse {
  error: { code: string; message: string };
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

// ---------------------------------------------------------------------------
// Validation types and functions
// ---------------------------------------------------------------------------

export interface ValidationFieldError {
  field: string;
  message: string;
  code: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationFieldError[];
}

export { validateCheckoutInput } from './validate-checkout-input';
export { validateEmail } from './validate-email';
export { validateVendorSlug } from './validate-vendor-slug';
