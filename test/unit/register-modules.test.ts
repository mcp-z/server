/**
 * Unit tests for module registration functions
 *
 * Tests registerTools(), registerResources(), and registerPrompts()
 * to ensure correct delegation to McpServer registration methods.
 */

import { type PromptModule, type ResourceModule, registerPrompts, registerResources, registerTools, type ToolModule } from '@mcp-z/server';
import { type McpServer, ResourceTemplate } from '@modelcontextprotocol/server';
import assert from 'assert';
import { z } from 'zod';

/**
 * Mock McpServer that tracks registration calls
 */
function createMockServer() {
  const calls: {
    tools: Array<{ name: string; config: unknown; handler: unknown }>;
    resources: Array<{ name: string; template: unknown; config: unknown; handler: unknown }>;
    prompts: Array<{ name: string; config: unknown; handler: unknown }>;
  } = {
    tools: [],
    resources: [],
    prompts: [],
  };

  const server = {
    registerTool(name: string, config: unknown, handler: unknown) {
      calls.tools.push({ name, config, handler });
    },
    registerResource(name: string, template: unknown, config: unknown, handler: unknown) {
      calls.resources.push({ name, template, config, handler });
    },
    registerPrompt(name: string, config: unknown, handler: unknown) {
      calls.prompts.push({ name, config, handler });
    },
  } as unknown as McpServer;

  return { server, calls };
}

