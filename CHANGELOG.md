# Changelog

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
