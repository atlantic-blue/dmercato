const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
};

const HTML_ESCAPE_REGEX = /[&<>"']/g;

export function escapeHtml(input: string): string {
  return input.replace(
    HTML_ESCAPE_REGEX,
    (char) => HTML_ESCAPE_MAP[char] ?? char
  );
}
