import { MongoTestContainer, loadFixtures, testUsers, testProducts, testOrders, testDocuments } from './mongo-container';
import { PostgresServer } from '../../src/pg-server';
import { QueryLeaf } from '@queryleaf/lib';
import { Db } from 'mongodb';
import debug from 'debug';
import portfinder from 'portfinder';
import waitPort from 'wait-port';

const log = debug('queryleaf:test:pg-integration');

/**
 * Base test setup for PostgreSQL server integration tests
 */
export class PgIntegrationTestSetup {
  public mongoContainer: MongoTestContainer;
  public TEST_DB = 'queryleaf_pg_test';
  public pgServer: PostgresServer | null = null;
  public pgPort: number = 0;
  public pgHost: string = '127.0.0.1';
  
  constructor() {
    this.mongoContainer = new MongoTestContainer();
  }
  
  /**
   * Initialize the test environment
   */
  async init(): Promise<void> {
    // Start MongoDB container
    await this.mongoContainer.start();
    const db = this.mongoContainer.getDatabase(this.TEST_DB);
    await loadFixtures(db);
    
    // Use TEST_PORT from integration test if available in the scope
    this.pgPort = 5458; // Fixed test port
    
    log(`Using port ${this.pgPort} for PostgreSQL server`);
    
    // Start PostgreSQL server
    const mongoClient = this.mongoContainer.getClient();
    const queryLeaf = new QueryLeaf(mongoClient, this.TEST_DB);
    
    this.pgServer = new PostgresServer(mongoClient, this.TEST_DB, {
      port: this.pgPort,
      host: this.pgHost,
      maxConnections: 10
    });
    
    // Explicitly call listen since we modified the constructor to not auto-listen
    await this.pgServer.listen(this.pgPort, this.pgHost);
    
    // Wait for the server to be ready
    log(`Waiting for PostgreSQL server at ${this.pgHost}:${this.pgPort}...`);
    
    try {
      const portResult = await waitPort({
        host: this.pgHost,
        port: this.pgPort,
        timeout: 20000,
        output: 'silent'
      });
      
      log(`Port check result: ${JSON.stringify(portResult)}`);
      
      if (!portResult.open) {
        throw new Error(`Port ${this.pgPort} is not open after waiting`);
      }
      
      // Give the server a moment to fully initialize
      log('Port is open, waiting 2 seconds for full initialization...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      log('PostgreSQL server is ready');
    } catch (error) {
      log(`Failed waiting for port: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
  
  /**
   * Clean up the test environment
   */
  async cleanup(): Promise<void> {
    try {
      // Stop the PostgreSQL server
      if (this.pgServer) {
        log('Stopping PostgreSQL server...');
        await this.pgServer.shutdown();
        this.pgServer = null;
      }
      
      // Stop the MongoDB container
      log('Stopping MongoDB container...');
      await this.mongoContainer.stop();
    } catch (err) {
      log('Error during cleanup:', err);
    }
  }
  
  /**
   * Get PostgreSQL connection info
   */
  getPgConnectionInfo() {
    return {
      host: this.pgHost,
      port: this.pgPort,
      database: this.TEST_DB,
      user: 'test', // Any username works with our simple implementation
      password: 'test', // Any password works with our simple implementation
    };
  }
  
  /**
   * Get a database instance
   */
  getDb(): Db {
    return this.mongoContainer.getDatabase(this.TEST_DB);
  }
}

/**
 * Create a shared test setup instance
 */
export const testSetup = new PgIntegrationTestSetup();

/**
 * Export fixture data for tests
 */
export { testUsers, testProducts, testOrders, testDocuments };

/**
 * Create debug logger for tests
 */
export const createLogger = (namespace: string) => debug(`queryleaf:test:${namespace}`);