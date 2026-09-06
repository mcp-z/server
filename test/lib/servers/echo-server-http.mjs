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
 * USAGE: node test/lib/servers/echo-server-http.mjs
 */

import { connectHttp, parseConfig, registerPrompts, registerResources, registerTools } from '@mcp-z/server';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/server';
import express from 'express';
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

  // create and configure MCP server instances
  const mcpServer = new McpServer({ name: 'echo-server-stdio', version: '1.0.0' });
  registerTools(mcpServer, tools);
  registerResources(mcpServer, resources);
  registerPrompts(mcpServer, prompts);

  // Parse transport config from CLI args
  const config = parseConfig(process.argv.slice(2), process.env);
  const port = config.transport.port;

  // Create Express app
  const app = express();

  // Setup HTTP server using high-level API
  logger.info('Starting MCP server (http)');
  const { close } = await connectHttp(mcpServer, { logger, app, port });
  logger.info('http transport ready');

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
