import { z } from 'zod';

// ============================================================================
// Field Selection Utilities
// ============================================================================

/**
 * Parses comma-separated field list into Set
 * @param fieldsStr - Comma-separated field names or undefined
 * @param availableFields - Array of valid field names
 * @returns Set of requested field names, or 'all' if fieldsStr is undefined
 */
export function parseFields(fieldsStr: string | undefined, availableFields: readonly string[]): Set<string> | 'all' {
  if (!fieldsStr) return 'all';

  const requested = fieldsStr
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean);
  const valid = new Set(requested.filter((f) => availableFields.includes(f)));

  // Always include 'id' field if available
  if (availableFields.includes('id')) valid.add('id');

  return valid.size > 0 ? valid : 'all';
}

/**
 * Filters object to include only requested fields
 * @param item - Object to filter
 * @param fields - Set of field names to include, or 'all'
 * @returns Filtered object with only requested fields
 */
export function filterFields<T extends Record<string, unknown>>(item: T, fields: Set<string> | 'all'): Partial<T> {
  if (fields === 'all') return item;

  const result: Partial<T> = {};
  for (const field of fields) {
    if (field in item) {
      // Cast is safe: field is confirmed to exist in item, and T extends Record<string, unknown>
      result[field as keyof T] = item[field] as T[keyof T];
    }
  }
  return result;
}

/**
 * Creates Zod schema for fields parameter with concise description.
 * The available fields are encoded in the description for contract validation.
 */
export function createFieldsSchema(options: { availableFields: readonly string[]; fieldDescriptions: Record<string, string>; commonPatterns: ReadonlyArray<{ name: string; fields: string; tokens: string }>; resourceName: string }): z.ZodOptional<z.ZodString> {
  const fieldList = options.availableFields.join(', ');
  return z.string().optional().describe(`Comma-separated fields to return. Omit for all fields. Available: ${fieldList}`);
}

/**
 * Schema for pagination parameters (simplified version)
 */
export function createPaginationSchema(options: { defaultPageSize?: number; maxPageSize?: number; provider?: string; description?: string } = {}) {
  const { defaultPageSize = 50, maxPageSize = 200, provider = 'generic', description } = options;

  const defaultDescription = description || `Pagination parameters for controlling result sets (${provider} provider)`;

  return z
    .object({
      pageSize: z.coerce.number().int().positive().max(maxPageSize).optional().default(defaultPageSize).describe(`Number of items per page (default: ${defaultPageSize}, max: ${maxPageSize}). Accepts numbers or numeric strings.`),
      pageToken: z.string().min(1).optional().describe(`Token for retrieving the next page of results (${provider} format). Omit for first page.`),
    })
    .describe(defaultDescription);
}

/**
 * Creates Zod schema for shape parameter controlling response format
 * @returns Zod enum schema for 'objects' | 'arrays'
 */
export function createShapeSchema() {
  return z.enum(['objects', 'arrays']).optional().default('objects').describe('Response shape: objects (keyed) or arrays (columnar, matching fields order)');
}

/**
 * Converts array of objects to columnar format (columns + rows)
 * @param items - Array of objects to convert
 * @param fields - Set of field names to include, or 'all'
 * @param availableFields - Canonical field order when fields is 'all'
 * @returns Object with columns array and rows 2D array
 */
export function toColumnarFormat<T extends Record<string, unknown>>(items: T[], fields: Set<string> | 'all', availableFields: readonly string[]): { columns: string[]; rows: unknown[][] } {
  // Determine column order: use availableFields order, filtered by requested fields
  const columns = fields === 'all' ? [...availableFields] : availableFields.filter((f) => fields.has(f));

  const rows = items.map((item) => columns.map((col) => item[col] ?? null));

  return { columns, rows };
}
