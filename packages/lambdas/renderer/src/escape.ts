const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '`': '&#x60;',
};

const HTML_ESCAPE_REGEX = /[&<>"'`]/g;
const NULL_BYTE_REGEX = /\x00/g;

export function escapeHtml(input: string): string {
  const sanitized = input.replace(NULL_BYTE_REGEX, '');
  return sanitized.replace(
    HTML_ESCAPE_REGEX,
    (char) => HTML_ESCAPE_MAP[char] ?? char
  );
}

export function escapeJsonLd(jsonString: string): string {
  return jsonString.replace(/<\//gi, '<\\/');
}
