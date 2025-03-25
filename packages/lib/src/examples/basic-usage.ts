import { QueryLeaf } from '../index';
import { MongoClient } from 'mongodb';

/**
 * Example showing how to use QueryLeaf with an existing MongoDB client
 */
async function main() {
  // Your existing MongoDB connection
  const connectionString = 'mongodb://localhost:27017';
  const dbName = 'example';

  // In a real application, you would already have a MongoDB client
  const mongoClient = new MongoClient(connectionString);
  await mongoClient.connect();

  // Create a QueryLeaf instance with your MongoDB client
  const queryLeaf = new QueryLeaf(mongoClient, dbName);

  try {
    // Setup sample data with nested structures and arrays
    console.log('\nSetting up sample data with nested structures and arrays...');

    await queryLeaf.execute(`
      INSERT INTO users (_id, name, age, email, active, address) VALUES 
      ('101', 'Nested User', 30, 'nested@example.com', true, {
        "street": "123 Main St",
        "city": "New York",
        "state": "NY",
        "zip": "10001"
      })
    `);

    await queryLeaf.execute(`
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
      'SELECT name, email FROM users WHERE age > 21 AND active = true',

      // SELECT with ORDER BY
      'SELECT * FROM products ORDER BY price DESC LIMIT 3',

      // Nested field queries - show accessing address fields
      "SELECT name, address.city, address.zip FROM users WHERE _id = '101'",

      // Query with nested field condition
      "SELECT * FROM users WHERE address.city = 'New York'",

      // Array element access - query showing array indices
      "SELECT _id, items[0].name, items[0].price FROM orders WHERE _id = '201'",

      // Array element condition
      'SELECT _id, userId FROM orders WHERE items[0].price > 1000',

      // GROUP BY with aggregation functions
      'SELECT status, COUNT(*) as count, SUM(total) as total_amount FROM orders GROUP BY status',

      // JOIN between collections
      'SELECT u.name, o._id as order_id, o.total FROM users u JOIN orders o ON u._id = o.userId',

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
      "DELETE FROM orders WHERE _id = '201'",
    ];

    // Execute each query and display results
    for (const sql of queries) {
      console.log(`\nExecuting SQL: ${sql}`);
      try {
        const result = await queryLeaf.execute(sql);
        console.log('Result:', JSON.stringify(result, null, 2));
      } catch (error) {
        console.error('Error:', error instanceof Error ? error.message : String(error));
      }
    }
    // Example showing how to use the cursor option
    console.log('\nUsing the returnCursor option:');
    try {
      // Using the returnCursor option to get a MongoDB cursor
      const cursor = await queryLeaf.execute('SELECT * FROM users WHERE active = true', {
        returnCursor: true,
      });

      // Now we can use the cursor methods directly
      console.log('Iterating through cursor results with forEach:');
      await cursor.forEach((doc: any) => {
        console.log(`- User: ${doc.name}, Email: ${doc.email}`);
      });

      // Always close the cursor when done
      await cursor.close();
    } catch (error) {
      console.error('Cursor error:', error instanceof Error ? error.message : String(error));
    }
  } finally {
    // Close the MongoDB client that we created
    // QueryLeaf does not manage MongoDB connections
    await mongoClient.close();
  }
}

// Run the example if this file is executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}
