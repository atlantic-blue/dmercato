const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_MAX_LENGTH = 254;

export function validateEmail(email: unknown): boolean {
  if (typeof email !== 'string') {
    return false;
  }

  if (email.length === 0) {
    return false;
  }

  if (email.length > EMAIL_MAX_LENGTH) {
    return false;
  }

  return EMAIL_REGEX.test(email);
}
