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
