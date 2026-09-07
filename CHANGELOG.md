# Changelog

## [1.3.2] - 2026-09-06

Re-publish of 1.3.1; identical content.

## [1.3.1] - 2026-09-06

### Fixed

- `ErrorCode` is this package's own type again. 1.3.0 also re-exported the SDK's `ErrorCode`, and an explicit re-export beats `export *`, so it shadowed the `'INVALID_ARGUMENT' | 'NOT_FOUND' | ...` union that `ErrorBranch.code` uses — importing `ErrorCode` from here returned the SDK enum instead. The SDK's is no longer re-exported; reach it through `McpError` or import it from the SDK directly.

## [1.3.0] - 2026-09-06

### Added

- Re-exports the MCP SDK surface consumers need — `McpServer`, `ResourceTemplate`, `McpError`, and the `CallToolResult` / `ReadResourceResult` / `RequestHandlerExtra` types — so they need not import `@modelcontextprotocol/sdk` directly. This makes the 2.x upgrade two non-breaking steps instead of one breaking one: adopt these names here, then take 2.x, where the same names resolve to the v2 SDK and its renames are absorbed by this package. Purely additive; nothing existing changes.

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
