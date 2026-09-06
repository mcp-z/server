import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node';
import type { McpServer } from '@modelcontextprotocol/server';
import cors from 'cors';
import express, { type Request, type Response } from 'express';
import * as http from 'http';
import type { CreateHttpMcpRouterOptions, Logger, SetupHttpTransportResult } from '../types.ts';

// Loopback hostnames a locally-run server treats as same-machine callers for DNS
// rebinding protection; anything else is untrusted by default.
const LOOPBACK_HOSTNAMES = ['127.0.0.1', 'localhost', '[::1]'];

/** Origin allow-list for DNS rebinding protection: every loopback hostname on `port`, over http and https. */
export function getLoopbackOrigins(port: number): string[] {
  return LOOPBACK_HOSTNAMES.flatMap((host) => [`http://${host}:${port}`, `https://${host}:${port}`]);
}

/** Host allow-list for DNS rebinding protection: every loopback hostname on `port`. */
export function getLoopbackHosts(port: number): string[] {
  return LOOPBACK_HOSTNAMES.map((host) => `${host}:${port}`);
}

/** Creates the Express router for the MCP HTTP endpoints, mounted by the caller at `/mcp`. */
export function createHttpMcpRouter({ mcpServer, logger, port, allowedOrigins: extraOrigins, allowedHosts: extraHosts }: CreateHttpMcpRouterOptions): express.Router {
  const router = express.Router();
  // Loopback access is additive: it keeps working even when the deployment also allows its public base URL.
  const allowedOrigins = [...getLoopbackOrigins(port), ...(extraOrigins ?? [])];
  const allowedHosts = [...getLoopbackHosts(port), ...(extraHosts ?? [])];

  // An allow-list, not '*': cors only reflects Access-Control-Allow-Origin for a matching
  // Origin, so this only affects what browser JS can read. DNS rebinding protection itself
  // (403 for any present-but-invalid Origin, for every caller) is the transport's job below.
  router.use(
    cors({
      origin: allowedOrigins,
      // 'authorization' is required for the DCR bearer flow; 'mcp-protocol-version' is
      // required on HTTP requests as of spec 2025-06-18.
      allowedHeaders: ['content-type', 'authorization', 'mcp-protocol-version'],
    })
  );

  router.post('/', async (req: Request, res: Response) => {
    try {
      const transport = new NodeStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        // Spec (Streamable HTTP transport, MUST): validate Origin on every request to
        // prevent DNS rebinding. Only a present-and-invalid Origin is rejected (403).
        enableDnsRebindingProtection: true,
        allowedOrigins,
        allowedHosts,
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
 * Sets up HTTP transport for an MCP server: creates the router, mounts it at `/mcp`,
 * and binds an HTTP server.
 *
 * @param mcpServer - The MCP server instance to connect transport to
 * @param options.host - Interface to bind to (spec SHOULD: loopback-only); pass `'0.0.0.0'` only for a deployment that genuinely needs it, e.g. behind a reverse proxy
 * @param options.allowedOrigins - Extra Origin values to accept, added to the loopback set for `port`
 * @param options.allowedHosts - Extra Host values to accept, added to the loopback set for `port`
 * @returns HTTP server instance
 */
export async function connectHttp(mcpServer: McpServer, options: { logger: Logger; app: express.Application; port: number; host?: string; allowedOrigins?: string[]; allowedHosts?: string[] }): Promise<SetupHttpTransportResult> {
  const { logger, app, port, host = '127.0.0.1', allowedOrigins, allowedHosts } = options;

  const router = createHttpMcpRouter({ mcpServer, logger, port, allowedOrigins, allowedHosts });
  app.use('/mcp', router);

  const httpServer = http.createServer(app);

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error(`Port ${port} is already in use. This usually means another process is using this port, ` + `or a previous instance didn't shut down cleanly. Try running: lsof -ti :${port} | xargs kill -9`));
      } else {
        reject(err);
      }
    });

    httpServer.listen(port, host, () => {
      httpServer.removeAllListeners('error');
      logger.info(`HTTP transport ready on ${host}:${port} at /mcp`);
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
