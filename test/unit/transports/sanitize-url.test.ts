import assert from 'assert';
import { sanitizeUrl } from '../../../src/transports/sanitize-url.ts';

describe('transports/sanitize-url', () => {
  describe('sanitizeUrl()', () => {
    it('sanitizes oauth_token parameter in http:// URL', () => {
      const url = 'http://localhost:3000/mcp?oauth_token=secret-123';
      const sanitized = sanitizeUrl(url);

      assert.ok(sanitized.includes('oauth_token=***'));
      assert.ok(!sanitized.includes('secret-123'));
    });

    it('sanitizes api_key parameter in http:// URL', () => {
      const url = 'http://api.example.com/endpoint?api_key=abc123&timeout=5000';
      const sanitized = sanitizeUrl(url);

      assert.ok(sanitized.includes('api_key=***'));
      assert.ok(!sanitized.includes('abc123'));
      assert.ok(sanitized.includes('timeout=5000'));
    });

    it('sanitizes secret parameter in http:// URL', () => {
      const url = 'http://localhost:3000/mcp?secret=my-secret&user=john';
      const sanitized = sanitizeUrl(url);

      assert.ok(sanitized.includes('secret=***'));
      assert.ok(!sanitized.includes('my-secret'));
      assert.ok(sanitized.includes('user=john'));
    });

    it('sanitizes token parameter in https:// URL', () => {
      const url = 'https://api.example.com/data?token=bearer-token-123';
      const sanitized = sanitizeUrl(url);

      assert.ok(sanitized.includes('token=***'));
      assert.ok(!sanitized.includes('bearer-token-123'));
    });

    it('sanitizes password parameter in http:// URL', () => {
      const url = 'http://localhost:8080/auth?password=mypassword123';
      const sanitized = sanitizeUrl(url);

      assert.ok(sanitized.includes('password=***'));
      assert.ok(!sanitized.includes('mypassword123'));
    });

    it('handles URL with only oauth_token parameter', () => {
      const url = 'http://localhost:3000/mcp?oauth_token=only-param';
      const sanitized = sanitizeUrl(url);

      assert.ok(sanitized.includes('oauth_token=***'));
      assert.ok(!sanitized.includes('only-param'));
    });

    it('handles URL with secret as first parameter', () => {
      const url = 'http://localhost:3000/mcp?secret=first&user=admin';
      const sanitized = sanitizeUrl(url);

      assert.ok(sanitized.includes('secret=***'));
      assert.ok(!sanitized.includes('first'));
      assert.ok(sanitized.includes('user=admin'));
    });

    it('handles URL with api_key as last parameter', () => {
      const url = 'http://api.example.com/data?user=admin&timeout=5000&api_key=last';
      const sanitized = sanitizeUrl(url);

      assert.ok(sanitized.includes('api_key=***'));
      assert.ok(!sanitized.includes('last'));
      assert.ok(sanitized.includes('user=admin'));
      assert.ok(sanitized.includes('timeout=5000'));
    });

    it('returns unchanged URL when no secret parameters', () => {
      const url = 'http://localhost:3000/mcp?user=admin';
      const sanitized = sanitizeUrl(url);

      assert.strictEqual(sanitized, url);
    });

    it('returns unchanged URL when no query string', () => {
      const url = 'http://localhost:3000/mcp';
      const sanitized = sanitizeUrl(url);

      assert.strictEqual(sanitized, url);
    });

    it('handles special characters in oauth_token value', () => {
      const url = 'http://localhost:3000/mcp?oauth_token=abc%2B123%3D%3D';
      const sanitized = sanitizeUrl(url);

      assert.ok(sanitized.includes('oauth_token=***'));
      assert.ok(!sanitized.includes('abc%2B123%3D%3D'));
    });

    it('returns original string for invalid URLs (graceful handling)', () => {
      const invalid = 'not-a-valid-url';
      const sanitized = sanitizeUrl(invalid);

      assert.strictEqual(sanitized, invalid);
    });

    it('handles empty string', () => {
      const sanitized = sanitizeUrl('');

      assert.strictEqual(sanitized, '');
    });

    it('preserves URL structure exactly except for secret value', () => {
      const url = 'http://localhost:3000/mcp?user=admin&oauth_token=test&timeout=5000';
      const sanitized = sanitizeUrl(url);

      // Should preserve protocol, host, port, path
      assert.ok(sanitized.startsWith('http://localhost:3000/mcp?'));

      // Should preserve all other parameters
      assert.ok(sanitized.includes('user=admin'));
      assert.ok(sanitized.includes('timeout=5000'));

      // Should only sanitize oauth_token
      assert.ok(sanitized.includes('oauth_token=***'));
      assert.ok(!sanitized.includes('oauth_token=test'));
    });

    it('sanitizes multiple secret parameters in same URL', () => {
      const url = 'http://localhost:3000/mcp?oauth_token=token1&api_key=key1';
      const sanitized = sanitizeUrl(url);

      assert.ok(sanitized.includes('oauth_token=***'));
      assert.ok(sanitized.includes('api_key=***'));
      assert.ok(!sanitized.includes('token1'));
      assert.ok(!sanitized.includes('key1'));
    });
  });
});
