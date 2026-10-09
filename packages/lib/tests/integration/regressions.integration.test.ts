import { testSetup, ensureArray } from './test-setup';

describe('Regression Integration Tests', () => {
  beforeAll(async () => {
    await testSetup.init();
  }, 30000);

  afterAll(async () => {
    await testSetup.cleanup();
  }, 10000);

  beforeEach(async () => {
    const db = testSetup.getDb();
    await db.collection('regression_test').deleteMany({});
    await db.collection('regression_test').insertMany([
      { name: 'Alice', age: 30, category: 'admin', phone_1: '555-0001', address_line_2: 'Apt 1' },
      { name: 'Bob', age: 25, category: 'user', phone_1: '555-0002', address_line_2: 'Suite 9' },
      { name: 'Alfred', age: 40, category: 'user', phone_1: '555-0003', address_line_2: 'Unit 3' },
    ]);
  });

  afterEach(async () => {
    await testSetup.getDb().collection('regression_test').deleteMany({});
  });

  const remainingNames = async () => {
    const docs = await testSetup.getDb().collection('regression_test').find().toArray();
    return docs.map((d) => d.name).sort();
  };

  describe('WHERE clauses that cannot be translated must not match every document', () => {
    test('DELETE with NOT (...) only deletes matching documents', async () => {
      const queryLeaf = testSetup.getQueryLeaf();
      await queryLeaf.execute('DELETE FROM regression_test WHERE NOT (age > 26)');

      expect(await remainingNames()).toEqual(['Alfred', 'Alice']);
    });

    test('SELECT with NOT (...) filters results', async () => {
      const queryLeaf = testSetup.getQueryLeaf();
      const results = ensureArray(
        await queryLeaf.execute("SELECT name FROM regression_test WHERE NOT (category = 'user')")
      );

      expect(results.map((r) => r.name)).toEqual(['Alice']);
    });

    test('UPDATE with an unsupported WHERE expression is rejected', async () => {
      const queryLeaf = testSetup.getQueryLeaf();
      await expect(
        queryLeaf.execute("UPDATE regression_test SET category = 'x' WHERE LOWER(name) = 'bob'")
      ).rejects.toThrow(/Unsupported WHERE/);

      const docs = await testSetup.getDb().collection('regression_test').find().toArray();
      expect(docs.map((d) => d.category).sort()).toEqual(['admin', 'user', 'user']);
    });

    test('DELETE with an unsupported WHERE expression is rejected', async () => {
      const queryLeaf = testSetup.getQueryLeaf();
      await expect(queryLeaf.execute('DELETE FROM regression_test WHERE 26 < age')).rejects.toThrow(
        /Unsupported WHERE/
      );

      expect(await remainingNames()).toEqual(['Alfred', 'Alice', 'Bob']);
    });

    test('constant conditions are still evaluated', async () => {
      const queryLeaf = testSetup.getQueryLeaf();
      const all = ensureArray(
        await queryLeaf.execute(
          "SELECT name FROM regression_test WHERE 1 = 1 AND category = 'user'"
        )
      );
      expect(all.map((r) => r.name).sort()).toEqual(['Alfred', 'Bob']);

      await queryLeaf.execute('DELETE FROM regression_test WHERE 1 = 0');
      await queryLeaf.execute('DELETE FROM regression_test WHERE NULL = NULL');
      expect(await remainingNames()).toEqual(['Alfred', 'Alice', 'Bob']);
    });
  });

  describe('field names ending in _<number> are not treated as array indexes', () => {
    test('filters and projects the field', async () => {
      const queryLeaf = testSetup.getQueryLeaf();
      const results = ensureArray(
        await queryLeaf.execute(
          "SELECT name, address_line_2 FROM regression_test WHERE address_line_2 = 'Apt 1'"
        )
      );

      expect(results).toEqual([{ name: 'Alice', address_line_2: 'Apt 1' }]);
    });

    test('sorts by the field', async () => {
      const queryLeaf = testSetup.getQueryLeaf();
      const results = ensureArray(
        await queryLeaf.execute('SELECT name, phone_1 FROM regression_test ORDER BY phone_1 DESC')
      );

      expect(results.map((r) => r.phone_1)).toEqual(['555-0003', '555-0002', '555-0001']);
    });

    test('UPDATE writes to the field instead of a nested path', async () => {
      const queryLeaf = testSetup.getQueryLeaf();
      await queryLeaf.execute("UPDATE regression_test SET phone_1 = '555-9999' WHERE name = 'Bob'");

      const bob = await testSetup.getDb().collection('regression_test').findOne({ name: 'Bob' });
      expect(bob?.phone_1).toBe('555-9999');
      expect(bob?.phone).toBeUndefined();
    });
  });

  describe('LIKE in queries compiled to an aggregation pipeline', () => {
    test('works with column aliases', async () => {
      const queryLeaf = testSetup.getQueryLeaf();
      const results = ensureArray(
        await queryLeaf.execute("SELECT name AS person FROM regression_test WHERE name LIKE 'Al%'")
      );

      expect(results.map((r) => r.person).sort()).toEqual(['Alfred', 'Alice']);
    });

    test('works with GROUP BY', async () => {
      const queryLeaf = testSetup.getQueryLeaf();
      const results = ensureArray(
        await queryLeaf.execute(
          "SELECT category, COUNT(*) AS total FROM regression_test WHERE name LIKE 'Al%' GROUP BY category"
        )
      );

      const totals = Object.fromEntries(results.map((r) => [r.category, r.total]));
      expect(totals).toEqual({ admin: 1, user: 1 });
    });
  });
});
