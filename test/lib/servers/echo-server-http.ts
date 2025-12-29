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
 * USAGE: node test/lib/servers/echo-server-stdio.ts
 */

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import express from 'express';
import { z } from 'zod';
import type { Logger, PromptModule, ResourceModule, ToolModule } from '../../../src/index.ts';
import { connectHttp, parseConfig, registerPrompts, registerResources, registerTools } from '../../../src/index.ts';

const logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
} as Logger;

async function main() {
  // Schema for wrapped-result tool (mirrors mcp-sheets pattern)
  const successBranchSchema = z.object({
    type: z.literal('success'),
    message: z.string(),
    timestamp: z.string(),
  });

  const wrappedOutputSchema = z.discriminatedUnion('type', [successBranchSchema]);

  // Define tools with explicit ToolModule type
  const tools: ToolModule[] = [
    {
      name: 'echo',
      config: {
        title: 'Echo Tool',
        description: 'Echoes back the provided message',
        inputSchema: { message: z.string() },
        outputSchema: { echo: z.string() },
      },
      handler: async (args: { message: string }, _extra: Record<string, unknown>): Promise<CallToolResult> => {
        const { message } = args;
        const output = { echo: `Tool echo: ${message}` };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(output) }],
          structuredContent: output,
        };
      },
    } satisfies ToolModule,
    // Tool that mimics mcp-sheets pattern with z.object({ result: ... }) wrapper
    {
      name: 'wrapped-result',
      config: {
        title: 'Wrapped Result Tool',
        description: 'Returns structuredContent wrapped in result property (mcp-sheets pattern)',
        inputSchema: { message: z.string() },
        // This is the pattern used by mcp-sheets tools: z.object({ result: ... })
        outputSchema: z.object({
          result: wrappedOutputSchema,
        }),
      },
      handler: async (args: { message: string }, _extra: Record<string, unknown>): Promise<CallToolResult> => {
        const { message } = args;
        const result = {
          type: 'success' as const,
          message: `Wrapped echo: ${message}`,
          timestamp: new Date().toISOString(),
        };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result) }],
          structuredContent: { result },
        };
      },
    } satisfies ToolModule,
  ];

  const resources: ResourceModule[] = [
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
      handler: async (uri: URL, vars: Record<string, string | string[]>) => {
        const { message } = vars as { message: string };
        return {
          contents: [
            {
              type: 'text' as const,
              uri: uri.href,
              text: `Resource echo: ${message}`,
            },
          ],
        };
      },
    },
  ];

  // Define prompts using factory functions
  function createEchoPrompt(): PromptModule {
    const handler = async (args: { message: string }) => {
      const { message } = args;
      return {
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
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
        argsSchema: { message: z.string() } as const,
      },
      handler,
    } satisfies PromptModule;
  }

  const prompts: PromptModule[] = [createEchoPrompt()];

  // create and configure MCP server instances
  const mcpServer = new McpServer({ name: 'echo-server-stdio', version: '1.0.0' });
  registerTools(mcpServer, tools);
  registerResources(mcpServer, resources);
  registerPrompts(mcpServer, prompts);

  // Parse transport config from CLI args
  const config = parseConfig(process.argv.slice(2), process.env);
  const port = config.transport.port as number;

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
