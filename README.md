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

```typescript
import { createQueryLeaf } from 'queryleaf';

async function main() {
  // Create a QueryLeaf instance
  const queryLeaf = createQueryLeaf('mongodb://localhost:27017', 'mydatabase');
  
  try {
    // Basic SQL query
    const basicResults = await queryLeaf.execute('SELECT * FROM users WHERE age > 21');
    console.log('Basic query results:', basicResults);
    
    // Query with nested fields
    const nestedResults = await queryLeaf.execute('SELECT name, address.city, address.zip FROM users WHERE address.country = "USA"');
    console.log('Nested fields query results:', nestedResults);
    
    // Query with array access
    const arrayResults = await queryLeaf.execute('SELECT order_id, items[0].name, items[0].price FROM orders WHERE items[0].price > 100');
    console.log('Array access query results:', arrayResults);
  } catch (error) {
    console.error('Error executing query:', error);
  } finally {
    // Close the MongoDB connection when done
    await queryLeaf.close();
  }
}

main().catch(console.error);
```

### Examples

The repository includes a complete example in `src/examples/basic-usage.ts`. You can run it with:

```bash
npm run example
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

AGPL-3.0