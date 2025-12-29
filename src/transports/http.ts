import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import cors from 'cors';
import express, { type Request, type Response } from 'express';
import * as http from 'http';
import type { CreateHttpMcpRouterOptions, Logger, SetupHttpTransportResult } from '../types.ts';

/**
 * Create configured Express router for MCP HTTP endpoints
 *
 * Path Convention: Always mount at '/mcp' per MCP server convention
 * Example: app.use('/mcp', router)
 *
 * Returns a router ready to mount on an Express app
 */
export function createHttpMcpRouter({ mcpServer, logger }: CreateHttpMcpRouterOptions): express.Router {
  const router = express.Router();

  // MCP-specific CORS configuration
  router.use(
    cors({
      origin: '*',
      exposedHeaders: ['Mcp-Session-Id'],
      allowedHeaders: ['Content-Type', 'mcp-session-id'],
    })
  );

  router.post('/', async (req: Request, res: Response) => {
    try {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });

      res.on('close', () => {
        transport.close();
      });
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      logger.error('Error handling MCP request:', error instanceof Error ? { message: error.message, stack: error.stack } : { error: String(error) });
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
          },
          id: null,
        });
      }
    }
  });

  // SSE notifications not supported in stateless mode
  router.get('/', async (_req: Request, res: Response) => {
    logger.info('Received GET MCP request');
    res.writeHead(405).end(
      JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Method not allowed.',
        },
        id: null,
      })
    );
  });

  // Session termination not needed in stateless mode
  router.delete('/', async (_req: Request, res: Response) => {
    logger.info('Received DELETE MCP request');
    res.writeHead(405).end(
      JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Method not allowed.',
        },
        id: null,
      })
    );
  });

  return router;
}

/**
 * Sets up HTTP transport for an existing MCP server
 *
 * Low-level function that handles HTTP server creation, router mounting, and port binding.
 * Path is always '/mcp' per MCP convention.
 *
 * @param mcpServer - The MCP server instance to connect transport to
 * @param options - Configuration for HTTP transport
 * @returns HTTP server instance
 *
 * @example
 * ```typescript
 * const mcpServer = new McpServer({ name: 'my-server', version: '1.0.0' });
 * const { close, httpServer } = await connectHttp(mcpServer, {
 *   logger,
 *   app,
 *   port: 3000
 * });
 * ```
 */
export async function connectHttp(mcpServer: McpServer, options: { logger: Logger; app: express.Application; port: number }): Promise<SetupHttpTransportResult> {
  const { logger, app, port } = options;

  // Create and mount MCP router
  const router = createHttpMcpRouter({ mcpServer, logger });
  app.use('/mcp', router); // Path is always '/mcp' per MCP convention

  // Create HTTP server with error handling
  const httpServer = http.createServer(app);

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error(`Port ${port} is already in use. This usually means another process is using this port, ` + `or a previous instance didn't shut down cleanly. Try running: lsof -ti :${port} | xargs kill -9`));
      } else {
        reject(err);
      }
    });

    httpServer.listen(port, () => {
      httpServer.removeAllListeners('error');
      logger.info(`HTTP transport ready on port ${port} at /mcp`);
      resolve();
    });
  });

  const close = async () => {
    logger.info('Shutting down HTTP transport...');
    httpServer.closeAllConnections();
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
  };

  return { close, httpServer };
}
