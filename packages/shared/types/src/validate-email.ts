const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(email: unknown): boolean {
  if (typeof email !== 'string') {
    return false;
  }

  if (email.length === 0) {
    return false;
  }

  return EMAIL_REGEX.test(email);
}
