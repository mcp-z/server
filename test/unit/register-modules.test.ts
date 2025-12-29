/**
 * Unit tests for module registration functions
 *
 * Tests registerTools(), registerResources(), and registerPrompts()
 * to ensure correct delegation to McpServer registration methods.
 */

import { type McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import assert from 'assert';
import { type PromptModule, type ResourceModule, registerPrompts, registerResources, registerTools, type ToolModule } from '../../src/register-modules.ts';

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
      const tools: ToolModule[] = [
        {
          name: 'test-tool',
          config: { inputSchema: {}, outputSchema: {} },
          handler,
        },
      ];

      registerTools(server, tools);

      assert.strictEqual(calls.tools.length, 1);
      const firstTool = calls.tools[0];
      assert.ok(firstTool, 'Should have first tool');
      assert.strictEqual(firstTool.name, 'test-tool');
      assert.deepStrictEqual(firstTool.config, { inputSchema: {}, outputSchema: {} });
      assert.strictEqual(firstTool.handler, handler);
    });

    it('registers multiple tool modules', () => {
      const { server, calls } = createMockServer();
      const handler1 = async () => ({ content: [] });
      const handler2 = async () => ({ content: [] });
      const tools: ToolModule[] = [
        {
          name: 'tool-1',
          config: { inputSchema: {}, outputSchema: {} },
          handler: handler1,
        },
        {
          name: 'tool-2',
          config: { inputSchema: {}, outputSchema: {} },
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
});
