/**
 * File serving utilities for MCP servers
 *
 * This module provides reusable functionality for servers that generate and serve files
 * (PDFs, CSVs, images, etc.) over both stdio and HTTP transports with configurable ID
 * generation and delimiter support.
 *
 * ## Key Features
 * - Zero storage overhead (no metadata files needed)
 * - Configurable ID generation (UUID, nanoid, custom)
 * - Configurable delimiter (-, _, |, etc.)
 * - Original filename preserved in stored name
 * - Delimiter collision handled correctly (ID validated, parse by first occurrence)
 * - Supports both buffered and streaming writes
 *
 * ## API Overview
 *
 * ### Core Utilities
 * - `reserveFile()` - Reserve location for streaming writes (returns id/path before writing)
 * - `writeFile()` - Write complete buffer (convenience wrapper for non-streaming)
 * - `getFileUri()` - Generate file:// or http:// URIs based on transport type
 * - `parseStoredName()` - Extract original filename from ID-prefixed stored name
 *
 * ### Express Router
 * - `createFileServingRouter()` - Express router with path traversal protection
 *
 * @module file-serving
 *
 * @example
 * // Streaming write (CSV export)
 * import { reserveFile, getFileUri } from '@mcp-z/server';
 *
 * const reservation = await reserveFile('export.csv', {
 *   storageDir: '/tmp/files'
 * });
 *
 * const stream = createWriteStream(reservation.fullPath);
 * // ... write CSV rows incrementally ...
 * stream.end();
 *
 * const uri = getFileUri(reservation.storedName, transport, {
 *   storageDir: '/tmp/files',
 *   baseUrl: config.baseUrl,
 *   endpoint: '/files'
 * });
 *
 * @example
 * // Buffered write (PDF generation)
 * import { writeFile, getFileUri } from '@mcp-z/server';
 *
 * const { storedName } = await writeFile(pdfBuffer, 'report.pdf', {
 *   storageDir: '/tmp/files'
 * });
 *
 * const uri = getFileUri(storedName, transport, {
 *   storageDir: '/tmp/files',
 *   baseUrl: config.baseUrl,
 *   endpoint: '/files'
 * });
 *
 * @example
 * // Express router
 * import { createFileServingRouter } from '@mcp-z/server';
 *
 * const router = createFileServingRouter(
 *   { storageDir: config.storageDir },
 *   {
 *     contentType: 'application/pdf',
 *     contentDisposition: 'attachment',
 *   }
 * );
 * app.use('/files', router);
 *
 * @example
 * // Custom delimiter and ID generator
 * import { nanoid } from 'nanoid';
 *
 * const reservation = await reserveFile('data.json', {
 *   storageDir: '/tmp/files',
 *   delimiter: '_',
 *   generateId: () => nanoid(12)
 * });
 * // storedName will be like: abc123xyz456_data.json
 */

export * from './router.ts';
export * from './types.ts';
export * from './utils.ts';
