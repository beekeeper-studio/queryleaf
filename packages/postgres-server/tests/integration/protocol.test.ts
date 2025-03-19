import { Socket } from 'net';
import { PostgresServer } from '../../src/pg-server';
import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import debug from 'debug';
import portfinder from 'portfinder';
import waitPort from 'wait-port';
import { Client } from 'pg';

const log = debug('queryleaf:test:protocol');

// For a fixed test port
const TEST_PORT = 5460;

// Set a longer timeout for these tests
jest.setTimeout(60000); // 60 seconds

describe('PostgreSQL Protocol Implementation', () => {
  let mongoServer: MongoMemoryServer;
  let mongoClient: MongoClient;
  let pgServer: PostgresServer;
  const TEST_DB = 'test_protocol_db';

  beforeAll(async () => {
    // Set up MongoDB memory server
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    
    // Connect to MongoDB
    mongoClient = new MongoClient(mongoUri);
    await mongoClient.connect();
    
    // Get a free port
    const port = await portfinder.getPortPromise({
      port: TEST_PORT,
      stopPort: TEST_PORT + 100
    });
    
    // Start PostgreSQL server
    pgServer = new PostgresServer(mongoClient, TEST_DB, {
      port,
      host: 'localhost',
      maxConnections: 5
    });
    
    await pgServer.listen(port, 'localhost');
    
    // Wait for server to be ready
    log(`Waiting for PostgreSQL server at localhost:${port}...`);
    const portResult = await waitPort({
      host: 'localhost',
      port,
      timeout: 10000,
      output: 'silent'
    });
    
    if (!portResult.open) {
      throw new Error(`Port ${port} is not open after waiting`);
    }
    
    // Additional wait to ensure server is fully initialized
    await new Promise(resolve => setTimeout(resolve, 500));
    log('PostgreSQL server is ready');
  });
  
  afterAll(async () => {
    // Clean up resources
    if (pgServer) {
      await pgServer.shutdown();
    }
    
    if (mongoClient) {
      await mongoClient.close();
    }
    
    if (mongoServer) {
      await mongoServer.stop();
    }
  });
  
  it('should handle authentication and basic query execution', async () => {
    // Create a pg client to test our implementation
    const client = new Client({
      host: 'localhost',
      port: TEST_PORT,
      database: TEST_DB,
      user: 'testuser',
      password: 'testpass',
      // Set a reasonable connection timeout
      connectionTimeoutMillis: 5000
    });
    
    try {
      // Connect to the server (tests startup message and auth handling)
      await client.connect();
      log('Client connected successfully');
      
      // Execute test query
      const result = await client.query('SELECT test');
      
      // Verify query response
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].test).toBe('success');
      
      log('Query executed successfully');
    } finally {
      // Close connection
      await client.end();
      log('Client disconnected');
    }
  });
  
  it('should handle transaction control statements', async () => {
    // Create a pg client to test our implementation
    const client = new Client({
      host: 'localhost',
      port: TEST_PORT,
      database: TEST_DB,
      user: 'testuser',
      password: 'testpass',
      // Set a reasonable connection timeout
      connectionTimeoutMillis: 5000
    });
    
    try {
      // Connect to the server
      await client.connect();
      log('Client connected successfully');
      
      // Begin transaction
      const beginResult = await client.query('BEGIN');
      expect(beginResult.command).toBe('BEGIN');
      
      // Should be in transaction block - use a valid query format for our server
      const inTransactionResult = await client.query('SELECT test');
      
      // Commit transaction
      const commitResult = await client.query('COMMIT');
      expect(commitResult.command).toBe('COMMIT');
      
      log('Transaction control statements handled successfully');
    } finally {
      // Close connection
      await client.end();
      log('Client disconnected');
    }
  });
});

