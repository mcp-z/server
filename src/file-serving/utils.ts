import { randomUUID } from 'crypto';
import { writeFile as fsWriteFile, mkdir } from 'fs/promises';
import { join, resolve } from 'path';
import type { TransportConfig } from '../types.ts';
import type { FileReservation, FileServingConfig, FileUriConfig } from './types.ts';

// Default configuration values
// Use tilde as default delimiter - valid on all filesystems, rarely used in filenames, and URL-safe
const DEFAULT_DELIMITER = '~';
const DEFAULT_GENERATE_ID = randomUUID;
const FILE_URI_PREFIX = 'file://';

export function resolveResourceStorePath(resourceStoreUri: string): string {
  if (!resourceStoreUri) {
    throw new Error('File serving requires a resourceStoreUri.');
  }

  if (resourceStoreUri.startsWith(FILE_URI_PREFIX)) {
    const rawPath = resourceStoreUri.slice(FILE_URI_PREFIX.length);
    return resolve(rawPath);
  }

  if (resourceStoreUri.includes('://')) {
    throw new Error(`Unsupported resourceStoreUri scheme: ${resourceStoreUri}. Only file:// URIs are supported.`);
  }

  return resolve(resourceStoreUri);
}

/**
 * Generate a validated ID that doesn't contain the delimiter
 * @throws Error if unable to generate valid ID after 100 attempts
 * @internal
 */
function generateValidatedId(delimiter: string, generateIdFn: () => string): string {
  const maxAttempts = 100;
  let attempts = 0;

  while (attempts < maxAttempts) {
    const id = generateIdFn();
    if (!id.includes(delimiter)) {
      return id;
    }
    attempts++;
  }

  throw new Error(`Failed to generate ID without delimiter '${delimiter}' after ${maxAttempts} attempts. Consider using a different delimiter or custom ID generator.`);
}

/**
 * Format a stored filename from ID and original filename
 *
 * Format: {id}{delimiter}{originalFilename}
 *
 * @param id - Unique identifier (must not contain delimiter)
 * @param originalFilename - Original filename
 * @param delimiter - Delimiter to use between ID and filename
 * @returns Formatted stored filename
 *
 * @example
 * formatStoredName('abc123', 'report.pdf', '-')
 * // => 'abc123-report.pdf'
 *
 * @example
 * // Filename can contain delimiter without issues
 * formatStoredName('abc123', 'report-2024.pdf', '-')
 * // => 'abc123-report-2024.pdf'
 *
 * @internal
 */
function formatStoredName(id: string, originalFilename: string, delimiter: string): string {
  return `${id}${delimiter}${originalFilename}`;
}

/**
 * Parse a stored filename back into ID and original filename
 *
 * Strategy: Find FIRST occurrence of delimiter to split.
 * Everything before = ID, everything after = original filename.
 *
 * This means the original filename CAN contain the delimiter without breaking parsing.
 *
 * @param storedName - Stored filename to parse
 * @param delimiter - Delimiter used between ID and filename
 * @returns Object with id and filename properties
 *
 * @example
 * parseStoredName('abc123-report.pdf', '-')
 * // => { id: 'abc123', filename: 'report.pdf' }
 *
 * @example
 * // Handles delimiter in filename correctly
 * parseStoredName('abc123-report-2024-final.pdf', '-')
 * // => { id: 'abc123', filename: 'report-2024-final.pdf' }
 *
 * @example
 * // Fallback if no delimiter found
 * parseStoredName('report.pdf', '-')
 * // => { id: 'report.pdf', filename: 'report.pdf' }
 */
export function parseStoredName(storedName: string, delimiter: string): { id: string; filename: string } {
  const index = storedName.indexOf(delimiter);

  if (index === -1) {
    // No delimiter found - return storedName as both id and filename (fallback)
    return { id: storedName, filename: storedName };
  }

  return {
    id: storedName.substring(0, index),
    filename: storedName.substring(index + delimiter.length),
  };
}

