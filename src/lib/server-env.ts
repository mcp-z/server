/**
 * server-env.ts
 *
 * Loads a server's private environment file: the first existing file in
 * [<baseDir>/<name>/<fileName>, ~/.config/mcp-z/<name>/<fileName>]. Values already set in the
 * real environment win over the file; an empty value counts as unset.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { env } from 'portable-env';
import { loadEnv } from 'portable-env/node';
import { SERVER_ENV_DIR } from '../constants.ts';

export type ServerEnvFileName = '.env' | '.env.test';

export interface ServerEnvOptions {
  /** Server name without scope, e.g. 'mcp-gmail'. Names the ~/.config/mcp-z/<name>/ directory. */
  name: string;
  /** Default '.env'. Test loaders pass '.env.test'. */
  fileName?: ServerEnvFileName;
  /** The server's data directory (the `.mcp-z` folder beside the nearest .mcp.json, else in the home directory). */
  baseDir: string;
  /** Default os.homedir(). */
  homeDir?: string;
}

export interface ServerEnvSearch {
  path: string;
  status: 'loaded' | 'missing' | 'not-checked';
}

export interface LoadServerEnvResult {
  /** Path of the file whose values were applied, if any. */
  loaded?: string;
  searched: ServerEnvSearch[];
}

/** The private config file: <homeDir>/.config/mcp-z/<name>/<fileName>. */
export function serverPrivateEnvPath(options: { name: string; fileName?: ServerEnvFileName; homeDir?: string }): string {
  return path.join(options.homeDir ?? os.homedir(), ...SERVER_ENV_DIR, options.name, options.fileName ?? '.env');
}

/** The ordered search list: [<baseDir>/<name>/<fileName>, <homeDir>/.config/mcp-z/<name>/<fileName>]. */
export function serverEnvPaths(options: ServerEnvOptions): string[] {
  const fileName = options.fileName ?? '.env';
  return [path.join(options.baseDir, options.name, fileName), serverPrivateEnvPath({ name: options.name, fileName, homeDir: options.homeDir })];
}

/** Throws when a POSIX file has any group or other permission bit. Windows mode bits do not model ACLs, so it is skipped there. */
export function assertPrivateMode(file: string, mode: number, platform: NodeJS.Platform): void {
  if (platform === 'win32' || (mode & 0o077) === 0) return;
  const octal = (mode & 0o777).toString(8).padStart(4, '0');
  throw new Error(`${file} has mode ${octal}. It can hold client secrets and must be private: chmod 600 "${file}"`);
}

/**
 * Applies the first existing file in serverEnvPaths() to process.env, then restores every key the
 * real environment already had with a non-empty value. Throws, naming the path, on a loose mode,
 * an unreadable file, or a path that is not a regular file. A missing file is not an error.
 */
export function loadServerEnv(options: ServerEnvOptions): LoadServerEnvResult {
  const real: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string' && value !== '') real[key] = value;
  }

  const paths = serverEnvPaths(options);
  const searched: ServerEnvSearch[] = paths.map((p) => ({ path: p, status: 'not-checked' }));
  let loaded: string | undefined;

  for (let i = 0; i < paths.length; i++) {
    const file = paths[i];
    let stat: fs.Stats;
    try {
      stat = fs.statSync(file);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'ENOTDIR') {
        searched[i].status = 'missing';
        continue;
      }
      throw new Error(`Cannot read ${file}: ${code ?? (error as Error).message}`);
    }
    if (!stat.isFile()) throw new Error(`Cannot read ${file}: not a regular file`);
    assertPrivateMode(file, stat.mode, process.platform);
    const result = loadEnv(file);
    if (result.error) throw new Error(`Cannot read ${file}: ${result.error.message}`);
    searched[i].status = 'loaded';
    loaded = file;
    break;
  }

  env(real);
  return { loaded, searched };
}

/** Describes what was searched, for appending to configuration errors. Paths only. */
export function formatServerEnvSearch(result: LoadServerEnvResult): string {
  const labels = { loaded: 'loaded', missing: 'not found', 'not-checked': 'not checked' };
  const lines = result.searched.map((s, i) => `  ${i + 1}. ${s.path}  (${labels[s.status]})`);
  return ['Configuration files searched (the first one found is used; the environment overrides it):', ...lines].join('\n');
}
