import type { PromptModule, ResourceModule, ToolModule } from '../register-modules.ts';

export interface MiddlewareLayer {
  withTool?: (tool: ToolModule) => ToolModule;
  withResource?: (resource: ResourceModule) => ResourceModule;
  withPrompt?: (prompt: PromptModule) => PromptModule;
}

export interface ModuleCollections {
  tools: ToolModule[];
  resources: ResourceModule[];
  prompts: PromptModule[];
}

export function composeMiddleware(modules: ModuleCollections, layers: MiddlewareLayer[]): ModuleCollections {
  return layers.reduce(
    (acc, layer) => ({
      tools: layer.withTool ? acc.tools.map(layer.withTool) : acc.tools,
      resources: layer.withResource ? acc.resources.map(layer.withResource) : acc.resources,
      prompts: layer.withPrompt ? acc.prompts.map(layer.withPrompt) : acc.prompts,
    }),
    modules
  );
}
