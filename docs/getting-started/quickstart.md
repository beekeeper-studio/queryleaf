# Quick Start Guide

This guide will help you get up and running with QueryLeaf quickly, demonstrating basic functionality and common use cases.

## Basic Usage

Here's a simple example showing how to use QueryLeaf with an existing MongoDB client:

```typescript
import { MongoClient } from 'mongodb';
import { QueryLeaf } from 'queryleaf';

async function runQueries() {
  // Connect to MongoDB
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  
  try {
    // Create a QueryLeaf instance with your MongoDB client
    const queryLeaf = new QueryLeaf(client, 'mydatabase');
    
    // Execute a simple SELECT query
    const users = await queryLeaf.execute(
      'SELECT name, email FROM users WHERE age > 21 ORDER BY name ASC'
    );
    console.log('Users over 21:', users);
    
    // Execute an INSERT query
    await queryLeaf.execute(
      `INSERT INTO products (name, price, category) 
       VALUES ('Laptop', 999.99, 'Electronics')`
    );
    console.log('Product inserted');
    
    // Execute an UPDATE query
    await queryLeaf.execute(
      "UPDATE users SET status = 'active' WHERE lastLogin > '2023-01-01'"
    );
    console.log('Users updated');
    
    // Execute a DELETE query
    await queryLeaf.execute(
      "DELETE FROM sessions WHERE expiry < '2023-06-01'"
    );
    console.log('Old sessions deleted');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    // Close your MongoDB client when done
    await client.close();
  }
}

runQueries().catch(console.error);
```

## Using with TypeScript

QueryLeaf is written in TypeScript and provides full type definitions. Here's how to use it with TypeScript:

```typescript
import { MongoClient } from 'mongodb';
import { QueryLeaf } from 'queryleaf';

interface User {
  _id: string;
  name: string;
  email: string;
  age: number;
}

async function getUsers(): Promise<User[]> {
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  
  try {
    const queryLeaf = new QueryLeaf(client, 'mydatabase');
    
    // Results will be typed as User[]
    const users = await queryLeaf.execute<User>(
      'SELECT _id, name, email, age FROM users WHERE age > 21'
    );
    
    return users;
  } finally {
    await client.close();
  }
}

getUsers()
  .then(users => console.log(`Found ${users.length} users`))
  .catch(console.error);
```

## Using with a Dummy Client for Testing

For testing or development without a real MongoDB instance, you can use the `DummyQueryLeaf` class:

```typescript
import { DummyQueryLeaf } from 'queryleaf';

async function testQueries() {
  // Create a dummy client that logs operations without executing them
  const dummyLeaf = new DummyQueryLeaf('testdb');
  
  // Execute queries (will be logged but not executed)
  await dummyLeaf.execute('SELECT * FROM users LIMIT 10');
  // [DUMMY MongoDB] FIND in testdb.users with filter: {}
  // [DUMMY MongoDB] Executing find on users with limit: 10
  
  await dummyLeaf.execute('UPDATE products SET price = price * 1.1 WHERE category = "Electronics"');
  // [DUMMY MongoDB] UPDATE in testdb.products with filter: {"category":"Electronics"}
  // [DUMMY MongoDB] Executing update on products with update: {"price":{"$multiply":["$price",1.1]}}
}

testQueries().catch(console.error);
```

## Common SQL Patterns

Here are some common SQL patterns you can use with QueryLeaf:

### Querying Nested Fields

```typescript
// Query for users in a specific city
const nyUsers = await queryLeaf.execute(
  'SELECT name, email, address.city FROM users WHERE address.city = "New York"'
);
```

### Working with Array Fields

```typescript
// Query for orders with a specific item at index 0
const laptopOrders = await queryLeaf.execute(
  'SELECT _id, customer, total FROM orders WHERE items[0].name = "Laptop"'
);

// Query for high-value items in any position
const expensiveOrders = await queryLeaf.execute(
  'SELECT _id, customer, total FROM orders WHERE items[0].price > 1000'
);
```

### Using JOINs

```typescript
// Join users and orders collections
const userOrders = await queryLeaf.execute(`
  SELECT u.name, u.email, o._id as order_id, o.total 
  FROM users u 
  JOIN orders o ON u._id = o.userId 
  WHERE o.status = 'processing'
`);
```

### Aggregation with GROUP BY

```typescript
// Group by status and count orders
const orderStats = await queryLeaf.execute(`
  SELECT status, COUNT(*) as count, SUM(total) as total_value 
  FROM orders 
  GROUP BY status
`);
```

## Next Steps

Now that you've seen the basic usage of QueryLeaf, you can:

- Explore the [Core Concepts](../usage/core-concepts.md) to understand the architecture
- Check out the [SQL Syntax Reference](../sql-syntax/index.md) for detailed information on supported SQL features
- See the [Examples](../usage/examples.md) for more complex use cases
- Learn about the MongoDB client integration in [MongoDB Client](../usage/mongodb-client.md)