/**
 * Sanitize URL by replacing secret parameter values with asterisks.
 * Used for safe logging of URLs that contain secrets.
 *
 * @param url - URL to sanitize
 * @returns Sanitized URL with secret values replaced
 *
 * @example
 * sanitizeUrl('http://localhost:3000/mcp?oauth_token=secret-123')
 * // Returns: 'http://localhost:3000/mcp?oauth_token=***'
 *
 * @example
 * sanitizeUrl('http://api.example.com/endpoint?api_key=abc123')
 * // Returns: 'http://api.example.com/endpoint?api_key=***'
 */
export function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const secretParams = ['secret', 'oauth_token', 'api_key', 'token', 'password', 'pw'];

    for (const param of secretParams) {
      if (parsed.searchParams.has(param)) {
        parsed.searchParams.set(param, '***');
      }
    }

    return parsed.toString();
  } catch (_error) {
    // If URL parsing fails, return original (better than crashing)
    return url;
  }
}
