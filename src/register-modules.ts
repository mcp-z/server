import type { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AnySchema, ZodRawShapeCompat } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { CallToolResult, ServerNotification, ServerRequest, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import type { ResourceConfig } from './types.ts';

/**
 * Tool config signature - explicit structural type mirroring SDK registerTool config
 *
 * Uses explicit structure instead of Parameters<> extraction to avoid TypeScript inference
 * collapse to 'never' when using ToolModule[] arrays. The deep conditional types from
 * Parameters<> cannot be unified across array elements.
 *
 * Validated against SDK signature for compatibility - compile errors if SDK changes.
 */
export type ToolConfig = {
  title?: string;
  description?: string;
  inputSchema?: ZodRawShapeCompat | AnySchema;
  outputSchema?: ZodRawShapeCompat | AnySchema;
  annotations?: ToolAnnotations;
  _meta?: Record<string, unknown>;
};

// Compile-time validation that ToolConfig is compatible with SDK
type _ValidateToolConfigAssignable = ToolConfig extends Parameters<McpServer['registerTool']>[1] ? true : never;
type _ValidateToolConfigReceivable = Parameters<McpServer['registerTool']>[1] extends ToolConfig ? true : never;

/**
 * Type-safe wrapper for CallToolResult with typed structuredContent.
 * Use in tests to get proper type inference for tool responses.
 *
 * @template T - The output schema type for the tool
 *
 * @example
 * ```typescript
 * const response = await handler(input, extra) as TypedToolResult<Output>;
 * const result = response.structuredContent?.result;
 * // result is properly typed as Output | undefined
 * ```
 */
export type TypedToolResult<T> = Omit<CallToolResult, 'structuredContent'> & {
  structuredContent?: { result: T };
};

/**
 * Tool handler signature with generic support for middleware.
 *
 * @template TArgs - Tool arguments type (default: unknown for SDK compatibility)
 * @template TExtra - Request handler extra type (default: RequestHandlerExtra from SDK)
 *
 * Defaults provide SDK-extracted types for compatibility with MCP SDK.
 * Generic parameters enable type-safe middleware transformation.
 */
export type ToolHandler<TArgs = unknown, TExtra = RequestHandlerExtra<ServerRequest, ServerNotification>> = (args: TArgs, extra: TExtra) => Promise<CallToolResult>;

export type ResourceHandler = Parameters<McpServer['registerResource']>[3];
export type PromptHandler = Parameters<McpServer['registerPrompt']>[2];

/**
 * Prompt config signature - explicit structural type mirroring SDK registerPrompt config
 *
 * Uses explicit structure to avoid TypeScript inference issues with array types.
 * Validated against SDK signature for compatibility.
 */
export type PromptConfig = {
  title?: string;
  description?: string;
  argsSchema?: ZodRawShapeCompat;
};

// Compile-time validation
type _ValidatePromptConfigAssignable = PromptConfig extends Parameters<McpServer['registerPrompt']>[1] ? true : never;
type _ValidatePromptConfigReceivable = Parameters<McpServer['registerPrompt']>[1] extends PromptConfig ? true : never;

/**
 * Tool module interface with bounded generics.
 *
 * @template TConfig - Tool config type (default: SDK ToolConfig)
 * @template THandler - Handler function type (default: ToolHandler)
 *
 * Use without generics for SDK-typed tools:
 * - Business tool factories: `ToolModule`
 * - Tool registration: `ToolModule[]`
 *
 * Use with generics for middleware transformation:
 * - Auth middleware: `ToolModule<ToolConfig, ToolHandler<TArgs, EnrichedExtra>>`
 *
 * The bounds ensure compatibility with SDK registration.
 * Tools are created via factory functions that inject dependencies via closure.
 *
 * Note: Handler uses `unknown` by default to avoid contravariance issues when
 * specific handler types are inferred via `satisfies` pattern. The SDK validates
 * handlers at runtime.
 */
export interface ToolModule<TConfig = ToolConfig, THandler = unknown> {
  name: string;
  config: TConfig;
  handler: THandler;
}

/**
 * Resource module interface - context-free
 * Resources are created via factory functions that inject dependencies via closure
 *
 * Note: Handler uses `unknown` to avoid contravariance issues with specific
 * variable types inferred via `satisfies` pattern.
 */
export interface ResourceModule {
  name: string;
  template?: ResourceTemplate; // SDK ResourceTemplate class instance
  config?: ResourceConfig;
  handler: unknown;
}

/**
 * Prompt module interface - context-free
 * Prompts are created via factory functions for consistency with tools/resources
 *
 * Note: Handler uses `unknown` to avoid contravariance issues.
 */
export interface PromptModule {
  name: string;
  config: PromptConfig;
  handler: unknown;
}

export type ToolFactory<TDeps extends unknown[] = unknown[]> = (...deps: TDeps) => ToolModule;
export type ResourceFactory<TDeps extends unknown[] = unknown[]> = (...deps: TDeps) => ResourceModule;
export type PromptFactory<TDeps extends unknown[] = unknown[]> = (...deps: TDeps) => PromptModule;

export function registerTools(server: McpServer, tools: ToolModule[]): void {
  for (const tool of tools) {
    server.registerTool(tool.name, tool.config, tool.handler as ToolHandler);
  }
}

export function registerResources(server: McpServer, resources: ResourceModule[]): void {
  for (const resource of resources) {
    if (!resource.template) {
      throw new Error(`Resource "${resource.name}" must have a template`);
    }
    server.registerResource(resource.name, resource.template, resource.config ?? {}, resource.handler as ResourceHandler);
  }
}

export function registerPrompts(server: McpServer, prompts: PromptModule[]): void {
  for (const prompt of prompts) {
    server.registerPrompt(prompt.name, prompt.config, prompt.handler as PromptHandler);
  }
}
