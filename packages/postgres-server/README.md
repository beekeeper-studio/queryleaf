<p align="center">
  <img src="https://raw.githubusercontent.com/beekeeper-studio/queryleaf/main/logo-transparent-bg-green-shape.png" width="100" height="100" alt="QueryLeaf Logo">
</p>

<h1 align="center">@queryleaf/postgres-server</h1>

<p align="center">PostgreSQL wire-compatible server for QueryLeaf</p>

## Overview

`@queryleaf/postgres-server` provides a PostgreSQL wire protocol compatible server for QueryLeaf, allowing you to connect to MongoDB using standard PostgreSQL clients and drivers. It implements the PostgreSQL wire protocol and leverages the core `@queryleaf/lib` package to translate SQL queries into MongoDB commands.

## Key Features

- Connect to MongoDB using any PostgreSQL client (pgAdmin, psql, etc.)
- Full SQL support for querying MongoDB collections
- Transparent authentication passthrough
- Compatible with any tool that uses PostgreSQL drivers
- Convert MongoDB documents to PostgreSQL-compatible row format

## Installation

```bash
# Global installation
npm install -g @queryleaf/postgres-server
# or
yarn global add @queryleaf/postgres-server

# Local installation
npm install @queryleaf/postgres-server
# or
yarn add @queryleaf/postgres-server
```

## Usage

### Running the Server

```bash
# Start the server with default settings
queryleaf-pg-server

# With specific MongoDB URI and port
queryleaf-pg-server --uri mongodb://localhost:27017 --port 5432

# With authentication
queryleaf-pg-server --uri mongodb://user:pass@localhost:27017

# Help
queryleaf-pg-server --help
```

### Connecting with PostgreSQL Clients

Connect using any PostgreSQL client with these connection parameters:
- Host: localhost (or wherever the server is running)
- Port: 5432 (or your configured port)
- Database: your MongoDB database name
- Username/Password: if required by your MongoDB deployment

Example with psql:
```bash
psql -h localhost -p 5432 -d mydatabase
```

Example connection string:
```
postgresql://localhost:5432/mydatabase
```

## SQL Query Examples

Once connected, you can use SQL syntax to query MongoDB:

```sql
-- Basic SELECT with WHERE
SELECT name, email FROM users WHERE age > 21;

-- Nested field access
SELECT name, address.city FROM users WHERE address.zip = '10001';

-- Array access
SELECT items[0].name FROM orders WHERE items[0].price > 100;

-- GROUP BY with aggregation
SELECT status, COUNT(*) as count FROM orders GROUP BY status;

-- JOIN between collections
SELECT u.name, o.total FROM users u JOIN orders o ON u._id = o.userId;
```

## Configuration

You can configure the server using command-line arguments or environment variables:

| Argument       | Environment Variable    | Description                      |
|----------------|-------------------------|----------------------------------|
| `--uri`        | `MONGODB_URI`           | MongoDB connection URI           |
| `--port`       | `POSTGRES_PORT`         | Server port (default: 5432)      |
| `--host`       | `POSTGRES_HOST`         | Server host (default: 0.0.0.0)   |
| `--auth`       | `ENABLE_AUTH`           | Enable authentication passthrough|
| `--debug`      | `DEBUG`                 | Enable debug output              |

## Links

- [Website](https://queryleaf.com)
- [Documentation](https://queryleaf.com/docs)
- [GitHub Repository](https://github.com/beekeeper-studio/queryleaf)

## License

QueryLeaf is dual-licensed:

- [AGPL-3.0](https://github.com/beekeeper-studio/queryleaf/blob/main/LICENSE.md) for open source use
- [Commercial license](https://github.com/beekeeper-studio/queryleaf/blob/main/COMMERCIAL_LICENSE.md) for commercial use

For commercial licensing options, visit [queryleaf.com](https://queryleaf.com).