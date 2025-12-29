# @mcp-z/server

Docs: https://mcp-z.github.io/server
Shared utilities for building MCP servers (stdio + HTTP) with consistent config parsing.

## Common uses

- Parse CLI/env config for stdio or HTTP
- Wire MCP servers to stdio or Express HTTP
- Standardize tool/resource/prompt registration

## Install

```bash
npm install @mcp-z/server
```

Peer dependencies:

```bash
npm install @modelcontextprotocol/sdk express
```

## Quick start

```ts
import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { parseConfig, connectStdio, connectHttp } from '@mcp-z/server';

const mcpServer = new McpServer({ name: 'my-server', version: '1.0.0' });
const config = parseConfig(process.argv.slice(2), process.env);

if (config.transport.type === 'stdio') {
  await connectStdio(mcpServer, { logger: console });
} else {
  const app = express();
  await connectHttp(mcpServer, { logger: console, app, port: config.transport.port });
}
```

## Registration helpers

- `registerTools(server, tools)`
- `registerResources(server, resources)`
- `registerPrompts(server, prompts)`

## OAuth helpers

Use `createOAuthAdapters` to wire loopback OAuth for Google or Microsoft.

```ts
import { createOAuthAdapters, parseConfig } from '@mcp-z/server';
import Keyv from 'keyv';
import { KeyvFile } from 'keyv-file';

const config = parseConfig(process.argv.slice(2), process.env);
const tokenStore = new Keyv({ store: new KeyvFile({ filename: '.tokens/google.json' }) });

const { loopback } = await createOAuthAdapters(config.transport, {
  provider: 'google',
  service: 'gmail',
  clientId: process.env.GOOGLE_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  scope: 'https://www.googleapis.com/auth/gmail.modify',
  headless: config.headless,
  tokenStore,
  logger: console
});

const middleware = loopback.authMiddleware();
```

## Requirements

- Node.js >= 24
