import { composeMiddleware, createLoggingMiddleware, findConfigPath, parseConfig, registerTools } from '@mcp-z/server';
import assert from 'assert';

describe('exports .ts', () => {
  it('named exports resolve', () => {
    for (const fn of [findConfigPath, parseConfig, registerTools, composeMiddleware, createLoggingMiddleware]) assert.equal(typeof fn, 'function');
  });
});
