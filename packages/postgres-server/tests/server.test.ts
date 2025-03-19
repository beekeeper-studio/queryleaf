import { MongoClient } from 'mongodb';
import { PostgresServer } from '../src/pg-server';
import { Client } from 'pg';
import { MongoMemoryServer } from 'mongodb-memory-server';

// Create a test database
let mongoServer: MongoMemoryServer;
let mongoClient: MongoClient;
let pgServer: any;

const TEST_PORT = 5433;
const TEST_HOST = '127.0.0.1';
const TEST_DB = 'test_db';

describe('PostgreSQL Server', () => {
  beforeAll(async () => {
    // Start MongoDB memory server
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    
    // Connect to MongoDB
    mongoClient = new MongoClient(mongoUri);
    await mongoClient.connect();
    
    // Create test data
    const db = mongoClient.db(TEST_DB);
    await db.collection('users').insertMany([
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 },
      { name: 'Charlie', age: 35 },
    ]);
    
    // Start PostgreSQL server
    pgServer = new PostgresServer(mongoClient, TEST_DB, {
      port: TEST_PORT,
      host: TEST_HOST,
      maxConnections: 10,
    });
    
    // Wait a bit for the server to start
    await new Promise(resolve => setTimeout(resolve, 1000));
  }, 30000);
  
  afterAll(async () => {
    // Clean up
    await mongoClient.close();
    await mongoServer.stop();
    
    // Shutdown server
    if (pgServer) {
      await pgServer.shutdown();
    }
  });
  
  it('should connect to the server', async () => {
    const client = new Client({
      host: TEST_HOST,
      port: TEST_PORT,
      database: TEST_DB,
      user: 'test',
      password: 'test',
    });
    
    await client.connect();
    await client.end();
  });
  
  it('should execute a simple query', async () => {
    const client = new Client({
      host: TEST_HOST,
      port: TEST_PORT,
      database: TEST_DB,
      user: 'test',
      password: 'test',
    });
    
    await client.connect();
    
    const result = await client.query('SELECT * FROM users');
    expect(result.rows).toHaveLength(3);
    expect(result.rows[0]).toHaveProperty('name');
    expect(result.rows[0]).toHaveProperty('age');
    
    await client.end();
  });
});