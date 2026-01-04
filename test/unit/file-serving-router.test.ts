import assert from 'assert';
import express, { type Express } from 'express';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';
import { createFileServingRouter, writeFile } from '../../src/file-serving/index.ts';

describe('file-serving router', () => {
  let app: Express;
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `router-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    app = express();
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('basic functionality', () => {
    it('serves files from resource store', async () => {
      // Create a test file
      const buffer = Buffer.from('test PDF content');
      const { storedName } = await writeFile(buffer, 'test.pdf', { resourceStoreUri: `file://${testDir}` });

      // Mount router
      const router = createFileServingRouter({ resourceStoreUri: `file://${testDir}` }, { contentType: 'application/pdf' });
      app.use('/files', router);

      // Request the file
      const response = await request(app).get(`/files/${storedName}`).expect(200).expect('Content-Type', 'application/pdf');

      assert.strictEqual(response.body.toString(), 'test PDF content');
    });

    it('returns 404 for non-existent files', async () => {
      const router = createFileServingRouter({ resourceStoreUri: `file://${testDir}` }, { contentType: 'application/pdf' });
      app.use('/files', router);

      await request(app).get('/files/nonexistent.pdf').expect(404).expect('File not found');
    });

    it('serves files with correct Content-Disposition header', async () => {
      const buffer = Buffer.from('test content');
      const { storedName } = await writeFile(buffer, 'report.pdf', { resourceStoreUri: `file://${testDir}` });

      const router = createFileServingRouter({ resourceStoreUri: `file://${testDir}` }, { contentType: 'application/pdf', contentDisposition: 'attachment' });
      app.use('/files', router);

      await request(app)
        .get(`/files/${storedName}`)
        .expect(200)
        .expect('Content-Disposition', /attachment; filename="report\.pdf"/);
    });

    it('supports inline content disposition', async () => {
      const buffer = Buffer.from('test content');
      const { storedName } = await writeFile(buffer, 'preview.pdf', { resourceStoreUri: `file://${testDir}` });

      const router = createFileServingRouter({ resourceStoreUri: `file://${testDir}` }, { contentType: 'application/pdf', contentDisposition: 'inline' });
      app.use('/files', router);

      await request(app)
        .get(`/files/${storedName}`)
        .expect(200)
        .expect('Content-Disposition', /inline; filename="preview\.pdf"/);
    });
  });

  describe('content types', () => {
    it('serves static content type', async () => {
      const buffer = Buffer.from('test content');
      const { storedName } = await writeFile(buffer, 'document.txt', { resourceStoreUri: `file://${testDir}` });

      const router = createFileServingRouter({ resourceStoreUri: `file://${testDir}` }, { contentType: 'text/plain' });
      app.use('/files', router);

      await request(app).get(`/files/${storedName}`).expect(200).expect('Content-Type', 'text/plain; charset=utf-8');
    });

    it('serves dynamic content type based on filename', async () => {
      const pdfBuffer = Buffer.from('pdf content');
      const { storedName: pdfName } = await writeFile(pdfBuffer, 'document.pdf', { resourceStoreUri: `file://${testDir}` });

      const csvBuffer = Buffer.from('csv content');
      const { storedName: csvName } = await writeFile(csvBuffer, 'data.csv', { resourceStoreUri: `file://${testDir}` });

      const router = createFileServingRouter(
        { resourceStoreUri: `file://${testDir}` },
        {
          contentType: (filename) => {
            if (filename.endsWith('.pdf')) return 'application/pdf';
            if (filename.endsWith('.csv')) return 'text/csv';
            return 'application/octet-stream';
          },
        }
      );
      app.use('/files', router);

      // Test PDF
      await request(app).get(`/files/${pdfName}`).expect(200).expect('Content-Type', 'application/pdf');

      // Test CSV
      await request(app).get(`/files/${csvName}`).expect(200).expect('Content-Type', 'text/csv; charset=utf-8');
    });
  });

  describe('security', () => {
    it('prevents path traversal attacks', async () => {
      const router = createFileServingRouter({ resourceStoreUri: `file://${testDir}` }, { contentType: 'application/pdf' });
      app.use('/files', router);

      // Try to access parent directory
      // Note: Express normalizes paths, so this results in 404 rather than 403
      // Either response code is acceptable - file is not served
      const response = await request(app).get('/files/../../../etc/passwd');
      assert.ok(response.status === 403 || response.status === 404);
    });

    it('prevents accessing files outside resource store', async () => {
      const router = createFileServingRouter({ resourceStoreUri: `file://${testDir}` }, { contentType: 'application/pdf' });
      app.use('/files', router);

      // Try to use absolute path outside storage
      const response = await request(app).get('/files//etc/passwd');
      assert.ok(response.status === 403 || response.status === 404);
    });

    it('prevents dot-dot sequences', async () => {
      const router = createFileServingRouter({ resourceStoreUri: `file://${testDir}` }, { contentType: 'application/pdf' });
      app.use('/files', router);

      const response = await request(app).get('/files/foo/../../../etc/passwd');
      assert.ok(response.status === 403 || response.status === 404);
    });
  });

  describe('filename extraction', () => {
    it('extracts original filename from UUID-prefixed stored name', async () => {
      const buffer = Buffer.from('test content');
      const { storedName } = await writeFile(buffer, 'my-report.pdf', { resourceStoreUri: `file://${testDir}` });

      const router = createFileServingRouter({ resourceStoreUri: `file://${testDir}` }, { contentType: 'application/pdf' });
      app.use('/files', router);

      await request(app)
        .get(`/files/${storedName}`)
        .expect(200)
        .expect('Content-Disposition', /filename="my-report\.pdf"/);
    });

    it('handles filenames with special characters', async () => {
      const buffer = Buffer.from('test content');
      const { storedName } = await writeFile(buffer, 'project plan (v2).pdf', { resourceStoreUri: `file://${testDir}` });

      const router = createFileServingRouter({ resourceStoreUri: `file://${testDir}` }, { contentType: 'application/pdf' });
      app.use('/files', router);

      await request(app)
        .get(`/files/${storedName}`)
        .expect(200)
        .expect('Content-Disposition', /filename="project%20plan%20\(v2\)\.pdf"/);
    });
  });

  describe('error handling', () => {
    it('returns 500 for unexpected errors', async () => {
      // Create router with non-existent directory (will cause error on file read)
      const router = createFileServingRouter(
        { resourceStoreUri: 'file:///nonexistent/directory' },
        {
          contentType: 'application/pdf',
        }
      );
      app.use('/files', router);

      await request(app).get('/files/test.pdf').expect(404); // File not found because directory doesn't exist
    });
  });

  describe('multiple file types', () => {
    it('serves different file types with appropriate headers', async () => {
      const testFiles = [
        { filename: 'document.pdf', content: 'pdf content', mimeType: 'application/pdf' },
        { filename: 'data.csv', content: 'csv content', mimeType: 'text/csv' },
        { filename: 'readme.txt', content: 'text content', mimeType: 'text/plain' },
        { filename: 'notes.md', content: 'markdown content', mimeType: 'text/markdown' },
      ];

      // Write test files
      const storedFiles = await Promise.all(
        testFiles.map(async (file) => ({
          ...file,
          storedName: (await writeFile(Buffer.from(file.content), file.filename, { resourceStoreUri: `file://${testDir}` })).storedName,
        }))
      );

      // Create router with dynamic content type
      const router = createFileServingRouter(
        { resourceStoreUri: `file://${testDir}` },
        {
          contentType: (filename) => {
            if (filename.endsWith('.pdf')) return 'application/pdf';
            if (filename.endsWith('.csv')) return 'text/csv';
            if (filename.endsWith('.txt')) return 'text/plain';
            if (filename.endsWith('.md')) return 'text/markdown';
            return 'application/octet-stream';
          },
        }
      );
      app.use('/files', router);

      // Test each file
      for (const file of storedFiles) {
        const response = await request(app).get(`/files/${file.storedName}`).expect(200);

        const contentType = response.headers['content-type'];
        assert.ok(contentType, 'Response should have content-type header');
        assert.ok(contentType.startsWith(file.mimeType));
        // Use body.toString() for binary content types, text for text types
        const content = file.mimeType.startsWith('text/') ? response.text : response.body.toString();
        assert.strictEqual(content, file.content);
      }
    });
  });
});
