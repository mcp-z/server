// The SDK surface consumers need, re-exported so they never import the SDK directly.
// That keeps which SDK backs this package an implementation detail, and it is what makes
// the 1.x -> 2.x upgrade two non-breaking steps instead of one breaking one: move to these
// re-exports on 1.x first, then take 2.x, where the same names resolve to the v2 SDK.

export { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
export type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
export type { CallToolResult, ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
export { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

// Builders
export * from './builders/schemas.ts';
// File serving utilities
export * from './file-serving/index.ts';
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
