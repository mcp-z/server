/**
 * Specs for src/transports/stdio.ts: connectStdio() serves both protocol eras
 * (a 2025 client and a 2026-07-28 client) from the same spawned process.
 */

import { Client as ModernClient } from '@modelcontextprotocol/client';
import { StdioClientTransport as ModernStdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { Client as LegacyClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport as LegacyStdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import assert from 'assert';

const ECHO_SERVER_ARGS = ['test/lib/servers/echo-server-stdio.mjs'];

describe('transports/stdio', () => {
  // serveStdio() owns the era decision per connection: the opening exchange (an
  // `initialize` request, or a `server/discover` probe) pins the connection to a
  // fresh instance from the same factory - proven here with two separate spawns of
  // the SAME echo server script, one per era.
  describe('dual-era serving (serveStdio)', () => {
    it('serves a legacy 2025 client end-to-end (initialize + tools/call)', async () => {
      const client = new LegacyClient({ name: 'legacy-stdio-test-client', version: '1.0.0' });
      const transport = new LegacyStdioClientTransport({ command: 'node', args: ECHO_SERVER_ARGS, cwd: process.cwd() });
      try {
        await client.connect(transport);

        const { tools } = await client.listTools();
        assert.ok(
          tools.find((t) => t.name === 'echo'),
          'legacy client should see the echo tool'
        );

        const result = await client.callTool({ name: 'echo', arguments: { message: 'legacy-stdio' } });
        const structured = result.structuredContent as { echo?: string } | undefined;
        assert.strictEqual(structured?.echo, 'Tool echo: legacy-stdio');

        // The server configures cacheHints, but 2025 has no cache fields at all.
        // Emitting them here would be a protocol violation, not a stray extra key.
        const listed = (await client.listTools()) as Record<string, unknown>;
        assert.strictEqual(listed.ttlMs, undefined, 'a 2025 result must not carry ttlMs');
        assert.strictEqual(listed.cacheScope, undefined, 'a 2025 result must not carry cacheScope');
      } finally {
        await client.close();
      }
    });

    it('serves a 2026-07-28 client end-to-end without an initialize handshake', async () => {
      const client = new ModernClient({ name: 'modern-stdio-test-client', version: '1.0.0' }, { versionNegotiation: { mode: { pin: '2026-07-28' } } });
      const transport = new ModernStdioClientTransport({ command: 'node', args: ECHO_SERVER_ARGS, cwd: process.cwd() });
      try {
        await client.connect(transport);

        const { tools } = await client.listTools();
        assert.ok(
          tools.find((t) => t.name === 'echo'),
          'modern client should see the echo tool'
        );

        const result = await client.callTool({ name: 'echo', arguments: { message: 'modern-stdio' } });
        const structured = result.structuredContent as { echo?: string } | undefined;
        assert.strictEqual(structured?.echo, 'Tool echo: modern-stdio');

        // defaultCacheHints reaching the wire, rather than the SDK's ttlMs: 0 / private default.
        const listed = (await client.listTools()) as Record<string, unknown>;
        assert.strictEqual(listed.cacheScope, 'public', 'tools/list is identical for every caller');
        assert.ok(typeof listed.ttlMs === 'number' && listed.ttlMs > 0, `tools/list should carry a positive TTL, got ${String(listed.ttlMs)}`);
      } finally {
        await client.close();
      }
    });
  });
});
