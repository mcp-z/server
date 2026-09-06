// The SDK surface consumers need, re-exported so they never import the SDK directly.
// That keeps which SDK backs this package an implementation detail: a future SDK swap
// changes this file rather than every consumer's imports.

export type { CallToolResult, ReadResourceResult, ServerContext, StandardSchemaWithJSON } from '@modelcontextprotocol/server';
export { McpServer, ProtocolError, ProtocolErrorCode, ResourceTemplate } from '@modelcontextprotocol/server';
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
