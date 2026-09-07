#!/usr/bin/env node

/**
 * Echo server using stdio transport with per-transport setup pattern
 *
 * PURPOSE: Tests stdio transport with explicit setup
 * FEATURES:
 * - Per-transport setup pattern
 * - Echo tool with JSON-structured responses
 * - Echo resource for URI-based access
 * - Echo prompt for message processing
 * - Process-based communication (stdin/stdout)
 * - Graceful shutdown on SIGINT/SIGTERM
 *
 * USAGE: node test/lib/servers/echo-server-stdio.mjs
 */

import { connectStdio, defaultCacheHints, registerPrompts, registerResources, registerTools } from '@mcp-z/server';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/server';
import { z } from 'zod';

const logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

async function main() {
  // Schema for wrapped-result tool (mirrors mcp-sheets pattern)
  const successBranchSchema = z.object({
    type: z.literal('success'),
    message: z.string(),
    timestamp: z.string(),
  });

  const wrappedOutputSchema = z.discriminatedUnion('type', [successBranchSchema]);

  const tools = [
    {
      name: 'echo',
      config: {
        title: 'Echo Tool',
        description: 'Echoes back the provided message',
        inputSchema: z.object({ message: z.string() }),
        outputSchema: z.object({ echo: z.string() }),
      },
      handler: async (args) => {
        const { message } = args;
        const output = { echo: `Tool echo: ${message}` };
        return {
          content: [{ type: 'text', text: JSON.stringify(output) }],
          structuredContent: output,
        };
      },
    },
    // Tool that mimics mcp-sheets pattern with z.object({ result: ... }) wrapper
    {
      name: 'wrapped-result',
      config: {
        title: 'Wrapped Result Tool',
        description: 'Returns structuredContent wrapped in result property (mcp-sheets pattern)',
        inputSchema: z.object({ message: z.string() }),
        // This is the pattern used by mcp-sheets tools: z.object({ result: ... })
        outputSchema: z.object({
          result: wrappedOutputSchema,
        }),
      },
      handler: async (args) => {
        const { message } = args;
        const result = {
          type: 'success',
          message: `Wrapped echo: ${message}`,
          timestamp: new Date().toISOString(),
        };
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          structuredContent: { result },
        };
      },
    },
  ];

  const resources = [
    {
      name: 'echo',
      template: new ResourceTemplate('echo://{message}', {
        list: async () => ({
          resources: [
            {
              uri: 'echo://{message}',
              name: 'echo',
              description: 'Echoes back messages as resources',
              mimeType: 'text/plain',
            },
          ],
        }),
      }),
      config: {
        title: 'Echo Resource',
        description: 'Echoes back messages as resources',
      },
      handler: async (uri, vars) => {
        const { message } = vars;
        return {
          contents: [
            {
              type: 'text',
              uri: uri.href,
              text: `Resource echo: ${message}`,
            },
          ],
        };
      },
    },
  ];

  // Define prompts using factory functions
  function createEchoPrompt() {
    const handler = async (args) => {
      const { message } = args;
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Please process this message: ${message}`,
            },
          },
        ],
      };
    };

    return {
      name: 'echo',
      config: {
        title: 'Echo Prompt',
        description: 'Creates a prompt to process a message',
        argsSchema: { message: z.string() },
      },
      handler,
    };
  }

  const prompts = [createEchoPrompt()];

  // Factory called by serveStdio to build the instance pinned for the connection's
  // lifetime: the same tool/resource/prompt definitions serve both the 2026-07-28
  // era (server/discover-negotiated) and the 2025-era initialize handshake.
  const buildServer = () => {
    // The hint travels on a symbol-keyed property only the 2026 codec reads, so
    // one configured server proves both halves: test/unit/transports/stdio.test.ts
    // asserts the fields are present for a modern client and absent for a legacy one.
    const mcpServer = new McpServer({ name: 'echo-server-stdio', version: '1.0.0' }, { cacheHints: defaultCacheHints });
    registerTools(mcpServer, tools);
    registerResources(mcpServer, resources);
    registerPrompts(mcpServer, prompts);
    return mcpServer;
  };

  // Setup stdio server using high-level API
  logger.info('Starting MCP server (stdio)');
  const { close } = await connectStdio(buildServer, { logger });
  logger.info('stdio transport ready');

  // Graceful shutdown
  process.on('SIGINT', async () => {
    await close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await close();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
