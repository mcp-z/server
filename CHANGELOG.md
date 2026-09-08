# Changelog

## [1.4.0] - 2026-09-08 — final 1.x release

**This is the last release on the 1.x line, and it is the 2.x code.** Everything below `## [2.2.0]`
documents what is in it; the 1.x entries that used to head this file are on the `v1.3.2` tag.

The 1.x line is now end-of-life. Rather than backport fixes to it one at a time, this release
carries the whole 2.x tree, so a 1.x consumer gets the RFC 8707 resource indicator, required PKCE,
RFC 9207 `iss`, CIMD, protocol-version negotiation, cache hints and deterministic list ordering in
one upgrade — see the 2.x entries below for what each of those is.

### Changed

- The package now serves both the 2025 and 2026-07-28 protocol revisions, and its internals moved
  from `@modelcontextprotocol/sdk` v1 to the v2 SDK. Your imports do not change: `McpError` and
  `RequestHandlerExtra` are exported as aliases of `ProtocolError` and `ServerContext`. They are the
  same constructor `(code, message, data?)`, the same `code`/`data` fields and the same
  `static fromError`; `instanceof` keeps working, and now survives two copies of the SDK in one tree
  where the old prototype check did not.
- `SetupHttpTransportResult.mcpServer` widens from `McpServer` to `McpServer | (() => McpServer)`.
  Passing an instance still works; a factory is what the stateless 2026-07-28 revision needs.

### Migrating to 2.x

Rename two imports. That is the whole diff:

```ts
- import { McpError, type RequestHandlerExtra } from '@mcp-z/server';
+ import { ProtocolError, type ServerContext } from '@mcp-z/server';
```

Then `npm install @mcp-z/server@latest`. The two aliases exist only in this release as a one-time
bridge — they are not a compatibility layer and will not appear in 2.x.

### Support

None. There will be no further 1.x releases, including for security. Fixes land on 2.x.

## [2.2.0] - 2026-09-07

### Added

- `defaultCacheHints`, a cache policy for the 2026-07-28 revision's cacheable results, to pass as `new McpServer(info, { cacheHints: defaultCacheHints })`. Catalog operations (`tools/list`, `prompts/list`, `resources/templates/list`, `server/discover`) get a five-minute TTL and `cacheScope: 'public'`; `resources/list` and `resources/read` stay `private` with no TTL, since those vary by account. Without it the SDK defaults every cacheable result to `ttlMs: 0` / `private`, which is correct but caches nothing. Spread the object to override a single operation. 2025-era responses are unaffected.
- `CacheableResultMethod` and the SDK's `CacheHint` type are re-exported for anyone writing their own policy.

### Changed

- `registerTools`, `registerResources` and `registerPrompts` now register in name order rather than the order of the array passed to them. `tools/list` and its siblings therefore return the same order from any two servers built from the same modules, which is what a 2026-07-28 client needs to keep a cached catalog valid across a reconnect. A server whose modules were already listed alphabetically sees no change; any other server sees its list reordered once. The array passed in is not mutated.

## [2.1.1] - 2026-09-06

Documentation only; the code is identical to 2.1.0.

### Fixed

- 2.1.0's notes said a client speaking either protocol revision is "served correctly with no configuration change", and that passing an `McpServer` instance "still works unchanged". That is true only for a server speaking a single revision. The SDK caches the negotiated revision on the instance, so one shared `McpServer` pins to whichever era arrives first and answers the other with `-32601 Method not found`. **Serving both revisions requires passing a factory** (`() => McpServer`) to `connectHttp` / `connectStdio` / `createHttpMcpRouter`. An instance still compiles and still works for a single revision.

## [2.1.0] - 2026-09-06

### Added

- The HTTP and stdio transports now serve the 2026-07-28 protocol revision alongside the existing 2025 revision, from the same server definitions. A client speaking either era is served correctly with no configuration change; nothing is dropped or scheduled for removal.
- `connectHttp`, `connectStdio`, and `createHttpMcpRouter` now also accept a factory function (`() => McpServer`) wherever they previously required a ready-made `McpServer` instance. Passing an instance still works unchanged. A factory is what the stateless 2026 revision needs, since it builds a server per request/connection.
- CORS now allows the `mcp-method` and `mcp-name` request headers, required on every 2026-07-28 request.

### Changed

- The `DELETE /mcp` "method not allowed" response now uses JSON-RPC error code `-32600` instead of `-32000`.
- A `GET /mcp` request, which previously always returned `405 Method not allowed`, is now answered directly by the MCP handler; a 2026-07-28 client uses it to open a `subscriptions/listen` stream.

## [2.0.0] - 2026-09-06

### Changed

- Migrated from the v1 MCP SDK (`@modelcontextprotocol/sdk`) to the v2 SDK (`@modelcontextprotocol/server` and `@modelcontextprotocol/node`). The wire protocol served is unchanged. `McpError` and `ErrorCode` are now `ProtocolError` and `ProtocolErrorCode`; `RequestHandlerExtra` is now `ServerContext`. `ToolConfig.inputSchema`/`.outputSchema` narrow from a union to `StandardSchemaWithJSON`. `SetupStdioTransportResult.transport` is removed; it exposed an SDK internal that no caller used.
- Calling a tool that is not registered now raises an Invalid Params protocol error (`-32602`) instead of resolving with an `isError` result. This follows the spec: an unregistered tool is a protocol-level error, not a tool execution error.

### Added

- The SDK surface consumers need is now re-exported from `@mcp-z/server` — `McpServer`, `ResourceTemplate`, `ProtocolError`, `ProtocolErrorCode`, and the types `CallToolResult`, `ReadResourceResult`, `ServerContext`, `StandardSchemaWithJSON` — so consumers no longer need to import an SDK package directly.

History prior to 2.0.0 belongs to the 1.x line, maintained on `support/1.x`; see that branch's `CHANGELOG.md`.
