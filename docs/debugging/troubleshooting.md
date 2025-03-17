# Troubleshooting

This guide provides solutions for common issues you may encounter when using QueryLeaf.

## Common Error Messages

### SQL Parsing Errors

**Error:** `SQL parsing error: syntax error at position X`

**Possible causes:**
- Syntax error in SQL query
- Using unsupported SQL syntax
- Missing commas, parentheses, or quotes

**Solutions:**
1. Check your SQL syntax for typos or errors
2. Make sure you're using SQL syntax compatible with PostgreSQL
3. Try simplifying your query to isolate the issue
4. Use the DummyQueryLeaf to debug the query parsing

**Example:**

```typescript
// Use DummyQueryLeaf to debug
const dummy = new DummyQueryLeaf('debug_db');
try {
  await dummy.execute('SELECT * FORM users'); // Error: typo in FROM
} catch (error) {
  console.error('Parsing error:', error.message);
}
```

### MongoDB Connection Issues

**Error:** `MongoServerSelectionError: connection timed out`

**Possible causes:**
- MongoDB server is not running
- Network connectivity issues
- Incorrect connection string
- Firewall blocking connections

**Solutions:**
1. Verify MongoDB server is running
2. Check network connectivity
3. Confirm your connection string is correct
4. Ensure firewall allows MongoDB connections
5. Add timeouts and retry logic

**Example:**

```typescript
// Add retry logic for connection issues
async function executeWithRetry(sqlQuery, maxRetries = 3) {
  let retries = 0;
  
  while (retries < maxRetries) {
    try {
      const client = new MongoClient('mongodb://localhost:27017');
      await client.connect();
      
      const queryLeaf = new QueryLeaf(client, 'mydb');
      return await queryLeaf.execute(sqlQuery);
    } catch (error) {
      retries++;
      console.log(`Connection attempt ${retries} failed:`, error.message);
      
      if (retries >= maxRetries) {
        throw new Error(`Failed to connect after ${maxRetries} attempts`);
      }
      
      // Wait before retrying
      await new Promise(r => setTimeout(r, 1000 * retries));
    }
  }
}
```

### Nested Field Access Errors

**Error:** `Cannot read property of undefined`

**Possible causes:**
- Accessing a nested field that doesn't exist
- Incorrect dot notation in SQL query
- Missing intermediate objects in the document structure

**Solutions:**
1. Check document structure to ensure nested fields exist
2. Use conditional operators in MongoDB to handle missing fields
3. Add validation for nested fields before accessing them

**Example:**

```typescript
// In MongoDB, you can handle this with $ifNull or similar operators
// In your application code, add validation:
function validateNestedPath(obj, path) {
  const parts = path.split('.');
  let current = obj;
  
  for (const part of parts) {
    if (current === undefined || current === null) {
      return false;
    }
    current = current[part];
  }
  
  return true;
}
```

### Array Access Issues

**Error:** `Error in array index syntax` or `Cannot convert undefined or null to object`

**Possible causes:**
- Incorrect array access syntax
- Accessing an array index that doesn't exist
- Array field is empty or not an array

**Solutions:**
1. Verify array access syntax (use `items[0].name` format)
2. Check array bounds before accessing elements
3. Use conditional logic to handle missing array elements

**Example:**

```typescript
// Check array existence and bounds before accessing
const query = `
  SELECT _id, customer,
  CASE 
    WHEN items[0] IS NOT NULL THEN items[0].name 
    ELSE NULL 
  END as first_item
  FROM orders
`;

// In MongoDB, you can use $arrayElemAt with conditional logic
// But QueryLeaf may need a simpler approach for now
```

### JOIN Operation Issues

**Error:** `Error executing $lookup stage` or `Join condition not properly specified`

**Possible causes:**
- Incorrect JOIN syntax
- JOIN fields have different types
- Missing or invalid JOIN conditions
- Referenced collection doesn't exist

**Solutions:**
1. Verify JOIN syntax and field names
2. Make sure JOIN fields have compatible types
3. Check that referenced collections exist
4. Simplify JOIN conditions for troubleshooting

