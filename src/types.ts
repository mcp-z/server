import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type * as http from 'http';

export type Logger = Pick<Console, 'info' | 'error' | 'warn' | 'debug'>;

export type ResourceConfig = Parameters<McpServer['registerResource']>[2];

/** Transport configuration type - supports stdio or HTTP transport */
export type TransportConfig = {
  type: 'stdio' | 'http';
  port?: number;
  // path is always '/mcp' per MCP convention (hardcoded in routers)
};

/** Base server configuration interface */
export interface BaseServerConfig {
  /**
   * Transport configuration - single transport per server
   * Each server runs with exactly one transport (stdio or HTTP, not both)
   * Path is always '/mcp' per MCP convention
   */
  transport: TransportConfig;

  // Optional configuration
  logLevel?: string;
}

export type ErrorCode = 'INVALID_ARGUMENT' | 'NOT_FOUND' | 'PERMISSION' | 'AUTH' | 'INTERNAL';

/**
 * Error branch type for discriminated union results
 */
export interface ErrorBranch {
  type: 'error';
  error: string;
  code?: ErrorCode;
  help?: string;
  debug?: Record<string, unknown>;
}

/** Create actionable error branches with guidance */
export function createActionableError(error: string, code: ErrorCode, help?: string): ErrorBranch {
  const result: ErrorBranch = {
    type: 'error',
    error,
  };
  if (code !== undefined) result.code = code;
  if (help !== undefined) result.help = help;
  return result;
}

export type ServerFactory = (transport?: TransportConfig) => McpServer;

export interface SetupHttpTransportResult {
  httpServer: http.Server;
  close: () => Promise<void>;
}

export interface SetupStdioTransportResult {
  transport: StdioServerTransport;
  close: () => Promise<void>;
}

export interface CreateHttpMcpRouterOptions {
  mcpServer: McpServer;
  logger: Logger;
}
