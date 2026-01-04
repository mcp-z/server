# @mcp-z/server

Docs: https://mcp-z.github.io/server
Shared utilities for building MCP servers with stdio + HTTP transports, middleware composition, and file serving.

## Common uses

- Parse transport config for stdio or HTTP
- Wire MCP servers to stdio or Express HTTP
- Compose auth/logging middleware
- Serve generated files (PDFs, CSVs)
- Build field/pagination/shape schemas

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

## Middleware composition

Use `composeMiddleware` with middleware layers (auth, logging, etc.):

```ts
import { composeMiddleware, createLoggingMiddleware } from '@mcp-z/server';

const logging = createLoggingMiddleware({ logger: console });
const composed = composeMiddleware({ tools, resources, prompts }, [
  { withTool: authMiddleware.withToolAuth, withResource: authMiddleware.withResourceAuth, withPrompt: authMiddleware.withPromptAuth },
  { withTool: logging.withToolLogging, withResource: logging.withResourceLogging, withPrompt: logging.withPromptLogging }
]);
```

## File serving utilities

For servers that generate files (PDFs, CSVs, images):

- `reserveFile()` - Reserve a file path for streaming writes
- `writeFile()` - Write a buffer directly
- `getFileUri()` - `file://` or `http://` URI based on transport
- `createFileServingRouter()` - Express router to serve files

```ts
import { reserveFile, getFileUri, createFileServingRouter } from '@mcp-z/server';

const reservation = await reserveFile('report.csv', { resourceStoreUri: 'file:///tmp/files' });
const uri = getFileUri(reservation.storedName, transport, {
  resourceStoreUri: 'file:///tmp/files',
  baseUrl: 'https://example.com',
  endpoint: '/files'
});

const router = createFileServingRouter({ resourceStoreUri: 'file:///tmp/files' }, { contentType: 'text/csv' });
app.use('/files', router);
```

## Schema helpers

Helpers for consistent tool inputs and output shaping:

- `createFieldsSchema()` / `parseFields()` / `filterFields()`
- `createPaginationSchema()`
- `createShapeSchema()` / `toColumnarFormat()`

## Requirements

- Node.js >= 24