**Example:**

```typescript
// Simplified JOIN for troubleshooting
await queryLeaf.execute(`
  SELECT u.name, o._id
  FROM users u
  JOIN orders o ON u._id = o.userId
`);

// If issues persist, examine the MongoDB schema and indexes
```

## Debugging Techniques

### Using DummyQueryLeaf for Debugging

The DummyQueryLeaf class is invaluable for debugging SQL translation issues:

```typescript
import { DummyQueryLeaf } from 'queryleaf';

async function debugQuery(sqlQuery) {
  const dummy = new DummyQueryLeaf('debug_db');
  
  console.log('\n=== SQL Query ===');
  console.log(sqlQuery);
  
  try {
    await dummy.execute(sqlQuery);
    console.log('✅ Query parsed and compiled successfully');
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Debug a specific query
debugQuery('SELECT * FROM users WHERE address.city = "New York"');
```

### Enabling Verbose Logging

You can enable more verbose logging in your application:

```typescript
// Set environment variable for debugging
process.env.DEBUG_QUERYLEAF = 'true';

// In your QueryLeaf implementation, you could add:
function log(message) {
  if (process.env.DEBUG_QUERYLEAF) {
    console.log(`[QueryLeaf Debug] ${message}`);
  }
}
```

### Checking MongoDB Commands

Examine the MongoDB commands being generated:

```typescript
// Using DummyQueryLeaf
const dummy = new DummyQueryLeaf('debug_db');
console.log('Translating SQL to MongoDB commands...');
await dummy.execute('SELECT name, email FROM users WHERE age > 21');

// This will log the MongoDB commands that would be executed
```

### Using MongoDB Explain

For performance issues, you can use MongoDB's explain feature:

```javascript
// After identifying the MongoDB query using DummyQueryLeaf,
// you can run MongoDB's explain directly:

const client = new MongoClient('mongodb://localhost:27017');
await client.connect();
const db = client.db('mydb');

const explanation = await db.collection('users').find({ age: { $gt: 21 } })
  .explain('executionStats');

console.log(JSON.stringify(explanation, null, 2));
```

## Performance Issues

### Slow Queries

**Symptoms:**
- Queries take longer than expected
- CPU usage spikes during queries
- Memory usage increases significantly

**Possible causes:**
- Missing indexes on queried fields
- Complex aggregation pipelines
- Large result sets
- Complex JOIN operations

**Solutions:**
1. Add appropriate indexes to MongoDB collections
2. Limit result sets with LIMIT clause
3. Optimize WHERE conditions to use indexed fields
4. Reduce complexity of aggregation queries
5. Consider denormalizing data to avoid JOINs

**Example - Creating indexes:**

```javascript
// Create indexes on frequently queried fields
const client = new MongoClient('mongodb://localhost:27017');
await client.connect();
const db = client.db('mydb');

// Create index on frequently queried field
await db.collection('users').createIndex({ age: 1 });

// Create compound index for queries that filter on multiple fields
await db.collection('orders').createIndex({ status: 1, date: -1 });

// Create index on join fields
await db.collection('orders').createIndex({ userId: 1 });

// Create index on nested fields
await db.collection('users').createIndex({ 'address.city': 1 });
```

### Memory Issues

**Symptoms:**
- Out of memory errors
- Application crashes with large datasets
- Gradually increasing memory usage

**Possible causes:**
- Large result sets being loaded into memory
- Missing LIMIT clauses in queries
- Memory leaks in connection handling
- Inadequate server resources

**Solutions:**
1. Add LIMIT clauses to all queries
2. Implement pagination for large result sets
3. Close MongoDB connections properly
4. Use streaming for large result processing
5. Increase server memory or scale horizontally

**Example - Implementing pagination:**

