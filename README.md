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
the same server definitions, on the same HTTP endpoint and the same stdio connection. A legacy
2025 client keeps working unchanged; support for it is not being dropped.

**Serving both revisions requires a factory, not an `McpServer` instance.** The 2026-07-28
revision is stateless — a client speaking it sends no `initialize` handshake — and the SDK caches
the negotiated revision on the `McpServer` instance. Its own documentation puts it plainly: once a
version is negotiated, *"a negotiated session never re-routes a method onto the other era."* So a
single shared instance pins itself to whichever revision reaches it first and answers the other
with `-32601 Method not found`. A factory hands every request (HTTP) or connection (stdio) a
fresh, un-negotiated instance, so each one negotiates for itself:

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

Passing a ready-made `McpServer` instance is still accepted and still compiles — the Quick start
example above is unchanged — but it is correct only for a server that will speak **one** revision.
If both eras must work, pass a factory. A factory serves 2025-era clients exactly as an instance
did, so there is no reason to prefer an instance once you have one.

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
