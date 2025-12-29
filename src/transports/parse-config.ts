import { parseArgs } from 'util';
import type { TransportConfig } from '../types.ts';

/**
 * Parsed transport configuration returned by parseConfig()
 */
export interface ParsedTransportConfig {
  transport: TransportConfig;
  port?: number | undefined; // Extracted for server use
}

/**
 * Parse server transport configuration from CLI arguments and environment variables.
 *
 * Each server runs with exactly one transport (stdio or HTTP, not both).
 * Path is always '/mcp' per MCP convention (hardcoded in router).
 *
 * Supports two primary modes:
 * - Stdio: Default mode for local CLI usage (--stdio flag)
 * - HTTP: Enabled with --port flag or PORT env var for web/API access
 *
 * @param args - CLI arguments array (REQUIRED - no default, typically process.argv)
 * @param env - Environment variables object (REQUIRED - no default, typically process.env)
 * @returns Parsed transport configuration with single transport
 *
 * @example Basic stdio usage
 * const config = parseConfig(process.argv, process.env);
 * // Result: { transport: { type: 'stdio' } }
 *
 * @example HTTP mode with CLI flag
 * const config = parseConfig(['--port=3000'], process.env);
 * // Result: { transport: { type: 'http', port: 3000 }, port: 3000 }
 *
 * @example HTTP mode with env var
 * const config = parseConfig([], { PORT: '3000' });
 * // Result: { transport: { type: 'http', port: 3000 }, port: 3000 }
 */
export function parseConfig(args: string[], env: Record<string, string | undefined>): ParsedTransportConfig {
  const { values } = parseArgs({
    args,
    options: {
      stdio: { type: 'boolean' },
      port: { type: 'string' },
    },
    strict: false, // Allow unknown options (servers may have custom flags like --gmail, --sheets, etc.)
    allowPositionals: true,
  });

  const cliPort = typeof values.port === 'string' ? Number(values.port) : undefined;
  const envPort = env.PORT ? Number(env.PORT) : undefined;
  const port = cliPort ?? envPort; // CLI flag overrides env var

  // Determine transport type: stdio XOR http
  const useStdio = typeof values.stdio === 'boolean' ? values.stdio : undefined;

  // Default to stdio when no port specified, or when --stdio flag provided
  const transport: TransportConfig = useStdio || !port ? { type: 'stdio' } : { type: 'http', port }; // Path '/mcp' hardcoded in router

  return {
    transport,
    port,
  };
}
