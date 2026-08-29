const assert = require('assert');
const { composeMiddleware, createLoggingMiddleware, findConfigPath, parseConfig, registerTools } = require('@mcp-z/server');

describe('exports .cjs', () => {
  it('named exports resolve', () => {
    for (const fn of [findConfigPath, parseConfig, registerTools, composeMiddleware, createLoggingMiddleware]) assert.equal(typeof fn, 'function');
  });
});
