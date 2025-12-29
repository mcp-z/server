import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Logger, SetupStdioTransportResult } from '../types.ts';

/**
 * Set up stdio transport for MCP server
 * Connects the server to stdin/stdout for local CLI usage
 * Returns the transport so it can be closed during close
 */
export async function connectStdio(mcpServer: McpServer, options?: { logger?: Logger }): Promise<SetupStdioTransportResult> {
  const logger = options?.logger ?? null;
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);

  const close = async () => {
    logger?.info('Shutting down stdio transport...');
    await transport.close();
  };

  return { close, transport };
}
