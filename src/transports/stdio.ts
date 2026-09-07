import type { McpServer, McpServerFactory } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import type { Logger, SetupStdioTransportResult } from '../types.ts';

/**
 * Set up stdio transport for MCP server: connects the server to stdin/stdout for local
 * CLI usage. `serveStdio` owns the era decision for the connection - the opening exchange
 * (an `initialize` request pins 2025-era, a `server/discover` probe pins 2026-07-28) selects
 * which instance from `factory` serves the connection's lifetime. Never pass `legacy: 'reject'`
 * here: dropping 2025-era stdio clients (Claude Desktop, Claude Code) is not this package's call.
 *
 * @param mcpServerOrFactory - Either a ready-made `McpServer` instance or a factory called
 * once per connection. A factory is what serves both protocol eras from the same definitions;
 * an instance is served through a factory that always returns it.
 */
export async function connectStdio(mcpServerOrFactory: McpServer | (() => McpServer), options?: { logger?: Logger }): Promise<SetupStdioTransportResult> {
  const logger = options?.logger ?? null;
  const factory: McpServerFactory = typeof mcpServerOrFactory === 'function' ? mcpServerOrFactory : () => mcpServerOrFactory;

  const handle = serveStdio(factory, {
    onerror: (error) => logger?.error('Error handling MCP stdio connection:', { message: error.message, stack: error.stack }),
  });

  const close = async () => {
    logger?.info('Shutting down stdio transport...');
    await handle.close();
  };

  return { close };
}
