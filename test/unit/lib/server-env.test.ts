/**
 * Unit tests for the per-server environment file search.
 *
 * Every case passes `baseDir` and `homeDir` under a scratch root, so the real home
 * directory and any real project directory are never read.
 */

import assert from 'assert';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import { safeRmSync } from 'fs-remove-compat';
import * as os from 'os';
import * as path from 'path';
import { assertPrivateMode, formatServerEnvSearch, loadServerEnv, serverEnvPaths, serverPrivateEnvPath } from '../../../src/lib/server-env.ts';

const NAME = 'mcp-gmail';
const SCRATCH = path.join(process.cwd(), '.tmp', `server-env-${randomUUID()}`);
const BASE = path.join(SCRATCH, 'project', '.mcp-z');
const HOME = path.join(SCRATCH, 'home');
const BASE_FILE = path.join(BASE, NAME, '.env');
const HOME_FILE = path.join(HOME, '.config', 'mcp-z', NAME, '.env');
const KEY = (suffix: string) => `MCPZ_SE_${SCRATCH.slice(-8).replace(/-/g, '')}_${suffix}`;

function write(file: string, lines: string[], mode = 0o600): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${lines.join('\n')}\n`, { mode });
  fs.chmodSync(file, mode);
}

describe('lib/server-env', () => {
  const touched = new Set<string>();
  const options = { name: NAME, baseDir: BASE, homeDir: HOME };
  const setKey = (key: string, value: string) => {
    touched.add(key);
    process.env[key] = value;
  };

  beforeEach(() => {
    safeRmSync(SCRATCH, { recursive: true, force: true });
    fs.mkdirSync(BASE, { recursive: true });
    fs.mkdirSync(HOME, { recursive: true });
  });

  afterEach(() => {
    for (const key of ['A', 'B', 'C', 'D']) touched.add(KEY(key));
    for (const key of touched) delete process.env[key];
    touched.clear();
    safeRmSync(SCRATCH, { recursive: true, force: true });
  });

  describe('serverPrivateEnvPath', () => {
    it('builds <home>/.config/mcp-z/<name>/.env by default', () => {
      assert.strictEqual(serverPrivateEnvPath({ name: NAME, homeDir: HOME }), HOME_FILE);
    });

    it('takes a file name', () => {
      assert.strictEqual(serverPrivateEnvPath({ name: NAME, fileName: '.env.test', homeDir: HOME }), path.join(HOME, '.config', 'mcp-z', NAME, '.env.test'));
    });

    it('defaults the home directory to os.homedir()', () => {
      assert.strictEqual(serverPrivateEnvPath({ name: NAME }), path.join(os.homedir(), '.config', 'mcp-z', NAME, '.env'));
    });
  });

  describe('serverEnvPaths', () => {
    it('lists the data directory file, then the private config file', () => {
      assert.deepStrictEqual(serverEnvPaths(options), [BASE_FILE, HOME_FILE]);
    });

    it('uses the same two places for .env.test', () => {
      assert.deepStrictEqual(serverEnvPaths({ ...options, fileName: '.env.test' }), [path.join(BASE, NAME, '.env.test'), path.join(HOME, '.config', 'mcp-z', NAME, '.env.test')]);
    });

    it('defaults the home directory to os.homedir()', () => {
      const [first, second] = serverEnvPaths({ name: NAME, baseDir: BASE });
      assert.strictEqual(first, BASE_FILE);
      assert.strictEqual(second, path.join(os.homedir(), '.config', 'mcp-z', NAME, '.env'));
    });
  });

  describe('loadServerEnv', () => {
    it('reports both paths missing and changes nothing when no file exists', () => {
      const before = { ...process.env };
      const result = loadServerEnv(options);
      assert.strictEqual(result.loaded, undefined);
      assert.deepStrictEqual(result.searched, [
        { path: BASE_FILE, status: 'missing' },
        { path: HOME_FILE, status: 'missing' },
      ]);
      assert.deepStrictEqual({ ...process.env }, before);
    });

    it('applies the private config file when it is the only one', () => {
      write(HOME_FILE, [`${KEY('A')}=from-home`]);
      const result = loadServerEnv(options);
      assert.strictEqual(result.loaded, HOME_FILE);
      assert.strictEqual(process.env[KEY('A')], 'from-home');
      assert.deepStrictEqual(
        result.searched.map((s) => s.status),
        ['missing', 'loaded']
      );
    });

    it('uses the data directory file whole and never reads the home file', () => {
      write(BASE_FILE, [`${KEY('A')}=from-base`]);
      write(HOME_FILE, [`${KEY('A')}=from-home`, `${KEY('B')}=only-home`]);
      const result = loadServerEnv(options);
      assert.strictEqual(result.loaded, BASE_FILE);
      assert.strictEqual(process.env[KEY('A')], 'from-base');
      assert.strictEqual(process.env[KEY('B')], undefined);
      assert.deepStrictEqual(
        result.searched.map((s) => s.status),
        ['loaded', 'not-checked']
      );
    });

    it('keeps a non-empty value already in the environment', () => {
      setKey(KEY('A'), 'real');
      write(HOME_FILE, [`${KEY('A')}=from-file`, `${KEY('C')}=from-file`]);
      loadServerEnv(options);
      assert.strictEqual(process.env[KEY('A')], 'real');
      assert.strictEqual(process.env[KEY('C')], 'from-file');
    });

    it('fills a key that is set to an empty string from the file', () => {
      setKey(KEY('B'), '');
      write(HOME_FILE, [`${KEY('B')}=from-file`]);
      loadServerEnv(options);
      assert.strictEqual(process.env[KEY('B')], 'from-file');
    });

    it('refuses a group- or world-readable file, naming the path and the fix', function () {
      if (process.platform === 'win32') this.skip();
      write(BASE_FILE, [`${KEY('A')}=x`], 0o644);
      assert.throws(
        () => loadServerEnv(options),
        (error: Error) => error.message.includes(BASE_FILE) && error.message.includes('0644') && error.message.includes(`chmod 600 "${BASE_FILE}"`)
      );
      assert.strictEqual(process.env[KEY('A')], undefined);
    });

    it('throws naming the path when the file is a directory', () => {
      fs.mkdirSync(BASE_FILE, { recursive: true });
      assert.throws(
        () => loadServerEnv(options),
        (error: Error) => error.message.includes(BASE_FILE)
      );
    });

    it('does not fall through to the home file when the data directory file is broken', () => {
      fs.mkdirSync(BASE_FILE, { recursive: true });
      write(HOME_FILE, [`${KEY('A')}=from-home`]);
      assert.throws(() => loadServerEnv(options));
      assert.strictEqual(process.env[KEY('A')], undefined);
    });
  });

  describe('assertPrivateMode', () => {
    it('accepts 0600 and 0400 on posix', () => {
      assertPrivateMode('/x/.env', 0o100600, 'linux');
      assertPrivateMode('/x/.env', 0o100400, 'darwin');
    });

    it('refuses any group or other bit on posix', () => {
      for (const mode of [0o100644, 0o100640, 0o100604, 0o100660]) {
        assert.throws(() => assertPrivateMode('/x/.env', mode, 'linux'), /chmod 600 "\/x\/\.env"/);
      }
    });

    it('skips the check on win32', () => {
      assertPrivateMode('C:\\x\\.env', 0o100666, 'win32');
    });
  });

  describe('formatServerEnvSearch', () => {
    it('lists every path with its status and no values', () => {
      write(HOME_FILE, [`${KEY('D')}=super-secret-value`]);
      const text = formatServerEnvSearch(loadServerEnv(options));
      assert.ok(text.includes(`1. ${BASE_FILE}  (not found)`));
      assert.ok(text.includes(`2. ${HOME_FILE}  (loaded)`));
      assert.ok(!text.includes('super-secret-value'));
    });

    it('marks later paths not checked when an earlier file was used', () => {
      write(BASE_FILE, [`${KEY('A')}=x`]);
      const text = formatServerEnvSearch(loadServerEnv(options));
      assert.ok(text.includes(`2. ${HOME_FILE}  (not checked)`));
    });
  });
});
