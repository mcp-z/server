# Changelog

## [1.3.0] - 2026-09-06

### Added

- Re-exports the MCP SDK surface consumers need — `McpServer`, `ResourceTemplate`, `McpError`, `ErrorCode`, and the `CallToolResult` / `ReadResourceResult` / `RequestHandlerExtra` types — so they need not import `@modelcontextprotocol/sdk` directly. This makes the 2.x upgrade two non-breaking steps instead of one breaking one: adopt these names here, then take 2.x, where the same names resolve to the v2 SDK and its renames are absorbed by this package. Purely additive; nothing existing changes.

## [1.2.0] - 2026-09-05

### Fixed

- DNS-rebinding protection on the HTTP transport: `Origin` and `Host` are validated against an allow-list, and `connectHttp` binds to `127.0.0.1` by default.

### Added

- `host`, `allowedOrigins` and `allowedHosts` options on `connectHttp` for deployments that need to bind elsewhere.

## [1.1.0] - 2026-08-29

### Changed

- `engines.node` raised to `>=20`; path handling improved.

## [1.0.0] - 2025-12-28

Initial release.
