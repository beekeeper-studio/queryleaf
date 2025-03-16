import { createSquongo } from '../index';

/**
 * Example showing basic usage of Squongo
 */
async function main() {
  // Connection info for MongoDB
  const connectionString = 'mongodb://localhost:27017';
  const dbName = 'example';
  
  // Create a Squongo instance
  const squongo = createSquongo(connectionString, dbName);
  
  try {
    // Example SQL queries
    const queries = [
      // Basic SELECT
      'SELECT * FROM users LIMIT 5',
      
      // SELECT with WHERE condition
      "SELECT name, email FROM users WHERE age > 21 AND active = true",
      
      // SELECT with ORDER BY
      'SELECT * FROM products ORDER BY price DESC LIMIT 3',
      
      // INSERT example
      "INSERT INTO users (_id, name, age, email, active) VALUES ('100', 'Example User', 25, 'example@example.com', true)",
      
      // SELECT to verify the insertion
      "SELECT * FROM users WHERE _id = '100'",
      
      // UPDATE example
      "UPDATE users SET age = 26 WHERE _id = '100'",
      
      // SELECT to verify the update
      "SELECT * FROM users WHERE _id = '100'",
      
      // DELETE example
      "DELETE FROM users WHERE _id = '100'",
      
      // SELECT to verify the deletion
      "SELECT * FROM users WHERE _id = '100'"
    ];
    
    // Execute each query and display results
    for (const sql of queries) {
      console.log(`\nExecuting SQL: ${sql}`);
      try {
        const result = await squongo.execute(sql);
        console.log('Result:', JSON.stringify(result, null, 2));
      } catch (error) {
        console.error('Error:', error instanceof Error ? error.message : String(error));
      }
    }
  } finally {
    // Close the MongoDB connection when done
    await squongo.close();
  }
}

// Run the example if this file is executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}