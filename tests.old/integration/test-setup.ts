import { MongoTestContainer, loadFixtures, testUsers, testProducts, testOrders } from '../utils/mongo-container';
import { QueryLeaf } from '../../src/index';
import { Db } from 'mongodb';
import debug from 'debug';

/**
 * Base test setup for integration tests
 */
export class IntegrationTestSetup {
  public mongoContainer: MongoTestContainer;
  public TEST_DB = 'queryleaf_test';
  
  constructor() {
    this.mongoContainer = new MongoTestContainer();
  }
  
  /**
   * Initialize the test environment
   */
  async init(): Promise<void> {
    await this.mongoContainer.start();
    const db = this.mongoContainer.getDatabase(this.TEST_DB);
    await loadFixtures(db);
  }
  
  /**
   * Clean up the test environment
   */
  async cleanup(): Promise<void> {
    const log = debug('queryleaf:test:cleanup');
    try {
      // Stop the container - this will close the connection
      await this.mongoContainer.stop();
    } catch (err) {
      log('Error stopping MongoDB container:', err);
    }
  }
  
  /**
   * Get a database instance
   */
  getDb(): Db {
    return this.mongoContainer.getDatabase(this.TEST_DB);
  }
  
  /**
   * Create a new QueryLeaf instance
   */
  getQueryLeaf() {
    const client = this.mongoContainer.getClient();
    return new QueryLeaf(client, this.TEST_DB);
  }
}

/**
 * Create a shared instance for test files
 */
export const testSetup = new IntegrationTestSetup();

/**
 * Export fixture data for tests
 */
export { testUsers, testProducts, testOrders };

/**
 * Create debug logger for tests
 */
export const createLogger = (namespace: string) => debug(`queryleaf:test:${namespace}`);