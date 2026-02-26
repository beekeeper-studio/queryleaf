import { ObjectId } from 'mongodb';
import { testSetup, createLogger, ensureArray } from './test-setup';

const log = createLogger('edge-cases');

describe('Edge Cases Integration Tests', () => {
  beforeAll(async () => {
    await testSetup.init();
  }, 30000); // 30 second timeout for container startup
  
  afterAll(async () => {
    // Make sure to close any outstanding connections
    const queryLeaf = testSetup.getQueryLeaf();
    
    // Clean up any resources that squongo might be using
    if (typeof queryLeaf.close === 'function') {
      await queryLeaf.close();
    }
    
    // Clean up test setup resources
    await testSetup.cleanup();
  }, 10000); // Give it more time to clean up
  
  beforeEach(async () => {
    // Clean up collections before each test
    const db = testSetup.getDb();
    await db.collection('edge_test').deleteMany({});
    await db.collection('missing_collection').deleteMany({});
  });
  
  afterEach(async () => {
    // Clean up collections after each test
    const db = testSetup.getDb();
    await db.collection('edge_test').deleteMany({});
  });

  test('should handle special characters in field names', async () => {
    // Arrange
    const db = testSetup.getDb();
    await db.collection('edge_test').insertMany([
      { 'field_with_underscores': 'value1', name: 'item1' },
      { 'field_with_numbers123': 'value2', name: 'item2' },
      { 'UPPERCASE_FIELD': 'value3', name: 'item3' },
      { 'mixedCaseField': 'value4', name: 'item4' },
      { 'snake_case_field': 'value5', name: 'item5' }
    ]);
    
    // Act
    const queryLeaf = testSetup.getQueryLeaf();
    // Since SQL parsers often have issues with special characters, we'll use identifiers that are more likely
    // to be supported by most SQL parsers
    const sql = 'SELECT name, field_with_underscores FROM edge_test WHERE field_with_underscores = "value1"';
    
    const results = ensureArray(await queryLeaf.execute(sql));
    
    // Assert
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('item1');
    expect(results[0].field_with_underscores).toBe('value1');
  });

  test('should gracefully handle invalid SQL syntax', async () => {
    // Arrange
    const queryLeaf = testSetup.getQueryLeaf();
    const invalidSql = 'SELECT FROM users WHERE;'; // Missing column and invalid WHERE clause
    
    // Act & Assert
    await expect(queryLeaf.execute(invalidSql)).rejects.toThrow();
  });

  test('should gracefully handle valid SQL but unsupported features', async () => {
    // Arrange
    const queryLeaf = testSetup.getQueryLeaf();
    // SQL with PIVOT which is not widely supported in most SQL implementations
    const unsupportedSql = 'SELECT * FROM (SELECT category, price FROM products) PIVOT (SUM(price) FOR category IN ("Electronics", "Furniture"))';
    
    // Act & Assert
    await expect(queryLeaf.execute(unsupportedSql)).rejects.toThrow();
  });

  test('should handle behavior with missing collections', async () => {
    // Arrange
    const queryLeaf = testSetup.getQueryLeaf();
    const sql = 'SELECT * FROM nonexistent_collection';
    
    // Act
    const results = await queryLeaf.execute(sql);
    
    // Assert - should return empty array rather than throwing an error
    expect(Array.isArray(results)).toBe(true);
    expect(results).toHaveLength(0);
  });

  test('should handle invalid data types appropriately', async () => {
    // Arrange
    const db = testSetup.getDb();
    await db.collection('edge_test').insertMany([
      { name: 'item1', value: 123 },
      { name: 'item2', value: 'not a number' }
    ]);
    
    // Act
    const queryLeaf = testSetup.getQueryLeaf();
    // Try to do numerical comparison on non-numeric data
    const sql = 'SELECT name FROM edge_test WHERE value > 100';
    
    const results = ensureArray(await queryLeaf.execute(sql));
    
    // Assert - should only find the numeric value that's valid for comparison
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('item1');
  });

  test('should handle MongoDB ObjectId conversions', async () => {
    // Arrange
    const db = testSetup.getDb();
    const objectId = new ObjectId();
    await db.collection('edge_test').insertOne({
      _id: objectId,
      name: 'ObjectId Test'
    });

    // Act
    const queryLeaf = testSetup.getQueryLeaf();
    // Use the string representation of ObjectId in SQL
    const sql = `SELECT name FROM edge_test WHERE _id = '${objectId.toString()}'`;

    const results = ensureArray(await queryLeaf.execute(sql));

    // Assert
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('ObjectId Test');
  });

  // Regression test for: https://github.com/beekeeper-studio/queryleaf/issues/12
  // Non-primary ObjectId fields (snake_case like transaction_id) were not being
  // converted from string to ObjectId, causing queries to return no results.
  test('should handle ObjectId conversions on non-primary snake_case id fields (issue #12)', async () => {
    // Arrange
    const db = testSetup.getDb();
    const transactionId = new ObjectId();
    await db.collection('edge_test').insertOne({
      name: 'sale record',
      transaction_id: transactionId,
    });

    // Act
    const queryLeaf = testSetup.getQueryLeaf();
    const sql = `SELECT name FROM edge_test WHERE transaction_id = '${transactionId.toString()}'`;

    const results = ensureArray(await queryLeaf.execute(sql));

    // Assert - should find the document by its non-primary ObjectId field
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('sale record');
  });

  test('should NOT convert *_id fields that store integers to ObjectId', async () => {
    const db = testSetup.getDb();
    await db.collection('edge_test').insertOne({
      name: 'integer id record',
      external_id: 42,
    });

    const queryLeaf = testSetup.getQueryLeaf();
    const results = ensureArray(
      await queryLeaf.execute("SELECT name FROM edge_test WHERE external_id = 42")
    );

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('integer id record');
  });

  test('should NOT convert *_id fields that store strings to ObjectId', async () => {
    const db = testSetup.getDb();
    // A 24-char hex string stored as a plain string — NOT an ObjectId
    const hexLikeString = 'aabbccddeeff001122334455';
    await db.collection('edge_test').insertOne({
      name: 'string id record',
      external_id: hexLikeString,
    });

    const queryLeaf = testSetup.getQueryLeaf();
    const results = ensureArray(
      await queryLeaf.execute(`SELECT name FROM edge_test WHERE external_id = '${hexLikeString}'`)
    );

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('string id record');
  });

  test('should NOT convert _id to ObjectId when stored as an integer', async () => {
    const db = testSetup.getDb();
    await db.collection('edge_test').insertOne({
      _id: 99 as any,
      name: 'integer _id record',
    });

    const queryLeaf = testSetup.getQueryLeaf();
    const results = ensureArray(
      await queryLeaf.execute("SELECT name FROM edge_test WHERE _id = 99")
    );

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('integer _id record');
  });

  test('should NOT convert _id to ObjectId when stored as a plain string', async () => {
    const db = testSetup.getDb();
    // A 24-char hex string stored as a plain string _id — NOT an ObjectId
    const stringId = 'aabbccddeeff001122334455';
    await db.collection('edge_test').insertOne({
      _id: stringId as any,
      name: 'string _id record',
    });

    const queryLeaf = testSetup.getQueryLeaf();
    const results = ensureArray(
      await queryLeaf.execute(`SELECT name FROM edge_test WHERE _id = '${stringId}'`)
    );

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('string _id record');
  });

  test('should support explicit CAST(value AS OBJECTID) syntax', async () => {
    // Arrange
    const db = testSetup.getDb();
    const refId = new ObjectId();
    await db.collection('edge_test').insertOne({
      name: 'cast test',
      arbitrary_ref: refId,
    });

    // Act - field name has no Id hint; user explicitly casts the value
    const queryLeaf = testSetup.getQueryLeaf();
    const sql = `SELECT name FROM edge_test WHERE arbitrary_ref = CAST('${refId.toString()}' AS OBJECTID)`;

    const results = ensureArray(await queryLeaf.execute(sql));

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('cast test');
  });

  test('should support explicit PostgreSQL-style ::OBJECTID cast syntax', async () => {
    // Arrange
    const db = testSetup.getDb();
    const refId = new ObjectId();
    await db.collection('edge_test').insertOne({
      name: 'pg cast test',
      arbitrary_ref: refId,
    });

    // Act
    const queryLeaf = testSetup.getQueryLeaf();
    const sql = `SELECT name FROM edge_test WHERE arbitrary_ref = '${refId.toString()}'::OBJECTID`;

    const results = ensureArray(await queryLeaf.execute(sql));

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('pg cast test');
  });

  // The real fix for issue #12: field name is arbitrary, conversion must be based on value shape
  test('should handle ObjectId conversions on arbitrarily-named ObjectId fields', async () => {
    // Arrange - field name has no Id/id suffix hint whatsoever
    const db = testSetup.getDb();
    const refId = new ObjectId();
    await db.collection('edge_test').insertOne({
      name: 'arbitrary field test',
      source_ref: refId,
    });

    // Act
    const queryLeaf = testSetup.getQueryLeaf();
    const sql = `SELECT name FROM edge_test WHERE source_ref = '${refId.toString()}'`;

    const results = ensureArray(await queryLeaf.execute(sql));

    // Assert
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('arbitrary field test');
  });

  test('should handle extremely large result sets', async () => {
    // Arrange
    const db = testSetup.getDb();
    const largeDataset = Array.from({ length: 1000 }, (_, i) => ({ 
      index: i, 
      name: `Item ${i}`, 
      value: Math.random() * 1000
    }));
    
    await db.collection('edge_test').insertMany(largeDataset);
    
    // Act
    const queryLeaf = testSetup.getQueryLeaf();
    const sql = 'SELECT * FROM edge_test';
    
    const results = ensureArray(await queryLeaf.execute(sql));
    
    // Assert
    expect(results).toHaveLength(1000);
    expect(results[0]).toHaveProperty('index');
    expect(results[0]).toHaveProperty('name');
    expect(results[0]).toHaveProperty('value');
  });
});
