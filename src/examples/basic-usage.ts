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
    // Setup sample data with nested structures and arrays
    console.log('\nSetting up sample data with nested structures and arrays...');
    
    await squongo.execute(`
      INSERT INTO users (_id, name, age, email, active, address) VALUES 
      ('101', 'Nested User', 30, 'nested@example.com', true, {
        "street": "123 Main St",
        "city": "New York",
        "state": "NY",
        "zip": "10001"
      })
    `);
    
    await squongo.execute(`
      INSERT INTO orders (_id, userId, items, total) VALUES 
      ('201', '101', [
        { "id": "item1", "name": "Laptop", "price": 1200 },
        { "id": "item2", "name": "Mouse", "price": 25 }
      ], 1225)
    `);
    
    // Example SQL queries
    const queries = [
      // Basic SELECT
      'SELECT * FROM users LIMIT 5',
      
      // SELECT with WHERE condition
      "SELECT name, email FROM users WHERE age > 21 AND active = true",
      
      // SELECT with ORDER BY
      'SELECT * FROM products ORDER BY price DESC LIMIT 3',
      
      // Nested field queries - show accessing address fields
      "SELECT name, address.city, address.zip FROM users WHERE _id = '101'",
      
      // Query with nested field condition
      "SELECT * FROM users WHERE address.city = 'New York'",
      
      // Array element access - query showing array indices
      "SELECT _id, items[0].name, items[0].price FROM orders WHERE _id = '201'",
      
      // Array element condition
      "SELECT _id, userId FROM orders WHERE items[0].price > 1000",
      
      // GROUP BY with aggregation functions
      "SELECT status, COUNT(*) as count, SUM(total) as total_amount FROM orders GROUP BY status",
      
      // JOIN between collections
      "SELECT u.name, o._id as order_id, o.total FROM users u JOIN orders o ON u._id = o.userId",
      
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
      "SELECT * FROM users WHERE _id = '100'",
      
      // Clean up sample data
      "DELETE FROM users WHERE _id = '101'",
      "DELETE FROM orders WHERE _id = '201'"
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