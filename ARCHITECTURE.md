# @mcp-z/server Architecture

> **Last Updated**: November 2025

## Overview

`@mcp-z/server` is a **library of building blocks** for constructing MCP (Model Context Protocol) servers. It provides transport abstraction, configuration parsing, OAuth adapter factories, error handling, response builders, and registration interfaces - but deliberately avoids being a framework.

**Design Philosophy**: Provide reusable utilities that servers compose freely, not an opinionated framework that dictates structure.

## Core Principles

### Building Blocks, Not Framework

**Decision**: Library provides focused utilities rather than an orchestration framework.

**Rationale**:
- Servers have diverse requirements - no one-size-fits-all approach
- Simple utilities are easier to understand and compose
- Libraries age better than frameworks (fewer breaking changes)
- Developers maintain full control over server architecture

**What this means**:
- No base classes or inheritance hierarchies
- No dependency injection containers
- No plugin systems or middleware chains
- Each utility solves one problem well

### Explicit Over Implicit

**Configuration Pattern**: Entry points pass explicit parameters, libraries never access globals.

```typescript
// CORRECT: Explicit parameters
const config = parseConfig(
  process.argv.slice(2),  // Explicit args
  process.env            // Explicit env
);

// WRONG: Implicit global access
const config = parseConfig();  // Accesses process internals
```

**Rationale**:
- Testability - easy to provide test configurations
- Clarity - dependencies are visible in function signatures
- Flexibility - callers control what's passed
- No hidden coupling to Node.js globals

### Fail Fast with Clear Errors

**Validation Strategy**: Validate at boundaries, throw immediately on invalid input.

```typescript
// Port validation example
if (!config.transport.port) {
  throw new Error('Port is required for HTTP transport');
}

const { httpServer } = await setupHttpServer({
  port: config.transport.port,  // TypeScript knows this is number
});
```

**Benefits**:
- Configuration errors caught at startup, not during requests
- Clear error messages point to exact problem
- No silent fallbacks that hide issues
- TypeScript type narrowing after validation

## Transport Abstraction Layer

### Configuration Parsing

**Purpose**: Convert CLI arguments and environment variables into typed configuration.

```typescript
interface ParsedTransportConfig {
  transport: TransportConfig;     // Stdio OR HTTP, never both
  headless: boolean;              // OAuth mode (browser vs URLs)
  logLevel?: string;              // Optional logging level
  redirectUri?: string;           // OAuth redirect URI
  redirectUrl?: ParsedRedirectUrl;// Parsed URL components
  port?: number;                  // Extracted for server use
}

type TransportConfig =
  | { type: 'stdio' }
  | { type: 'http'; port: number };
```

**Design Decision**: Single transport configuration, not array of transports.

**Rationale**:
- Simplifies deployment (one process = one transport)
- Eliminates multi-transport coordination complexity
- Clearer resource ownership (stdio vs HTTP have different scaling)
- Easier testing (no multi-transport edge cases)

**parseConfig() Implementation Strategy**:
1. Read CLI args (using minimist or similar)
2. Read environment variables
3. CLI args take precedence over env vars
4. Validate and construct typed config
5. Throw on invalid configuration

### Transport Setup Functions

**setupStdioServer()**: Stdio transport orchestration

```typescript
interface SetupStdioServerOptions {
  serverFactory: () => McpServer;  // Factory for server instance
  logger: Logger;                 // Optional logging
}
```

**Implementation**:
1. Create MCP server instance via factory
2. Create stdio transport from MCP SDK
3. Connect server to transport
4. Start listening (runs indefinitely)

**setupHttpServer()**: HTTP transport orchestration

```typescript
interface SetupHttpServerOptions {
  serverFactory: () => McpServer;  // Factory for server instance
  logger: Logger;                 // Optional logging
  app: Express;                    // Express app (required)
  port: number;                    // Port to listen on
}
```

**Implementation**:
1. Create MCP server instance via factory
2. Create HTTP SSE transport router
3. Mount router on Express app at `/mcp` path
4. Start HTTP server on specified port
5. Return server handle for cleanup

