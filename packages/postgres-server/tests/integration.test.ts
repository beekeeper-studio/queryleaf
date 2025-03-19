import { Pool, Client } from 'pg';
import { MongoClient, ObjectId } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { PostgresServer } from '../src/pg-server';
import { ChildProcess, spawn } from 'child_process';
import { join } from 'path';
import waitPort from 'wait-port';
import debug from 'debug';

// Test data
const testUsers = [
  { name: 'John Doe', age: 25, email: 'john@example.com', active: true },
  { name: 'Jane Smith', age: 30, email: 'jane@example.com', active: true },
  { name: 'Bob Johnson', age: 18, email: 'bob@example.com', active: false },
  { name: 'Alice Brown', age: 35, email: 'alice@example.com', active: true },
  { name: 'Charlie Davis', age: 17, email: 'charlie@example.com', active: false },
];

const testProducts = [
  { name: 'Laptop', price: 1200, category: 'Electronics', inStock: true },
  { name: 'Smartphone', price: 800, category: 'Electronics', inStock: true },
  { name: 'Headphones', price: 150, category: 'Electronics', inStock: false },
  { name: 'Chair', price: 250, category: 'Furniture', inStock: true },
  { name: 'Table', price: 450, category: 'Furniture', inStock: true },
];

const testOrders = [
  { userId: 'user1', productIds: ['product1', 'product3'], totalAmount: 1350, status: 'Completed' },
  { userId: 'user2', productIds: ['product2', 'product5'], totalAmount: 1250, status: 'Completed' },
  { userId: 'user3', productIds: ['product4'], totalAmount: 250, status: 'Processing' },
  { userId: 'user1', productIds: ['product5', 'product3'], totalAmount: 600, status: 'Completed' },
  { userId: 'user4', productIds: ['product1', 'product2'], totalAmount: 2000, status: 'Delivered' },
];

const log = debug('queryleaf:test:pg-integration');

const TEST_PORT = 5444;
const TEST_HOST = '127.0.0.1';
const TEST_DB = 'pg_integration_test';

