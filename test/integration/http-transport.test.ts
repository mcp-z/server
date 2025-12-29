/**
 * Integration tests for setupMcpTransports() with HTTP transport
 *
 * Validates @mcp-z/server's HTTP transport orchestration by:
 * - Spawning echo server using setupMcpTransports() with HTTP
 * - Connecting MCP clients via HTTP
 * - Testing tool/resource/prompt registration over HTTP
 * - Verifying graceful shutdown
 */

import { createServerRegistry, type ManagedClient, type ServerRegistry, type ServersConfig } from '@mcp-z/client';
import assert from 'assert';
import getPort from 'get-port';

describe('HTTP transport', () => {
  let cluster: ServerRegistry | undefined;
  const clients: ManagedClient[] = [];
  let port: number;
  let url: string;

  before(async () => {
    // Get available port dynamically
    port = await getPort();
    url = `http://localhost:${port}/mcp`;

    // Spawn HTTP echo server using @mcp-z/client infrastructure
    const config: ServersConfig = {
      'echo-server': {
        type: 'http',
        url,
        start: {
          command: 'node',
          args: ['test/lib/servers/echo-server-http.ts', '--port', String(port)],
        },
      },
    };
    cluster = createServerRegistry(config, { cwd: process.cwd(), dialects: ['start'] });

    // Wait for HTTP server to be ready by connecting
    const testClient = await cluster.connect('echo-server');
    await testClient.close();
  });

  after(async () => {
    for (const client of clients.slice()) {
      if (client) await client.close();
    }

    if (cluster) await cluster.close();
  });

  it('should connect to HTTP server', async () => {
    const client = await cluster.connect('echo-server');
    clients.push(client);

    assert.ok(client, 'Client should be created');

    // Verify client is functional
    const result = await client.listTools();
    assert.ok(result.tools, 'Should receive tools list');
    assert.ok(Array.isArray(result.tools), 'Tools should be an array');
  });

  it('should list echo tool', async () => {
    const client = await cluster.connect('echo-server');
    clients.push(client);

    const tools = await client.listTools();
    const echoTool = tools.tools.find((t) => t.name === 'echo');

    assert.ok(echoTool, 'Should have echo tool');
    assert.strictEqual(echoTool.name, 'echo');
    assert.strictEqual(echoTool.description, 'Echoes back the provided message');
    assert.ok(echoTool.inputSchema, 'Should have input schema');
  });

  it('should list echo resource', async () => {
    const client = await cluster.connect('echo-server');
    clients.push(client);

    const resources = await client.listResources();
    const echoResource = resources.resources.find((r) => r.name === 'echo');

    assert.ok(echoResource, 'Should have echo resource');
    assert.strictEqual(echoResource.name, 'echo');
    assert.strictEqual(echoResource.description, 'Echoes back messages as resources');
    assert.strictEqual(echoResource.mimeType, 'text/plain');
  });

  it('should list echo prompt', async () => {
    const client = await cluster.connect('echo-server');
    clients.push(client);

    const prompts = await client.listPrompts();
    const echoPrompt = prompts.prompts.find((p) => p.name === 'echo');

    assert.ok(echoPrompt, 'Should have echo prompt');
    assert.strictEqual(echoPrompt.name, 'echo');
    assert.strictEqual(echoPrompt.description, 'Creates a prompt to process a message');
  });

  it('should call echo tool successfully', async () => {
    const client = await cluster.connect('echo-server');
    clients.push(client);

    const response = await client.callTool({
      name: 'echo',
      arguments: { message: 'test-message' },
    });

    const textContent = response.text();
    const parsed = JSON.parse(textContent);
    assert.strictEqual(parsed.echo, 'Tool echo: test-message');

    // Verify structuredContent if present
    const raw = response.raw();
    if (raw.structuredContent) {
      const content = raw.structuredContent as { echo: string };
      assert.strictEqual(content.echo, 'Tool echo: test-message');
    }
  });

  it('should read echo resource successfully', async () => {
    const client = await cluster.connect('echo-server');
    clients.push(client);

    const resource = await client.readResource({ uri: 'echo://hello-world' });
    const text = resource.text();
    assert.ok(text.includes('Resource echo: hello-world'), 'Should echo message in resource');

    const raw = resource.raw();
    assert.ok(raw.contents.length > 0, 'Should have contents');
    const content = raw.contents[0];
    assert.ok(content, 'Contents should have first element');
    assert.strictEqual(content.uri, 'echo://hello-world');
  });

  it('should get echo prompt successfully', async () => {
    const client = await cluster.connect('echo-server');
    clients.push(client);

    const prompt = await client.getPrompt({
      name: 'echo',
      arguments: { message: 'test-prompt' },
    });

    const text = prompt.text();
    assert.ok(text.includes('test-prompt'), 'Should include message in prompt');

    const raw = prompt.raw();
    assert.ok(raw.messages.length > 0, 'Should have messages');
    const message = raw.messages[0];
    assert.ok(message, 'Messages should have first element');
    assert.strictEqual(message.role, 'user');
    if ('text' in message.content) {
      assert.ok(message.content.text?.includes('test-prompt'), 'Should include message in prompt');
    }
  });

  it('should handle concurrent connections', async () => {
    const [c1, c2, c3] = await Promise.all([cluster.connect('echo-server'), cluster.connect('echo-server'), cluster.connect('echo-server')]);

    clients.push(c1, c2, c3);

    assert.ok(c1, 'First connection should succeed');
    assert.ok(c2, 'Second connection should succeed');
    assert.ok(c3, 'Third connection should succeed');

    // Verify all connections are functional
    const results = await Promise.all([c1.listTools(), c2.listTools(), c3.listTools()]);

    for (const result of results) {
      assert.ok(result.tools.length > 0, 'Each connection should list tools');
    }
  });

  it('should handle tool calls from multiple clients concurrently', async () => {
    const client1 = await cluster.connect('echo-server');
    const client2 = await cluster.connect('echo-server');
    clients.push(client1, client2);

    const [result1, result2] = await Promise.all([client1.callTool({ name: 'echo', arguments: { message: 'client1' } }), client2.callTool({ name: 'echo', arguments: { message: 'client2' } })]);

    // Verify each client got its own response
    const text1 = result1.json<{ echo: string }>();
    const text2 = result2.json<{ echo: string }>();

    assert.strictEqual(text1.echo, 'Tool echo: client1');
    assert.strictEqual(text2.echo, 'Tool echo: client2');
  });

  // Error scenario tests
  it('should handle invalid tool name gracefully', async () => {
    const client = await cluster.connect('echo-server');
    clients.push(client);

    const result = await client.callToolRaw({ name: 'nonexistent-tool', arguments: {} });
    assert.ok(result.isError, 'Should return error result for unknown tool');
    assert.ok(result.content);
    const firstContent = (result.content as unknown[])[0] as { text?: string } | undefined;
    assert.ok(firstContent, 'Content should have first element');
    assert.ok(firstContent.text?.includes('Tool nonexistent-tool not found'));
  });

  it('should handle invalid resource URI gracefully', async () => {
    const client = await cluster.connect('echo-server');
    clients.push(client);

    await assert.rejects(
      async () => {
        await client.readResource({ uri: 'invalid://uri' });
      },
      /./,
      'Should reject with error for invalid resource URI'
    );
  });

  it('should handle missing required arguments gracefully', async () => {
    const client = await cluster.connect('echo-server');
    clients.push(client);

    const result = await client.callToolRaw({ name: 'echo', arguments: {} });
    assert.ok(result.isError, 'Should return error result for missing required arguments');
    assert.ok(result.content);
    const firstContent = (result.content as unknown[])[0] as { text?: string } | undefined;
    assert.ok(firstContent, 'Content should have first element');
    assert.ok(firstContent.text?.includes('Input validation error'));
  });

  // TDD Test: Verify z.object({ result: ... }) outputSchema pattern works correctly
  // This mimics the mcp-sheets pattern that's failing in mcp-workflows integration tests
  it('should validate structuredContent with z.object wrapped outputSchema (mcp-sheets pattern)', async () => {
    const client = await cluster.connect('echo-server');
    clients.push(client);

    // Call the wrapped-result tool that uses z.object({ result: discriminatedUnion })
    const response = await client.callTool({
      name: 'wrapped-result',
      arguments: { message: 'test-wrapped' },
    });

    // This should NOT return an error - the structuredContent should match the outputSchema
    const raw = response.raw();
    assert.ok(!raw.isError, `Should succeed, but got error: ${JSON.stringify(raw.content)}`);
    assert.ok(raw.content);
    assert.ok(Array.isArray(raw.content));
    assert.ok(raw.content.length > 0);

    // Verify structuredContent is present and has the expected structure
    assert.ok(raw.structuredContent, 'structuredContent should be present');
    const structured = raw.structuredContent as { result: { type: string; message: string } };
    assert.ok(structured.result, 'structuredContent.result should exist');
    assert.strictEqual(structured.result.type, 'success');
    assert.ok(structured.result.message.includes('test-wrapped'));
  });
});
