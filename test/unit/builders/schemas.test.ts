import assert from 'assert';
import { createFieldsSchema, createPaginationSchema, createShapeSchema, filterFields, parseFields, toColumnarFormat } from '../../../src/builders/schemas.ts';

describe('builders/schemas', () => {
  describe('parseFields()', () => {
    const availableFields = ['id', 'name', 'email', 'age'] as const;

    it('returns "all" when fieldsStr is undefined', () => {
      const result = parseFields(undefined, availableFields);
      assert.strictEqual(result, 'all');
    });

    it('returns "all" when fieldsStr is empty string', () => {
      const result = parseFields('', availableFields);
      assert.strictEqual(result, 'all');
    });

    it('parses comma-separated field list', () => {
      const result = parseFields('name,email', availableFields);
      assert.ok(result instanceof Set);
      assert.ok(result.has('name'));
      assert.ok(result.has('email'));
      assert.ok(result.has('id')); // Always includes 'id'
    });

    it('always includes id field when available', () => {
      const result = parseFields('name', availableFields);
      assert.ok(result instanceof Set);
      assert.ok(result.has('id'), 'Should always include id');
      assert.ok(result.has('name'));
    });

    it('filters out invalid fields', () => {
      const result = parseFields('name,invalid,email', availableFields);
      assert.ok(result instanceof Set);
      assert.ok(result.has('name'));
      assert.ok(result.has('email'));
      assert.ok(!result.has('invalid'));
    });

    it('trims whitespace from field names', () => {
      const result = parseFields(' name , email ', availableFields);
      assert.ok(result instanceof Set);
      assert.ok(result.has('name'));
      assert.ok(result.has('email'));
    });

    it('returns Set with id when only invalid fields requested', () => {
      const result = parseFields('invalid1,invalid2', availableFields);
      assert.ok(result instanceof Set);
      assert.ok(result.has('id')); // Always includes 'id' when available
      assert.strictEqual(result.size, 1); // Only 'id', no invalid fields
    });

    it('handles fields without id in available list', () => {
      const fieldsWithoutId = ['name', 'email'];
      const result = parseFields('name', fieldsWithoutId);
      assert.ok(result instanceof Set);
      assert.ok(result.has('name'));
      assert.ok(!result.has('id')); // id not in available fields
    });

    it('returns "all" when no id available and no valid fields requested', () => {
      const fieldsWithoutId = ['name', 'email'];
      const result = parseFields('invalid', fieldsWithoutId);
      assert.strictEqual(result, 'all'); // No valid fields and no id to add
    });
  });

  describe('filterFields()', () => {
    const item = {
      id: '1',
      name: 'John',
      email: 'john@example.com',
      age: 30,
    };

    it('returns full object when fields is "all"', () => {
      const result = filterFields(item, 'all');
      assert.deepStrictEqual(result, item);
    });

    it('filters object to requested fields', () => {
      const fields = new Set(['id', 'name']);
      const result = filterFields(item, fields);

      assert.strictEqual(result.id, '1');
      assert.strictEqual(result.name, 'John');
      assert.strictEqual(result.email, undefined);
      assert.strictEqual(result.age, undefined);
    });

    it('handles empty field set', () => {
      const fields = new Set<string>();
      const result = filterFields(item, fields);

      assert.deepStrictEqual(result, {});
    });

    it('ignores fields not in object', () => {
      const fields = new Set(['id', 'nonexistent']);
      const result = filterFields(item, fields);

      assert.strictEqual(result.id, '1');
      assert.strictEqual(Reflect.get(result, 'nonexistent'), undefined);
    });
  });

  describe('createFieldsSchema()', () => {
    const options = {
      availableFields: ['id', 'name', 'email'] as const,
      fieldDescriptions: {
        id: 'Unique identifier',
        name: 'Full name',
        email: 'Email address',
      },
      commonPatterns: [
        { name: 'Minimal', fields: 'id,name', tokens: '~20 tokens' },
        { name: 'Full', fields: 'id,name,email', tokens: '~40 tokens' },
      ],
      resourceName: 'user',
    };

    it('creates optional string schema', () => {
      const schema = createFieldsSchema(options);
      const data = schema.parse(undefined);
      assert.strictEqual(data, undefined);
    });

    it('accepts comma-separated field list', () => {
      const schema = createFieldsSchema(options);
      const data = schema.parse('id,name,email');
      assert.strictEqual(data, 'id,name,email');
    });

    it('has concise description', () => {
      const schema = createFieldsSchema(options);
      const description = schema.description;

      assert.ok(description?.includes('Comma-separated fields'));
      assert.ok(description?.includes('Omit for all fields'));
    });
  });

  describe('createPaginationSchema()', () => {
    it('creates schema with default values', () => {
      const schema = createPaginationSchema();
      const data = schema.parse({});
      assert.strictEqual(data.pageSize, 50); // Default
    });

    it('accepts custom page size', () => {
      const schema = createPaginationSchema({ defaultPageSize: 100 });
      const data = schema.parse({ pageSize: 75 });
      assert.strictEqual(data.pageSize, 75);
    });

    it('coerces page size string to number', () => {
      const schema = createPaginationSchema();
      const data = schema.parse({ pageSize: '25' });
      assert.strictEqual(data.pageSize, 25);
    });

    it('enforces max page size', () => {
      const schema = createPaginationSchema({ maxPageSize: 100 });
      const result = schema.safeParse({ pageSize: 150 });
      assert.ok(!result.success, 'Should reject page size exceeding max');
    });

    it('accepts optional pageToken', () => {
      const schema = createPaginationSchema();
      const data = schema.parse({ pageToken: 'abc123' });
      assert.strictEqual(data.pageToken, 'abc123');
    });

    it('rejects negative page size', () => {
      const schema = createPaginationSchema();
      const result = schema.safeParse({ pageSize: -10 });
      assert.ok(!result.success, 'Should reject negative page size');
    });

    it('rejects zero page size', () => {
      const schema = createPaginationSchema();
      const result = schema.safeParse({ pageSize: 0 });
      assert.ok(!result.success, 'Should reject zero page size');
    });

    it('includes provider in description', () => {
      const schema = createPaginationSchema({ provider: 'gmail' });
      assert.ok(schema.description?.includes('gmail'));
    });
  });

  describe('createShapeSchema()', () => {
    it('creates optional enum schema with default "objects"', () => {
      const schema = createShapeSchema();
      const data = schema.parse(undefined);
      assert.strictEqual(data, 'objects');
    });

    it('accepts "objects" value', () => {
      const schema = createShapeSchema();
      const data = schema.parse('objects');
      assert.strictEqual(data, 'objects');
    });

    it('accepts "arrays" value', () => {
      const schema = createShapeSchema();
      const data = schema.parse('arrays');
      assert.strictEqual(data, 'arrays');
    });

    it('rejects invalid values', () => {
      const schema = createShapeSchema();
      const result = schema.safeParse('invalid');
      assert.ok(!result.success, 'Should reject invalid shape value');
    });

    it('has descriptive description', () => {
      const schema = createShapeSchema();
      assert.ok(schema.description?.includes('objects'));
      assert.ok(schema.description?.includes('arrays'));
    });
  });

  describe('toColumnarFormat()', () => {
    const availableFields = ['id', 'name', 'email', 'age'] as const;

    const items = [
      { id: '1', name: 'Alice', email: 'alice@example.com', age: 30 },
      { id: '2', name: 'Bob', email: 'bob@example.com', age: 25 },
    ];

    it('converts items to columnar format with all fields', () => {
      const result = toColumnarFormat(items, 'all', availableFields);

      assert.deepStrictEqual(result.columns, ['id', 'name', 'email', 'age']);
      assert.deepStrictEqual(result.rows, [
        ['1', 'Alice', 'alice@example.com', 30],
        ['2', 'Bob', 'bob@example.com', 25],
      ]);
    });

    it('filters columns based on fields Set', () => {
      const fields = new Set(['id', 'name']);
      const result = toColumnarFormat(items, fields, availableFields);

      assert.deepStrictEqual(result.columns, ['id', 'name']);
      assert.deepStrictEqual(result.rows, [
        ['1', 'Alice'],
        ['2', 'Bob'],
      ]);
    });

    it('maintains canonical field order from availableFields', () => {
      // Even if Set iteration order differs, columns should match availableFields order
      const fields = new Set(['email', 'id']); // Different order than availableFields
      const result = toColumnarFormat(items, fields, availableFields);

      // Should be in availableFields order: id, then email
      assert.deepStrictEqual(result.columns, ['id', 'email']);
      assert.deepStrictEqual(result.rows, [
        ['1', 'alice@example.com'],
        ['2', 'bob@example.com'],
      ]);
    });

    it('handles empty items array', () => {
      const result = toColumnarFormat([], 'all', availableFields);

      assert.deepStrictEqual(result.columns, ['id', 'name', 'email', 'age']);
      assert.deepStrictEqual(result.rows, []);
    });

    it('handles missing fields in items with null', () => {
      const partialItems = [{ id: '1', name: 'Alice' }, { id: '2' }];
      const result = toColumnarFormat(partialItems, 'all', availableFields);

      assert.deepStrictEqual(result.columns, ['id', 'name', 'email', 'age']);
      assert.deepStrictEqual(result.rows, [
        ['1', 'Alice', null, null],
        ['2', null, null, null],
      ]);
    });

    it('handles empty fields Set', () => {
      const fields = new Set<string>();
      const result = toColumnarFormat(items, fields, availableFields);

      assert.deepStrictEqual(result.columns, []);
      assert.deepStrictEqual(result.rows, [[], []]);
    });
  });
});