**Why factories?** Server creation may depend on transport-specific setup (OAuth adapters, context initialization). Factories decouple transport setup from server construction.

### Lower-Level Transport Utilities

For advanced use cases, the library exposes lower-level primitives:

```typescript
// Direct transport creation
setupStdioTransport(mcpServer);

// HTTP router without server orchestration
const router = createHttpMcpRouter({ mcpServer, logger });
app.use('/mcp', router);
```

**Use cases**:
- Custom transport paths (`/api/mcp` instead of `/mcp`)
- Shared Express app with other routes
- Custom server lifecycle management
- Testing with specific transport configurations

## OAuth Adapter Factory

### Purpose

Create OAuth adapters based on transport configuration, enabling servers to support loopback OAuth for interactive authentication flows.

### Adapter Selection Strategy

```typescript
interface OAuthAdapters {
  loopback: AuthAdapter;   // Always created for interactive OAuth flows
}
```

**Loopback Adapter**:
- Interactive OAuth with ephemeral local server
- RFC 8252 loopback pattern
- Used by: stdio transport, HTTP transport, account management
- No redirect URI configuration needed (dynamic ports)

### createOAuthAdapters() Design

**Why async?** Uses dynamic imports for tree-shaking - Google and Microsoft OAuth libraries are large, only import what's needed.

**Parameters**:
```typescript
interface OAuthFactoryConfig {
  provider: 'google' | 'microsoft';
  service: string;                     // gmail, drive, outlook, etc.
  clientId: string;                    // OAuth client ID
  clientSecret?: string;               // Optional (public clients)
  scope: string;                       // Space-separated scopes
  headless: boolean;                   // Browser vs URL-based OAuth
  tokenStore: Keyv<CachedToken>;      // Swappable storage
  logger: Logger;                      // Logging
  tenant?: string;                     // Microsoft only
}
```

**Implementation Pattern**:
1. Validate configuration (throw on missing required fields)
2. Dynamically import provider-specific OAuth library
3. Create loopback adapter for interactive OAuth flows
4. Return adapter

**Auth Configuration**:
```typescript
// Application decides auth, not library
interface ServerConfig {
  transport: TransportConfig;
  auth?: 'loopback-oauth';  // App-level config
}
```

The library creates OAuth adapters for interactive authentication flows. Applications must explicitly configure auth - the library provides no defaults.

## Error Handling Patterns

### handleToolError()

**Purpose**: Convert any error into MCP-compliant error response.

**Design**:
```typescript
function handleToolError(
  error: unknown,
  logger: Logger
): CallToolResult
```

**Implementation Strategy**:
1. Log error details if logger provided
2. Extract error message (handle `unknown` type safely)
3. Map error to MCP error code (if custom code property exists)
4. Return MCP-compliant error response with `content` field

**Why needed?** MCP protocol requires specific response format. Centralizing error handling ensures consistency across 40+ tools.

### toErrorBranch()

**Purpose**: Convert errors to error branch objects for structured responses.

**Design**:
```typescript
function toErrorBranch(
  error: unknown,
  customHandler?: (error: Error) => ErrorBranch
): ErrorBranch
```

**Use case**: When building structured responses with discriminated unions, need error branches that match schema.

**Pattern**:
```typescript
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

try {
  const data = await fetchData();
  return {
    content: [{ type: 'text', text: JSON.stringify(data) }],
    structuredContent: data,
  };
} catch (error) {
  if (error instanceof McpError) {
    throw error;
  }
  const message = error instanceof Error ? error.message : String(error);
  throw new McpError(ErrorCode.InternalError, `Error: ${message}`);
}
```

### createHttpError()

**Purpose**: Create HTTP errors with appropriate MCP error codes.

**Error Code Mapping**:
```typescript
400 → 'INVALID_REQUEST'
401 → 'AUTHENTICATION_REQUIRED'
403 → 'FORBIDDEN'
404 → 'NOT_FOUND'
429 → 'RATE_LIMITED'
500+ → 'SERVICE_ERROR'
```

