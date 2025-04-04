<p align="center">
  <img src="https://raw.githubusercontent.com/beekeeper-studio/queryleaf/main/logo-transparent-bg-green-shape.png" width="100" height="100" alt="QueryLeaf Logo">
</p>

<h1 align="center">@queryleaf/lib</h1>

<p align="center">SQL to MongoDB query translator - Core library</p>

## Overview

`@queryleaf/lib` is the core library for QueryLeaf, a tool that translates SQL queries into MongoDB commands. It provides the foundation for all QueryLeaf packages by parsing SQL using node-sql-parser, transforming it into an abstract command set, and executing those commands against the MongoDB Node.js driver.

## Features

- Parse SQL statements into an abstract syntax tree
- Compile SQL AST into MongoDB commands
- Execute MongoDB commands using the official driver
- Support for basic SQL operations (SELECT, INSERT, UPDATE, DELETE)
- Advanced querying features:
  - Nested field access (e.g., `address.zip`)
  - Array element access (e.g., `items[0].name`)
  - GROUP BY with aggregation functions (COUNT, SUM, AVG, MIN, MAX)
  - JOINs between collections
  - Direct MongoDB cursor access for fine-grained result processing and memory efficiency

## Installation

```bash
npm install @queryleaf/lib
# or
yarn add @queryleaf/lib
```

## Usage

```typescript
import { QueryLeaf } from '@queryleaf/lib';
import { MongoClient } from 'mongodb';

// Your existing MongoDB client
const mongoClient = new MongoClient('mongodb://localhost:27017');
await mongoClient.connect();

// Create QueryLeaf with your MongoDB client
const queryLeaf = new QueryLeaf(mongoClient, 'mydatabase');

// Execute SQL queries against your MongoDB database
const results = await queryLeaf.execute('SELECT * FROM users WHERE age > 21');
console.log(results);

// Get a MongoDB cursor for more control over result processing and memory efficiency
// You can optionally specify a batch size to control how many documents are fetched at once
const cursor = await queryLeaf.executeCursor('SELECT * FROM users WHERE age > 30', { batchSize: 50 });
await cursor.forEach((doc) => {
  console.log(`User: ${doc.name}`);
});
await cursor.close();

// When you're done, close your MongoDB client
await mongoClient.close();
```

### Testing with DummyQueryLeaf

For testing or debugging without a real database, use DummyQueryLeaf:

```typescript
import { DummyQueryLeaf } from '@queryleaf/lib';

// Create a DummyQueryLeaf instance for testing
const queryLeaf = new DummyQueryLeaf('mydatabase');

// Operations will be logged to console but not executed
await queryLeaf.execute('SELECT * FROM users WHERE age > 21');
// [DUMMY MongoDB] FIND in mydatabase.users with filter: { "age": { "$gt": 21 } }

// You can also use cursor functionality with DummyQueryLeaf
const cursor = await queryLeaf.executeCursor('SELECT * FROM users LIMIT 10');
await cursor.forEach((doc) => {
  // Process each document
});
await cursor.close();
```

## SQL Query Examples

```sql
-- Basic SELECT with WHERE
SELECT name, email FROM users WHERE age > 21

-- Nested field access
SELECT name, address.city FROM users WHERE address.zip = '10001'

-- Array access
SELECT items[0].name FROM orders WHERE items[0].price > 100

-- GROUP BY with aggregation
SELECT status, COUNT(*) as count FROM orders GROUP BY status

-- JOIN between collections
SELECT u.name, o.total FROM users u JOIN orders o ON u._id = o.userId
```

## Working with Cursors

When working with large result sets, using MongoDB cursors directly can be more memory-efficient and gives you more control over result processing:

```typescript
// Get a cursor for a SELECT query
// You can specify a batch size to control memory usage and network behavior
const cursor = await queryLeaf.executeCursor('SELECT * FROM products WHERE price > 100', { batchSize: 100 });

// Option 1: Convert to array (loads all results into memory)
const results = await cursor.toArray();
console.log(`Found ${results.length} products`);

// Option 2: Iterate with forEach (memory efficient)
await cursor.forEach(product => {
  console.log(`Processing ${product.name}...`);
});

// Option 3: Manual iteration with next/hasNext (most control)
while (await cursor.hasNext()) {
  const product = await cursor.next();
  // Process each product individually
  console.log(`Product: ${product.name}, $${product.price}`);
}

// Always close the cursor when done
await cursor.close();
```

Features:
- Returns MongoDB `FindCursor` for normal queries and `AggregationCursor` for aggregations
- Supports all cursor methods like `forEach()`, `toArray()`, `next()`, `hasNext()`
- Efficiently handles large result sets with MongoDB's batching system (configurable batch size)
- Works with all advanced QueryLeaf features (filtering, sorting, aggregations, etc.)
- Only available for read operations (SELECT queries)
```

## Links

- [Website](https://queryleaf.com)
- [Documentation](https://queryleaf.com/docs)
- [GitHub Repository](https://github.com/beekeeper-studio/queryleaf)

## License

QueryLeaf is dual-licensed:

- [AGPL-3.0](https://github.com/beekeeper-studio/queryleaf/blob/main/LICENSE.md) for open source use
- [Commercial license](https://github.com/beekeeper-studio/queryleaf/blob/main/COMMERCIAL_LICENSE.md) for commercial use

For commercial licensing options, visit [queryleaf.com](https://queryleaf.com).