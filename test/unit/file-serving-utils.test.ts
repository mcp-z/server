import assert from 'assert';
import { existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { getFileUri, parseStoredName, writeFile } from '../../src/file-serving/index.ts';
import type { TransportConfig } from '../../src/types.ts';

describe('file-serving utilities', () => {
  describe('getFileUri', () => {
    describe('stdio transport', () => {
      it('returns file:// URI for stdio transport', () => {
        const uri = getFileUri(
          'test-file.pdf',
          { type: 'stdio' },
          {
            resourceStoreUri: 'file:///tmp/files',
          }
        );

        assert.strictEqual(uri, 'file:///tmp/files/test-file.pdf');
      });

      it('returns file:// URI when transport is undefined', () => {
        const uri = getFileUri('test-file.pdf', undefined, {
          resourceStoreUri: 'file:///tmp/files',
        });

        assert.strictEqual(uri, 'file:///tmp/files/test-file.pdf');
      });

      it('handles relative storage paths', () => {
        const uri = getFileUri(
          'test-file.pdf',
          { type: 'stdio' },
          {
            resourceStoreUri: 'file://./files',
          }
        );

        // Should resolve to absolute path
        assert.ok(uri.startsWith('file://'));
        assert.ok(uri.endsWith('/files/test-file.pdf'));
      });
    });

    describe('HTTP transport', () => {
      it('returns http:// URI with default endpoint', () => {
        const transport: TransportConfig = { type: 'http', port: 3000 };
        const uri = getFileUri('test-file.pdf', transport, {
          resourceStoreUri: 'file:///tmp/files',
        });

        assert.strictEqual(uri, 'http://localhost:3000/files/test-file.pdf');
      });

      it('uses custom endpoint', () => {
        const transport: TransportConfig = { type: 'http', port: 3000 };
        const uri = getFileUri('test-file.pdf', transport, {
          resourceStoreUri: 'file:///tmp/files',
          endpoint: '/exports',
        });

        assert.strictEqual(uri, 'http://localhost:3000/exports/test-file.pdf');
      });

      it('uses baseUrl when provided', () => {
        const transport: TransportConfig = { type: 'http', port: 3000 };
        const uri = getFileUri('test-file.pdf', transport, {
          resourceStoreUri: 'file:///tmp/files',
          baseUrl: 'https://example.com',
        });

        assert.strictEqual(uri, 'https://example.com/files/test-file.pdf');
      });

      it('uses baseUrl with custom endpoint', () => {
        const transport: TransportConfig = { type: 'http', port: 3000 };
        const uri = getFileUri('test-file.pdf', transport, {
          resourceStoreUri: 'file:///tmp/files',
          baseUrl: 'https://example.com',
          endpoint: '/api/files',
        });

        assert.strictEqual(uri, 'https://example.com/api/files/test-file.pdf');
      });

      it('throws error when no baseUrl and no port', () => {
        const transport: TransportConfig = { type: 'http' };

        assert.throws(
          () => {
            getFileUri('test-file.pdf', transport, {
              resourceStoreUri: 'file:///tmp/files',
            });
          },
          {
            name: 'Error',
            message: 'getFileUri: HTTP transport requires either baseUrl or port. This is a configuration error.',
          }
        );
      });
    });
  });

  describe('writeFile', () => {
    let testDir: string;

    beforeEach(() => {
      testDir = join(tmpdir(), `server-test-${Date.now()}`);
    });

    afterEach(() => {
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    it('writes file to specified directory with ID prefix', async () => {
      const buffer = Buffer.from('test content');
      const result = await writeFile(buffer, 'test.pdf', { resourceStoreUri: `file://${testDir}` });

      // Verify file was written
      assert.ok(existsSync(result.fullPath));
      assert.ok(result.fullPath.startsWith(testDir));

      // Verify ID has been generated and stored name contains filename
      assert.ok(result.id);
      assert.ok(result.storedName.includes('test.pdf'));
      // Default delimiter is '~', so should have format {id}~{filename}
      assert.ok(result.storedName.match(/^[0-9a-f-]+~test\.pdf$/));
    });

    it('generates unique IDs for each file', async () => {
      const buffer = Buffer.from('test content');
      const result1 = await writeFile(buffer, 'test.pdf', { resourceStoreUri: `file://${testDir}` });
      const result2 = await writeFile(buffer, 'test.pdf', { resourceStoreUri: `file://${testDir}` });

      // Should have different IDs
      assert.notStrictEqual(result1.id, result2.id);
      assert.notStrictEqual(result1.storedName, result2.storedName);
      assert.ok(existsSync(result1.fullPath));
      assert.ok(existsSync(result2.fullPath));
    });

    it('creates directory if it does not exist', async () => {
      const newDir = join(tmpdir(), `server-new-${Date.now()}`);

      try {
        assert.ok(!existsSync(newDir));

        const buffer = Buffer.from('test content');
        const result = await writeFile(buffer, 'test.pdf', { resourceStoreUri: `file://${newDir}` });

        // Directory should now exist
        assert.ok(existsSync(newDir));
        assert.ok(existsSync(result.fullPath));
      } finally {
        if (existsSync(newDir)) {
          rmSync(newDir, { recursive: true, force: true });
        }
      }
    });

    it('creates nested directories', async () => {
      const nestedDir = join(testDir, 'level1', 'level2', 'level3');

      const buffer = Buffer.from('test content');
      const result = await writeFile(buffer, 'test.pdf', { resourceStoreUri: `file://${nestedDir}` });

      assert.ok(existsSync(nestedDir));
      assert.ok(existsSync(result.fullPath));
    });

    it('handles different file extensions', async () => {
      const extensions = ['.pdf', '.txt', '.csv', '.json', '.md'];

      for (const ext of extensions) {
        const filename = `test${ext}`;
        const buffer = Buffer.from('test content');
        const result = await writeFile(buffer, filename, { resourceStoreUri: `file://${testDir}` });

        assert.ok(result.storedName.includes(filename));
        assert.ok(existsSync(result.fullPath));
      }
    });

    it('handles filenames with special characters', async () => {
      const filenames = ['my-document.pdf', 'project plan.pdf', 'report_2024.pdf', 'file (copy).pdf'];

      for (const filename of filenames) {
        const buffer = Buffer.from('test content');
        const result = await writeFile(buffer, filename, { resourceStoreUri: `file://${testDir}` });

        assert.ok(result.storedName.includes(filename));
        assert.ok(existsSync(result.fullPath));
      }
    });
  });

  describe('parseStoredName', () => {
    it('extracts filename from ID-prefixed format with hyphen delimiter', () => {
      const stored = 'abc123-invoice.pdf';
      const result = parseStoredName(stored, '-');
      assert.strictEqual(result.id, 'abc123');
      assert.strictEqual(result.filename, 'invoice.pdf');
    });

    it('handles filenames with delimiter in them (parses by FIRST occurrence)', () => {
      const stored = 'abc123-my-document-v2.pdf';
      const result = parseStoredName(stored, '-');
      assert.strictEqual(result.id, 'abc123');
      assert.strictEqual(result.filename, 'my-document-v2.pdf');
    });

    it('handles simple filenames', () => {
      const stored = 'abc123-resume.pdf';
      const result = parseStoredName(stored, '-');
      assert.strictEqual(result.id, 'abc123');
      assert.strictEqual(result.filename, 'resume.pdf');
    });

    it('handles filenames with spaces', () => {
      const stored = 'abc123-project plan.pdf';
      const result = parseStoredName(stored, '-');
      assert.strictEqual(result.id, 'abc123');
      assert.strictEqual(result.filename, 'project plan.pdf');
    });

    it('handles different file extensions', () => {
      const extensions = ['.pdf', '.txt', '.csv', '.json', '.md'];

      for (const ext of extensions) {
        const stored = `abc123-test${ext}`;
        const result = parseStoredName(stored, '-');
        assert.strictEqual(result.id, 'abc123');
        assert.strictEqual(result.filename, `test${ext}`);
      }
    });

    it('handles filenames with underscores', () => {
      const stored = 'abc123-report_2024_final.pdf';
      const result = parseStoredName(stored, '-');
      assert.strictEqual(result.id, 'abc123');
      assert.strictEqual(result.filename, 'report_2024_final.pdf');
    });

    it('handles filenames with parentheses', () => {
      const stored = 'abc123-document (copy).pdf';
      const result = parseStoredName(stored, '-');
      assert.strictEqual(result.id, 'abc123');
      assert.strictEqual(result.filename, 'document (copy).pdf');
    });

    it('handles custom delimiter (underscore)', () => {
      const stored = 'abc123_report.pdf';
      const result = parseStoredName(stored, '_');
      assert.strictEqual(result.id, 'abc123');
      assert.strictEqual(result.filename, 'report.pdf');
    });

    it('handles custom delimiter (pipe)', () => {
      const stored = 'abc123|data.json';
      const result = parseStoredName(stored, '|');
      assert.strictEqual(result.id, 'abc123');
      assert.strictEqual(result.filename, 'data.json');
    });

    it('returns fallback when no delimiter found', () => {
      const stored = 'invalid-format.pdf';
      const result = parseStoredName(stored, '|');
      // Should return stored name as both id and filename when delimiter not found
      assert.strictEqual(result.id, 'invalid-format.pdf');
      assert.strictEqual(result.filename, 'invalid-format.pdf');
    });

    it('handles filename with multiple delimiters correctly', () => {
      const stored = 'abc-def-ghi-report-2024-final.pdf';
      const result = parseStoredName(stored, '-');
      // Should parse by FIRST delimiter
      assert.strictEqual(result.id, 'abc');
      assert.strictEqual(result.filename, 'def-ghi-report-2024-final.pdf');
    });
  });
});
