/**
 * Specs for src/transports/http.ts: createHttpMcpRouter()'s CORS allow-list,
 * DNS-rebinding (Origin/Host) validation, connectHttp()'s bind-host default, and
 * dual-era serving (a 2025 client and a 2026-07-28 client against the same router).
 */

import { connectHttp, createHttpMcpRouter, defaultCacheHints, type Logger, OAuthError, OAuthErrorCode } from '@mcp-z/server';
import { Client as ModernClient, StreamableHTTPClientTransport as ModernStreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { Client as LegacyClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport as LegacyStreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { McpServer } from '@modelcontextprotocol/server';
import assert from 'assert';
import express from 'express';
import * as http from 'http';
import { z } from 'zod';
import { listenLoopback } from '../../lib/listen-loopback.ts';

describe('transports/http', () => {
  const silentLogger: Logger = { info: () => {}, error: () => {}, warn: () => {}, debug: () => {} };

  describe('createHttpMcpRouter()', () => {
    // Mounted without an app-level cors() layer: every mcp-* server stacks a permissive
    // app.use(cors()) ahead of this router, which (preflightContinue: false) answers
    // preflight itself, so these requests exercise the router's own allow-list instead.
    describe('CORS preflight', () => {
      const preflight = async (requestHeaders: string) => {
        const { port, mount, close } = await listenLoopback();
        const app = express();
        const mcpServer = new McpServer({ name: 'cors-test', version: '1.0.0' });
        app.use('/mcp', createHttpMcpRouter({ mcpServer, logger: silentLogger, port }));
        mount(app);

        try {
          const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
            method: 'OPTIONS',
            headers: {
              Origin: `http://localhost:${port}`,
              'Access-Control-Request-Method': 'POST',
              'Access-Control-Request-Headers': requestHeaders,
            },
          });
          return (response.headers.get('access-control-allow-headers') ?? '').toLowerCase();
        } finally {
          await close();
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

      it('allows mcp-method, required on every modern (2026-07-28) request POST', async () => {
        const allowed = await preflight('mcp-method');
        assert.ok(allowed.includes('mcp-method'), `expected 'mcp-method' in allow-headers, got: "${allowed}"`);
      });

      it('allows mcp-name, required on every modern (2026-07-28) request POST', async () => {
        const allowed = await preflight('mcp-name');
        assert.ok(allowed.includes('mcp-name'), `expected 'mcp-name' in allow-headers, got: "${allowed}"`);
      });

      it('does not expose a session id header - the router is stateless', async () => {
        const { port, mount, close } = await listenLoopback();
        const app = express();
        const mcpServer = new McpServer({ name: 'cors-test', version: '1.0.0' });
        app.use('/mcp', createHttpMcpRouter({ mcpServer, logger: silentLogger, port }));
        mount(app);

        try {
          const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
            method: 'OPTIONS',
            headers: { Origin: `http://localhost:${port}`, 'Access-Control-Request-Method': 'POST' },
          });
          assert.strictEqual(response.headers.get('access-control-expose-headers'), null, 'sessionIdGenerator is undefined, so no session id exists to expose');
        } finally {
          await close();
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
        const { port, mount, close } = await listenLoopback();
        const app = express();
        app.use(express.json());
        const mcpServer = new McpServer({ name: 'origin-validation-test', version: '1.0.0' });
        app.use('/mcp', createHttpMcpRouter({ mcpServer, logger: silentLogger, port, ...extra }));
        mount(app);
        return { port, close };
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
            const body = (await response.json()) as { error?: { code?: number; message?: string } };
            assert.ok(body.error?.message?.includes('Invalid Origin'), `expected an Origin error, got: ${JSON.stringify(body)}`);
            assert.strictEqual(body.error?.code, -32000);
          } finally {
            await close();
          }
        });

        it('serves a request with no Origin header at all - most MCP clients never send one', async () => {
          const { port, close } = await startServer();
          try {
            const response = await post(port, undefined);
            assert.strictEqual(response.status, 200);
          } finally {
            await close();
          }
        });

        it('serves a request with a loopback Origin on the bound port', async () => {
          const { port, close } = await startServer();
          try {
            const response = await post(port, `http://127.0.0.1:${port}`);
            assert.strictEqual(response.status, 200);
          } finally {
            await close();
          }
        });

        it('serves a request with a localhost Origin on the bound port', async () => {
          const { port, close } = await startServer();
          try {
            const response = await post(port, `http://localhost:${port}`);
            assert.strictEqual(response.status, 200);
          } finally {
            await close();
          }
        });

        // Regression guard: the SDK's hostname guard is port-agnostic by design, so it
        // alone would admit any port on an allowed hostname. The exact-match gate on top
        // of it must still reject a right-hostname-wrong-port Origin.
        it('rejects a request whose Origin hostname matches but the port does not', async () => {
          const { port, close } = await startServer();
          try {
            const wrongPort = port === 65535 ? port - 1 : port + 1;
            const response = await post(port, `http://localhost:${wrongPort}`);
            assert.strictEqual(response.status, 403);
            const body = (await response.json()) as { error?: { code?: number; message?: string } };
            assert.ok(body.error?.message?.includes('Invalid Origin'), `expected an Origin error, got: ${JSON.stringify(body)}`);
            assert.strictEqual(body.error?.code, -32000);
          } finally {
            await close();
          }
        });

        it('admits exactly a caller-supplied allowedOrigins entry and refuses the same host on a different port', async () => {
          const { port, close } = await startServer({ allowedOrigins: ['https://app.example.com:8443'] });
          try {
            const admitted = await post(port, 'https://app.example.com:8443');
            assert.strictEqual(admitted.status, 200);

            const refused = await post(port, 'https://app.example.com:9999');
            assert.strictEqual(refused.status, 403);
          } finally {
            await close();
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
            assert.ok(parsed.error?.message?.includes('Invalid Host'), `expected a Host error, got: ${body}`);
          } finally {
            await close();
          }
        });

        it('serves a request whose Host matches an explicitly configured allowedHosts entry', async () => {
          const { port, close } = await startServer({ allowedHosts: ['mcp.example.com'] });
          try {
            const { status } = await postWithHost(port, 'mcp.example.com');
            assert.strictEqual(status, 200);
          } finally {
            await close();
          }
        });

        it('still rejects an unlisted Host even when allowedHosts adds another entry', async () => {
          const { port, close } = await startServer({ allowedHosts: ['mcp.example.com'] });
          try {
            const { status } = await postWithHost(port, 'evil.example');
            assert.strictEqual(status, 403);
          } finally {
            await close();
          }
        });

        // Same regression as the Origin case above, for the Host header.
        it('rejects a request whose Host hostname matches but the port does not', async () => {
          const { port, close } = await startServer();
          try {
            const wrongPort = port === 65535 ? port - 1 : port + 1;
            const { status, body } = await postWithHost(port, `localhost:${wrongPort}`);
            assert.strictEqual(status, 403);
            const parsed = JSON.parse(body) as { error?: { message?: string } };
            assert.ok(parsed.error?.message?.includes('Invalid Host'), `expected a Host error, got: ${body}`);
          } finally {
            await close();
          }
        });
      });

      // There are no sessions to terminate, so DELETE stays a 405 - but spec's new
      // error-code policy says implementations SHOULD NOT use -32000..-32019, so this
      // uses -32600 (Invalid Request) rather than the legacy transport's -32000.
      describe('DELETE stub', () => {
        it('answers DELETE with 405 and JSON-RPC code -32600', async () => {
          const { port, close } = await startServer();
          try {
            const response = await fetch(`http://127.0.0.1:${port}/mcp`, { method: 'DELETE' });
            assert.strictEqual(response.status, 405);
            const body = (await response.json()) as { error?: { code?: number } };
            assert.strictEqual(body.error?.code, -32600);
          } finally {
            await close();
          }
        });
      });
    });

    describe('factory-based mcpServer', () => {
      it('accepts a factory and constructs a fresh instance per request', async () => {
        const { port, mount, close } = await listenLoopback();
        const app = express();
        let constructions = 0;
        const buildServer = () => {
          constructions++;
          return new McpServer({ name: 'factory-test', version: '1.0.0' });
        };
        app.use('/mcp', createHttpMcpRouter({ mcpServer: buildServer, logger: silentLogger, port }));
        mount(app);

        try {
          const initializeBody = {
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'factory-test', version: '1.0.0' } },
          };
          for (let i = 0; i < 2; i++) {
            const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
              body: JSON.stringify(initializeBody),
            });
            assert.strictEqual(response.status, 200);
          }
          assert.strictEqual(constructions, 2, 'each stateless request should build its own instance from the factory');
        } finally {
          await close();
        }
      });
    });
  });

  describe('connectHttp()', () => {
    // Spec (Streamable HTTP transport, SHOULD): a locally-run server binds loopback-only,
    // not every interface - 0.0.0.0 is an explicit opt-in for deployments that need it.
    describe('bind host', () => {
      it('binds to 127.0.0.1 by default, not every interface', async () => {
        const port = 0;
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
        const port = 0;
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

  // Proves the point of this migration: the SAME router, from the SAME factory, answers
  // a 2025-era client (initialize handshake) and a 2026-07-28 client (no initialize, a
  // server/discover-negotiated connection) with no divergence in tool definitions or results.
  describe('dual-era serving (createMcpHandler)', () => {
    const buildEchoServer = () => {
      // The hint travels on a symbol-keyed property only the 2026 codec reads, so
      // one configured server proves both halves: fields present for a modern client,
      // absent for a legacy one.
      const mcpServer = new McpServer({ name: 'dual-era-test', version: '1.0.0' }, { cacheHints: defaultCacheHints });
      mcpServer.registerTool(
        'echo',
        {
          title: 'Echo',
          description: 'Echoes back the provided message',
          inputSchema: z.object({ message: z.string() }),
          outputSchema: z.object({ echo: z.string() }),
        },
        async (args: { message: string }) => {
          const output = { echo: `echo: ${args.message}` };
          return { content: [{ type: 'text' as const, text: JSON.stringify(output) }], structuredContent: output };
        }
      );
      return mcpServer;
    };

    const startEchoRouter = async () => {
      const { port, mount, close } = await listenLoopback();
      const app = express();
      app.use('/mcp', createHttpMcpRouter({ mcpServer: buildEchoServer, logger: silentLogger, port }));
      mount(app);
      return { url: `http://127.0.0.1:${port}/mcp`, close };
    };

    // Spec (JSON Schema in tool definitions): a `$ref` MUST be local (`#/...`) - network
    // refs are forbidden, since a client is not expected to dereference an external URL.
    function assertLocalRefs(schema: unknown, path = '$'): void {
      if (Array.isArray(schema)) {
        for (const [i, item] of schema.entries()) assertLocalRefs(item, `${path}[${i}]`);
        return;
      }
      if (schema && typeof schema === 'object') {
        for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
          if (key === '$ref') {
            assert.ok(typeof value === 'string' && value.startsWith('#'), `expected a local $ref at ${path}.$ref, got: ${String(value)}`);
          } else {
            assertLocalRefs(value, `${path}.${key}`);
          }
        }
      }
    }

    it('serves a legacy 2025 client end-to-end (initialize + tools/call) on the same router', async () => {
      const { url, close } = await startEchoRouter();
      let client: LegacyClient | undefined;
      try {
        client = new LegacyClient({ name: 'legacy-test-client', version: '1.0.0' });
        const transport = new LegacyStreamableHTTPClientTransport(new URL(url));
        await client.connect(transport);

        const { tools } = await client.listTools();
        const echoTool = tools.find((t) => t.name === 'echo');
        assert.ok(echoTool, 'legacy client should see the echo tool');
        assertLocalRefs(echoTool?.inputSchema, 'inputSchema');
        assertLocalRefs(echoTool?.outputSchema, 'outputSchema');

        const listed = (await client.listTools()) as Record<string, unknown>;
        assert.strictEqual(listed.ttlMs, undefined, 'a 2025 result must not carry ttlMs');
        assert.strictEqual(listed.cacheScope, undefined, 'a 2025 result must not carry cacheScope');

        const result = await client.callTool({ name: 'echo', arguments: { message: 'legacy' } });
        const structured = result.structuredContent as { echo?: string } | undefined;
        assert.strictEqual(structured?.echo, 'echo: legacy');
      } finally {
        if (client) await client.close();
        await close();
      }
    });

    it('serves a 2026-07-28 client end-to-end without an initialize handshake', async () => {
      const { url, close } = await startEchoRouter();
      let client: ModernClient | undefined;
      try {
        client = new ModernClient({ name: 'modern-test-client', version: '1.0.0' }, { versionNegotiation: { mode: { pin: '2026-07-28' } } });
        const transport = new ModernStreamableHTTPClientTransport(new URL(url));
        await client.connect(transport);

        const { tools } = await client.listTools();
        const echoTool = tools.find((t) => t.name === 'echo');
        assert.ok(echoTool, 'modern client should see the echo tool');
        assertLocalRefs(echoTool?.inputSchema, 'inputSchema');
        assertLocalRefs(echoTool?.outputSchema, 'outputSchema');

        const listed = (await client.listTools()) as Record<string, unknown>;
        assert.strictEqual(listed.cacheScope, 'public', 'tools/list is identical for every caller');
        assert.ok(typeof listed.ttlMs === 'number' && listed.ttlMs > 0, `tools/list should carry a positive TTL, got ${String(listed.ttlMs)}`);

        const result = await client.callTool({ name: 'echo', arguments: { message: 'modern' } });
        const structured = result.structuredContent as { echo?: string } | undefined;
        assert.strictEqual(structured?.echo, 'echo: modern');
      } finally {
        if (client) await client.close();
        await close();
      }
    });

    it('still rejects an evil Origin for a pinned-modern client the same way', async () => {
      const { url, close } = await startEchoRouter();
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Origin: 'https://evil.example' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
        });
        assert.strictEqual(response.status, 403);
      } finally {
        await close();
      }
    });
  });
  describe('bearerAuth', () => {
    const TOKEN = 'valid-token';
    // A verifier is the option's interface parameter: this one knows one token and refuses the rest.
    const verifier = {
      async verifyAccessToken(token: string) {
        if (token === 'outage') throw new Error('verification endpoint unavailable');
        if (token !== TOKEN) throw new OAuthError(OAuthErrorCode.InvalidToken, 'Unknown token');
        return { token, clientId: 'client-1', scopes: ['read'], expiresAt: Math.floor(Date.now() / 1000) + 3600, extra: { account: 'a@example.com' } };
      },
    };

    const buildAuthEchoServer = () => {
      const mcpServer = new McpServer({ name: 'bearer-test', version: '1.0.0' });
      mcpServer.registerTool('whoami', { description: 'Returns the caller auth info', inputSchema: z.object({}) }, async (_args, ctx) => {
        const authInfo = ctx.http?.authInfo;
        return { content: [{ type: 'text' as const, text: JSON.stringify({ clientId: authInfo?.clientId, extra: authInfo?.extra }) }] };
      });
      return mcpServer;
    };

    const start = async () => {
      const { port, mount, close } = await listenLoopback();
      const resourceMetadataUrl = `http://127.0.0.1:${port}/.well-known/oauth-protected-resource/mcp`;
      const app = express();
      app.use('/mcp', createHttpMcpRouter({ mcpServer: buildAuthEchoServer, logger: silentLogger, port, bearerAuth: { verifier, resourceMetadataUrl } }));
      mount(app);
      return { url: `http://127.0.0.1:${port}/mcp`, port, resourceMetadataUrl, close };
    };

    const initialize = (url: string, headers: Record<string, string> = {}) =>
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18', ...headers },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } } }),
      });

    it('answers a request with no Authorization header with 401 and a resource_metadata challenge', async () => {
      const { url, resourceMetadataUrl, close } = await start();
      try {
        const response = await initialize(url);
        assert.strictEqual(response.status, 401);
        const challenge = response.headers.get('www-authenticate') ?? '';
        assert.match(challenge, /^Bearer /);
        assert.ok(challenge.includes(`resource_metadata="${resourceMetadataUrl}"`), challenge);
      } finally {
        await close();
      }
    });

    it('answers an unknown token with 401 invalid_token', async () => {
      const { url, close } = await start();
      try {
        const response = await initialize(url, { Authorization: 'Bearer not-a-real-token' });
        assert.strictEqual(response.status, 401);
        assert.match(response.headers.get('www-authenticate') ?? '', /error="invalid_token"/);
      } finally {
        await close();
      }
    });

    it('answers 500 when the verifier cannot reach its authority', async () => {
      const { url, close } = await start();
      try {
        assert.strictEqual((await initialize(url, { Authorization: 'Bearer outage' })).status, 500);
      } finally {
        await close();
      }
    });

    it('still answers CORS preflight, which carries no Authorization header', async () => {
      const { url, port, close } = await start();
      try {
        const response = await fetch(url, { method: 'OPTIONS', headers: { Origin: `http://localhost:${port}`, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization' } });
        assert.strictEqual(response.status, 204);
      } finally {
        await close();
      }
    });

    it('refuses an evil Origin with 403 before asking for a token', async () => {
      const { url, close } = await start();
      try {
        assert.strictEqual((await initialize(url, { Origin: 'https://evil.example' })).status, 403);
      } finally {
        await close();
      }
    });

    it('serves a legacy 2025 client with a valid token and hands the verified authInfo to the tool', async () => {
      const { url, close } = await start();
      let client: LegacyClient | undefined;
      try {
        client = new LegacyClient({ name: 'legacy-test-client', version: '1.0.0' });
        await client.connect(new LegacyStreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } } }));
        const result = await client.callTool({ name: 'whoami', arguments: {} });
        const text = (result.content as Array<{ text: string }>)[0]?.text ?? '';
        assert.deepStrictEqual(JSON.parse(text), { clientId: 'client-1', extra: { account: 'a@example.com' } });
      } finally {
        if (client) await client.close();
        await close();
      }
    });

    it('serves a 2026-07-28 client with a valid token and hands the verified authInfo to the tool', async () => {
      const { url, close } = await start();
      let client: ModernClient | undefined;
      try {
        client = new ModernClient({ name: 'modern-test-client', version: '1.0.0' }, { versionNegotiation: { mode: { pin: '2026-07-28' } } });
        await client.connect(new ModernStreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } } }));
        const result = await client.callTool({ name: 'whoami', arguments: {} });
        const text = (result.content as Array<{ text: string }>)[0]?.text ?? '';
        assert.deepStrictEqual(JSON.parse(text), { clientId: 'client-1', extra: { account: 'a@example.com' } });
      } finally {
        if (client) await client.close();
        await close();
      }
    });
  });
});