describe('PostgreSQL Server Integration Tests', () => {
  let mongoServer: MongoMemoryServer;
  let mongoClient: MongoClient;
  let pgServer: PostgresServer | null = null;
  // No need for pgServerProcess as we're using the class directly
  let pgPool: Pool;

  // This setup runs a real PostgreSQL-compatible server as a separate process
  // to test the full end-to-end integration
  beforeAll(async () => {
    // Start MongoDB memory server
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    
    // Connect to MongoDB
    mongoClient = new MongoClient(mongoUri);
    await mongoClient.connect();
    
    // Set up test database with sample collections
    const db = mongoClient.db(TEST_DB);
    
    // Load test fixtures
    await db.collection('users').insertMany(testUsers);
    await db.collection('products').insertMany(testProducts);
    await db.collection('orders').insertMany(testOrders);
    
    // Add a collection with nested data to test nested field access
    await db.collection('documents').insertMany([
      { 
        title: 'Document 1', 
        metadata: { author: 'John', tags: ['tag1', 'tag2'], views: 100 },
        comments: [
          { user: 'Alice', text: 'Great document!', likes: 5 },
          { user: 'Bob', text: 'Very helpful', likes: 3 }
        ]
      },
      { 
        title: 'Document 2', 
        metadata: { author: 'Jane', tags: ['tag3', 'tag4'], views: 200 },
        comments: [
          { user: 'Charlie', text: 'Needs improvement', likes: 1 },
          { user: 'David', text: 'Excellent work', likes: 7 }
        ]
      }
    ]);
    
    // Start the PostgreSQL server directly instead of using the binary
    // This ensures we're using the TS version for testing
    log('Starting PostgreSQL server...');
    pgServer = new PostgresServer(mongoClient, TEST_DB, {
      port: TEST_PORT,
      host: TEST_HOST,
      maxConnections: 10
    });
    
    log(`PostgreSQL server started on ${TEST_HOST}:${TEST_PORT}`);
    
    // Wait for the server to be ready
    await waitPort({
      host: TEST_HOST,
      port: TEST_PORT,
      timeout: 10000
    });
    
    // Create a connection pool for tests
    pgPool = new Pool({
      host: TEST_HOST,
      port: TEST_PORT,
      database: TEST_DB,
      user: 'test',
      password: 'test',
      // Set a reasonable connection timeout
      connectionTimeoutMillis: 5000,
      // Reduce idle timeout for faster tests
      idleTimeoutMillis: 1000
    });
    
    // Wait a bit more to ensure the server is fully initialized
    await new Promise(resolve => setTimeout(resolve, 1000));
  }, 30000); // Increase timeout for server startup
  
  afterAll(async () => {
    // Clean up resources
    if (pgPool) {
      await pgPool.end();
    }
    
    // Shutdown the server
    if (pgServer) {
      await pgServer.shutdown();
    }
    
    // Clean up MongoDB
    await mongoClient.close();
    await mongoServer.stop();
  });
  
  it('should connect using a connection pool', async () => {
    // Simply test that we can get and release a client from the pool
    const client = await pgPool.connect();
    expect(client).toBeDefined();
    client.release();
  });
  
  it('should execute basic SELECT queries', async () => {
    const result = await pgPool.query('SELECT * FROM users');
    expect(result.rows).toHaveLength(5);
    expect(result.rows[0]).toHaveProperty('name');
    expect(result.rows[0]).toHaveProperty('age');
    expect(result.rows[0]).toHaveProperty('email');
  });
  
  it('should handle WHERE clauses', async () => {
    const result = await pgPool.query("SELECT * FROM users WHERE age > 30");
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].name).toBe('Alice Brown');
  });
  
  it('should support ORDER BY clauses', async () => {
    const result = await pgPool.query('SELECT * FROM users ORDER BY age ASC');
    expect(result.rows).toHaveLength(5);
    expect(result.rows[0].name).toBe('Charlie Davis');
    expect(result.rows[4].name).toBe('Alice Brown');
  });
  
  it('should support LIMIT and OFFSET', async () => {
    const result = await pgPool.query('SELECT * FROM users ORDER BY age ASC LIMIT 2 OFFSET 1');
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].name).toBe('Bob Johnson');
    expect(result.rows[1].name).toBe('John Doe');
  });
  
  it('should handle COUNT aggregations', async () => {
    const result = await pgPool.query('SELECT COUNT(*) FROM users WHERE active = true');
    expect(parseInt(result.rows[0].count)).toBe(3);
  });
  
  it('should support GROUP BY clauses', async () => {
    const result = await pgPool.query('SELECT active, COUNT(*) as count FROM users GROUP BY active');
    expect(result.rows).toHaveLength(2);
    
    // Find the active=true and active=false rows
    const activeRow = result.rows.find(r => r.active === true);
    const inactiveRow = result.rows.find(r => r.active === false);
    
    expect(parseInt(activeRow.count)).toBe(3);
    expect(parseInt(inactiveRow.count)).toBe(2);
  });
  
  it('should support transaction blocks', async () => {
    const client = await pgPool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Insert a new user in the transaction
      await client.query("INSERT INTO users (name, age, email, active) VALUES ('Test User', 40, 'test@example.com', true)");
      
      // Check the user exists in this transaction
      const result = await client.query("SELECT * FROM users WHERE email = 'test@example.com'");
      expect(result.rows).toHaveLength(1);
      
      await client.query('COMMIT');
      
      // Verify the user was saved after commit
      const finalResult = await pgPool.query("SELECT * FROM users WHERE email = 'test@example.com'");
      expect(finalResult.rows).toHaveLength(1);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });
  
  it('should support nested field access', async () => {
    const result = await pgPool.query("SELECT metadata.author, metadata.views FROM documents WHERE title = 'Document 1'");
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].author).toBe('John');
    expect(parseInt(result.rows[0].views)).toBe(100);
  });
  
  it('should handle array fields', async () => {
    // This is testing access to array fields in MongoDB documents
    const result = await pgPool.query("SELECT title, metadata.tags[0] as first_tag FROM documents");
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].first_tag).toBe('tag1');
    expect(result.rows[1].first_tag).toBe('tag3');
  });
  
  it('should support UPDATE operations', async () => {
    // Update a user's email
    await pgPool.query("UPDATE users SET email = 'newemail@example.com' WHERE name = 'John Doe'");
    
    // Verify the update worked
    const result = await pgPool.query("SELECT * FROM users WHERE name = 'John Doe'");
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].email).toBe('newemail@example.com');
  });
  
  it('should support DELETE operations', async () => {
    // Count users before delete
    const beforeResult = await pgPool.query("SELECT COUNT(*) FROM users");
    const beforeCount = parseInt(beforeResult.rows[0].count);
    
    // Delete a user
    await pgPool.query("DELETE FROM users WHERE name = 'Bob Johnson'");
    
    // Verify the delete worked
    const afterResult = await pgPool.query("SELECT COUNT(*) FROM users");
    const afterCount = parseInt(afterResult.rows[0].count);
    
    expect(afterCount).toBe(beforeCount - 1);
    
    // Check the specific user is gone
    const userResult = await pgPool.query("SELECT * FROM users WHERE name = 'Bob Johnson'");
    expect(userResult.rows).toHaveLength(0);
  });
  
  it('should support JOIN operations', async () => {
    // Join users with orders
    const result = await pgPool.query(`
      SELECT u.name as user_name, o.totalAmount, o.status 
      FROM users u 
      JOIN orders o ON u.name LIKE '%' || o.userId || '%' 
      ORDER BY o.totalAmount DESC
      LIMIT 3
    `);
    
    expect(result.rows).toHaveLength(3);
    expect(result.rows[0]).toHaveProperty('user_name');
    expect(result.rows[0]).toHaveProperty('totalamount');
    expect(result.rows[0]).toHaveProperty('status');
    
    // The first result should be the largest order
    expect(parseInt(result.rows[0].totalamount)).toBe(2000);
  });
  
  it('should handle concurrent connections', async () => {
    // Create multiple clients to test concurrent connections
    const client1 = new Client({
      host: TEST_HOST,
      port: TEST_PORT,
      database: TEST_DB,
      user: 'test1',
      password: 'test1',
    });
    
    const client2 = new Client({
      host: TEST_HOST,
      port: TEST_PORT,
      database: TEST_DB,
      user: 'test2',
      password: 'test2',
    });
    
    await client1.connect();
    await client2.connect();
    
    // Run queries concurrently
    const [result1, result2] = await Promise.all([
      client1.query('SELECT * FROM users LIMIT 2'),
      client2.query('SELECT * FROM products LIMIT 3')
    ]);
    
    expect(result1.rows).toHaveLength(2);
    expect(result2.rows).toHaveLength(3);
    
    await client1.end();
    await client2.end();
  });
});