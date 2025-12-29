import assert from 'assert';
import { parseConfig } from '../../../src/transports/parse-config.ts';

describe('transports/parse-config', () => {
  describe('parseConfig()', () => {
    it('returns stdio transport by default', () => {
      const config = parseConfig([], {});

      assert.strictEqual(config.transport.type, 'stdio');
    });

    it('returns HTTP transport when --port provided', () => {
      const config = parseConfig(['--port=3000'], {});

      assert.strictEqual(config.transport.type, 'http');
      assert.strictEqual(config.transport.port, 3000);
      assert.strictEqual(config.port, 3000);
    });

    it('returns stdio transport when --stdio flag provided', () => {
      const config = parseConfig(['--stdio'], {});

      assert.strictEqual(config.transport.type, 'stdio');
    });

    it('prefers stdio when both --stdio and --port provided', () => {
      const config = parseConfig(['--stdio', '--port=3000'], {});

      assert.strictEqual(config.transport.type, 'stdio');
    });

    it('handles empty args array', () => {
      const config = parseConfig([], {});

      assert.ok(config);
      assert.ok(config.transport);
    });

    it('handles empty env object', () => {
      const config = parseConfig([], {});

      assert.ok(config);
      assert.ok(config.transport);
    });

    it('parses port from string to number', () => {
      const config = parseConfig(['--port=4567'], {});

      assert.strictEqual(typeof config.port, 'number');
      assert.strictEqual(config.port, 4567);
      assert.strictEqual(config.transport.type, 'http');
      assert.strictEqual(config.transport.port, 4567);
    });
  });
});
