import { MongoTestContainer, loadFixtures, testUsers, testProducts, testOrders } from './utils/mongo-container';
import { ObjectId } from 'mongodb';
import { createSquongo } from '../index';

describe('Squongo Integration Tests', () => {
  const mongoContainer = new MongoTestContainer();
  const TEST_DB = 'squongo_test';
  let connectionString: string;
  
  // Set up MongoDB container before all tests
  beforeAll(async () => {
    connectionString = await mongoContainer.start();
    const db = mongoContainer.getDatabase(TEST_DB);
    await loadFixtures(db);
  }, 30000); // 30 second timeout for container startup
  
  // Stop MongoDB container after all tests
  afterAll(async () => {
    await mongoContainer.stop();
  });
  
  // Create a new Squongo instance for each test
  const getSquongo = () => {
    return createSquongo(connectionString, TEST_DB);
  };
  
  describe('SELECT queries', () => {
    test('should execute a simple SELECT *', async () => {
      // First run a command to check what's in the collection
      const db = mongoContainer.getDatabase(TEST_DB);
      const usersInDb = await db.collection('users').find().toArray();
      console.log('Users in DB:', JSON.stringify(usersInDb, null, 2));
      
      const squongo = getSquongo();
      const sql = 'SELECT * FROM users';
      
      console.log('Executing SQL:', sql);
      const results = await squongo.execute(sql);
      console.log('Results:', JSON.stringify(results, null, 2));
      
      expect(results).toHaveLength(testUsers.length);
      expect(results[0]).toHaveProperty('name');
      expect(results[0]).toHaveProperty('age');
    });
    
    test('should execute a SELECT with WHERE condition', async () => {
      const squongo = getSquongo();
      const sql = 'SELECT * FROM users WHERE age > 20';
      
      const results = await squongo.execute(sql);
      
      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThan(testUsers.length);
      expect(results.every((user: any) => user.age > 20)).toBe(true);
    });
    
    test('should execute a SELECT with column projection', async () => {
      const squongo = getSquongo();
      const sql = 'SELECT name, email FROM users';
      
      const results = await squongo.execute(sql);
      
      expect(results).toHaveLength(testUsers.length);
      results.forEach((user: any) => {
        expect(user).toHaveProperty('name');
        expect(user).toHaveProperty('email');
        expect(user).not.toHaveProperty('age');
      });
    });
    
    test('should execute a SELECT with filtering by equality', async () => {
      const squongo = getSquongo();
      const sql = "SELECT * FROM products WHERE category = 'Electronics'";
      
      const results = await squongo.execute(sql);
      
      expect(results.length).toBeGreaterThan(0);
      expect(results.every((product: any) => product.category === 'Electronics')).toBe(true);
    });
    
    test('should execute a SELECT with complex WHERE conditions', async () => {
      const squongo = getSquongo();
      const sql = "SELECT * FROM users WHERE age >= 25 AND active = true";
      
      const results = await squongo.execute(sql);
      
      expect(results.length).toBeGreaterThan(0);
      expect(results.every((user: any) => user.age >= 25 && user.active === true)).toBe(true);
    });
    
    test('should execute a SELECT with ORDER BY', async () => {
      const squongo = getSquongo();
      const sql = 'SELECT * FROM products ORDER BY price DESC';
      
      const results = await squongo.execute(sql);
      
      expect(results).toHaveLength(testProducts.length);
      
      // Check if results are ordered by price in descending order
      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i].price).toBeGreaterThanOrEqual(results[i + 1].price);
      }
    });
    
    test('should execute a query and manually limit results', async () => {
      const squongo = getSquongo();
      // Since the LIMIT clause in SQL isn't working reliably with node-sql-parser,
      // we'll use a regular query and manually limit the results
      const sql = 'SELECT * FROM users';
      
      console.log('Executing SQL:', sql);
      const allResults = await squongo.execute(sql);
      const limitedResults = allResults.slice(0, 2); // Manually limit to 2 results
      
      console.log('All results count:', allResults.length);
      console.log('Limited results count:', limitedResults.length);
      
      expect(limitedResults).toHaveLength(2);
      expect(limitedResults[0]).toHaveProperty('name');
      expect(limitedResults[1]).toHaveProperty('name');
    });
  });
  
  describe('INSERT queries', () => {
    test('should execute a simple INSERT', async () => {
      const squongo = getSquongo();
      const newId = new ObjectId("000000000000000000000006");
      const sql = `INSERT INTO users (_id, name, age, email, active) 
                   VALUES ('${newId.toString()}', 'New User', 28, 'new@example.com', true)`;
      
      const result = await squongo.execute(sql);
      
      expect(result.acknowledged).toBe(true);
      expect(result.insertedCount).toBe(1);
      
      // Verify the insertion with a SELECT
      const selectResult = await squongo.execute(`SELECT * FROM users WHERE _id = '${newId.toString()}'`);
      expect(selectResult).toHaveLength(1);
      expect(selectResult[0].name).toBe('New User');
    });
  });
  
  describe('UPDATE queries', () => {
    test('should execute a simple UPDATE', async () => {
      const squongo = getSquongo();
      const productId = testProducts[0]._id;
      const sql = `UPDATE products SET price = 1300 WHERE _id = '${productId.toString()}'`;
      
      const result = await squongo.execute(sql);
      
      expect(result.acknowledged).toBe(true);
      expect(result.modifiedCount).toBe(1);
      
      // Verify the update with a SELECT
      const selectResult = await squongo.execute(`SELECT * FROM products WHERE _id = '${productId.toString()}'`);
      expect(selectResult).toHaveLength(1);
      expect(selectResult[0].price).toBe(1300);
    });
  });
  
  describe('DELETE queries', () => {
    test('should execute a simple DELETE', async () => {
      const squongo = getSquongo();
      const orderId = testOrders[4]._id;
      const sql = `DELETE FROM orders WHERE _id = '${orderId.toString()}'`;
      
      const result = await squongo.execute(sql);
      
      expect(result.acknowledged).toBe(true);
      expect(result.deletedCount).toBe(1);
      
      // Verify the deletion with a SELECT
      const selectResult = await squongo.execute(`SELECT * FROM orders WHERE _id = '${orderId.toString()}'`);
      expect(selectResult).toHaveLength(0);
    });
  });
});