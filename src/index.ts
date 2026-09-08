// The SDK surface consumers need, re-exported so they never import the SDK directly.
// That keeps which SDK backs this package an implementation detail: a future SDK swap
// changes this file rather than every consumer's imports.

export type { CacheHint, CallToolResult, ReadResourceResult, ServerContext, ServerContext as RequestHandlerExtra, StandardSchemaWithJSON } from '@modelcontextprotocol/server';
// --- End-of-life bridge for the 1.x line. Delete with this branch. ---
//
// This release is the last 1.x: the same code as 2.x, plus the two aliases below, so a 1.x
// consumer can take every fix without editing a single import. `ProtocolError` and
// `ServerContext` are pure renames of `McpError` and `RequestHandlerExtra` - same constructor
// `(code, message, data?)`, same `code`/`data` fields, same `static fromError`, and
// `ProtocolError` additionally brands `Symbol.hasInstance`, so `instanceof` survives duplicate
// SDK copies in one tree where the 1.x prototype check did not.
//
// These are a one-time bridge, NOT a compat layer. Nothing is maintained behind them and
// nothing else should be added here. To move to 2.x properly, rename the two imports.
export { McpServer, ProtocolError, ProtocolError as McpError, ProtocolErrorCode, ResourceTemplate } from '@modelcontextprotocol/server';
// Builders
export * from './builders/schemas.ts';
// File serving utilities
export * from './file-serving/index.ts';
// Cache hints for 2026-07-28 cacheable results
export { type CacheableResultMethod, defaultCacheHints } from './lib/cache-hints.ts';
// Config helpers
export { default as findConfigPath, type FindConfigOptions } from './lib/find-config-path.ts';
export * from './middleware/composer.ts';
// Middleware
export * from './middleware/logging.ts';
// Registration utilities and module types
export * from './register-modules.ts';
// Transports
export * from './transports/http.ts';
export { type ParsedTransportConfig, parseConfig } from './transports/parse-config.ts';
export * from './transports/stdio.ts';
// Core types and utilities - ResourceConfig exported here (also used by register-modules)
export * from './types.ts';
