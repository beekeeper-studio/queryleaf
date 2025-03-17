<p align="center">
  <img src="logo-transparent-bg-green-shape.png" width="100" height="100" alt="QueryLeaf Logo">
</p>

<h1 align="center">QueryLeaf</h1>

<p align="center">SQL to MongoDB query translator for NodeJS</p>

## Overview

QueryLeaf is a library that translates SQL queries into MongoDB commands. It parses SQL using node-sql-parser, transforms it into an abstract command set, and then executes those commands against the MongoDB Node.js driver.

## Features

- Parse SQL statements into an abstract syntax tree using node-sql-parser
- Compile SQL AST into MongoDB commands
- Execute MongoDB commands using the official driver
- Support for basic SQL operations:
  - SELECT
  - INSERT
  - UPDATE
  - DELETE
- Advanced querying features:
  - Nested field access (e.g., `address.zip`)
  - Array element access (e.g., `items[0].name`)
  - GROUP BY with aggregation functions (COUNT, SUM, AVG, MIN, MAX)
  - JOINs between collections

## SQL to MongoDB Translation Examples

QueryLeaf translates SQL queries into MongoDB commands. Here are some examples of the translation:

### Basic SELECT with WHERE

**SQL:**
```sql
SELECT name, email FROM users WHERE age > 21
```

**MongoDB:**
```js
db.collection('users').find(
  { age: { $gt: 21 } }, 
  { name: 1, email: 1 }
)
```

### Nested Field Access

**SQL:**
```sql
SELECT name, address.city, address.zip FROM users WHERE address.city = 'New York'
```

**MongoDB:**
```js
db.collection('users').find(
  { 'address.city': 'New York' }, 
  { name: 1, 'address.city': 1, 'address.zip': 1 }
)
```

### Array Element Access

**SQL:**
```sql
SELECT _id, items[0].name, items[0].price FROM orders WHERE items[0].price > 1000
```

**MongoDB:**
```js
db.collection('orders').find(
  { 'items.0.price': { $gt: 1000 } }, 
  { _id: 1, 'items.0.name': 1, 'items.0.price': 1 }
)
```

### GROUP BY with Aggregation

**SQL:**
```sql
SELECT status, COUNT(*) as count, SUM(total) as total_amount FROM orders GROUP BY status
```

**MongoDB:**
```js
db.collection('orders').aggregate([
  { 
    $group: {
      _id: "$status",
      status: { $first: "$status" },
      count: { $sum: 1 },
      total_amount: { $sum: "$total" }
    }
  }
])
```

### JOIN Between Collections

**SQL:**
```sql
SELECT u.name, o._id as order_id, o.total FROM users u JOIN orders o ON u._id = o.userId
```

**MongoDB:**
```js
db.collection('users').aggregate([
  {
    $lookup: {
      from: "orders",
      localField: "_id",
      foreignField: "userId",
      as: "orders"
    }
  },
  { $unwind: { path: "$orders", preserveNullAndEmptyArrays: true } },
  {
    $project: {
      name: 1,
      order_id: "$orders._id",
      total: "$orders.total"
    }
  }
])
```

## Installation

```bash
npm install queryleaf
```

## Usage

QueryLeaf takes your existing MongoDB client. It never creates or manages MongoDB connections on its own.

```typescript
import { QueryLeaf } from 'queryleaf';
import { MongoClient } from 'mongodb';

// Your existing MongoDB client
const mongoClient = new MongoClient('mongodb://localhost:27017');
await mongoClient.connect();

// Create QueryLeaf with your MongoDB client
const queryLeaf = new QueryLeaf(mongoClient, 'mydatabase');

// Execute SQL queries against your MongoDB database
const results = await queryLeaf.execute('SELECT * FROM users WHERE age > 21');
console.log(results);

// When you're done, close your MongoDB client
// (QueryLeaf never manages MongoDB connections)
await mongoClient.close();
```

### Testing with DummyQueryLeaf

For testing or debugging without a real database, use DummyQueryLeaf:

```typescript
import { DummyQueryLeaf } from 'queryleaf';

// Create a DummyQueryLeaf instance for testing
const queryLeaf = new DummyQueryLeaf('mydatabase');

// Operations will be logged to console but not executed
await queryLeaf.execute('SELECT * FROM users WHERE age > 21');
// [DUMMY MongoDB] FIND in mydatabase.users with filter: { "age": { "$gt": 21 } }
// [DUMMY MongoDB] Executing find on users
```

### Examples

The repository includes several examples:

