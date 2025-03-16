# Squongo

SQL to MongoDB command compiler for NodeJS.

## Overview

Squongo is a library that translates SQL queries into MongoDB commands. It parses SQL using node-sql-parser, transforms it into an abstract command set, and then executes those commands against the MongoDB Node.js driver.

## Features

- Parse SQL statements into an abstract syntax tree using node-sql-parser
- Compile SQL AST into MongoDB commands
- Execute MongoDB commands using the official driver
- Support for basic SQL operations:
  - SELECT
  - INSERT
  - UPDATE
  - DELETE

## Installation

```bash
npm install squongo
```

## Usage

```typescript
import { createSquongo } from 'squongo';

async function main() {
  // Create a Squongo instance
  const squongo = createSquongo('mongodb://localhost:27017', 'mydatabase');
  
  try {
    // Execute a SQL query
    const results = await squongo.execute('SELECT * FROM users WHERE age > 21');
    console.log(results);
  } catch (error) {
    console.error('Error executing query:', error);
  } finally {
    // Close the MongoDB connection when done
    await squongo.close();
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

## License

AGPL-3.0