```typescript
async function paginateResults(query, pageSize = 100, page = 1) {
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  
  try {
    const queryLeaf = new QueryLeaf(client, 'mydb');
    
    // Add LIMIT and calculate offset
    const offset = (page - 1) * pageSize;
    const paginatedQuery = `${query} LIMIT ${pageSize} OFFSET ${offset}`;
    
    return await queryLeaf.execute(paginatedQuery);
  } finally {
    await client.close();
  }
}

// Use pagination
const page1 = await paginateResults('SELECT * FROM users ORDER BY name', 50, 1);
const page2 = await paginateResults('SELECT * FROM users ORDER BY name', 50, 2);
```

## Common Patterns and Solutions

### Handling MongoDB ObjectIDs

QueryLeaf automatically converts string representations of MongoDB ObjectIDs to actual ObjectID objects when:

1. The field name is `_id`
2. The field name ends with `Id` (e.g., `userId`)
3. The field name ends with `Ids` (for arrays of IDs)
4. The string follows the MongoDB ObjectID format (24 hex characters)

```sql
-- These will automatically have the string converted to ObjectID
SELECT * FROM users WHERE _id = '507f1f77bcf86cd799439011'
SELECT * FROM orders WHERE userId = '507f1f77bcf86cd799439011'
```

If you're working directly with ObjectIDs in your application code:

```typescript
import { ObjectId } from 'mongodb';

// Converting string IDs to ObjectID in your application
function stringToObjectId(id) {
  try {
    return new ObjectId(id);
  } catch (error) {
    throw new Error(`Invalid ObjectID format: ${id}`);
  }
}

// Using with QueryLeaf
const id = new ObjectId('5f8d94c3e6b5c3a99ceafb53');
await queryLeaf.execute(`SELECT * FROM users WHERE _id = '${id.toString()}'`);
```

#### Common ObjectID Issues

**Invalid ObjectID Format:**

```
Error: Could not convert _id value to ObjectId: not-an-objectid
```

**Solution:** Ensure you're using a valid 24-character hexadecimal string.

**ObjectID Comparison with String:**

If your query isn't returning expected results when filtering by ID, make sure:

1. The ID string has the correct format
2. The field name follows the convention (_id, userId, etc.)
3. You're using single quotes around the ObjectID string

```sql
-- Correct:
SELECT * FROM users WHERE _id = '507f1f77bcf86cd799439011'

-- Incorrect (missing quotes):
SELECT * FROM users WHERE _id = 507f1f77bcf86cd799439011
```

### Handling NULL Values

Work with NULL values in SQL queries:

```sql
-- Find documents where a field is NULL
SELECT * FROM users WHERE profile IS NULL

-- Find documents where a field is NOT NULL
SELECT * FROM users WHERE email IS NOT NULL

-- Handle NULLs in results with COALESCE
SELECT name, COALESCE(email, 'No Email') as contact FROM users
```

### Debugging Complex Aggregations

For complex GROUP BY operations:

```typescript
// Break down the aggregation into stages
const dummy = new DummyQueryLeaf('debug_db');

console.log('=== Stage 1: Simple GROUP BY ===');
await dummy.execute(`
  SELECT category, COUNT(*) as count
  FROM products
  GROUP BY category
`);

console.log('\n=== Stage 2: Multiple Aggregations ===');
await dummy.execute(`
  SELECT category, COUNT(*) as count, AVG(price) as avg_price
  FROM products
  GROUP BY category
`);

console.log('\n=== Stage 3: With WHERE Clause ===');
await dummy.execute(`
  SELECT category, COUNT(*) as count, AVG(price) as avg_price
  FROM products
  WHERE stock > 0
  GROUP BY category
`);
```

## Getting Additional Help

If you're still experiencing issues after trying these troubleshooting steps:

1. **Check Documentation**: Review the detailed documentation for specific features
2. **Example Projects**: Look at example projects for reference implementations
3. **GitHub Issues**: Search the GitHub repository for similar issues
4. **Community Support**: Ask questions in the GitHub Discussions section
5. **Professional Support**: For commercial license holders, contact support@queryleaf.com

For bug reports or feature requests, please open an issue on the GitHub repository with:

- A minimal, reproducible example
- Your SQL query and expected results
- Error messages and stack traces
- QueryLeaf version and MongoDB version