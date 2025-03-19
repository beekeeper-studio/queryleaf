import { MongoClient } from 'mongodb';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { PostgresServer } from '../../src/pg-server';
import { Client } from 'pg';
import debug from 'debug';
import portfinder from 'portfinder';
import waitPort from 'wait-port';

const log = debug('queryleaf:test:minimal');

// Mock QueryLeaf class for testing
class MockQueryLeaf {
  constructor(public client: any, public dbName: string) {}
  
  execute(query: string) {
    log(`Mock executing query: ${query}`);
    if (query.includes('users')) {
      return [
        { name: 'John', age: 30 },
        { name: 'Jane', age: 25 }
      ];
    }
    // Return test data
    if (query.trim().toLowerCase() === 'select test') {
      return [{ test: 'success' }];
    }
    return [];
  }
  
  getDatabase() {
    return this.dbName;
  }
}

// Very long test timeout
jest.setTimeout(120000);

describe('Minimal PostgreSQL Server Integration Test', () => {
  let mongoContainer: StartedTestContainer;
  let mongoClient: MongoClient;
  let pgServer: PostgresServer;
  let pgPort: number;
  let pgClient: Client;
  
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
    
    // Create test database and load sample data
    const db = mongoClient.db('minimal_test');
    await db.collection('users').insertMany([
      { name: 'John', age: 30 },
      { name: 'Jane', age: 25 }
    ]);
    
    // Get free port for PostgreSQL server
    pgPort = await portfinder.getPortPromise({
      port: 5432,
      stopPort: 6000
    });
    
    log(`Using port ${pgPort} for PostgreSQL server`);
    
    // Create a mock QueryLeaf instance instead of using the real one
    const mockQueryLeaf = new MockQueryLeaf(mongoClient, 'minimal_test');
    
    // Start PostgreSQL server with the mock
    log('Creating PostgreSQL server instance with mock QueryLeaf...');
    // @ts-ignore - using mock class
    pgServer = new PostgresServer(mongoClient, 'minimal_test', {
      port: pgPort,
      host: '127.0.0.1',
      maxConnections: 5
    });
    
    // Replace the real QueryLeaf with our mock
    Object.defineProperty(pgServer, 'queryLeaf', {
      value: mockQueryLeaf
    });
    
    // Wait for server to start
    log(`Starting PostgreSQL server on port ${pgPort}...`);
    try {
      await pgServer.listen(pgPort, '127.0.0.1');
      log('PostgreSQL server started successfully');
    } catch (err) {
      log(`Error starting PostgreSQL server: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }
    
    log('Waiting 2 seconds for initialization...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Create PostgreSQL client
    pgClient = new Client({
      host: '127.0.0.1',
      port: pgPort,
      database: 'minimal_test',
      user: 'test',
      password: 'test'
    });
    
    await pgClient.connect();
    log('PostgreSQL client connected');
  });
  
  afterAll(async () => {
    // Clean up resources
    log('Cleaning up test resources...');
    
    if (pgClient) {
      try {
        await pgClient.end();
        log('PostgreSQL client disconnected');
      } catch (err) {
        log('Error disconnecting PostgreSQL client:', err);
      }
    }
    
    if (pgServer) {
      try {
        await pgServer.shutdown();
        log('PostgreSQL server stopped');
      } catch (err) {
        log('Error stopping PostgreSQL server:', err);
      }
    }
    
    if (mongoClient) {
      try {
        await mongoClient.close();
        log('MongoDB client closed');
      } catch (err) {
        log('Error closing MongoDB client:', err);
      }
    }
    
    if (mongoContainer) {
      try {
        await mongoContainer.stop();
        log('MongoDB container stopped');
      } catch (err) {
        log('Error stopping MongoDB container:', err);
      }
    }
  });
  
  it('should execute a simple test query', async () => {
    const result = await pgClient.query('SELECT test');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toHaveProperty('test');
    expect(result.rows[0].test).toBe('success');
  }, 90000);
});