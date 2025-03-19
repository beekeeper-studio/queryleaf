# PostgreSQL Wire-Compatible Server

QueryLeaf includes a PostgreSQL wire-compatible server that allows you to connect to your MongoDB database using standard PostgreSQL clients like `psql`, pgAdmin, DBeaver, or any application that supports PostgreSQL connectivity.

This provides a convenient way to use SQL with your MongoDB database without requiring specialized drivers or custom integration work.

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

Example with custom options:

```bash
queryleaf-pg-server --db your_database_name --uri mongodb://user:password@mongodb.example.com:27017 --port 5433 --host 0.0.0.0
```

## Connecting with PostgreSQL Clients

Once the server is running, you can connect to it using any PostgreSQL client. Authentication is currently simplified - any username will be accepted.

### Using psql

```bash
psql -h localhost -p 5432 -d your_database_name -U any_username
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
- Authentication is simplified (any username/password is accepted)
- Some advanced PostgreSQL features may not be supported
- Performance may differ from native PostgreSQL

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