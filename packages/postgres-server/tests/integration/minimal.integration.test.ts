import { MongoClient } from 'mongodb';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { PostgresServer } from '../../src/pg-server';
import { Client } from 'pg';
import debug from 'debug';

const log = debug('queryleaf:test:minimal-integration');

// Set a very long timeout for this test
jest.setTimeout(120000);

// Mock QueryLeaf class for testing
class MockQueryLeaf {
  constructor(public client: any, public dbName: string) {}
  
  execute(query: string): any[] {
    log(`Mock executing query: ${query}`);
    if (query.includes('test')) {
      return [{ test: 'success' }];
    }
    return [];
  }
  
  getDatabase() {
    return this.dbName;
  }
}

describe('Minimal PostgreSQL Integration Test', () => {
  let mongoContainer: StartedTestContainer;
  let mongoClient: MongoClient;
  let pgServer: PostgresServer;
  let pgClient: Client;
  const TEST_PORT = 5459; // Use a different port from other tests
  
  beforeAll(async () => {
    // Start MongoDB container
    log('Starting MongoDB container...');
    mongoContainer = await new GenericContainer('mongo:6.0')
      .withExposedPorts(27017)
      .start();
    
    const mongoHost = mongoContainer.getHost();
    const mongoPort = mongoContainer.getMappedPort(27017);
    const mongoUri = `mongodb://${mongoHost}:${mongoPort}`;
    
    log(`MongoDB container started at ${mongoUri}`);
    
    // Connect to MongoDB
    mongoClient = new MongoClient(mongoUri);
    await mongoClient.connect();
    
    // Create mock QueryLeaf
    const mockQueryLeaf = new MockQueryLeaf(mongoClient, 'minimal_test');
    
    // Create PostgreSQL server
    log('Creating PostgreSQL server instance...');
    pgServer = new PostgresServer(mongoClient, 'minimal_test', {
      port: TEST_PORT,
      host: '127.0.0.1',
      maxConnections: 5
    });
    
    // Replace the real QueryLeaf with our mock
    Object.defineProperty(pgServer, 'queryLeaf', {
      value: mockQueryLeaf
    });
    
    // Start server
    log(`Starting PostgreSQL server on port ${TEST_PORT}...`);
    await pgServer.listen(TEST_PORT, '127.0.0.1');
    log('PostgreSQL server started');
    
    // Create PostgreSQL client
    pgClient = new Client({
      host: '127.0.0.1',
      port: TEST_PORT,
      database: 'minimal_test',
      user: 'test',
      password: 'test'
    });
    
    // Connect to server
    log('Connecting to PostgreSQL server...');
    await pgClient.connect();
    log('PostgreSQL client connected');
  });
  
  afterAll(async () => {
    // Clean up resources
    log('Cleaning up resources...');
    
    if (pgClient) {
      await pgClient.end();
      log('PostgreSQL client disconnected');
    }
    
    if (pgServer) {
      await pgServer.shutdown();
      log('PostgreSQL server stopped');
    }
    
    if (mongoClient) {
      await mongoClient.close();
      log('MongoDB client disconnected');
    }
    
    if (mongoContainer) {
      await mongoContainer.stop();
      log('MongoDB container stopped');
    }
    
    log('All resources cleaned up');
  });
  
  it('should execute a simple test query', async () => {
    const result = await pgClient.query('SELECT test');
    log(`Query result: ${JSON.stringify(result)}`);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toHaveProperty('test');
    expect(result.rows[0].test).toBe('success');
  }, 90000);
});