const VENDOR_SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VENDOR_SLUG_MAX_LENGTH = 100;

export function validateVendorSlug(slug: unknown): boolean {
  if (typeof slug !== 'string') {
    return false;
  }

  if (slug.length === 0) {
    return false;
  }

  if (slug.length > VENDOR_SLUG_MAX_LENGTH) {
    return false;
  }

  return VENDOR_SLUG_REGEX.test(slug);
}
