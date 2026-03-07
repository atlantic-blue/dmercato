import { Tenant, Product } from '@dmercato/types';

interface SeoMetadataInput {
  tenant: Tenant;
  baseUrl: string;
}

export interface OgTags {
  'og:title': string;
  'og:description': string;
  'og:image': string;
  'og:url': string;
  'og:type': string;
}

export interface SeoMetadata {
  title: string;
  description: string;
  canonicalUrl: string;
  ogTags: OgTags;
  jsonLd: Record<string, unknown>;
}

const MAX_DESCRIPTION_LENGTH = 160;
const ELLIPSIS = '...';

function truncateDescription(tagline: string): string {
  if (tagline.length <= MAX_DESCRIPTION_LENGTH) {
    return tagline;
  }
  const truncateAt = MAX_DESCRIPTION_LENGTH - ELLIPSIS.length;
  return tagline.slice(0, truncateAt) + ELLIPSIS;
}

function buildProductJsonLd(
  product: Product,
  assetsBaseUrl: string
): Record<string, unknown> {
  return {
    '@type': 'Product',
    name: product.name,
    description: product.description,
    image: `${assetsBaseUrl}/${product.imageKey}`,
    offers: {
      '@type': 'Offer',
      price: (product.price / 100).toFixed(2),
      priceCurrency: product.currency.toUpperCase(),
      availability: product.available
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
    },
  };
}

function buildJsonLd(
  tenant: Tenant,
  baseUrl: string
): Record<string, unknown> {
  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: tenant.name,
    description: tenant.tagline,
    url: `${baseUrl}/${tenant.vendorSlug}`,
    image: `${baseUrl}/assets/${tenant.primaryPhotoKey}`,
    address: {
      '@type': 'PostalAddress',
      addressLocality: tenant.city,
      addressCountry: tenant.country,
    },
  };

  if (tenant.products.length > 0) {
    jsonLd.makesOffer = tenant.products.map((product) =>
      buildProductJsonLd(product, `${baseUrl}/assets`)
    );
  }

  return jsonLd;
}

export function generateSeoMetadata(input: SeoMetadataInput): SeoMetadata {
  const { tenant, baseUrl } = input;
  const canonicalUrl = `${baseUrl}/${tenant.vendorSlug}`;
  const description = truncateDescription(tenant.tagline);

  return {
    title: `${tenant.name} | Dmercato`,
    description,
    canonicalUrl,
    ogTags: {
      'og:title': tenant.name,
      'og:description': description,
      'og:image': `${baseUrl}/assets/${tenant.primaryPhotoKey}`,
      'og:url': canonicalUrl,
      'og:type': 'website',
    },
    jsonLd: buildJsonLd(tenant, baseUrl),
  };
}
