# MongoDB Client Integration

QueryLeaf is designed to work with your existing MongoDB client instead of managing connections itself. This approach provides several benefits:

1. You have full control over connection management
2. You can use your existing connection pools and configurations
3. You can customize authentication and encryption
4. QueryLeaf remains lightweight and focused on SQL translation

This guide explains how to integrate QueryLeaf with the MongoDB Node.js driver.

## Creating a MongoDB Client

Before using QueryLeaf, you need to create and configure a MongoDB client:

```typescript
import { MongoClient } from 'mongodb';

// Create a MongoDB client with connection options
const mongoClient = new MongoClient('mongodb://localhost:27017', {
  // Optional: Connection pool settings
  maxPoolSize: 50,
  minPoolSize: 5,
  
  // Optional: Authentication
  auth: {
    username: 'username',
    password: 'password'
  },
  
  // Optional: TLS/SSL settings
  tls: true,
  tlsCAFile: '/path/to/ca.pem',
  
  // Optional: Other settings
  connectTimeoutMS: 5000,
  socketTimeoutMS: 30000
});

// Connect to MongoDB
await mongoClient.connect();
```

## Integrating with QueryLeaf

Once you have a MongoDB client, you can create a QueryLeaf instance:

```typescript
import { QueryLeaf } from 'queryleaf';

// Create a QueryLeaf instance with your MongoDB client
const queryLeaf = new QueryLeaf(mongoClient, 'mydatabase');

// Now you can execute SQL queries
const results = await queryLeaf.execute('SELECT * FROM users');
```

## Connection Management

Since QueryLeaf doesn't manage connections, you're responsible for:

1. Creating the MongoDB client
2. Connecting before using QueryLeaf
3. Closing the connection when done

Here's a complete example with proper connection management:

```typescript
import { MongoClient } from 'mongodb';
import { QueryLeaf } from 'queryleaf';

async function main() {
  const client = new MongoClient('mongodb://localhost:27017');
  
  try {
    // Connect to MongoDB
    await client.connect();
    console.log('Connected to MongoDB');
    
    // Create QueryLeaf instance
    const queryLeaf = new QueryLeaf(client, 'mydatabase');
    
    // Execute queries
    const users = await queryLeaf.execute('SELECT * FROM users LIMIT 10');
    console.log(`Found ${users.length} users`);
    
    // You can execute multiple queries with the same instance
    const products = await queryLeaf.execute(
      'SELECT name, price FROM products WHERE category = "Electronics"'
    );
    console.log(`Found ${products.length} electronic products`);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    // Always close the MongoDB client when done
    await client.close();
    console.log('MongoDB connection closed');
  }
}

main().catch(console.error);
```

## Advanced Connection Options

### Connection Pooling

For production applications, you should configure connection pooling:

```typescript
const client = new MongoClient('mongodb://localhost:27017', {
  maxPoolSize: 100,   // Maximum connections in the pool
  minPoolSize: 10,    // Minimum connections to maintain
  maxIdleTimeMS: 30000  // Close connections after 30 seconds of inactivity
});
```

### Replica Sets

For high availability, connect to a MongoDB replica set:

```typescript
const client = new MongoClient(
  'mongodb://server1:27017,server2:27017,server3:27017/?replicaSet=myReplicaSet',
  {
    readPreference: 'secondaryPreferred'  // Read from secondary nodes when possible
  }
);
```

### MongoDB Atlas

To connect to MongoDB Atlas:

```typescript
const client = new MongoClient(
  'mongodb+srv://username:password@cluster0.example.mongodb.net/mydb?retryWrites=true&w=majority'
);
```

### Connection Timeouts

Configure timeouts for better error handling:

```typescript
const client = new MongoClient('mongodb://localhost:27017', {
  connectTimeoutMS: 5000,    // Give up connecting after 5 seconds
  socketTimeoutMS: 30000,    // Socket timeout for operations
  serverSelectionTimeoutMS: 5000  // Timeout for server selection
});
```

## Using Multiple Databases

You can create multiple QueryLeaf instances to work with different databases:

```typescript
// Create separate instances for different databases
const usersDb = new QueryLeaf(mongoClient, 'users_db');
const productsDb = new QueryLeaf(mongoClient, 'products_db');

// Query the users database
const activeUsers = await usersDb.execute(
  'SELECT * FROM users WHERE status = "active"'
);

// Query the products database
const featuredProducts = await productsDb.execute(
  'SELECT * FROM products WHERE featured = true'
);
```

## Connection Error Handling

Implement proper error handling for MongoDB connection issues:

```typescript
import { MongoClient, MongoServerError } from 'mongodb';
import { QueryLeaf } from 'queryleaf';

async function executeWithRetry(sqlQuery: string, maxRetries = 3) {
  const client = new MongoClient('mongodb://localhost:27017');
  let retries = 0;
  
  while (retries < maxRetries) {
    try {
      await client.connect();
      const queryLeaf = new QueryLeaf(client, 'mydatabase');
      
      // Execute the query
      const results = await queryLeaf.execute(sqlQuery);
      
      // Success - return results
      return results;
    } catch (error) {
      retries++;
      
      if (error instanceof MongoServerError) {
        // Handle specific MongoDB errors
        if (error.code === 13) {
          console.error('Authentication failed');
          throw error; // Don't retry auth failures
        }
      }
      
      if (retries >= maxRetries) {
        console.error(`Failed after ${maxRetries} retries`, error);
        throw error;
      }
      
      // Wait before retrying (exponential backoff)
      const waitTime = Math.pow(2, retries) * 100;
      console.log(`Retrying in ${waitTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    } finally {
      // Always close the connection
      await client.close().catch(console.error);
    }
  }
}
```

## Next Steps

Now that you understand how to integrate QueryLeaf with MongoDB clients, you can:

- Learn about [Using the Dummy Client](dummy-client.md) for testing
- Explore [SQL Syntax Support](../sql-syntax/index.md) for details on supported features
- See practical [Examples](examples.md) of using QueryLeaf in different scenarios