**Design Decision**: Standardized error codes across all MCP servers.

**Rationale**: Clients can handle errors consistently regardless of which server they're calling.

## Response Pattern

### Current Standard

**Pattern**: Use inline structuredContent with McpError for errors.

**Why both fields?**
- `content` - Required by MCP protocol specification
- `structuredContent` - Enables structured tool output (type safety, discriminated unions)

**Implementation**:
```typescript
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

async function handler(params: Input): Promise<CallToolResult> {
  try {
    const result = await apiCall();

    // Return with both fields inline
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
      structuredContent: result,
    };
  } catch (error) {
    // Re-throw McpError as-is
    if (error instanceof McpError) {
      throw error;
    }

    // Wrap other errors in McpError
    const message = error instanceof Error ? error.message : String(error);
    throw new McpError(ErrorCode.InternalError, `Error: ${message}`, {
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
}
```

**Type Safety**:
```typescript
const config = {
  outputSchema: z.object({
    type: z.literal('success'),
    data: z.string(),
  }),
};

type Out = z.infer<typeof config.outputSchema>;

// TypeScript enforces result matches schema
const result: Out = { type: 'success', data: 'Hello' };
return {
  content: [{ type: 'text', text: JSON.stringify(result) }],
  structuredContent: result,
};
```

**Rationale**:
- **MCP compliant**: Uses official SDK error types
- **Simple**: No helper dependencies
- **Explicit**: Clear, self-contained error handling
- **Type safe**: TypeScript enforces schema compliance

### buildAuthResponse()

**Purpose**: Build standardized authentication required responses.

**Design**:
```typescript
function buildAuthResponse(
  message: string,
  authUrl: string
): CallToolResult
```

**Use case**: OAuth flows where user needs to authenticate before proceeding.

**Response Structure**:
```typescript
{
  content: [{ type: 'text', text: message }],
  structuredContent: {
    type: 'auth_required',
    authUrl,
    message
  }
}
```

## Output Property Naming Standards

### Standardized Vocabulary

All MCP tool output schemas MUST use consistent property names for similar data types. This reduces cognitive overhead for consumers and ensures predictable access patterns.

### Domain Object Properties

**`items`** - Array of domain objects

Use `items` for arrays of domain entities regardless of type (messages, files, folders, path segments, etc.).

```typescript
// CORRECT: Consistent property name
const successBranchSchema = z.object({
  type: z.literal('success'),
  items: z.array(MessageSchema),
  nextPageToken: z.string().optional(),
});

// WRONG: Type-specific property names
const successBranchSchema = z.object({
  type: z.literal('success'),
  messages: z.array(MessageSchema),  // ❌ Should be "items"
  files: z.array(FileSchema),        // ❌ Should be "items"
  folders: z.array(FolderSchema),    // ❌ Should be "items"
});
```

**`item`** - Single domain object

Use `item` for single entity responses wrapped in result objects.

```typescript
// CORRECT: Wrapped with "item"
const successBranchSchema = z.object({
  type: z.literal('success'),
  item: EmailDetailSchema,
});

// WRONG: Flattened or type-specific
const successBranchSchema = EmailDetailSchema.extend({
  type: z.literal('success'),  // ❌ Flattening loses structure
});
```

### Spreadsheet/Database-like Data Properties

**`columns`** - Array of column/header names

Use `columns` for first-row values that define the schema or structure of tabular data.

```typescript
// CORRECT: Database-like terminology
const successBranchSchema = z.object({
  type: z.literal('success'),
  columns: z.array(z.string()).describe('Column names from first row'),
  isEmpty: z.boolean(),
});

// WRONG: Ambiguous "headers"
const successBranchSchema = z.object({
  type: z.literal('success'),
  headers: z.array(z.string()),  // ❌ Should be "columns"
});
```

**`rows`** - 2D array of row data

Use `rows` when data is in rows-major format (each inner array is a row). This applies when the data structure is definitively row-oriented.

