import { MongoTestContainer, loadFixtures, testUsers, testProducts, testOrders } from '../utils/mongo-container';
import { createSquongo } from '../../index';
import { Db } from 'mongodb';

/**
 * Base test setup for integration tests
 */
export class IntegrationTestSetup {
  public mongoContainer: MongoTestContainer;
  public TEST_DB = 'squongo_test';
  public connectionString: string = '';
  
  constructor() {
    this.mongoContainer = new MongoTestContainer();
  }
  
  /**
   * Initialize the test environment
   */
  async init(): Promise<void> {
    this.connectionString = await this.mongoContainer.start();
    const db = this.mongoContainer.getDatabase(this.TEST_DB);
    await loadFixtures(db);
  }
  
  /**
   * Clean up the test environment
   */
  async cleanup(): Promise<void> {
    try {
      // Stop the container - this will close the connection
      await this.mongoContainer.stop();
    } catch (err) {
      console.error('Error stopping MongoDB container:', err);
    }
  }
  
  /**
   * Get a database instance
   */
  getDb(): Db {
    return this.mongoContainer.getDatabase(this.TEST_DB);
  }
  
  /**
   * Create a new Squongo instance
   */
  getSquongo() {
    return createSquongo(this.connectionString, this.TEST_DB);
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