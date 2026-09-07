/**
 * Unit tests for the default cache-hint policy.
 *
 * The scope values are the reason this file exists. `cacheScope: 'public'`
 * permits a shared cache to serve one caller's copy to another, so a hint that
 * flips from 'private' to 'public' on a per-account result is a data leak, not
 * a performance regression. Pin each one.
 *
 * The key set itself needs no test: the object is typed
 * `Partial<Record<CacheableResultMethod, CacheHint>>`, so a method the SDK adds
 * to or drops from that union is a compile error here.
 */

import { type CacheableResultMethod, defaultCacheHints } from '@mcp-z/server';
import assert from 'assert';

describe('lib/cache-hints', () => {
  describe('defaultCacheHints', () => {
    it('marks per-account results private', () => {
      for (const method of ['resources/list', 'resources/read'] as CacheableResultMethod[]) {
        const hint = defaultCacheHints[method];
        assert.ok(hint, `${method} should carry a hint`);
        assert.strictEqual(hint.cacheScope, 'private', `${method} varies by account and must never be publicly cacheable`);
        assert.strictEqual(hint.ttlMs, 0, `${method} must not be cached`);
      }
    });

    it('marks registration-fixed catalogs public with a TTL', () => {
      for (const method of ['tools/list', 'prompts/list', 'resources/templates/list', 'server/discover'] as CacheableResultMethod[]) {
        const hint = defaultCacheHints[method];
        assert.ok(hint, `${method} should carry a hint`);
        assert.strictEqual(hint.cacheScope, 'public', `${method} is identical for every caller`);
        assert.ok(typeof hint.ttlMs === 'number' && hint.ttlMs > 0, `${method} should have a positive TTL`);
      }
    });
  });
});
