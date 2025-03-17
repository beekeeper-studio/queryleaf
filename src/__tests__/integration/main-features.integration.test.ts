import { ObjectId } from 'mongodb';
import { testSetup } from './test-setup';

describe('Main SQL Features Integration Tests', () => {
  beforeAll(async () => {
    await testSetup.init();
  }, 30000); // 30 second timeout for container startup
  
  afterAll(async () => {
    // Make sure to close any outstanding connections
    const squongo = testSetup.getSquongo();
    
    // Clean up any resources that squongo might be using
    if (typeof squongo.close === 'function') {
      await squongo.close();
    }
    
    // Clean up test setup resources
    await testSetup.cleanup();
  }, 10000); // Give it more time to clean up
  
  beforeEach(async () => {
    // Clean up collections before each test
    const db = testSetup.getDb();
    await db.collection('simple_products').deleteMany({});
  });
  
  afterEach(async () => {
    // Clean up collections after each test
    const db = testSetup.getDb();
    await db.collection('simple_products').deleteMany({});
  });

  test('should support nested field access in WHERE clause', async () => {
    // Arrange
    const db = testSetup.getDb();
    await db.collection('simple_products').insertMany([
      { 
        name: 'Laptop',
        details: { color: 'silver', price: 1200 }
      },
      { 
        name: 'Smartphone',
        details: { color: 'black', price: 800 }
      }
    ]);
    
    // Act
    const squongo = testSetup.getSquongo();
    const sql = "SELECT name FROM simple_products WHERE details.color = 'black'";
    
    const results = await squongo.execute(sql);
    
    // Assert
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Smartphone');
  });
  
  test('should support basic GROUP BY with COUNT', async () => {
    // Arrange
    const db = testSetup.getDb();
    await db.collection('simple_products').insertMany([
      { category: 'Electronics', price: 100 },
      { category: 'Electronics', price: 200 },
      { category: 'Clothing', price: 50 },
      { category: 'Clothing', price: 75 },
      { category: 'Books', price: 25 }
    ]);
    
    // Act
    const squongo = testSetup.getSquongo();
    const sql = "SELECT category, COUNT(*) as count FROM simple_products GROUP BY category";
    
    const results = await squongo.execute(sql);
    
    // Assert - just verify we have 3 groups (Electronics, Clothing, Books)
    expect(results).toHaveLength(3);
  });
  
  test('should handle complex WHERE queries with AND/OR logic', async () => {
    // Arrange
    const db = testSetup.getDb();
    await db.collection('simple_products').insertMany([
      { name: 'Laptop', category: 'Electronics', price: 1200 },
      { name: 'T-shirt', category: 'Clothing', price: 25 },
      { name: 'Smartphone', category: 'Electronics', price: 800 },
      { name: 'Jeans', category: 'Clothing', price: 75 },
      { name: 'Tablet', category: 'Electronics', price: 350 }
    ]);
    
    // Act
    const squongo = testSetup.getSquongo();
    const sql = "SELECT name FROM simple_products WHERE (category = 'Electronics' AND price < 1000) OR (category = 'Clothing' AND price < 50)";
    
    const results = await squongo.execute(sql);
    
    // Assert - we should have 3 rows matching our criteria:
    // - Smartphone (Electronics < 1000)
    // - Tablet (Electronics < 1000)
    // - T-shirt (Clothing + price < 50)
    expect(results).toHaveLength(3);
    
    // Check that we have all expected products
    const names = results.map((r: any) => r.name);
    expect(names).toContain('Smartphone');
    expect(names).toContain('Tablet');
    expect(names).toContain('T-shirt');
    expect(names).not.toContain('Jeans');
    expect(names).not.toContain('Laptop');
  });
});