import { ObjectId } from 'mongodb';
import { testSetup, ensureArray } from './test-setup';

describe('Projection and Field Selection Tests', () => {
  let db;
  beforeAll(async () => {
    await testSetup.init();
  }, 30000); // 30 second timeout for container startup
  
  afterAll(async () => {
    // Make sure to close any outstanding connections
    const queryLeaf = testSetup.getQueryLeaf();
    
    // Clean up any resources that QueryLeaf might be using
    if (typeof queryLeaf.close === 'function') {
      await queryLeaf.close();
    }
    
    // Clean up test setup resources
    await testSetup.cleanup();
  }, 10000);
  
  beforeEach(async () => {
    // Clean up and setup test data before each test
    db = testSetup.getDb();
    await db.collection('projection_test').deleteMany({});
    
    // Insert test data
    await db.collection('projection_test').insertMany([
      { 
        _id: new ObjectId(),
        name: 'Product A', 
        price: 100, 
        category: 'Electronics',
        inStock: true
      },
      { 
        _id: new ObjectId(),
        name: 'Product B', 
        price: 200, 
        category: 'Furniture',
        inStock: false
      }
    ]);
  });
  
  afterEach(async () => {
    // Clean up test data after each test
    await db.collection('projection_test').deleteMany({});
  });

  test('should NOT include _id field when not explicitly selected', async () => {
    // Act
    const queryLeaf = testSetup.getQueryLeaf();
    const sql = 'SELECT name, price FROM projection_test';
    
    const results = ensureArray(await queryLeaf.execute(sql));
    
    // Assert
    expect(results).toHaveLength(2);
    
    // Check the fields in the first result
    expect(Object.keys(results[0])).toContain('name');
    expect(Object.keys(results[0])).toContain('price');
    expect(Object.keys(results[0])).not.toContain('_id'); // _id should NOT be included
    expect(Object.keys(results[0])).not.toContain('category');
    expect(Object.keys(results[0])).not.toContain('inStock');
  });

  test('should include _id field when using SELECT *', async () => {
    // Act
    const queryLeaf = testSetup.getQueryLeaf();
    const sql = 'SELECT * FROM projection_test';
    
    const results = ensureArray(await queryLeaf.execute(sql));
    
    // Assert
    expect(results).toHaveLength(2);
    
    // Check all fields are included in the first result
    expect(Object.keys(results[0])).toContain('_id');
    expect(Object.keys(results[0])).toContain('name');
    expect(Object.keys(results[0])).toContain('price');
    expect(Object.keys(results[0])).toContain('category');
    expect(Object.keys(results[0])).toContain('inStock');
  });

  test('should include _id field when explicitly requested', async () => {
    // Act
    const queryLeaf = testSetup.getQueryLeaf();
    const sql = 'SELECT _id, name FROM projection_test';
    
    const results = ensureArray(await queryLeaf.execute(sql));
    
    // Assert
    expect(results).toHaveLength(2);
    
    // Check the fields in the first result
    expect(Object.keys(results[0])).toContain('_id');
    expect(Object.keys(results[0])).toContain('name');
    expect(Object.keys(results[0])).not.toContain('price');
    expect(Object.keys(results[0])).not.toContain('category');
    expect(Object.keys(results[0])).not.toContain('inStock');
  });

  test('should handle _id with table alias', async () => {
    // Act
    const queryLeaf = testSetup.getQueryLeaf();
    const sql = 'SELECT p._id, p.name FROM projection_test p';
    
    const results = ensureArray(await queryLeaf.execute(sql));
    
    // Assert
    expect(results).toHaveLength(2);
    
    // Check the fields in the first result
    expect(Object.keys(results[0])).toContain('_id');
    expect(Object.keys(results[0])).toContain('name');
    expect(Object.keys(results[0])).not.toContain('price');
  });

  test('should include _id field in GROUP BY results', async () => {
    // Act
    const queryLeaf = testSetup.getQueryLeaf();
    const sql = 'SELECT category, COUNT(*) as count FROM projection_test GROUP BY category';
    
    const results = ensureArray(await queryLeaf.execute(sql));
    
    // Assert
    expect(results).toHaveLength(2);
    
    // In GROUP BY, MongoDB puts the group key in _id
    // Depending on implementation, it could be in _id or directly in category
    const categoryValues = results.map(r => r._id || r.category);
    expect(categoryValues).toContain('Electronics');
    expect(categoryValues).toContain('Furniture');
    
    // Make sure each result has a count field
    results.forEach(result => {
      expect(result).toHaveProperty('count');
    });
  });

  test('should handle JOIN with proper _id field handling', async () => {
    // Arrange - Create related collections for JOIN test
    await db.collection('join_test_orders').deleteMany({});
    await db.collection('join_test_customers').deleteMany({});
    
    const customer1Id = new ObjectId();
    const customer2Id = new ObjectId();
    
    await db.collection('join_test_customers').insertMany([
      { _id: customer1Id, name: 'Alice', email: 'alice@example.com' },
      { _id: customer2Id, name: 'Bob', email: 'bob@example.com' }
    ]);
    
    await db.collection('join_test_orders').insertMany([
      { orderId: 'ORD-001', customerId: customer1Id, amount: 100 },
      { orderId: 'ORD-002', customerId: customer1Id, amount: 200 },
      { orderId: 'ORD-003', customerId: customer2Id, amount: 150 }
    ]);
    
    // Act - Test JOIN with specific field selection (no _id)
    const queryLeaf = testSetup.getQueryLeaf();
    const sql = `
      SELECT c.name, o.orderId, o.amount
      FROM join_test_customers c
      JOIN join_test_orders o ON c._id = o.customerId
    `;
    
    const results = ensureArray(await queryLeaf.execute(sql));
    
    // Assert
    expect(results.length).toBeGreaterThan(0);
    
    // Check fields in the result - _id should not be included
    expect(Object.keys(results[0])).toContain('name');
    expect(Object.keys(results[0])).toContain('orderId');
    expect(Object.keys(results[0])).toContain('amount');
    expect(Object.keys(results[0])).not.toContain('_id');
    expect(Object.keys(results[0])).not.toContain('customerId');
    expect(Object.keys(results[0])).not.toContain('email');
    
    // Clean up JOIN test collections
    await db.collection('join_test_orders').deleteMany({});
    await db.collection('join_test_customers').deleteMany({});
  });
});