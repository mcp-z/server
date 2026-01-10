import express, { type Request, type Response, type Router } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import type { FileServingConfig, FileServingRouterOptions } from './types.ts';
import { parseStoredName, resolveResourceStorePath } from './utils.ts';

// Default delimiter for parsing stored filenames (matches utils.ts default)
const DEFAULT_DELIMITER = '~';

/**
 * Create an Express router for serving files from a resource store
 *
 * Features:
 * - Path traversal protection
 * - File existence validation
 * - Automatic original filename extraction from ID-prefixed filenames
 * - Configurable Content-Type and Content-Disposition headers
 * - Standard error responses (403, 404, 500)
 *
 * @param config - File serving configuration (resourceStoreUri, delimiter, generateId)
 * @param options - Router options (contentType, contentDisposition)
 * @returns Express router ready to mount on an Express app
 *
 * @example
 * // Simple PDF server
 * const router = createFileServingRouter(
 *   { resourceStoreUri: 'file:///tmp/pdfs' },
 *   { contentType: 'application/pdf', contentDisposition: 'attachment' }
 * );
 * app.use('/files', router);
 *
 * @example
 * // Multi-format server with dynamic content type and custom delimiter
 * const router = createFileServingRouter(
 *   { resourceStoreUri: 'file:///tmp/exports', delimiter: '_' },
 *   {
 *     contentType: (filename) => {
 *       if (filename.endsWith('.pdf')) return 'application/pdf';
 *       if (filename.endsWith('.csv')) return 'text/csv';
 *       if (filename.endsWith('.txt')) return 'text/plain';
 *       return 'application/octet-stream';
 *     },
 *     contentDisposition: 'inline',
 *   }
 * );
 * app.use('/exports', router);
 */
export function createFileServingRouter(config: FileServingConfig, options: FileServingRouterOptions): Router {
  const { resourceStoreUri, delimiter = DEFAULT_DELIMITER } = config;
  const { contentType, contentDisposition = 'attachment' } = options;

  const router = express.Router();
  const resolvedStorageDir = resolveResourceStorePath(resourceStoreUri);

  router.get('/:filename', (req: Request, res: Response) => {
    try {
      const { filename: rawFilename } = req.params;

      // Validate filename exists
      if (!rawFilename) {
        res.status(400).send('Bad request: filename parameter is required');
        return;
      }

      // Handle filename as string (array case only happens with wildcard routes)
      const filename = Array.isArray(rawFilename) ? rawFilename[0] : rawFilename;

      const filePath = path.join(resolvedStorageDir, filename);

      // Security: Prevent path traversal attacks
      // Ensure the resolved file path is within the resource store path
      if (!filePath.startsWith(resolvedStorageDir)) {
        res.status(403).send('Access denied');
        return;
      }

      // Check file existence
      if (!fs.existsSync(filePath)) {
        res.status(404).send('File not found');
        return;
      }

      // Read file
      const data = fs.readFileSync(filePath);

      // Parse original filename from ID-prefixed stored name
      // This works even if the original filename contains the delimiter
      const { filename: originalFilename } = parseStoredName(filename, delimiter);

      // Set Content-Type header
      if (typeof contentType === 'function') {
        res.contentType(contentType(filename));
      } else {
        res.contentType(contentType);
      }

      // Set Content-Disposition header with properly encoded filename
      res.setHeader('Content-Disposition', `${contentDisposition}; filename="${encodeURIComponent(originalFilename)}"`);

      // Send file
      res.send(data);
    } catch (_error) {
      // Handle unexpected errors
      res.status(500).send('Internal server error');
    }
  });

  return router;
}
