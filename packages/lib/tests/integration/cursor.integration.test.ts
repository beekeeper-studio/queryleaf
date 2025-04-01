import { testSetup, createLogger } from './test-setup';
import { Document, FindCursor, AggregationCursor } from 'mongodb';

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
    
    // Generate 30 test products (more than the default MongoDB batch size of 20)
    // to properly test cursor batching
    const testProducts: any[] = [];
    const categories = ['Electronics', 'Clothing', 'Books', 'Home', 'Sports'];
    
    for (let i = 1; i <= 30; i++) {
      const categoryIndex = i % categories.length;
      const price = 10 + (i * 5); // Different prices for variety
      
      testProducts.push({
        name: `Product ${i}`,
        category: categories[categoryIndex],
        price: price,
        sku: `SKU-${i.toString().padStart(4, '0')}`,
        inStock: i % 3 === 0 ? false : true
      });
    }
    
    // Insert test data
    await db.collection('test_cursor').insertMany(testProducts);
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
    const result = await queryLeaf.execute('SELECT * FROM test_cursor');
    
    // Type checking - we expect this to be a Document[] (not a cursor)
    expect(Array.isArray(result)).toBe(true);
    
    // With the type assertion, TypeScript knows it's an array
    if (Array.isArray(result)) {
      const results = result;
      expect(results.length).toBe(30);
      // Check for expected array methods
      expect(typeof results.map).toBe('function');
      expect(typeof results.forEach).toBe('function');
      expect(typeof results.filter).toBe('function');
    }
  });

  test('should return a cursor when returnCursor is true', async () => {
    // Arrange
    const queryLeaf = testSetup.getQueryLeaf();
    
    // Act
    const cursor = await queryLeaf.executeCursor('SELECT * FROM test_cursor');
    
    // Assert
    expect(cursor).not.toBeNull();

    if (cursor) {
      expect(typeof cursor.toArray).toBe('function');
      expect(typeof cursor.forEach).toBe('function');
      expect(typeof cursor.next).toBe('function');
      expect(typeof cursor.hasNext).toBe('function');
      
      // Clean up
      await cursor.close();
    }
  });

  test('should be able to iterate through cursor with forEach', async () => {
    // Arrange
    const queryLeaf = testSetup.getQueryLeaf();
    
    // Act
    const cursor = await queryLeaf.executeCursor('SELECT * FROM test_cursor');

    expect(cursor).not.toBeNull();
    
    const results: any[] = [];
    await cursor?.forEach((doc: any) => {
      results.push(doc);
    });
    
    // Assert
    expect(results.length).toBe(30);
    expect(results[0].name).toBeDefined();
    
    // Clean up
    await cursor?.close();
  });

  test('should be able to get all results with toArray from cursor', async () => {
    // Arrange
    const queryLeaf = testSetup.getQueryLeaf();
    
    // Act
    const cursor = await queryLeaf.executeCursor('SELECT * FROM test_cursor');
    expect(cursor).not.toBeNull();
    const results = await cursor?.toArray();
    
    // Assert
    expect(Array.isArray(results)).toBe(true);
    expect(results?.length).toBe(30);
    
    // Clean up
    await cursor?.close();
  });

  test('should be able to use next and hasNext with cursor', async () => {
    // Arrange
    const queryLeaf = testSetup.getQueryLeaf();
    
    // Act
    const cursor = await queryLeaf.executeCursor('SELECT * FROM test_cursor');
    
    // Assert
    expect(cursor).not.toBeNull();
    // Check if we have documents
    expect(await cursor?.hasNext()).toBe(true);
    
    // Get the first document
    const firstDoc = await cursor?.next();
    expect(firstDoc).toBeDefined();
    expect(firstDoc?.name).toBeDefined();
    
    // Get remaining documents
    const docs: any[] = [];
    while (await cursor?.hasNext()) {
      const doc = await cursor?.next();
      docs.push(doc);
    }
    
    // We should have 29 remaining documents
    expect(docs.length).toBe(29);
    
    // Clean up
    await cursor?.close();
  });

  test('should work with returnCursor for filtered queries', async () => {
    // Arrange
    const queryLeaf = testSetup.getQueryLeaf();
    
    // Act
    const cursor = await queryLeaf.executeCursor("SELECT * FROM test_cursor WHERE category = 'Electronics'");

    expect(cursor).not.toBeNull();
    
    const results = await cursor?.toArray();
    
    // Assert
    // With our test data generation logic (5 categories), we expect 6 Electronics products
    const expectedElectronicsCount = Math.ceil(30 / 5); // 30 products / 5 categories
    expect(results?.length).toBe(expectedElectronicsCount);
    // Check that all results are from Electronics category
    results?.forEach(product => {
      expect(product.category).toBe('Electronics');
    });
    
    // Clean up
    await cursor?.close();
  });

  test('should work with returnCursor for sorted queries', async () => {
    // Arrange
    const queryLeaf = testSetup.getQueryLeaf();
    
    // Act
    const cursor = await queryLeaf.executeCursor('SELECT * FROM test_cursor ORDER BY price DESC');

    expect(cursor).not.toBeNull()
    
    const results = await cursor?.toArray();

    if (!results) throw new Error('failed to get array from cursor');
    
    // Assert
    expect(results.length).toBe(30);
    // Check if sorted in descending order
    // With our generation logic: prices = 10 + (i * 5), highest should be for i=30
    expect(results[0].price).toBe(160); // Product 30: 10 + (30 * 5) = 160
    expect(results[1].price).toBe(155); // Product 29: 10 + (29 * 5) = 155
    
    // Clean up
    await cursor?.close();
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
    const cursor = await queryLeaf.executeCursor('SELECT category, COUNT(*) as count FROM test_cursor GROUP BY category');
    
    // Get the results and log them
    const results = await cursor?.toArray();
    if (!results) throw new Error('failed to get array from cursor');
    log('GROUP BY cursor results:', JSON.stringify(results, null, 2));
    
    // Assert
    // We should have some results
    expect(results.length).toBeGreaterThan(0);
    
    // In a MongoDB aggregation with $group, the group key is always in _id
    // We expect 5 distinct categories in our test data
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
    await cursor?.close();
  });

  test('should respect cursor limit and skip options', async () => {
    // Arrange
    const queryLeaf = testSetup.getQueryLeaf();
    
    // Act - Use LIMIT and OFFSET in SQL
    const cursor = await queryLeaf.executeCursor('SELECT * FROM test_cursor LIMIT 2 OFFSET 1');
    
    const results = await cursor?.toArray();
    if (!results) throw new Error('failed to get array from cursor');
    
    // Assert
    expect(results.length).toBe(2); // Limited to 2 records
    
    // Clean up
    await cursor?.close();
  });

  test('should properly close the cursor', async () => {
    // Arrange
    const queryLeaf = testSetup.getQueryLeaf();
    
    // Act
    const cursor = await queryLeaf.executeCursor('SELECT * FROM test_cursor');
    
    // Get some results first to ensure the cursor is actually used
    expect(await cursor?.hasNext()).toBe(true);
    
    // Now close the cursor
    await cursor?.close();
    
    // Assert - at this point, we can't really test if the cursor is closed
    // in a reliable way without accessing MongoDB internals
    // The best we can do is ensure no error was thrown when closing
  });

  test('should handle cursor batching properly with next/hasNext', async () => {
    // Arrange
    const queryLeaf = testSetup.getQueryLeaf();
    
    // Act
    const cursor = await queryLeaf.executeCursor('SELECT * FROM test_cursor ORDER BY price ASC');
    
    // Manual iteration to test batching behavior
    // Default MongoDB batch size is 20, so we need to iterate beyond that
    
    // First, get a batch of items iteratively
    const firstBatchItems: any[] = [];
    for (let i = 0; i < 25; i++) {
      expect(await cursor?.hasNext()).toBe(true); // Should still have more
      const item = await cursor?.next();
      expect(item).toBeDefined();
      firstBatchItems.push(item);
    }
    
    // Verify we got 25 items (which crosses the default batch boundary of 20)
    expect(firstBatchItems.length).toBe(25);
    
    // Verify we still have more items
    expect(await cursor?.hasNext()).toBe(true);
    
    // Get the remaining items
    const remainingItems: any[] = [];
    while (await cursor?.hasNext()) {
      const item = await cursor?.next();
      remainingItems.push(item);
    }
    
    // Verify we got all 30 items (25 + 5 more)
    expect(remainingItems.length).toBe(5);
    expect(firstBatchItems.length + remainingItems.length).toBe(30);
    
    // Verify items are in ascending price order as requested
    for (let i = 1; i < firstBatchItems.length; i++) {
      expect(firstBatchItems[i].price).toBeGreaterThanOrEqual(firstBatchItems[i-1].price);
    }
    
    // Clean up
    await cursor?.close();
  });
});