```typescript
// CORRECT: Clear row orientation
const successBranchSchema = z.object({
  type: z.literal('success'),
  range: z.string(),
  rows: z.array(z.array(CellSchema)).describe('2D array - each inner array is a row'),
});

// WRONG: Ambiguous "values" when orientation is fixed
const successBranchSchema = z.object({
  type: z.literal('success'),
  values: z.array(z.array(CellSchema)),  // ❌ Should be "rows" when row-oriented
});
```

**`values`** - Flexible orientation/granularity

Reserve `values` for cases where data orientation or granularity is flexible or determined by parameters.

```typescript
// CORRECT: Flexible granularity via parameter
const successBranchSchema = z.discriminatedUnion('select', [
  z.object({
    select: z.literal('cells'),
    values: z.array(CellMatchSchema),  // ✅ Individual cells
  }),
  z.object({
    select: z.literal('rows'),
    values: z.array(z.array(CellSchema)),  // ✅ Full rows
  }),
  z.object({
    select: z.literal('columns'),
    values: z.array(z.array(CellSchema)),  // ✅ Full columns
  }),
]);
```

### Shape Discriminator Pattern

When supporting multiple output shapes, use `shape` parameter with `columns` and `rows` properties:

```typescript
// Objects shape (default)
const objectsSchema = z.object({
  shape: z.literal('objects'),
  items: z.array(ItemSchema),
});

// Arrays shape (columnar)
const arraysSchema = z.object({
  shape: z.literal('arrays'),
  columns: z.array(z.string()),        // Column names
  rows: z.array(z.array(CellSchema)),  // Row data
});
```

### Tool Naming Conventions

Tool names should align with property naming:

| Output Property | Tool Name Pattern | Example |
|-----------------|-------------------|---------|
| `items` | `{resource}-search`, `{resource}-list` | `message-search`, `files-search` |
| `item` | `{resource}-get` | `message-get`, `file-get` |
| `columns` | `columns-get` | `columns-get`, `csv-get-columns` |
| `rows` | `rows-get`, `rows-append` | `rows-get`, `rows-append` |

### Rationale

1. **Consistent access patterns**: Consumers always access `result.items[0]` regardless of entity type
2. **Database-like vocabulary**: `columns` and `rows` accurately represent spreadsheet data structure
3. **Clear semantics**: `rows` for row-major data, `values` for flexible orientation
4. **Predictable behavior**: Tool names hint at output structure

## Registration Interfaces

### ToolModule Interface

**Purpose**: Standard interface for tool definitions that decouple tool logic from server registration.

```typescript
interface ToolModule<In = unknown, Out = unknown, Ctx = ToolContext> {
  name: string;                      // Tool identifier
  description: string;               // Human-readable description
  inputSchema: z.ZodType<In>;       // Input validation
  outputSchema?: OutputSchemaLike;   // Output validation (optional)
  handler: ToolHandler<In, Out, Ctx>; // Business logic
}
```

**Design Benefits**:
- Tools are self-contained modules (name, schema, handler together)
- Easy to test (export tool module, test handler directly)
- Type-safe (input/output types flow from schemas)
- Composable (middleware can wrap handlers)

**Registration Pattern**:
```typescript
const tools: ToolModule[] = [echoTool, searchTool, sendTool];

for (const tool of tools) {
  mcpServer.registerTool(
    tool.name,
    tool.inputSchema,
    (args, extra) => tool.handler(args, extra, context)
  );
}
```

### ResourceModule & PromptModule

Parallel interfaces for resources and prompts, following same design philosophy.

**Purpose**: Standardize resource/prompt definitions across servers.

## File Serving Architecture

### Purpose

Generic file serving for HTTP transports - used for serving generated files like CSV exports and PDFs.

### createFileServingRouter()

**Design**:
```typescript
interface FileServingConfig {
  routePrefix: string;        // URL path prefix
  resourceStoreUri: string;         // Resource store URI (file://)
  getMetadata?: (fileId: string) => Promise<FileMetadata | null>;
  getAllFiles?: () => Promise<FileInfo[]>;
}

function createFileServingRouter(
  config: FileServingConfig
): Router
```

