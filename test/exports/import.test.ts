import { composeMiddleware, createLoggingMiddleware, findConfigPath, McpError, ProtocolError, parseConfig, type RequestHandlerExtra, registerTools } from '@mcp-z/server';
import assert from 'assert';

describe('exports .ts', () => {
  it('named exports resolve', () => {
    for (const fn of [findConfigPath, parseConfig, registerTools, composeMiddleware, createLoggingMiddleware]) assert.equal(typeof fn, 'function');
  });

  // The 1.x end-of-life bridge. This release is 2.x code, so a consumer's existing
  // `McpError` / `RequestHandlerExtra` imports must still resolve and behave - that is the
  // whole claim the final 1.x makes. Delete with the bridge.
  it('resolves the 1.x names through their 2.x aliases', () => {
    assert.strictEqual(McpError, ProtocolError, 'McpError must alias ProtocolError');

    const error = new McpError(-32603, 'boom', { detail: 1 });
    assert.ok(error instanceof McpError, 'instanceof must survive the alias');
    assert.strictEqual(error.code, -32603);
    assert.deepStrictEqual(error.data, { detail: 1 });
    assert.strictEqual(error.message, 'boom');
    assert.strictEqual(typeof McpError.fromError, 'function', '1.x exposed a static fromError');

    // Type-only: this file failing to compile is the assertion for RequestHandlerExtra.
    const extra: RequestHandlerExtra | undefined = undefined;
    assert.strictEqual(extra, undefined);
  });
});