describe('register-modules', () => {
  describe('registerTools()', () => {
    it('registers single tool module', () => {
      const { server, calls } = createMockServer();
      const handler = async () => ({ content: [] });
      const config = { inputSchema: z.object({}), outputSchema: z.object({}) };
      const tools: ToolModule[] = [
        {
          name: 'test-tool',
          config,
          handler,
        },
      ];

      registerTools(server, tools);

      assert.strictEqual(calls.tools.length, 1);
      const firstTool = calls.tools[0];
      assert.ok(firstTool, 'Should have first tool');
      assert.strictEqual(firstTool.name, 'test-tool');
      assert.strictEqual(firstTool.config, config);
      assert.strictEqual(firstTool.handler, handler);
    });

    it('registers multiple tool modules', () => {
      const { server, calls } = createMockServer();
      const handler1 = async () => ({ content: [] });
      const handler2 = async () => ({ content: [] });
      const tools: ToolModule[] = [
        {
          name: 'tool-1',
          config: { inputSchema: z.object({}), outputSchema: z.object({}) },
          handler: handler1,
        },
        {
          name: 'tool-2',
          config: { inputSchema: z.object({}), outputSchema: z.object({}) },
          handler: handler2,
        },
      ];

      registerTools(server, tools);

      assert.strictEqual(calls.tools.length, 2);
      const firstTool = calls.tools[0];
      const secondTool = calls.tools[1];
      assert.ok(firstTool, 'Should have first tool');
      assert.ok(secondTool, 'Should have second tool');
      assert.strictEqual(firstTool.name, 'tool-1');
      assert.strictEqual(firstTool.handler, handler1);
      assert.strictEqual(secondTool.name, 'tool-2');
      assert.strictEqual(secondTool.handler, handler2);
    });

    it('handles empty tools array', () => {
      const { server, calls } = createMockServer();

      registerTools(server, []);

      assert.strictEqual(calls.tools.length, 0);
    });
  });

  describe('registerResources()', () => {
    it('registers single resource module with config', () => {
      const { server, calls } = createMockServer();
      const handler = async () => ({ contents: [] });
      const template = new ResourceTemplate('test://{id}', { list: async () => ({ resources: [] }) });
      const resources: ResourceModule[] = [
        {
          name: 'test-resource',
          template,
          config: { description: 'Test resource' },
          handler,
        },
      ];

      registerResources(server, resources);

      assert.strictEqual(calls.resources.length, 1);
      const firstResource = calls.resources[0];
      assert.ok(firstResource, 'Should have first resource');
      assert.strictEqual(firstResource.name, 'test-resource');
      assert.strictEqual(firstResource.template, template);
      assert.deepStrictEqual(firstResource.config, { description: 'Test resource' });
      assert.strictEqual(firstResource.handler, handler);
    });

    it('registers resource module without config (defaults to empty object)', () => {
      const { server, calls } = createMockServer();
      const handler = async () => ({ contents: [] });
      const template = new ResourceTemplate('test://{id}', { list: async () => ({ resources: [] }) });
      const resources: ResourceModule[] = [
        {
          name: 'test-resource',
          template,
          handler,
        },
      ];

      registerResources(server, resources);

      assert.strictEqual(calls.resources.length, 1);
      const firstResource = calls.resources[0];
      assert.ok(firstResource, 'Should have first resource');
      assert.strictEqual(firstResource.name, 'test-resource');
      assert.strictEqual(firstResource.template, template);
      assert.deepStrictEqual(firstResource.config, {});
      assert.strictEqual(firstResource.handler, handler);
    });

    it('registers multiple resource modules', () => {
      const { server, calls } = createMockServer();
      const handler1 = async () => ({ contents: [] });
      const handler2 = async () => ({ contents: [] });
      const template1 = new ResourceTemplate('test1://{id}', { list: async () => ({ resources: [] }) });
      const template2 = new ResourceTemplate('test2://{id}', { list: async () => ({ resources: [] }) });
      const resources: ResourceModule[] = [
        {
          name: 'resource-1',
          template: template1,
          config: { description: 'First' },
          handler: handler1,
        },
        {
          name: 'resource-2',
          template: template2,
          handler: handler2,
        },
      ];

      registerResources(server, resources);

      assert.strictEqual(calls.resources.length, 2);
      const firstResource = calls.resources[0];
      const secondResource = calls.resources[1];
      assert.ok(firstResource, 'Should have first resource');
      assert.ok(secondResource, 'Should have second resource');
      assert.strictEqual(firstResource.name, 'resource-1');
      assert.strictEqual(firstResource.handler, handler1);
      assert.deepStrictEqual(firstResource.config, { description: 'First' });
      assert.strictEqual(secondResource.name, 'resource-2');
      assert.strictEqual(secondResource.handler, handler2);
      assert.deepStrictEqual(secondResource.config, {});
    });

    it('handles empty resources array', () => {
      const { server, calls } = createMockServer();

      registerResources(server, []);

      assert.strictEqual(calls.resources.length, 0);
    });
  });

  describe('registerPrompts()', () => {
    it('registers single prompt module', () => {
      const { server, calls } = createMockServer();
      const handler = async () => ({ messages: [] });
      const prompts: PromptModule[] = [
        {
          name: 'test-prompt',
          config: { argsSchema: {} },
          handler,
        },
      ];

      registerPrompts(server, prompts);

      assert.strictEqual(calls.prompts.length, 1);
      const firstPrompt = calls.prompts[0];
      assert.ok(firstPrompt, 'Should have first prompt');
      assert.strictEqual(firstPrompt.name, 'test-prompt');
      assert.deepStrictEqual(firstPrompt.config, { argsSchema: {} });
      assert.strictEqual(firstPrompt.handler, handler);
    });

    it('registers multiple prompt modules', () => {
      const { server, calls } = createMockServer();
      const handler1 = async () => ({ messages: [] });
      const handler2 = async () => ({ messages: [] });
      const prompts: PromptModule[] = [
        {
          name: 'prompt-1',
          config: { argsSchema: {} },
          handler: handler1,
        },
        {
          name: 'prompt-2',
          config: { argsSchema: {} },
          handler: handler2,
        },
      ];

      registerPrompts(server, prompts);

      assert.strictEqual(calls.prompts.length, 2);
      const firstPrompt = calls.prompts[0];
      const secondPrompt = calls.prompts[1];
      assert.ok(firstPrompt, 'Should have first prompt');
      assert.ok(secondPrompt, 'Should have second prompt');
      assert.strictEqual(firstPrompt.name, 'prompt-1');
      assert.strictEqual(firstPrompt.handler, handler1);
      assert.strictEqual(secondPrompt.name, 'prompt-2');
      assert.strictEqual(secondPrompt.handler, handler2);
    });

    it('handles empty prompts array', () => {
      const { server, calls } = createMockServer();

      registerPrompts(server, []);

      assert.strictEqual(calls.prompts.length, 0);
    });
  });
  describe('deterministic ordering', () => {
    const noopHandler = async () => ({ content: [] });
    const toolConfig = { inputSchema: z.object({}), outputSchema: z.object({}) };

    const makeTools = (names: string[]): ToolModule[] => names.map((name) => ({ name, config: toolConfig, handler: noopHandler }));
    const makePrompts = (names: string[]): PromptModule[] => names.map((name) => ({ name, config: { argsSchema: {} }, handler: noopHandler }));
    const makeResources = (names: string[]): ResourceModule[] => names.map((name) => ({ name, template: new ResourceTemplate(`test://${name}/{id}`, { list: undefined }), handler: noopHandler }));

    it('registers tools in name order regardless of array order', () => {
      const { server, calls } = createMockServer();

      registerTools(server, makeTools(['zebra', 'alpha', 'monkey']));

      assert.deepStrictEqual(
        calls.tools.map((t) => t.name),
        ['alpha', 'monkey', 'zebra']
      );
    });

    it('registers resources in name order regardless of array order', () => {
      const { server, calls } = createMockServer();

      registerResources(server, makeResources(['zebra', 'alpha', 'monkey']));

      assert.deepStrictEqual(
        calls.resources.map((r) => r.name),
        ['alpha', 'monkey', 'zebra']
      );
    });

    it('registers prompts in name order regardless of array order', () => {
      const { server, calls } = createMockServer();

      registerPrompts(server, makePrompts(['zebra', 'alpha', 'monkey']));

      assert.deepStrictEqual(
        calls.prompts.map((p) => p.name),
        ['alpha', 'monkey', 'zebra']
      );
    });

    // The guarantee a 2026-07-28 client depends on: two servers built from the
    // same set of modules list them identically, so a cached tools/list stays
    // valid across a reconnect that happens to assemble the array differently.
    it('produces the same order across two separate server constructions', () => {
      const first = createMockServer();
      const second = createMockServer();

      registerTools(first.server, makeTools(['delta', 'alpha', 'charlie', 'bravo']));
      registerTools(second.server, makeTools(['bravo', 'charlie', 'delta', 'alpha']));

      assert.deepStrictEqual(
        first.calls.tools.map((t) => t.name),
        second.calls.tools.map((t) => t.name)
      );
    });

    it('does not mutate the caller array', () => {
      const { server } = createMockServer();
      const tools = makeTools(['zebra', 'alpha']);

      registerTools(server, tools);

      assert.deepStrictEqual(
        tools.map((t) => t.name),
        ['zebra', 'alpha']
      );
    });
  });
});
