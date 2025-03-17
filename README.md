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

This example demonstrates:
- Basic SELECT queries
- Filtering with WHERE clauses
- Sorting with ORDER BY
- INSERT, UPDATE, and DELETE operations
- Accessing nested fields with dot notation
- Accessing array elements with indexing
- Aggregation with GROUP BY and aggregation functions
- Joining collections with JOIN syntax

## Architecture

Squongo follows a modular architecture:

1. **SqlParser**: Converts SQL text into an abstract syntax tree (AST) using node-sql-parser
2. **SqlCompiler**: Transforms the AST into MongoDB commands
3. **CommandExecutor**: Executes the commands against a MongoDB database

## Development

### Testing

The project includes both unit tests and integration tests:

#### Unit Tests

Run unit tests with:

```bash
npm test
```

#### Integration Tests

Integration tests use [testcontainers](https://github.com/testcontainers/testcontainers-node) to spin up a MongoDB instance in Docker. Make sure you have Docker installed and running before executing these tests.

Run integration tests with:

```bash
npm run test:integration
```

These tests will:
1. Start a MongoDB container
2. Load fixture data
3. Run a series of SQL queries against the database
4. Verify the results
5. Clean up the container when done

### Continuous Integration

This project uses GitHub Actions for continuous integration. The CI workflow automatically runs on:
- All pushes to the `main` branch
- All pull requests targeting the `main` branch

The CI workflow:
1. Sets up Node.js (versions 16.x, 18.x, and 20.x)
2. Installs dependencies
3. Runs all tests (including integration tests with MongoDB in a Docker container)
4. Performs type checking
5. Builds the package

You can see the workflow configuration in `.github/workflows/test.yml`.

## License

QueryLeaf is dual-licensed:

- [AGPL-3.0](LICENSE) for open source use
- [Commercial license](COMMERCIAL_LICENSE.md) for commercial use with embedding

For commercial licensing options and pricing, please visit [queryleaf.com](https://queryleaf.com) or contact us at info@queryleaf.com.