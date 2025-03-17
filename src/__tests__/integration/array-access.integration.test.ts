import { ObjectId } from 'mongodb';
import { testSetup } from './test-setup';

describe('Array Access Integration Tests', () => {
  beforeAll(async () => {
    await testSetup.init();
  }, 30000); // 30 second timeout for container startup
  
  afterAll(async () => {
    await testSetup.cleanup();
  });
  
  beforeEach(async () => {
    // Add test data for array access
    const db = testSetup.getDb();
    await db.collection('order_items').deleteMany({});
  });
  
  afterEach(async () => {
    // Clean up test data
    const db = testSetup.getDb();
    await db.collection('order_items').deleteMany({});
  });

  test('should handle array access syntax for nested field access in queries', async () => {
    // Arrange: Insert test data with arrays - keep it very simple
    const db = testSetup.getDb();
    await db.collection('order_items').insertOne({
      orderId: 'ORD-1001',
      items: [
        { name: 'Widget', price: 10.99 },
        { name: 'Gadget', price: 24.99 }
      ]
    });
    
    // Act: Execute query accessing just the first array element
    const squongo = testSetup.getSquongo();
    // Use the __ARRAY_ syntax that Squongo expects for array access
    const sql = `
      SELECT 
        orderId
      FROM order_items
      WHERE items__ARRAY_0__name = 'Widget'
    `;
    
    const results = await squongo.execute(sql);
    console.log('Array access filter results:', JSON.stringify(results, null, 2));
    
    // Assert: Verify that filtering by array element works
    expect(results).toHaveLength(1);
    expect(results[0].orderId).toBe('ORD-1001');
  });

  test('should filter by array element properties at different indices', async () => {
    // Arrange: Insert test data with arrays
    const db = testSetup.getDb();
    await db.collection('order_items').insertMany([
      {
        orderId: 'ORD-1001',
        items: [
          { id: 'ITEM-1', name: 'Widget', price: 10.99, inStock: true },
          { id: 'ITEM-2', name: 'Gadget', price: 24.99, inStock: false }
        ]
      },
      {
        orderId: 'ORD-1002',
        items: [
          { id: 'ITEM-3', name: 'Tool', price: 15.50, inStock: true },
          { id: 'ITEM-4', name: 'Device', price: 99.99, inStock: true }
        ]
      },
      {
        orderId: 'ORD-1003',
        items: [
          { id: 'ITEM-5', name: 'Widget', price: 11.99, inStock: false },
          { id: 'ITEM-6', name: 'Gizmo', price: 34.99, inStock: true }
        ]
      }
    ]);
    
    // Act: Execute query filtering on different array indices
    const squongo = testSetup.getSquongo();
    const sql = `
      SELECT orderId
      FROM order_items
      WHERE items__ARRAY_0__name = 'Widget' AND items__ARRAY_1__inStock = true
    `;
    
    const results = await squongo.execute(sql);
    console.log('Array indices filtering results:', JSON.stringify(results, null, 2));
    
    // Assert: Verify only the order with Widget as first item and inStock=true for second item
    expect(results).toHaveLength(1);
    expect(results[0].orderId).toBe('ORD-1003');
  });
});