/**
 * S-2 Security Tests: A visitor can see a vendor page with product catalogue
 *
 * These tests prove the existence of security vulnerabilities found during
 * the security review. The implementer must make these tests pass by fixing
 * the underlying issues.
 *
 * Vulnerabilities covered:
 * 1. JSON-LD script tag breakout (HIGH) - CWE-79
 * 2. Cart innerHTML XSS via unsanitized item.name (HIGH) - CWE-79
 * 3. Missing Content-Security-Policy header (MEDIUM) - CWE-1021
 * 4. Missing Referrer-Policy header (LOW) - CWE-200
 * 5. HTML escaping does not cover backticks or null bytes (MEDIUM) - CWE-79
 */

import '../fixtures/setup';
import {
  createFullTenantFixture,
  createProductFixture,
} from '../fixtures/factories';

/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-var-requires */

const renderer = require('@dmercato/renderer') as {
  handler: (event: { path: string }) => Promise<{
    statusCode: number;
    headers: Record<string, string>;
    body: string;
  }>;
  generateSeoMetadata: (input: {
    tenant: Record<string, unknown>;
    baseUrl: string;
  }) => {
    title: string;
    description: string;
    canonicalUrl: string;
    ogTags: Record<string, string>;
    jsonLd: Record<string, unknown>;
  };
  renderHtmlTemplate: (input: {
    tenant: Record<string, unknown>;
    seoMetadata: Record<string, unknown>;
    assetsBaseUrl: string;
  }) => string;
  escapeHtml: (input: string) => string;
};

// ---------------------------------------------------------------------------
// Helper: generate SEO metadata for a tenant
// ---------------------------------------------------------------------------
function makeSeoMetadata(tenant: Record<string, unknown>) {
  return renderer.generateSeoMetadata({
    tenant,
    baseUrl: 'https://dmercato.com',
  });
}

/**
 * Extracts the raw content of the JSON-LD script block from the HTML.
 * Uses a regex that finds the application/ld+json script tag.
 * Returns everything between the opening and first closing </script> tag,
 * which is what the browser would parse.
 */
function extractJsonLdBlock(html: string): string {
  const match = html.match(
    /<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/
  );
  return match?.[1] ?? '';
}

