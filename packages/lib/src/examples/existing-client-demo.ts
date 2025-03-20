/**
 * Example showing how to use QueryLeaf with an existing MongoDB client
 * This is the recommended way to use QueryLeaf in a real application
 */

import { MongoClient } from 'mongodb';
import { QueryLeaf } from '../index';

// This would be your application's existing MongoDB client setup
class MyApplication {
  private mongoClient: MongoClient;

  constructor() {
    // Your application's MongoDB client configuration
    this.mongoClient = new MongoClient('mongodb://localhost:27017', {
      // Your custom options here
      connectTimeoutMS: 5000,
      // etc.
    });
  }

  async initialize() {
    console.log('Initializing application...');
    // Connect your MongoDB client
    await this.mongoClient.connect();
    console.log('MongoDB client connected');
  }

  async shutdown() {
    console.log('Shutting down application...');
    await this.mongoClient.close();
    console.log('MongoDB client disconnected');
  }

  // Your application would use this MongoDB client directly for some operations
  getMongoClient() {
    return this.mongoClient;
  }
}

async function main() {
  // Create your application
  const app = new MyApplication();

  try {
    // Initialize your application (connects to MongoDB)
    await app.initialize();

    // Create QueryLeaf using your application's MongoDB client directly
    const queryLeaf = new QueryLeaf(app.getMongoClient(), 'example_db');

    console.log('\nExecuting SQL query using your existing MongoDB client:');

    // Example: Create a test collection
    const createQuery = `
      INSERT INTO test_collection (name, value) VALUES 
      ('Example', 42)
    `;

    console.log(`\nExecuting SQL: ${createQuery}`);
    const createResult = await queryLeaf.execute(createQuery);
    console.log('Result:', JSON.stringify(createResult, null, 2));

    // Example: Query the collection
    const selectQuery = 'SELECT * FROM test_collection';
    console.log(`\nExecuting SQL: ${selectQuery}`);
    const selectResult = await queryLeaf.execute(selectQuery);
    console.log('Result:', JSON.stringify(selectResult, null, 2));

    // Clean up
    const cleanupQuery = 'DELETE FROM test_collection';
    console.log(`\nExecuting SQL: ${cleanupQuery}`);
    const cleanupResult = await queryLeaf.execute(cleanupQuery);
    console.log('Result:', JSON.stringify(cleanupResult, null, 2));

    // You can close QueryLeaf, but it won't close your MongoDB client
    await queryLeaf.close();
  } finally {
    // Your application manages the MongoDB client lifecycle
    await app.shutdown();
  }
}

// Run the example
if (require.main === module) {
  main().catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
}
