/**
 * Logging Middleware - Injects logger into tool/resource/prompt handlers
 *
 * Separation of Concerns: OAuth providers handle authentication,
 * logging middleware handles logger injection separately.
 */

import type { Logger } from '../types.ts';

/**
 * Logging middleware configuration
 */
export interface LoggingMiddlewareOptions {
  /** Logger instance to inject into handler extra */
  logger: Logger;
}

/**
 * Create logging middleware that injects logger into EnrichedExtra
 *
 * @param options - Logger to inject
 * @returns Object with withToolLogging, withResourceLogging, withPromptLogging methods
 *
 * @example
 * ```typescript
 * const loggingMiddleware = createLoggingMiddleware({ logger });
 *
 * const tools = Object.values(toolFactories)
 *   .map(f => f())
 *   .map(authMiddleware.withToolAuth)           // Auth middleware first
 *   .map(loggingMiddleware.withToolLogging);    // Logging middleware second
 *
 * const resources = Object.values(resourceFactories)
 *   .map(f => f())
 *   .map(authMiddleware.withResourceAuth)
 *   .map(loggingMiddleware.withResourceLogging);
 * ```
 */
export function createLoggingMiddleware(options: LoggingMiddlewareOptions) {
  const { logger } = options;

  // Shared wrapper logic - extracts extra parameter from specified position
  const wrapAtPosition = <T extends { name: string; handler: unknown; [key: string]: unknown }>(module: T, extraPosition: number): T => {
    const originalHandler = module.handler as (...args: unknown[]) => Promise<unknown>;

    const wrappedHandler = async (...allArgs: unknown[]) => {
      // Extract extra from the correct position
      const extra = allArgs[extraPosition];

      // Inject logger into extra
      (extra as { logger?: Logger }).logger = logger;

      // Call original handler with all args
      return await originalHandler(...allArgs);
    };

    return {
      ...module,
      handler: wrappedHandler,
    } as T;
  };

  return {
    // Use structural constraints to avoid contravariance check on handler type.
    // Generic T captures actual specific type, `as T` preserves it through transformation.
    withToolLogging: <T extends { name: string; config: unknown; handler: unknown }>(module: T): T => wrapAtPosition(module, 1) as T,
    withResourceLogging: <T extends { name: string; template?: unknown; config?: unknown; handler: unknown }>(module: T): T => wrapAtPosition(module, 2) as T,
    withPromptLogging: <T extends { name: string; config: unknown; handler: unknown }>(module: T): T => wrapAtPosition(module, 0) as T,
  };
}