describe('Security: S-2 Vendor Page', () => {
  // ---------------------------------------------------------------------------
  // VULNERABILITY 1: JSON-LD Script Injection via </script> in tenant data
  //
  // Severity: HIGH | CWE-79
  // Location: packages/lambdas/renderer/src/template.ts:22
  //
  // The renderJsonLd function uses JSON.stringify to serialize tenant data
  // into a <script type="application/ld+json"> tag. JSON.stringify does NOT
  // escape the sequence </script>, so a malicious tenant name like
  // "Vendor</script><script>alert(1)</script>" will break out of the
  // JSON-LD script block and inject executable JavaScript.
  //
  // Fix: Escape all occurrences of "</" to "<\\/" or use \\u003c in the
  // JSON-LD output to prevent the browser from seeing a closing script tag.
  // ---------------------------------------------------------------------------
  describe('JSON-LD Script Injection', () => {
    it('should not contain a raw </script> tag inside the JSON-LD block when tenant name contains a script breakout payload', () => {
      // Use alert(1) without quotes to avoid JSON.stringify escaping the
      // double quotes and masking the real vulnerability.
      const maliciousName = 'Vendor</script><script>alert(1)</script>';
      const tenant = createFullTenantFixture({ name: maliciousName });
      const seoMetadata = makeSeoMetadata(tenant);
      const html = renderer.renderHtmlTemplate({
        tenant,
        seoMetadata,
        assetsBaseUrl: 'https://dmercato.com/assets',
      });

      // Extract only the JSON-LD block. If the </script> inside the
      // payload is not escaped, the regex will match a truncated block
      // (everything up to the first </script> inside the JSON, not the
      // intended closing tag). The truncated block will NOT be valid JSON.
      const jsonLdContent = extractJsonLdBlock(html);
      let parsed: unknown = null;
      let parseError = false;
      try {
        parsed = JSON.parse(jsonLdContent);
      } catch {
        parseError = true;
      }

      // If parsing fails, the </script> inside the tenant name broke the
      // JSON-LD block -- proving the vulnerability.
      expect(parseError).toBe(false);
      // Additionally verify the parsed object still contains the full name
      expect(parsed).not.toBeNull();
      expect((parsed as Record<string, unknown>).name).toContain('Vendor');
    });

    it('should not contain a raw </script> tag inside the JSON-LD block when product name contains a script breakout payload', () => {
      const maliciousProduct = createProductFixture({
        name: 'Cookie</script><script>alert(1)</script>',
        description: 'Delicious cookie',
        order: 0,
      });
      const tenant = createFullTenantFixture({
        products: [maliciousProduct],
      });
      const seoMetadata = makeSeoMetadata(tenant);
      const html = renderer.renderHtmlTemplate({
        tenant,
        seoMetadata,
        assetsBaseUrl: 'https://dmercato.com/assets',
      });

      const jsonLdContent = extractJsonLdBlock(html);
      let parseError = false;
      try {
        JSON.parse(jsonLdContent);
      } catch {
        parseError = true;
      }

      expect(parseError).toBe(false);
    });

    it('should not contain a raw </script> tag inside the JSON-LD block when product description contains a script breakout payload', () => {
      const maliciousProduct = createProductFixture({
        name: 'Normal Cookie',
        description: 'Great</script><script>alert(1)</script>',
        order: 0,
      });
      const tenant = createFullTenantFixture({
        products: [maliciousProduct],
      });
      const seoMetadata = makeSeoMetadata(tenant);
      const html = renderer.renderHtmlTemplate({
        tenant,
        seoMetadata,
        assetsBaseUrl: 'https://dmercato.com/assets',
      });

      const jsonLdContent = extractJsonLdBlock(html);
      let parseError = false;
      try {
        JSON.parse(jsonLdContent);
      } catch {
        parseError = true;
      }

      expect(parseError).toBe(false);
    });

    it('should not contain a raw </script> tag inside the JSON-LD block when tenant tagline contains a script breakout payload', () => {
      const tenant = createFullTenantFixture({
        tagline: 'Best</script><script>alert(1)</script>',
      });
      const seoMetadata = makeSeoMetadata(tenant);
      const html = renderer.renderHtmlTemplate({
        tenant,
        seoMetadata,
        assetsBaseUrl: 'https://dmercato.com/assets',
      });

      const jsonLdContent = extractJsonLdBlock(html);
      let parseError = false;
      try {
        JSON.parse(jsonLdContent);
      } catch {
        parseError = true;
      }

      expect(parseError).toBe(false);
    });

    it('should not contain a raw </script> tag inside the JSON-LD block when tenant city contains a script breakout payload', () => {
      const tenant = createFullTenantFixture({
        city: 'City</script><script>alert(1)</script>',
      });
      const seoMetadata = makeSeoMetadata(tenant);
      const html = renderer.renderHtmlTemplate({
        tenant,
        seoMetadata,
        assetsBaseUrl: 'https://dmercato.com/assets',
      });

      const jsonLdContent = extractJsonLdBlock(html);
      let parseError = false;
      try {
        JSON.parse(jsonLdContent);
      } catch {
        parseError = true;
      }

      expect(parseError).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // VULNERABILITY 2: Cart innerHTML XSS via unsanitized item.name
  //
  // Severity: HIGH | CWE-79
  // Location: packages/lambdas/renderer/src/template.ts:253-254
  //
  // The inline cart script builds HTML by concatenating item.name directly
  // into an innerHTML assignment. When a user clicks "Add to Cart", the
  // product name is read from a data-name attribute (which the browser
  // decodes from HTML entities back to raw text) and concatenated into
  // innerHTML. A vendor-controlled product name like
  // <img src=x onerror=alert(1)> would execute JavaScript.
  //
  // Fix: Use textContent or DOM APIs instead of innerHTML with string
  // concatenation, or implement a client-side HTML escape function.
  // ---------------------------------------------------------------------------
  describe('Cart innerHTML XSS Prevention', () => {
    it('should not use innerHTML with direct string concatenation of item.name in the cart script', () => {
      const tenant = createFullTenantFixture();
      const seoMetadata = makeSeoMetadata(tenant);
      const html = renderer.renderHtmlTemplate({
        tenant,
        seoMetadata,
        assetsBaseUrl: 'https://dmercato.com/assets',
      });

      // Find the cart script block (the inline <script> that handles
      // localStorage cart operations)
      const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
      expect(scriptMatch).toBeTruthy();
      const scriptContent = scriptMatch![1]!;

      // The dangerous pattern is: .innerHTML = cart.map(...item.name...)
      // where item.name is concatenated directly into an HTML string.
      // This test detects the pattern and requires it to be replaced with
      // a safe alternative (textContent, DOM APIs, or escaping).
      const hasUnsafeInnerHtml = /\.innerHTML\s*=\s*cart\.map\(function\(item\)\{[\s\S]*?\+\s*item\.name\s*\+/.test(scriptContent);
      expect(hasUnsafeInnerHtml).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // VULNERABILITY 3: Missing Content-Security-Policy header
  //
  // Severity: MEDIUM | CWE-1021
  // Location: packages/lambdas/renderer/src/handler.ts:15-19
  //
  // The SECURITY_HEADERS object includes X-Content-Type-Options,
  // X-Frame-Options, and Strict-Transport-Security, but does NOT include
  // Content-Security-Policy. Without CSP, any XSS vulnerability (such as
  // the JSON-LD injection above) results in immediate code execution with
  // no defense-in-depth.
  //
  // Fix: Add a Content-Security-Policy header with at minimum a script-src
  // directive. Since the page uses inline scripts and styles, use nonces
  // or hashes for those, and restrict external sources.
  // ---------------------------------------------------------------------------
  describe('Content-Security-Policy Header', () => {
    it('should include Content-Security-Policy header on 200 responses', async () => {
      const response = await renderer.handler({ path: '/sweet-sin' });

      expect(response.headers['Content-Security-Policy']).toBeDefined();
    });

    it('should include Content-Security-Policy header on 404 responses', async () => {
      const response = await renderer.handler({ path: '/nonexistent-vendor' });

      expect(response.headers['Content-Security-Policy']).toBeDefined();
    });

    it('should include Content-Security-Policy header on 500 responses', async () => {
      const response = await renderer.handler({ path: '/db-error-trigger' });

      expect(response.headers['Content-Security-Policy']).toBeDefined();
    });

    it('should restrict script-src in Content-Security-Policy', async () => {
      const response = await renderer.handler({ path: '/sweet-sin' });
      const csp = response.headers['Content-Security-Policy'] ?? '';

      // CSP must include a script-src directive
      expect(csp).toMatch(/script-src/);
    });
  });

  // ---------------------------------------------------------------------------
  // VULNERABILITY 4: Missing Referrer-Policy header
  //
  // Severity: LOW | CWE-200
  // Location: packages/lambdas/renderer/src/handler.ts:15-19
  //
  // No Referrer-Policy header is set. The page loads Google Fonts via an
  // @import CSS rule, which sends the full page URL as the Referer header
  // to third-party servers. The CLAUDE.md security standards require
  // Referrer-Policy: strict-origin-when-cross-origin or more restrictive.
  //
  // Fix: Add 'Referrer-Policy': 'strict-origin-when-cross-origin' to
  // the SECURITY_HEADERS object.
  // ---------------------------------------------------------------------------
  describe('Referrer-Policy Header', () => {
    it('should include Referrer-Policy header on 200 responses', async () => {
      const response = await renderer.handler({ path: '/sweet-sin' });

      expect(response.headers['Referrer-Policy']).toBeDefined();
      expect(response.headers['Referrer-Policy']).toMatch(
        /strict-origin-when-cross-origin|strict-origin|no-referrer|same-origin/
      );
    });

    it('should include Referrer-Policy header on 404 responses', async () => {
      const response = await renderer.handler({ path: '/nonexistent-vendor' });

      expect(response.headers['Referrer-Policy']).toBeDefined();
    });

    it('should include Referrer-Policy header on 500 responses', async () => {
      const response = await renderer.handler({ path: '/db-error-trigger' });

      expect(response.headers['Referrer-Policy']).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // VULNERABILITY 5: HTML escaping incomplete - backticks and null bytes
  //
  // Severity: MEDIUM | CWE-79
  // Location: packages/lambdas/renderer/src/escape.ts:1-16
  //
  // The escapeHtml function handles &, <, >, ", and ' but does not handle
  // backticks (`) or null bytes (\x00). Backticks can create template
  // literal contexts in some JavaScript evaluation scenarios. Null bytes
  // can be used to bypass security filters in some parsers, and the
  // escapeHtml function will pass them through unchanged, leaving the
  // subsequent < and > characters to be escaped but the null byte intact
  // in the output. While the current escapeHtml does escape < and > even
  // after null bytes, the null byte itself should be stripped as it has
  // no valid use in HTML content and can cause parser confusion.
  //
  // Fix: Add backtick (`) to the escape map (e.g., &#x60;) and strip
  // or replace null bytes (\x00) from input.
  // ---------------------------------------------------------------------------
  describe('HTML Escaping Completeness', () => {
    it('should escape backtick characters to prevent template literal injection in JavaScript contexts', () => {
      const escaped = renderer.escapeHtml('`${alert(1)}`');

      // Backticks should be escaped to their HTML entity form
      expect(escaped).not.toContain('`');
    });

    it('should strip or escape null bytes from user-provided content', () => {
      const escaped = renderer.escapeHtml('Vendor\x00Name');

      // Null bytes should not be present in escaped output
      expect(escaped).not.toContain('\x00');
    });

    it('should strip null bytes even when followed by HTML special characters', () => {
      const escaped = renderer.escapeHtml('test\x00<script>');

      // The null byte should be removed and < should still be escaped
      expect(escaped).not.toContain('\x00');
      expect(escaped).not.toContain('<script>');
    });
  });
});
