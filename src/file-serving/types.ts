/**
 * Configuration for generating file URIs
 */
export interface FileUriConfig {
  storageDir: string;
  /** e.g., 'https://example.com' or 'http://localhost:3000' */
  baseUrl?: string;
  /** @default '/files' */
  endpoint?: string;
}

/**
 * Configuration for file serving with configurable ID generation and delimiter
 *
 * @example
 * // Default configuration (UUID with hyphen delimiter)
 * const config: FileServingConfig = {
 *   storageDir: '/tmp/files'
 * };
 *
 * @example
 * // Custom delimiter
 * const config: FileServingConfig = {
 *   storageDir: '/tmp/files',
 *   delimiter: '_'
 * };
 *
 * @example
 * // Custom ID generator (e.g., nanoid)
 * import { nanoid } from 'nanoid';
 * const config: FileServingConfig = {
 *   storageDir: '/tmp/files',
 *   delimiter: '-',
 *   generateId: () => nanoid(12)
 * };
 */
export interface FileServingConfig {
  storageDir: string;
  /** @default '-' - IDs are validated to not contain this */
  delimiter?: string;
  /** @default randomUUID - must not generate IDs containing delimiter */
  generateId?: () => string;
}

/**
 * Result of reserving or writing a file
 * storedName format: {id}{delimiter}{filename} (e.g., 'abc123-report.pdf')
 */
export interface FileReservation {
  id: string;
  storedName: string;
  fullPath: string;
}

/**
 * Options for creating a file serving Express router
 */
export interface FileServingRouterOptions {
  /**
   * Content-Type header value or function to determine it from filename
   * Examples:
   * - Static: 'application/pdf'
   * - Dynamic: (filename) => filename.endsWith('.pdf') ? 'application/pdf' : 'text/plain'
   */
  contentType: string | ((filename: string) => string);
  /**
   * Content-Disposition header value
   * - 'attachment': Forces download with filename
   * - 'inline': Displays in browser when possible
   * @default 'attachment'
   */
  contentDisposition?: 'inline' | 'attachment';
}
