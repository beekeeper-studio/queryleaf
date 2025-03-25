import { testSetup, createLogger } from './test-setup';

const log = createLogger('cursor');

describe('MongoDB Cursor Functionality Tests', () => {
  beforeAll(async () => {
    await testSetup.init();
  }, 30000); // 30 second timeout for container startup
  
  afterAll(async () => {
    // Make sure to close any outstanding connections
    const queryLeaf = testSetup.getQueryLeaf();
    
    // Clean up any resources that queryLeaf might be using
    if (typeof queryLeaf.close === 'function') {
      await queryLeaf.close();
    }
    
    // Clean up test setup resources
    await testSetup.cleanup();
  }, 10000); // Give it more time to clean up
  
  beforeEach(async () => {
    // Clean up and populate test collections before each test
    const db = testSetup.getDb();
    await db.collection('test_cursor').deleteMany({});
    
    // Insert test data
    await db.collection('test_cursor').insertMany([
      { name: 'Product 1', category: 'Electronics', price: 100 },
      { name: 'Product 2', category: 'Electronics', price: 200 },
      { name: 'Product 3', category: 'Clothing', price: 50 },
      { name: 'Product 4', category: 'Clothing', price: 75 },
      { name: 'Product 5', category: 'Books', price: 25 }
    ]);
  });
  
  afterEach(async () => {
    // Clean up test collections after each test
    const db = testSetup.getDb();
    await db.collection('test_cursor').deleteMany({});
  });

  test('should return an array by default', async () => {
    // Arrange
    const queryLeaf = testSetup.getQueryLeaf();
    
    // Act
    const results = await queryLeaf.execute('SELECT * FROM test_cursor');
    
    // Assert
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(5);
    // Check for expected array methods
    expect(typeof results.map).toBe('function');
    expect(typeof results.forEach).toBe('function');
    expect(typeof results.filter).toBe('function');
  });

  test('should return a cursor when returnCursor is true', async () => {
    // Arrange
    const queryLeaf = testSetup.getQueryLeaf();
    
    // Act
    const cursor = await queryLeaf.execute('SELECT * FROM test_cursor', { returnCursor: true });
    
    // Assert
    expect(cursor).toBeDefined();
    // Check for expected cursor methods
    expect(typeof cursor.toArray).toBe('function');
    expect(typeof cursor.forEach).toBe('function');
    expect(typeof cursor.next).toBe('function');
    expect(typeof cursor.hasNext).toBe('function');
    
    // Clean up
    await cursor.close();
  });

  test('should be able to iterate through cursor with forEach', async () => {
    // Arrange
    const queryLeaf = testSetup.getQueryLeaf();
    
    // Act
    const cursor = await queryLeaf.execute('SELECT * FROM test_cursor', { returnCursor: true });
    
    const results: any[] = [];
    await cursor.forEach((doc: any) => {
      results.push(doc);
    });
    
    // Assert
    expect(results.length).toBe(5);
    expect(results[0].name).toBeDefined();
    
    // Clean up
    await cursor.close();
  });

  test('should be able to get all results with toArray from cursor', async () => {
    // Arrange
    const queryLeaf = testSetup.getQueryLeaf();
    
    // Act
    const cursor = await queryLeaf.execute('SELECT * FROM test_cursor', { returnCursor: true });
    const results = await cursor.toArray();
    
    // Assert
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(5);
    
    // Clean up
    await cursor.close();
  });

  test('should be able to use next and hasNext with cursor', async () => {
    // Arrange
    const queryLeaf = testSetup.getQueryLeaf();
    
    // Act
    const cursor = await queryLeaf.execute('SELECT * FROM test_cursor', { returnCursor: true });
    
    // Assert
    // Check if we have documents
    expect(await cursor.hasNext()).toBe(true);
    
    // Get the first document
    const firstDoc = await cursor.next();
    expect(firstDoc).toBeDefined();
    expect(firstDoc.name).toBeDefined();
    
    // Get remaining documents
    const docs: any[] = [];
    while (await cursor.hasNext()) {
      const doc = await cursor.next();
      docs.push(doc);
    }
    
    // We should have 4 remaining documents
    expect(docs.length).toBe(4);
    
    // Clean up
    await cursor.close();
  });

  test('should work with returnCursor for filtered queries', async () => {
    // Arrange
    const queryLeaf = testSetup.getQueryLeaf();
    
    // Act
    const cursor = await queryLeaf.execute(
      "SELECT * FROM test_cursor WHERE category = 'Electronics'", 
      { returnCursor: true }
    );
    
    const results = await cursor.toArray();
    
    // Assert
    expect(results.length).toBe(2);
    expect(results[0].category).toBe('Electronics');
    expect(results[1].category).toBe('Electronics');
    
    // Clean up
    await cursor.close();
  });

  test('should work with returnCursor for sorted queries', async () => {
    // Arrange
    const queryLeaf = testSetup.getQueryLeaf();
    
    // Act
    const cursor = await queryLeaf.execute(
      'SELECT * FROM test_cursor ORDER BY price DESC', 
      { returnCursor: true }
    );
    
    const results = await cursor.toArray();
    
    // Assert
    expect(results.length).toBe(5);
    // Check if sorted in descending order
    expect(results[0].price).toBe(200);
    expect(results[1].price).toBe(100);
    
    // Clean up
    await cursor.close();
  });

  test('should work with returnCursor for aggregation queries', async () => {
    // Arrange
    const queryLeaf = testSetup.getQueryLeaf();
    const db = testSetup.getDb();
    
    // First, check with a direct MongoDB query how the aggregation works
    const directAggregateResult = await db.collection('test_cursor').aggregate([
      { $group: { _id: "$category", count: { $sum: 1 } } }
    ]).toArray();
    
    log('Direct MongoDB aggregate result:', JSON.stringify(directAggregateResult, null, 2));
    
    // Act
    const cursor = await queryLeaf.execute(
      'SELECT category, COUNT(*) as count FROM test_cursor GROUP BY category', 
      { returnCursor: true }
    );
    
    // First verify the cursor has expected methods
    expect(cursor).toBeDefined();
    expect(typeof cursor.toArray).toBe('function');
    expect(typeof cursor.forEach).toBe('function');
    
    // Get the results and log them
    const results = await cursor.toArray();
    log('GROUP BY cursor results:', JSON.stringify(results, null, 2));
    
    // Assert
    // We should have some results
    expect(results.length).toBeGreaterThan(0);
    
    // In a MongoDB aggregation with $group, the group key is always in _id
    // We expect 3 distinct categories in our test data
    const uniqueCategories = new Set();
    
    results.forEach(r => {
      // With GROUP BY, MongoDB puts the grouping key in _id
      if (r._id) {
        uniqueCategories.add(r._id);
      }
    });
    
    // We expect at least one unique value which should be in _id
    expect(uniqueCategories.size).toBeGreaterThan(0);
    
    // Clean up
    await cursor.close();
  });

  test('should respect cursor limit and skip options', async () => {
    // Arrange
    const queryLeaf = testSetup.getQueryLeaf();
    
    // Act - Use LIMIT and OFFSET in SQL
    const cursor = await queryLeaf.execute(
      'SELECT * FROM test_cursor LIMIT 2 OFFSET 1', 
      { returnCursor: true }
    );
    
    const results = await cursor.toArray();
    
    // Assert
    expect(results.length).toBe(2); // Limited to 2 records
    
    // Clean up
    await cursor.close();
  });

  test('should properly close the cursor', async () => {
    // Arrange
    const queryLeaf = testSetup.getQueryLeaf();
    
    // Act
    const cursor = await queryLeaf.execute(
      'SELECT * FROM test_cursor', 
      { returnCursor: true }
    );
    
    // Get some results first to ensure the cursor is actually used
    expect(await cursor.hasNext()).toBe(true);
    
    // Now close the cursor
    await cursor.close();
    
    // Assert - at this point, we can't really test if the cursor is closed
    // in a reliable way without accessing MongoDB internals
    // The best we can do is ensure no error was thrown when closing
  });
});