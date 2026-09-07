/**
 * Cache hints for the 2026-07-28 revision's cacheable results.
 *
 * The SDK emits `ttlMs` and `cacheScope` on every cacheable result when serving
 * 2026-07-28, defaulting to `ttlMs: 0` / `cacheScope: 'private'` — the most
 * conservative policy, which forfeits the benefit entirely. 2025-era responses
 * are never affected.
 */

import type { CacheHint, ServerOptions } from '@modelcontextprotocol/server';

/**
 * The operations whose results carry cache fields on 2026-07-28. The SDK keeps
 * this list closed but does not export the union, so derive it from the option
 * it belongs to rather than restating six strings that could drift.
 */
export type CacheableResultMethod = keyof NonNullable<ServerOptions['cacheHints']>;

/**
 * Five minutes. Catalogs only change when a server is deployed, so a client
 * caching one is right almost always — but a client that cached across a
 * version bump serves a stale catalog for exactly this long, which is the cost
 * of a longer value.
 */
const CATALOG_TTL_MS = 5 * 60 * 1000;

/**
 * The default policy for an mcp-z server: catalogs are shareable, anything
 * derived from a user's account is not.
 *
 * `cacheScope: 'public'` permits a *shared* cache to serve one client's copy to
 * another, so it is only ever correct for a result identical for every caller.
 * A tool, prompt or resource-template catalog is fixed at registration and does
 * not vary by who is asking. A resource list or read does — a Drive file listing
 * or a spreadsheet's contents belongs to one account — so those stay `private`,
 * and marking them `public` would hand one user's data to another. That is the
 * one value in this file where a mistake is a data leak rather than a slow cache.
 *
 * Spread it into `new McpServer(info, { ...defaultCacheHints })`, or pass a
 * merged object to override a single operation.
 *
 * @public
 */
export const defaultCacheHints: Partial<Record<CacheableResultMethod, CacheHint>> = {
  // Identical for every caller, fixed at registration.
  'tools/list': { ttlMs: CATALOG_TTL_MS, cacheScope: 'public' },
  'prompts/list': { ttlMs: CATALOG_TTL_MS, cacheScope: 'public' },
  'resources/templates/list': { ttlMs: CATALOG_TTL_MS, cacheScope: 'public' },
  // Server identity and capabilities: static per process, and hit on every
  // 2026-era connection, so caching it is worth more than it looks.
  'server/discover': { ttlMs: CATALOG_TTL_MS, cacheScope: 'public' },
  // Per-account. Stated rather than left to default so the reasoning is visible
  // at the point a future change would have to argue with it.
  'resources/list': { ttlMs: 0, cacheScope: 'private' },
  'resources/read': { ttlMs: 0, cacheScope: 'private' },
};
