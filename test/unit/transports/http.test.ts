/**
 * Specs for src/transports/http.ts: createHttpMcpRouter()'s CORS allow-list and
 * DNS-rebinding (Origin/Host) validation, and connectHttp()'s bind-host default.
 */

import { connectHttp, createHttpMcpRouter, type Logger } from '@mcp-z/server';
import { McpServer } from '@modelcontextprotocol/server';
import assert from 'assert';
import express from 'express';
import getPort from 'get-port';
import * as http from 'http';

describe('transports/http', () => {
  const silentLogger: Logger = { info: () => {}, error: () => {}, warn: () => {}, debug: () => {} };

  describe('createHttpMcpRouter()', () => {
    // Mounted without an app-level cors() layer: every mcp-* server stacks a permissive
    // app.use(cors()) ahead of this router, which (preflightContinue: false) answers
    // preflight itself, so these requests exercise the router's own allow-list instead.
    describe('CORS preflight', () => {
      const preflight = async (requestHeaders: string) => {
        const port = await getPort();
        const app = express();
        const mcpServer = new McpServer({ name: 'cors-test', version: '1.0.0' });
        app.use('/mcp', createHttpMcpRouter({ mcpServer, logger: silentLogger, port }));

        const server = app.listen(port);
        try {
          const response = await fetch(`http://localhost:${port}/mcp`, {
            method: 'OPTIONS',
            headers: {
              Origin: `http://localhost:${port}`,
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
        app.use('/mcp', createHttpMcpRouter({ mcpServer, logger: silentLogger, port }));

        const server = app.listen(port);
        try {
          const response = await fetch(`http://localhost:${port}/mcp`, {
            method: 'OPTIONS',
            headers: { Origin: `http://localhost:${port}`, 'Access-Control-Request-Method': 'POST' },
          });
          assert.strictEqual(response.headers.get('access-control-expose-headers'), null, 'sessionIdGenerator is undefined, so no session id exists to expose');
        } finally {
          server.close();
        }
      });
    });

    // Shared by Origin and Host validation below: both hit the same router with the
    // same initialize request, varying only the header under test.
    describe('DNS rebinding protection', () => {
      const initializeBody = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'origin-validation-test', version: '1.0.0' },
        },
      };

      const startServer = async (extra?: { allowedOrigins?: string[]; allowedHosts?: string[] }) => {
        const port = await getPort();
        const app = express();
        app.use(express.json());
        const mcpServer = new McpServer({ name: 'origin-validation-test', version: '1.0.0' });
        app.use('/mcp', createHttpMcpRouter({ mcpServer, logger: silentLogger, port, ...extra }));
        const server = app.listen(port);
        return { port, close: () => server.close() };
      };

      const post = async (port: number, origin: string | undefined) => {
        const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
        if (origin !== undefined) headers.Origin = origin;
        return fetch(`http://127.0.0.1:${port}/mcp`, { method: 'POST', headers, body: JSON.stringify(initializeBody) });
      };

      // fetch() refuses to let script set the forbidden Host header, so the Host-header
      // cases below use Node's raw http client, which allows it - the same thing that
      // lets an attacker or a reverse proxy present an arbitrary Host in the first place.
      const postWithHost = (port: number, host: string): Promise<{ status: number; body: string }> => {
        const body = JSON.stringify(initializeBody);
        return new Promise((resolve, reject) => {
          const req = http.request(
            {
              host: '127.0.0.1',
              port,
              path: '/mcp',
              method: 'POST',
              headers: {
                Host: host,
                'Content-Type': 'application/json',
                Accept: 'application/json, text/event-stream',
                'Content-Length': Buffer.byteLength(body),
              },
            },
            (res) => {
              let data = '';
              res.on('data', (chunk) => {
                data += chunk;
              });
              res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data }));
            }
          );
          req.on('error', reject);
          req.end(body);
        });
      };

      // Spec (Streamable HTTP transport, MUST): validate Origin on every request. A
      // present-but-invalid Origin gets 403; no Origin header (curl, stdio-spawned
      // clients, most non-browser callers) is served, since it never sends one.
      describe('Origin validation', () => {
        it('rejects a request with a present, invalid Origin with 403', async () => {
          const { port, close } = await startServer();
          try {
            const response = await post(port, 'https://evil.example');
            assert.strictEqual(response.status, 403);
            const body = (await response.json()) as { error?: { message?: string } };
            assert.ok(body.error?.message?.includes('Invalid Origin header'), `expected an Origin error, got: ${JSON.stringify(body)}`);
          } finally {
            close();
          }
        });

        it('serves a request with no Origin header at all - most MCP clients never send one', async () => {
          const { port, close } = await startServer();
          try {
            const response = await post(port, undefined);
            assert.strictEqual(response.status, 200);
          } finally {
            close();
          }
        });

        it('serves a request with a loopback Origin on the bound port', async () => {
          const { port, close } = await startServer();
          try {
            const response = await post(port, `http://127.0.0.1:${port}`);
            assert.strictEqual(response.status, 200);
          } finally {
            close();
          }
        });

        it('serves a request with a localhost Origin on the bound port', async () => {
          const { port, close } = await startServer();
          try {
            const response = await post(port, `http://localhost:${port}`);
            assert.strictEqual(response.status, 200);
          } finally {
            close();
          }
        });
      });

      // The SDK's Host check is stricter than the Origin check: absent OR unlisted both
      // get 403, so a public deployment must add its hostname via allowedHosts.
      describe('Host validation', () => {
        it('rejects a request with a Host header outside the loopback default with 403', async () => {
          const { port, close } = await startServer();
          try {
            const { status, body } = await postWithHost(port, 'evil.example');
            assert.strictEqual(status, 403);
            const parsed = JSON.parse(body) as { error?: { message?: string } };
            assert.ok(parsed.error?.message?.includes('Invalid Host header'), `expected a Host error, got: ${body}`);
          } finally {
            close();
          }
        });

        it('serves a request whose Host matches an explicitly configured allowedHosts entry', async () => {
          const { port, close } = await startServer({ allowedHosts: ['mcp.example.com'] });
          try {
            const { status } = await postWithHost(port, 'mcp.example.com');
            assert.strictEqual(status, 200);
          } finally {
            close();
          }
        });

        it('still rejects an unlisted Host even when allowedHosts adds another entry', async () => {
          const { port, close } = await startServer({ allowedHosts: ['mcp.example.com'] });
          try {
            const { status } = await postWithHost(port, 'evil.example');
            assert.strictEqual(status, 403);
          } finally {
            close();
          }
        });
      });
    });
  });

  describe('connectHttp()', () => {
    // Spec (Streamable HTTP transport, SHOULD): a locally-run server binds loopback-only,
    // not every interface - 0.0.0.0 is an explicit opt-in for deployments that need it.
    describe('bind host', () => {
      it('binds to 127.0.0.1 by default, not every interface', async () => {
        const port = await getPort();
        const app = express();
        const mcpServer = new McpServer({ name: 'bind-host-test', version: '1.0.0' });

        const { close, httpServer } = await connectHttp(mcpServer, { logger: silentLogger, app, port });
        try {
          const address = httpServer.address();
          assert.ok(address && typeof address === 'object', 'expected a bound AddressInfo');
          assert.strictEqual((address as { address: string }).address, '127.0.0.1');
        } finally {
          await close();
        }
      });

      it('binds to an explicit host when the operator opts in', async () => {
        const port = await getPort();
        const app = express();
        const mcpServer = new McpServer({ name: 'bind-host-test', version: '1.0.0' });

        const { close, httpServer } = await connectHttp(mcpServer, { logger: silentLogger, app, port, host: '0.0.0.0' });
        try {
          const address = httpServer.address();
          assert.ok(address && typeof address === 'object', 'expected a bound AddressInfo');
          assert.strictEqual((address as { address: string }).address, '0.0.0.0');
        } finally {
          await close();
        }
      });
    });
  });
});