- `src/examples/existing-client-demo.ts` - Shows how to use QueryLeaf in a real application
- `src/examples/basic-usage.ts` - Demonstrates basic usage with an existing MongoDB client
- `src/examples/dummy-client-demo.ts` - Shows how to use DummyQueryLeaf for testing

You can run the examples with:

```bash
# Main application example
ts-node src/examples/existing-client-demo.ts

# Basic usage example
npm run example

# Dummy client example
ts-node src/examples/dummy-client-demo.ts
```

## SQL Query Examples

Here are some practical SQL queries you can use with QueryLeaf:

### Working with Nested Fields

```sql
-- Query users by nested address field
SELECT name, email, address.city FROM users WHERE address.zip = '10001'

-- Insert with nested document structure
INSERT INTO users (name, age, email, address) VALUES 
('Jane Smith', 28, 'jane@example.com', {
  "street": "456 Park Ave",
  "city": "Chicago",
  "state": "IL",
  "zip": "60601"
})

-- Update a nested field
UPDATE users SET address.city = 'San Francisco', address.state = 'CA' WHERE _id = '123'
```

### Working with Array Fields

```sql
-- Query by array element property
SELECT userId, total FROM orders WHERE items[0].name = 'Laptop'

-- Filter by array element condition
SELECT * FROM orders WHERE items[1].price < 50

-- Insert document with array field
INSERT INTO orders (userId, items, status) VALUES
('user123', [
  { "id": "prod1", "name": "Monitor", "price": 300 },
  { "id": "prod2", "name": "Keyboard", "price": 75 }
], 'pending')
```

### Advanced Queries

```sql
-- Using GROUP BY with aggregation functions
SELECT category, COUNT(*) as count, AVG(price) as avg_price FROM products GROUP BY category

-- JOIN between users and orders
SELECT u.name, o.total, o.status FROM users u JOIN orders o ON u._id = o.userId WHERE o.total > 100
```

Check out the [examples folder](src/examples/) for more complete examples, including how to set up the QueryLeaf instance and execute these queries.

This library demonstrates:
- Basic SELECT queries
- Filtering with WHERE clauses
- Sorting with ORDER BY
- INSERT, UPDATE, and DELETE operations
- Accessing nested fields with dot notation
- Accessing array elements with indexing
- Aggregation with GROUP BY and aggregation functions
- Joining collections with JOIN syntax

## Architecture

QueryLeaf follows a modular architecture:

1. **SqlParser**: Converts SQL text into an abstract syntax tree (AST) using node-sql-parser
2. **SqlCompiler**: Transforms the AST into MongoDB commands
3. **CommandExecutor**: Executes the commands against a MongoDB database

## Development

### Testing

The project includes both unit tests and integration tests:

#### Unit Tests

Run unit tests with:

```bash
npm run test:unit
```

Unit tests are located in the `tests/unit` directory and focus on testing the parsing and compilation of SQL statements without requiring a database connection.

#### Integration Tests

Integration tests use [testcontainers](https://github.com/testcontainers/testcontainers-node) to spin up a MongoDB instance in Docker. Make sure you have Docker installed and running before executing these tests.

Run integration tests with:

```bash
npm run test:integration
```

Integration tests are located in the `tests/integration` directory and test the complete functionality with a real MongoDB database.

These tests will:
1. Start a MongoDB container
2. Load fixture data
3. Run a series of SQL queries against the database
4. Verify the results
5. Clean up the container when done

To run all tests:

```bash
npm run test:all
```

### Continuous Integration

This project uses GitHub Actions for continuous integration. The CI workflow automatically runs on:
- All pushes to the `main` branch
- All pull requests targeting the `main` branch

The CI workflow:
1. Sets up Node.js (versions 16.x, 18.x, and 20.x)
2. Installs dependencies
3. Runs unit tests
4. Runs integration tests with MongoDB in a Docker container
5. Performs type checking
6. Builds the package

You can see the workflow configuration in `.github/workflows/test.yml`.

## Documentation

Comprehensive documentation is available at [queryleaf.com/docs](https://queryleaf.com/docs), including:

- Detailed installation and setup guides
- In-depth explanation of supported SQL syntax
- Usage examples and best practices
- Troubleshooting and debugging guides
- Performance optimization tips

For local development, you can run the documentation site with:

```bash
# Install required packages
pip install -r requirements.txt

# Serve the documentation locally
npm run docs:serve
```

## License

QueryLeaf is dual-licensed:

- [AGPL-3.0](LICENSE) for open source use
- [Commercial license](COMMERCIAL_LICENSE.md) for commercial use with embedding

For commercial licensing options and pricing, please visit [queryleaf.com](https://queryleaf.com) or contact us at info@queryleaf.com.