**Implementation Strategy**:
1. Create Express router
2. Mount GET endpoint for file retrieval at `/:fileId`
3. Mount GET endpoint for file listing at `/`
4. Use provided metadata functions for access control
5. Stream files from resource store
6. Return 404 for missing files

**Security**: Sanitize file paths to prevent directory traversal attacks.

**Example Routes**:
```
GET /exports/abc123           → Stream abc123.csv
GET /exports                  → List all available files
```

## Type Safety Patterns

### Explicit Return Types

**Pattern**: Annotate function return types to catch errors at compile time.

```typescript
function parseConfig(
  args: string[],
  env: Record<string, string | undefined>
): ParsedTransportConfig {  // Explicit return type
  // TypeScript validates return matches declared type
  return { transport, headless, logLevel };
}
```

**Rationale**: TypeScript's inference sometimes fails with complex transformations. Explicit types catch errors immediately.

### Union Return Types

**Pattern**: Different functions return different shapes based on branching logic.

```typescript
// setupStdioServer returns void (runs indefinitely)
await setupStdioServer({ serverFactory, logger });

// setupHttpServer returns Server handle
const httpServer = await setupHttpServer({ serverFactory, logger, app, port });
```

**Testing Pattern**: Use type guards in assertions.

```typescript
const result = await setupTransport(config);
if (config.transport.type === 'http') {
  assert.ok('httpServer' in result && result.httpServer);
}
```

### Discriminated Unions

**Pattern**: Use discriminated unions for configuration objects.

```typescript
type TransportConfig =
  | { type: 'stdio' }
  | { type: 'http'; port: number };

// TypeScript narrows types based on discriminant
if (config.transport.type === 'http') {
  // config.transport.port is number (not undefined)
  const server = await startHttpServer(config.transport.port);
}
```

**Rationale**: Type-safe branching without runtime type checks.

## Design Constraints

### What the Library Does NOT Do

**No centralized state management** - Servers manage their own state (active accounts, contexts)

**No authentication enforcement** - Library provides OAuth adapters, servers decide when to use them

**No multi-transport orchestration** - One transport per process, orchestration is external

**No configuration defaults** - Entry points provide explicit configuration

**No plugin systems** - Composition happens at the application level

### What the Library Provides

**Configuration parsing** - CLI args + env vars → typed config

**Transport setup** - One function call to start stdio or HTTP

**OAuth adapter factory** - Create appropriate adapters based on config

**Error handling** - Standardized error responses

**Response builders** - MCP-compliant response construction

**Registration interfaces** - Standard patterns for tools, resources, prompts

**File serving** - Generic file serving for HTTP transports

## Architecture Trade-offs

### Simplicity vs Flexibility

**Choice**: Favor simplicity - provide focused utilities rather than flexible frameworks.

**Trade-off**: Some use cases require more manual setup, but code remains understandable.

**Example**: No automatic OAuth middleware - servers explicitly call OAuth adapters when needed. More verbose, but clear control flow.

### Type Safety vs Ergonomics

**Choice**: Favor type safety - explicit types over inference, validation over silent fallbacks.

**Trade-off**: More verbose code (explicit return types, validation checks), but fewer runtime errors.

**Example**: `parseConfig()` throws on invalid config rather than returning defaults. Fails fast, but requires error handling.

### Building Blocks vs Framework

**Choice**: Provide building blocks that compose freely.

**Trade-off**: No "one function to rule them all" - servers wire utilities together. More boilerplate, but full control.

**Example**: Servers call `parseConfig()`, then `setupStdioServer()` or `setupHttpServer()`, then register tools. Library doesn't dictate order or structure.

## References

- [Model Context Protocol Specification](https://modelcontextprotocol.io/)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [@mcp-z/server README](README.md)
- [CONTRIBUTING.md](CONTRIBUTING.md) - Development guidelines
- [QUALITY.md](../../QUALITY.md) - Project quality principles
