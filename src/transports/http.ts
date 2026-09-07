import { hostHeaderValidation, originValidation, toNodeHandler } from '@modelcontextprotocol/node';
import { createMcpHandler, localhostAllowedHostnames, type McpServer, type McpServerFactory } from '@modelcontextprotocol/server';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import * as http from 'http';
import type { CreateHttpMcpRouterOptions, Logger, SetupHttpTransportResult } from '../types.ts';

// Loopback hostnames a locally-run server treats as same-machine callers for DNS
// rebinding protection; anything else is untrusted by default. Matches the SDK's
// own `localhostAllowedHostnames()` / `localhostAllowedOrigins()` set.
const LOOPBACK_HOSTNAMES = ['127.0.0.1', 'localhost', '[::1]'];

/** Origin allow-list for DNS rebinding protection: every loopback hostname on `port`, over http and https. */
export function getLoopbackOrigins(port: number): string[] {
  return LOOPBACK_HOSTNAMES.flatMap((host) => [`http://${host}:${port}`, `https://${host}:${port}`]);
}

/** Host allow-list for DNS rebinding protection: every loopback hostname on `port`. */
export function getLoopbackHosts(port: number): string[] {
  return LOOPBACK_HOSTNAMES.map((host) => `${host}:${port}`);
}

/**
 * Extracts the bare hostname from either a full origin/URL string (`https://example.com:8443`)
 * or a bare host[:port] value (`example.com:8443`, `example.com`), matching the port-agnostic
 * hostname convention `validateHostHeader`/`validateOriginHeader` use for their allow-lists.
 */
function toHostname(value: string): string {
  const withScheme = value.includes('://') ? value : `http://${value}`;
  return new URL(withScheme).hostname;
}

/**
 * Extracts the authority (`host[:port]`) from either a full origin/URL string or a bare
 * host[:port] value, for EXACT allow-list matching (see `exactHeaderMatch` below). Scheme is
 * deliberately not part of the comparison: the DNS-rebinding threat this guards against is
 * defeated by pinning host+port, not scheme, and a bare caller-supplied entry (`app.example.com:8443`)
 * carries no scheme to compare against in the first place - requiring one would make bare
 * entries impossible to match consistently.
 */
function toAuthority(value: string): string {
  const withScheme = value.includes('://') ? value : `http://${value}`;
  return new URL(withScheme).host;
}

/**
 * Exact-match gate layered in front of the SDK's `hostHeaderValidation`/`originValidation`
 * guards, which match by hostname only and are port-agnostic by design (an allowed
 * `localhost:3000` also admits `localhost:9999`). This restores the exact origin/host string
 * allow-listing the pre-rewrite transport enforced: `headerValue` must match one of
 * `allowedValues` by authority (host[:port]) exactly. A missing header always passes (mirrors
 * the SDK guards - non-browser clients send neither). A present-but-unlisted value is rejected
 * with the SDK guards' own 403 JSON-RPC error shape, so a caller cannot tell which guard
 * rejected the request.
 */
function exactHeaderMatch(res: Response, headerValue: string | undefined, allowedValues: string[], label: 'Origin' | 'Host'): boolean {
  if (!headerValue) return true;
  if (allowedValues.some((allowed) => toAuthority(allowed) === toAuthority(headerValue))) return true;
  res.writeHead(403, { 'Content-Type': 'application/json' }).end(
    JSON.stringify({
      jsonrpc: '2.0',
      error: { code: -32000, message: `Invalid ${label}: ${headerValue}` },
      id: null,
    })
  );
  return false;
}

