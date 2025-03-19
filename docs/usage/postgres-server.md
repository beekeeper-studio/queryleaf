# PostgreSQL Wire-Compatible Server

QueryLeaf includes a PostgreSQL wire-compatible server that allows you to connect to your MongoDB database using standard PostgreSQL clients like `psql`, pgAdmin, DBeaver, Beekeeper Studio, or any application that supports PostgreSQL connectivity.

This provides a convenient way to use SQL with your MongoDB database without requiring specialized drivers or custom integration work. With the PostgreSQL server, you can leverage your existing PostgreSQL tools and workflows while working with MongoDB data.

## Installation

The PostgreSQL server is included in the QueryLeaf package and can be installed via npm:

```bash
npm install -g @queryleaf/postgres-server
```

## Usage

### Starting the Server

You can start the server using the following command:

```bash
queryleaf-pg-server --db your_database_name
```

By default, the server will connect to MongoDB at `mongodb://localhost:27017` and listen for PostgreSQL connections on port 5432.

### Command Line Options

The server supports the following command line options:

| Option | Description | Default |
| ------ | ----------- | ------- |
| `--uri` | MongoDB connection URI | `mongodb://localhost:27017` |
| `--db` | MongoDB database name (required) | - |
| `--port` | PostgreSQL server port | `5432` |
| `--host` | PostgreSQL server host | `localhost` |
| `--max-connections` | Maximum number of connections | `100` |
| `--auth-passthrough` | Pass PostgreSQL credentials to MongoDB | `false` |

Example with custom options:

```bash
queryleaf-pg-server --db your_database_name --uri mongodb://user:password@mongodb.example.com:27017 --port 5433 --host 0.0.0.0
```

## Connecting with PostgreSQL Clients

Once the server is running, you can connect to it using any PostgreSQL client.

### Authentication

The PostgreSQL server supports two authentication modes:

1. **Simple Authentication (Default)** - Any username and password will be accepted. This is useful for development and testing.

2. **MongoDB Authentication Passthrough** - Username and password from PostgreSQL clients are passed to MongoDB for authentication.

To enable authentication passthrough:

```bash
queryleaf-pg-server --db your_database_name --auth-passthrough
```

When authentication passthrough is enabled:
- PostgreSQL client credentials are used to authenticate with MongoDB
- Successful MongoDB authentication is required for clients to connect
- Different users can have different MongoDB permissions
- Connection fails if MongoDB authentication fails

This provides a secure way to use existing MongoDB users and permissions with your PostgreSQL clients.

### Using psql

```bash
# With default authentication (any username works)
psql -h localhost -p 5432 -d your_database_name -U any_username

# With authentication passthrough enabled (must use valid MongoDB credentials)
psql -h localhost -p 5432 -d your_database_name -U mongodb_user
```

### Connection String

The PostgreSQL connection string format is:

```
postgresql://username@host:port/database
```

For example:

```
postgresql://user@localhost:5432/your_database_name
```

## Supported Features

The PostgreSQL server supports:

- Basic SQL queries (SELECT, INSERT, UPDATE, DELETE)
- Transaction management (BEGIN, COMMIT, ROLLBACK)
- Connection pooling for multiple concurrent clients

## Limitations

The current implementation has the following limitations:

- Limited support for PostgreSQL-specific features and data types
- Some advanced PostgreSQL features may not be supported
- Performance may differ from native PostgreSQL
- When authentication passthrough is disabled, any username/password is accepted

### Nested Field Handling

When working with MongoDB's nested documents, the PostgreSQL server flattens nested fields in the results to ensure compatibility with standard PostgreSQL clients. This means:

- Nested fields like `metadata.author` are flattened to `metadata_author` in the results
- Array fields are serialized as JSON strings
- Dot notation in queries (like `SELECT metadata.author`) will cause "Path collision" errors

#### Example of Flattened Results

For a MongoDB document like:

```json
{
  "title": "Document 1",
  "metadata": {
    "author": "John",
    "tags": ["tag1", "tag2"],
    "views": 100
  },
  "comments": [
    { "user": "Alice", "text": "Great document!", "likes": 5 }
  ]
}
```

The PostgreSQL results will be flattened to:

```
title           | metadata_author | metadata_tags           | metadata_views | comments
----------------|-----------------|--------------------------|--------------|---------------------------------
Document 1      | John            | ["tag1","tag2"]          | 100          | [{"user":"Alice","text":"Great document!","likes":5}]
```

#### Workarounds for Nested Field Access

To work with nested fields effectively:

1. Use `SELECT *` instead of dot notation to retrieve all flattened fields
2. Reference the flattened field names in your application code
3. For arrays, use `JSON_PARSE()` or similar functions in your application to convert the JSON strings back to arrays
4. For complex operations requiring nested field manipulation, consider using the QueryLeaf library directly

Example SQL without dot notation:

```sql
-- Instead of: SELECT metadata.author FROM documents
SELECT * FROM documents WHERE title = 'Document 1'

-- Then access the flattened fields (metadata_author, metadata_tags, etc.)
```

## Programmatic Usage

You can also use the PostgreSQL server programmatically in your Node.js applications:

```typescript
import { MongoClient } from 'mongodb';
import { PostgresServer } from '@queryleaf/postgres-server';

async function startServer() {
  // Connect to MongoDB
  const mongoClient = new MongoClient('mongodb://localhost:27017');
  await mongoClient.connect();
  
  // Start PostgreSQL server
  const server = new PostgresServer(mongoClient, 'your_database_name', {
    port: 5432,
    host: 'localhost',
    maxConnections: 100,
    authPassthrough: true,         // Enable authentication passthrough
    mongoUri: 'mongodb://localhost:27017'  // Original URI for constructing auth URIs
  });
  
  // Server is now running
  console.log('PostgreSQL-compatible server started');
  
  // To shutdown the server:
  // await server.shutdown();
}

startServer().catch(console.error);
```

## Use Cases

The PostgreSQL wire-compatible server is useful for:

- Connecting existing PostgreSQL-based applications to MongoDB
- Using familiar SQL tools for data exploration and analysis
- Providing a SQL interface to team members unfamiliar with MongoDB query syntax
- Supporting applications that require a SQL interface but need MongoDB's document model
- Enabling GUI database tools like Beekeeper Studio to connect directly to MongoDB
- Simplifying migrations from SQL databases to MongoDB without rewriting application code
- Creating unified data access patterns across SQL and NoSQL databases