# @mcp-z/server

Shared utilities and server orchestration for building MCP (Model Context Protocol) servers

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
npm install @modelcontextprotocol/server @modelcontextprotocol/node express
```

## Quick start

```ts
import express from 'express';
import { McpServer } from '@modelcontextprotocol/server';
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

## Protocol versions

`connectHttp` and `connectStdio` serve both the 2025 and 2026-07-28 MCP protocol revisions from
the same server definitions, on the same HTTP endpoint and the same stdio connection — no
configuration selects a revision. A legacy 2025 client keeps working unchanged; support for it is
not being dropped.

The 2026-07-28 revision is stateless: a client speaking it sends no `initialize` handshake, so the
server needs a fresh `McpServer` per request (HTTP) or per connection (stdio) rather than one
shared instance. To support this, `connectHttp`, `connectStdio`, and `createHttpMcpRouter` accept
either a ready-made `McpServer` instance — as in the Quick start example above, which keeps working
unchanged — or a factory function that builds one:

```ts
const buildServer = () => {
  const mcpServer = new McpServer({ name: 'my-server', version: '1.0.0' });
  // register tools/resources/prompts on mcpServer
  return mcpServer;
};

await connectStdio(buildServer, { logger: console });
// or
await connectHttp(buildServer, { logger: console, app, port: config.transport.port });
```

Passing an instance is still correct for a server with no per-request state; passing a factory is
what the 2026-07-28 revision needs, and it also serves 2025-era requests without change.

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

### Documentation

[API Docs](https://mcp-z.github.io/server)
