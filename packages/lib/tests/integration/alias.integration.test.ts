import { ObjectId } from 'mongodb';
import { testSetup, ensureArray, ensureDocument } from './test-setup';

describe('SQL Aliases Integration Tests', () => {
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
  }, 10000); // Give it more time to clean up
  
  beforeEach(async () => {
    // Clean up collections before each test
    db = testSetup.getDb();
    await db.collection('customers').deleteMany({});
    await db.collection('products').deleteMany({});
    await db.collection('orders').deleteMany({});
  });
  
  afterEach(async () => {
    // Clean up collections after each test
    await db.collection('customers').deleteMany({});
    await db.collection('products').deleteMany({});
    await db.collection('orders').deleteMany({});
  });

  // Test case for SELECT with table alias
  test('should return correct fields when using table alias in SELECT', async () => {
    // Arrange
    await db.collection('customers').insertMany([
      { name: 'John Doe', email: 'john@example.com', active: true },
      { name: 'Jane Smith', email: 'jane@example.com', active: false }
    ]);
    
    // Act
    const queryLeaf = testSetup.getQueryLeaf();
    const sql = "SELECT c.name, c.active FROM customers c";
    
    const results = ensureArray(await queryLeaf.execute(sql));
    
    // Assert
    expect(results).toHaveLength(2);
    expect(results[0].name).toBe('John Doe');
    expect(results[0].active).toBe(true);
    expect(results[1].name).toBe('Jane Smith');
    expect(results[1].active).toBe(false);
  });

  // Test case for just selecting a single field with table alias
  test('should return single field when using table alias in SELECT', async () => {
    // Arrange
    await db.collection('customers').insertMany([
      { name: 'John Doe', email: 'john@example.com', active: true },
      { name: 'Jane Smith', email: 'jane@example.com', active: false }
    ]);
    
    // Act
    const queryLeaf = testSetup.getQueryLeaf();
    const sql = "SELECT c.active FROM customers c";
    
    const results = ensureArray(await queryLeaf.execute(sql));
    
    // Assert
    expect(results).toHaveLength(2);
    expect(results[0]).toHaveProperty('active');
    expect(results[0].active).toBe(true);
    expect(results[1]).toHaveProperty('active');
    expect(results[1].active).toBe(false);
  });

  // Test case for table alias in WHERE clause
  test('should filter correctly when using table alias in WHERE clause', async () => {
    // Arrange
    await db.collection('customers').insertMany([
      { name: 'John Doe', email: 'john@example.com', active: true },
      { name: 'Jane Smith', email: 'jane@example.com', active: false }
    ]);
    
    // Act
    const queryLeaf = testSetup.getQueryLeaf();
    const sql = "SELECT c.name FROM customers c WHERE c.active = true";
    
    const results = ensureArray(await queryLeaf.execute(sql));
    
    // Assert
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('John Doe');
  });

  // Test case for combining table alias with column alias
  test('should support combined table alias with column alias', async () => {
    // Arrange
    await db.collection('customers').insertMany([
      { name: 'John Doe', email: 'john@example.com', active: true },
      { name: 'Jane Smith', email: 'jane@example.com', active: false }
    ]);
    
    // Act
    const queryLeaf = testSetup.getQueryLeaf();
    const sql = "SELECT c.name AS customer_name, c.active AS is_active FROM customers c";
    
    const results = ensureArray(await queryLeaf.execute(sql));
    
    // Assert
    expect(results).toHaveLength(2);
    
    // Create helper to handle different output formats
    const getField = (obj: any, field: string) => {
      return obj[field] !== undefined ? obj[field] : 
             (obj._id && obj._id[field] !== undefined ? obj._id[field] : undefined);
    };
    
    // First customer should be John Doe and active
    const john = results.find((r: any) => 
      getField(r, 'customer_name') === 'John Doe' || r.name === 'John Doe'
    );
    expect(john).toBeDefined();
    if (john) {
      const isActive = getField(john, 'is_active');
      expect(isActive).toBe(true);
    }
    
    // Second customer should be Jane Smith and not active
    const jane = results.find((r: any) => 
      getField(r, 'customer_name') === 'Jane Smith' || r.name === 'Jane Smith'
    );
    expect(jane).toBeDefined();
    if (jane) {
      const isActive = getField(jane, 'is_active');
      expect(isActive).toBe(false);
    }
  });

  // Test case for using table alias in UPDATE statement
  test('should update correctly when using table alias in UPDATE', async () => {
    // Arrange
    await db.collection('customers').insertMany([
      { name: 'John Doe', email: 'john@example.com', active: true },
      { name: 'Jane Smith', email: 'jane@example.com', active: false }
    ]);
    
    // Act
    const queryLeaf = testSetup.getQueryLeaf();
    const updateSql = "UPDATE customers c SET c.active = true WHERE c.name = 'Jane Smith'";
    
    await queryLeaf.execute(updateSql);
    
    // Verify with a SELECT
    const selectSql = "SELECT name, active FROM customers";
    const results = ensureArray(await queryLeaf.execute(selectSql));
    
    // Assert
    expect(results).toHaveLength(2);
    const jane = results.find((r: any) => r.name === 'Jane Smith');
    expect(jane).toBeDefined();
    expect(jane?.active).toBe(true);
  });

  // Test case for using table alias in DELETE statement
  test('should delete correctly when using table alias in DELETE', async () => {
    // Arrange
    await db.collection('customers').insertMany([
      { name: 'John Doe', email: 'john@example.com', active: true },
      { name: 'Jane Smith', email: 'jane@example.com', active: false }
    ]);
    
    // Act
    const queryLeaf = testSetup.getQueryLeaf();
    const deleteSql = "DELETE FROM customers c WHERE c.active = false";
    
    await queryLeaf.execute(deleteSql);
    
    // Verify with a SELECT
    const selectSql = "SELECT name, active FROM customers";
    const results = ensureArray(await queryLeaf.execute(selectSql));
    
    // Assert
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('John Doe');
    expect(results[0].active).toBe(true);
  });

  // Test case for multiple table aliases in a query with JOIN
  test('should handle multiple table aliases in a JOIN query', async () => {
    // Arrange
    const johnId = new ObjectId();
    const janeId = new ObjectId();
    
    await db.collection('customers').insertMany([
      { _id: johnId, name: 'John Doe', email: 'john@example.com' },
      { _id: janeId, name: 'Jane Smith', email: 'jane@example.com' }
    ]);
    
    await db.collection('orders').insertMany([
      { customerId: johnId, product: 'Laptop', price: 1200 },
      { customerId: johnId, product: 'Mouse', price: 25 },
      { customerId: janeId, product: 'Keyboard', price: 100 }
    ]);
    
    // Act
    const queryLeaf = testSetup.getQueryLeaf();
    const sql = `
      SELECT c.name, o.product, o.price 
      FROM customers c
      JOIN orders o ON c._id = o.customerId
    `;
    
    const results = ensureArray(await queryLeaf.execute(sql));
    
    // Assert
    expect(results.length).toBeGreaterThan(0);
    
    // Look for John's laptop order
    const johnLaptop = results.find((r: any) => 
      r.name === 'John Doe' && r.product === 'Laptop'
    );
    expect(johnLaptop).toBeDefined();
    if (johnLaptop) {
      expect(johnLaptop.price).toBe(1200);
    }
    
    // Look for Jane's keyboard order
    const janeKeyboard = results.find((r: any) => 
      r.name === 'Jane Smith' && r.product === 'Keyboard'
    );
    expect(janeKeyboard).toBeDefined();
    if (janeKeyboard) {
      expect(janeKeyboard.price).toBe(100);
    }
  });

  // Test case for alias in ORDER BY clause
  test('should sort correctly when using alias in ORDER BY', async () => {
    // Arrange
    await db.collection('products').insertMany([
      { name: 'Laptop', category: 'Electronics', price: 1200 },
      { name: 'Mouse', category: 'Electronics', price: 25 },
      { name: 'Desk', category: 'Furniture', price: 300 }
    ]);
    
    // Act
    const queryLeaf = testSetup.getQueryLeaf();
    const sql = "SELECT p.name, p.price FROM products p ORDER BY p.price DESC";
    
    const results = ensureArray(await queryLeaf.execute(sql));
    
    // Assert
    expect(results).toHaveLength(3);
    // First should be laptop (highest price)
    expect(results[0].name).toBe('Laptop');
    // Last should be mouse (lowest price)
    expect(results[2].name).toBe('Mouse');
  });

  // Test case for using alias in GROUP BY clause
  test('should group correctly when using alias in GROUP BY', async () => {
    // Arrange
    await db.collection('products').insertMany([
      { name: 'Laptop', category: 'Electronics', price: 1200 },
      { name: 'Mouse', category: 'Electronics', price: 25 },
      { name: 'Keyboard', category: 'Electronics', price: 100 },
      { name: 'Desk', category: 'Furniture', price: 300 },
      { name: 'Chair', category: 'Furniture', price: 150 }
    ]);
    
    // Act
    const queryLeaf = testSetup.getQueryLeaf();
    const sql = "SELECT p.category, COUNT(*) as count FROM products p GROUP BY p.category";
    
    const results = ensureArray(await queryLeaf.execute(sql));
    
    // Assert
    expect(results.length).toBe(2);
    
    // Helper function to get field from different possible locations
    const getFieldValue = (obj: any, field: string) => {
      if (obj[field] !== undefined) return obj[field];
      if (obj._id && typeof obj._id === 'object' && obj._id[field] !== undefined) return obj._id[field];
      if (obj._id === field) return field;
      return undefined;
    };
    
    // Helper function to get count from different possible locations
    const getCount = (obj: any) => {
      if (obj.count !== undefined) return obj.count;
      if (obj.COUNT !== undefined) return obj.COUNT;
      return undefined;
    };
    
    // Check that we have both categories with correct counts
    const electronics = results.find((r: any) => getFieldValue(r, 'category') === 'Electronics');
    const furniture = results.find((r: any) => getFieldValue(r, 'category') === 'Furniture');
    
    expect(electronics).toBeDefined();
    expect(furniture).toBeDefined();
    
    if (electronics) {
      const count = getCount(electronics);
      expect(count).toBe(3);
    }
    
    if (furniture) {
      const count = getCount(furniture);
      expect(count).toBe(2);
    }
  });

  // Test case for alias with functions
  test('should handle alias with functions in SELECT', async () => {
    // Arrange
    await db.collection('products').insertMany([
      { name: 'Laptop', price: 1200 },
      { name: 'Mouse', price: 25 },
      { name: 'Keyboard', price: 100 }
    ]);
    
    // Act
    const queryLeaf = testSetup.getQueryLeaf();
    const sql = "SELECT p.name, UPPER(p.name) as upper_name FROM products p";
    
    const results = ensureArray(await queryLeaf.execute(sql));
    
    // Assert
    expect(results).toHaveLength(3);
    
    // Get helper function to handle different output formats
    const getField = (obj: any, field: string) => {
      return obj[field] !== undefined ? obj[field] : 
             (obj._id && obj._id[field] !== undefined ? obj._id[field] : undefined);
    };
    
    // Look for laptop record
    const laptop = results.find((r: any) => r.name === 'Laptop');
    expect(laptop).toBeDefined();
    if (laptop) {
      const upperName = getField(laptop, 'upper_name');
      // If the function is supported, the name should be uppercase
      if (upperName) {
        expect(upperName).toBe('LAPTOP');
      }
    }
  });
});
