/**
 * CORS preflight contract for createHttpMcpRouter().
 *
 * The router is mounted here WITHOUT an app-level cors() layer. That is deliberate:
 * every mcp-* server stacks a permissive `app.use(cors())` ahead of this router, and
 * with cors' default `preflightContinue: false` that layer answers preflight and ends
 * the response - so the router's own allow-list never runs there. A consumer mounting
 * this public export standalone gets the router's list, and that is what these tests pin.
 */

import { createHttpMcpRouter } from '@mcp-z/server';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import assert from 'assert';
import express from 'express';
import getPort from 'get-port';

describe('unit/http-transport-cors-preflight', () => {
  const silentLogger = { info: () => {}, error: () => {}, warn: () => {}, debug: () => {} };

  const preflight = async (requestHeaders: string) => {
    const port = await getPort();
    const app = express();
    const mcpServer = new McpServer({ name: 'cors-test', version: '1.0.0' });
    app.use('/mcp', createHttpMcpRouter({ mcpServer, logger: silentLogger as never }));

    const server = app.listen(port);
    try {
      const response = await fetch(`http://localhost:${port}/mcp`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://example.com',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': requestHeaders,
        },
      });
      return (response.headers.get('access-control-allow-headers') ?? '').toLowerCase();
    } finally {
      server.close();
    }
  };

  it('allows the authorization header so the DCR bearer flow works cross-origin', async () => {
    const allowed = await preflight('authorization');
    assert.ok(allowed.includes('authorization'), `expected 'authorization' in allow-headers, got: "${allowed}"`);
  });

  it('allows mcp-protocol-version, required on HTTP requests since spec 2025-06-18', async () => {
    const allowed = await preflight('mcp-protocol-version');
    assert.ok(allowed.includes('mcp-protocol-version'), `expected 'mcp-protocol-version' in allow-headers, got: "${allowed}"`);
  });

  it('allows content-type', async () => {
    const allowed = await preflight('content-type');
    assert.ok(allowed.includes('content-type'), `expected 'content-type' in allow-headers, got: "${allowed}"`);
  });

  it('does not expose a session id header - the router is stateless', async () => {
    const port = await getPort();
    const app = express();
    const mcpServer = new McpServer({ name: 'cors-test', version: '1.0.0' });
    app.use('/mcp', createHttpMcpRouter({ mcpServer, logger: silentLogger as never }));

    const server = app.listen(port);
    try {
      const response = await fetch(`http://localhost:${port}/mcp`, {
        method: 'OPTIONS',
        headers: { Origin: 'https://example.com', 'Access-Control-Request-Method': 'POST' },
      });
      assert.strictEqual(response.headers.get('access-control-expose-headers'), null, 'sessionIdGenerator is undefined, so no session id exists to expose');
    } finally {
      server.close();
    }
  });
});
