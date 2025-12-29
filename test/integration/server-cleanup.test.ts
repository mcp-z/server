/**
 * Integration tests for server close
 *
 * Validates that servers shut down cleanly:
 * - HTTP server close closes all active connections immediately
 * - stdio server close completes successfully
 * - Cleanup is deterministic - no timing dependencies
 *
 * CONTEXT:
 * Without `httpServer.closeAllConnections()`, `httpServer.close()` waits for keep-alive
 * connections to close naturally, causing non-deterministic close timing.
 *
 * TESTING APPROACH:
 * - Create servers with active connections
 * - Call close() and verify it completes
 * - Verify server is no longer listening
 * - No magic numbers, no timing assumptions, no arbitrary delays
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import assert from 'assert';
import express from 'express';
import getPort from 'get-port';
import * as http from 'http';
import { connectHttp, connectStdio, type Logger } from '../../src/index.ts';

const logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
} as Logger;

describe('Server close', () => {
  describe('HTTP server close', () => {
    it('should close HTTP server with active keep-alive connection', async () => {
      const port = await getPort();

      const app = express();
      app.get('/test', (_req, res) => {
        res.send('OK');
      });

      const mcpServer = new McpServer({
        name: 'close-test',
        version: '1.0.0',
      });

      logger.info('Starting MCP server (http)');
      const { close, httpServer } = await connectHttp(mcpServer, { logger, app, port });
      logger.info('http transport ready');

      const agent = new http.Agent({ keepAlive: true });

      try {
        // Make request with keep-alive agent
        await new Promise<void>((resolve, reject) => {
          const req = http.get(`http://localhost:${port}/test`, { agent }, (res) => {
            res.on('data', () => {});
            res.on('end', () => resolve());
          });
          req.on('error', reject);
        });

        // Verify server is listening
        assert.ok(httpServer.listening, 'Server should be listening before close');

        // Cleanup with agent connection still open
        await close();

        // Verify server is no longer listening
        assert.strictEqual(httpServer.listening, false, 'Server should not be listening after close');
      } finally {
        agent.destroy();
        if (httpServer.listening) {
          await close();
        }
      }
    });

    it('should close HTTP server with MCP client connection', async () => {
      const port = await getPort();
      const url = `http://localhost:${port}/mcp`;

      const app = express();
      const mcpServer = new McpServer({
        name: 'close-test-mcp',
        version: '1.0.0',
      });

      logger.info('Starting MCP server (http)');
      const { close, httpServer } = await connectHttp(mcpServer, { logger, app, port });
      logger.info('http transport ready');

      let client: Client | undefined;

      try {
        client = new Client({
          name: 'test-client',
          version: '1.0.0',
        });

        const transport = new StreamableHTTPClientTransport(new URL(url));
        await client.connect(transport as never);

        // Verify server is listening
        assert.ok(httpServer?.listening, 'Server should be listening before close');

        // Cleanup server - this will force-close all connections
        await close();

        // Verify server stopped
        assert.strictEqual(httpServer?.listening, false, 'Server should not be listening after close');
      } finally {
        // Cleanup client
        if (client) {
          try {
            await client.close();
          } catch {
            /* client already closed */
          }
        }
        // Ensure server is cleaned up
        if (httpServer?.listening) {
          await close();
        }
      }
    });

    it('should close HTTP server with multiple connections', async () => {
      const port = await getPort();
      const url = `http://localhost:${port}/mcp`;

      const app = express();
      const mcpServer = new McpServer({
        name: 'close-test-multi',
        version: '1.0.0',
      });

      logger.info('Starting MCP server (http)');
      const { close, httpServer } = await connectHttp(mcpServer, { logger, app, port });
      logger.info('http transport ready');

      const clients: Client[] = [];

      try {
        // Create multiple MCP clients
        for (let i = 0; i < 3; i++) {
          const client = new Client({
            name: `test-client-${i}`,
            version: '1.0.0',
          });

          const transport = new StreamableHTTPClientTransport(new URL(url));
          await client.connect(transport as never);
          clients.push(client);
        }

        assert.ok(httpServer?.listening, 'Server should be listening before close');

        // Cleanup server - this will force-close all connections
        await close();

        assert.strictEqual(httpServer?.listening, false, 'Server should not be listening after close');
      } finally {
        // Cleanup all clients
        for (const client of clients) {
          try {
            await client.close();
          } catch {
            /* client already closed */
          }
        }
        // Ensure server is cleaned up
        if (httpServer?.listening) {
          await close();
        }
      }
    });
  });

  describe('stdio server close', () => {
    it('should close stdio server', async () => {
      const mcpServer = new McpServer({
        name: 'close-test',
        version: '1.0.0',
      });

      logger.info('Starting MCP server (stdio)');
      const { close } = await connectStdio(mcpServer, { logger });
      logger.info('stdio transport ready');

      // stdio close has no external resources to verify
      // Just ensure close completes without error
      await close();
    });
  });
});
