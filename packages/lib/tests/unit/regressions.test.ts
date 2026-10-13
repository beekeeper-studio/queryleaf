import { MongoClient } from 'mongodb';
import { SqlParserImpl } from '../../src/parser';
import { SqlCompilerImpl } from '../../src/compiler';
import { MongoExecutor } from '../../src/executor';
import { Command } from '../../src/interfaces';

// Compiler-level counterparts to tests/integration/regressions.integration.test.ts,
// so these regressions are caught without Docker

const compile = (sql: string): Command => {
  const commands = new SqlCompilerImpl().compile(new SqlParserImpl().parse(sql));
  expect(commands).toHaveLength(1);
  return commands[0];
};

const filterOf = (sql: string) => (compile(sql) as any).filter;

describe('Regressions', () => {
  describe('WHERE clauses are never dropped or weakened', () => {
    test('NOT (...) compiles to $nor', () => {
      expect(filterOf('DELETE FROM t WHERE NOT (age > 26)')).toEqual({
        $nor: [{ age: { $gt: 26 } }],
      });
    });

    test.each([
      ['DELETE FROM t WHERE 1 = 1', {}],
      ['DELETE FROM t WHERE TRUE', {}],
      ['DELETE FROM t WHERE 1 = 0', { $expr: false }],
      ['DELETE FROM t WHERE FALSE', { $expr: false }],
      ['DELETE FROM t WHERE NULL = NULL', { $expr: false }],
      ["SELECT * FROM t WHERE 1 = 1 AND a = 'x'", { $and: [{}, { a: 'x' }] }],
    ])('evaluates constant condition: %s', (sql, expected) => {
      expect(filterOf(sql)).toEqual(expected);
    });

    test.each<[string, unknown]>([
      ['DELETE FROM t WHERE a <> -1', { a: { $ne: -1 } }],
      ['DELETE FROM t WHERE a IN (1, 2)', { a: { $in: [1, 2] } }],
      ["DELETE FROM t WHERE a NOT IN ('x', 'y')", { a: { $nin: ['x', 'y'] } }],
      ["DELETE FROM t WHERE d = DATE '2024-01-01'", { d: '2024-01-01' }],
      [
        "DELETE FROM t WHERE _id = CAST('507f1f77bcf86cd799439011' AS OBJECTID)",
        { _id: { __qlObjectId: '507f1f77bcf86cd799439011' } },
      ],
    ])('still accepts literal values: %s', (sql, expected) => {
      expect(filterOf(sql)).toEqual(expected);
    });

    test.each([
      // Unsupported WHERE expressions
      "UPDATE t SET a = 1 WHERE LOWER(name) = 'bob'",
      'DELETE FROM t WHERE 26 < age',
      'DELETE FROM t WHERE age + 1 > 26',
      'DELETE FROM t WHERE active',
      // Non-literal comparison values
      'DELETE FROM t WHERE a <> b',
      "DELETE FROM t WHERE status != LOWER('X')",
      'DELETE FROM t WHERE id NOT IN (SELECT user_id FROM banned)',
      "DELETE FROM t WHERE name NOT IN ('a', b)",
      'DELETE FROM t WHERE age <> 1 + 1',
      "DELETE FROM t WHERE age <> '30'::int",
      'DELETE FROM t WHERE age <> $1',
      'UPDATE t SET a = 1 WHERE name <> category',
      // Multiple tables, whose join conditions would be dropped
      'DELETE FROM a JOIN b ON a.id = b.id',
      'DELETE FROM a, b WHERE a.id = 1',
      'UPDATE a JOIN b ON a.id = b.id SET a.x = 1',
      'UPDATE a, b SET a.x = 1 WHERE a.id = 1',
      'UPDATE t SET a = 1 FROM other o WHERE t.id = o.id',
    ])('rejects %s', (sql) => {
      expect(() => compile(sql)).toThrow(/not supported|Unsupported/);
    });
  });

  describe('field names ending in _<number> are not treated as array indexes', () => {
    test('WHERE', () => {
      expect(filterOf("SELECT name FROM t WHERE address_line_2 = 'Apt 1'")).toEqual({
        address_line_2: 'Apt 1',
      });
    });

    test('SELECT and ORDER BY', () => {
      const command = compile('SELECT name, phone_1 FROM t ORDER BY phone_1 DESC') as any;
      expect(command.projection).toEqual({ name: 1, phone_1: 1, _id: 0 });
      expect(command.sort).toEqual({ phone_1: -1 });
    });

    test('UPDATE SET', () => {
      const command = compile("UPDATE t SET phone_1 = '555' WHERE name = 'Bob'") as any;
      expect(command.update).toEqual({ $set: { phone_1: '555' } });
    });

    test('bracket array access still uses array indexes', () => {
      expect(filterOf("SELECT * FROM t WHERE items[0].name = 'x'")).toEqual({
        'items.0.name': 'x',
      });
    });
  });

  describe('LIKE in aggregation pipelines', () => {
    test('the executor passes the LIKE RegExp through to MongoDB intact', async () => {
      let pipeline: any[] = [];
      const client = {
        db: () => ({
          collection: () => ({
            aggregate: (stages: any[]) => {
              pipeline = stages;
              return { toArray: async () => [] };
            },
            findOne: async () => null,
          }),
        }),
      } as unknown as MongoClient;

      const command = compile("SELECT name AS person FROM t WHERE name LIKE 'Al%'");
      expect(command.type).toBe('AGGREGATE');

      await new MongoExecutor(client, 'db').execute([command]);

      const regex = pipeline[0].$match.name.$regex;
      expect(regex).toBeInstanceOf(RegExp);
      expect(regex.source).toBe('^Al.*$');
    });
  });

  // https://github.com/beekeeper-studio/queryleaf/issues/7
  describe('selecting a column that no document has', () => {
    test.each<[string, string[] | undefined]>([
      ['SELECT invalid_lmao FROM t', ['invalid_lmao']],
      ['SELECT name, invalid_lmao AS x FROM t', ['name', 'invalid_lmao']],
      ['SELECT u.name FROM t u', ['name']],
      ['SELECT address.city FROM t', ['address.city']],
      ['SELECT tags[0], items[1].name FROM t', ['tags', 'items']],
      ['SELECT category, COUNT(*) AS total FROM t GROUP BY category', ['category']],
      ['SELECT _id FROM t', undefined],
      ['SELECT * FROM t', undefined],
      ['SELECT u.name, o.total FROM users u JOIN orders o ON u._id = o.userId', undefined],
    ])('records the fields read by %s', (sql, expected) => {
      expect((compile(sql) as any).selectedFields).toEqual(expected);
    });

    const fakeClient = (rows: any[]) => {
      // No document in the collection matches a $exists check
      const findOne = jest.fn(async (_filter: any) => null);
      const collection = { find: () => ({ toArray: async () => rows }), findOne };
      const client = { db: () => ({ collection: () => collection }) } as unknown as MongoClient;
      return { client, findOne };
    };

    test('the executor rejects a field that no document has', async () => {
      const { client } = fakeClient([{}, {}]);
      await expect(
        new MongoExecutor(client, 'db').execute([compile('SELECT invalid_lmao FROM t')])
      ).rejects.toThrow('Column "invalid_lmao" does not exist in collection "t"');
    });

    test('the executor does not look up fields the returned rows already have', async () => {
      const { client, findOne } = fakeClient([{ name: 'Alice' }]);
      await expect(
        new MongoExecutor(client, 'db').execute([compile('SELECT name FROM t')])
      ).resolves.toEqual([{ name: 'Alice' }]);
      expect(findOne.mock.calls.filter(([filter]) => filter.$or)).toHaveLength(0);
    });
  });
});
