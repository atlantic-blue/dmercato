const VENDOR_SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function validateVendorSlug(slug: unknown): boolean {
  if (typeof slug !== 'string') {
    return false;
  }

  if (slug.length === 0) {
    return false;
  }

  return VENDOR_SLUG_REGEX.test(slug);
}