/** Creates the Express router for the MCP HTTP endpoints, mounted by the caller at `/mcp`. */
export function createHttpMcpRouter({ mcpServer, logger, port, allowedOrigins: extraOrigins, allowedHosts: extraHosts }: CreateHttpMcpRouterOptions): express.Router {
  const router = express.Router();
  const factory: McpServerFactory = typeof mcpServer === 'function' ? mcpServer : () => mcpServer;

  // Loopback access is additive: it keeps working even when the deployment also allows its public base URL.
  const allowedOrigins = [...getLoopbackOrigins(port), ...(extraOrigins ?? [])];
  const allowedHosts = [...getLoopbackHosts(port), ...(extraHosts ?? [])];

  // `createMcpHandler` performs no Origin/Host validation of its own (it is transport-agnostic);
  // the SDK's Node guards are port-agnostic hostname allow-lists, unlike the origin/host string
  // lists above used for the CORS reflection allow-list.
  const allowedOriginHostnames = [...localhostAllowedHostnames(), ...(extraOrigins ?? []).map(toHostname)];
  const allowedHostHostnames = [...localhostAllowedHostnames(), ...(extraHosts ?? []).map(toHostname)];

  // An allow-list, not '*': cors only reflects Access-Control-Allow-Origin for a matching
  // Origin, so this only affects what browser JS can read. DNS rebinding protection itself
  // (403 for any present-but-invalid Origin, for every caller) is the guards mounted below.
  router.use(
    cors({
      origin: allowedOrigins,
      // 'authorization' is required for the DCR bearer flow; 'mcp-protocol-version' is
      // required on HTTP requests as of spec 2025-06-18; 'mcp-method'/'mcp-name' are
      // required on every modern (2026-07-28) request POST.
      allowedHeaders: ['content-type', 'authorization', 'mcp-protocol-version', 'mcp-method', 'mcp-name'],
    })
  );

  // Spec (Streamable HTTP transport, MUST): validate Origin on every request to prevent DNS
  // rebinding. Only a present-and-invalid Origin is rejected (403); no Origin header (curl,
  // stdio-spawned clients, most non-browser callers) is served. The Host check is stricter:
  // absent OR unlisted both get 403.
  const validateHost = hostHeaderValidation(allowedHostHostnames);
  const validateOrigin = originValidation(allowedOriginHostnames);
  router.use((req: Request, res: Response, next: NextFunction) => {
    if (!validateHost(req, res)) return;
    if (!validateOrigin(req, res)) return;
    // The guards above match by hostname only and admit any port on an allowed hostname
    // (`localhost:3000` allowed also admits `localhost:9999`); this gate restores the exact
    // origin/host string allow-listing the pre-rewrite transport enforced, against the same
    // exact `allowedOrigins`/`allowedHosts` lists the CORS layer above uses.
    if (!exactHeaderMatch(res, req.headers.host, allowedHosts, 'Host')) return;
    if (!exactHeaderMatch(res, req.headers.origin, allowedOrigins, 'Origin')) return;
    next();
  });

  // Session termination not needed in stateless mode. New-implementation error codes
  // (spec) SHOULD NOT use -32000..-32019, so this uses -32600 (Invalid Request) rather
  // than the legacy transport's -32000.
  router.delete('/', (_req: Request, res: Response) => {
    logger.info('Received DELETE MCP request');
    res.writeHead(405).end(
      JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: -32600,
          message: 'Method not allowed.',
        },
        id: null,
      })
    );
  });

  // `createMcpHandler` serves the 2026-07-28 revision from `factory` and, by default
  // (`legacy` omitted, never 'reject'), falls back to old-school stateless serving for
  // 2025-era traffic from the SAME factory - both eras can never drift apart. GET is
  // answered by the handler itself (2026-07-28's `subscriptions/listen`); there is no
  // GET stub here anymore.
  const handler = createMcpHandler(factory, {
    onerror: (error) => logger.error('Error handling MCP request:', { message: error.message, stack: error.stack }),
  });
  const nodeHandler = toNodeHandler(handler, {
    onerror: (error) => logger.error('Error handling MCP request:', { message: error.message, stack: error.stack }),
  });

  // `req.body` is passed explicitly rather than mounting `nodeHandler` itself as
  // middleware: Express calls a 3-arg middleware as (req, res, next), and toNodeHandler
  // ignores a function third argument - passing `req.body` here is what lets it read the
  // raw request stream itself when nothing upstream parsed it, and use the already-parsed
  // value (never re-reading the drained stream) when something did.
  router.all('/', (req: Request, res: Response) => {
    nodeHandler(req, res, req.body).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Error handling MCP request:', { message, stack: error instanceof Error ? error.stack : undefined });
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    });
  });

  return router;
}

/**
 * Sets up HTTP transport for an MCP server: creates the router, mounts it at `/mcp`,
 * and binds an HTTP server.
 *
 * @param mcpServerOrFactory - Either a ready-made `McpServer` instance or a factory called
 * once per request. A factory is what serves both protocol eras from the same definitions;
 * an instance is served through a factory that always returns it (fine for a stateless server).
 * @param options.host - Interface to bind to (spec SHOULD: loopback-only); pass `'0.0.0.0'` only for a deployment that genuinely needs it, e.g. behind a reverse proxy
 * @param options.allowedOrigins - Extra Origin values to accept, added to the loopback set for `port`
 * @param options.allowedHosts - Extra Host values to accept, added to the loopback set for `port`
 * @returns HTTP server instance
 */
export async function connectHttp(mcpServerOrFactory: McpServer | (() => McpServer), options: { logger: Logger; app: express.Application; port: number; host?: string; allowedOrigins?: string[]; allowedHosts?: string[] }): Promise<SetupHttpTransportResult> {
  const { logger, app, port, host = '127.0.0.1', allowedOrigins, allowedHosts } = options;

  const router = createHttpMcpRouter({ mcpServer: mcpServerOrFactory, logger, port, allowedOrigins, allowedHosts });
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