/**
 * Reserve a file location for streaming writes
 *
 * Generates a validated ID and returns all paths needed to write the file.
 * Does NOT create the file - caller should write to fullPath using streams or other means.
 *
 * @param originalFilename - Original filename to preserve
 * @param config - File serving configuration
 * @returns FileReservation with id, storedName, and fullPath
 *
 * @example
 * const reservation = await reserveFile('export.csv', {
 *   resourceStoreUri: 'file:///tmp/files',
 *   delimiter: '-'
 * });
 *
 * const stream = createWriteStream(reservation.fullPath);
 * // ... write CSV incrementally ...
 * stream.end();
 *
 * const uri = getFileUri(reservation.storedName, transport, uriConfig);
 */
export async function reserveFile(originalFilename: string, config: FileServingConfig): Promise<FileReservation> {
  const delimiter = config.delimiter ?? DEFAULT_DELIMITER;
  const generateIdFn = config.generateId ?? DEFAULT_GENERATE_ID;
  const outputDir = resolveResourceStorePath(config.resourceStoreUri);

  await mkdir(outputDir, { recursive: true });

  const id = generateValidatedId(delimiter, generateIdFn);
  const storedName = formatStoredName(id, originalFilename, delimiter);
  const fullPath = join(outputDir, storedName);

  return { id, storedName, fullPath };
}

/**
 * Write a complete file buffer to storage
 *
 * Convenience wrapper around reserveFile() for non-streaming use cases.
 * Generates ID, formats filename, creates directory, and writes file atomically.
 *
 * @param buffer - File content as a Buffer
 * @param originalFilename - Original filename to preserve
 * @param config - File serving configuration
 * @returns FileReservation with id, storedName, and fullPath
 *
 * @example
 * const pdfBuffer = Buffer.from('...');
 * const result = await writeFile(pdfBuffer, 'report.pdf', {
 *   resourceStoreUri: 'file:///tmp/files'
 * });
 * // result.storedName => '{uuid}-report.pdf'
 * // result.fullPath => '/tmp/files/{uuid}-report.pdf'
 */
export async function writeFile(buffer: Buffer, originalFilename: string, config: FileServingConfig): Promise<FileReservation> {
  const reservation = await reserveFile(originalFilename, config);
  await fsWriteFile(reservation.fullPath, buffer);
  return reservation;
}

/**
 * Generate a file URI based on the transport type
 *
 * @param storedFilename - The stored filename (ID-prefixed)
 * @param transport - The transport configuration (undefined for stdio)
 * @param config - Configuration for URI generation
 * @returns URI string (file:// for stdio, http:// for HTTP transports)
 *
 * @example
 * // Stdio transport (or no transport)
 * getFileUri('abc123-report.pdf', undefined, { resourceStoreUri: 'file:///tmp/files' })
 * // => 'file:///tmp/files/abc123-report.pdf'
 *
 * @example
 * // HTTP transport with explicit base URL
 * getFileUri('abc123-report.pdf', { type: 'http', port: 3000 }, {
 *   resourceStoreUri: 'file:///tmp/files',
 *   baseUrl: 'https://example.com'
 * })
 * // => 'https://example.com/files/abc123-report.pdf'
 *
 * @example
 * // HTTP transport with default localhost
 * getFileUri('abc123-report.pdf', { type: 'http', port: 3000 }, {
 *   resourceStoreUri: 'file:///tmp/files'
 * })
 * // => 'http://localhost:3000/files/abc123-report.pdf'
 */
export function getFileUri(storedFilename: string, transport: TransportConfig | undefined, config: FileUriConfig): string {
  // Stdio or no transport: return file:// URI
  if (transport?.type === 'stdio' || !transport) {
    const outputDir = resolveResourceStorePath(config.resourceStoreUri);
    const fullPath = resolve(join(outputDir, storedFilename));
    return `${FILE_URI_PREFIX}${fullPath}`;
  }

  // HTTP transport: return http:// URI
  // Require either baseUrl or port - fail fast if neither provided
  if (!config.baseUrl && !transport.port) {
    throw new Error('getFileUri: HTTP transport requires either baseUrl or port. This is a configuration error.');
  }

  const base = config.baseUrl || `http://localhost:${transport.port}`;
  const endpoint = config.endpoint || '/files';
  return `${base}${endpoint}/${storedFilename}`;
}
