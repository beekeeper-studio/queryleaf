<p align="center">
  <img src="https://raw.githubusercontent.com/beekeeper-studio/queryleaf/main/logo-transparent-bg-green-shape.png" width="100" height="100" alt="QueryLeaf Logo">
</p>

<h1 align="center">@queryleaf/cli</h1>

<p align="center">SQL to MongoDB query translator - Command Line Interface</p>

## Overview

`@queryleaf/cli` provides a command-line interface for QueryLeaf, allowing you to execute SQL queries against MongoDB directly from your terminal. It leverages the core `@queryleaf/lib` package to parse SQL, transform it into MongoDB commands, and execute those commands.

## Installation

```bash
# Global installation
npm install -g @queryleaf/cli
# or
yarn global add @queryleaf/cli

# Local installation
npm install @queryleaf/cli
# or
yarn add @queryleaf/cli
```

## Usage

```bash
# Basic usage
queryleaf --uri mongodb://localhost:27017 --db mydb "SELECT * FROM users"

# With authentication
queryleaf --uri mongodb://user:pass@localhost:27017 --db mydb "SELECT * FROM users"

# Output formatting
queryleaf --uri mongodb://localhost:27017 --db mydb --format table "SELECT * FROM users"

# Help
queryleaf --help
```

## Example Queries

```bash
# Basic SELECT with WHERE
queryleaf "SELECT name, email FROM users WHERE age > 21"

# Nested field access
queryleaf "SELECT name, address.city FROM users WHERE address.zip = '10001'"

# Array access
queryleaf "SELECT items[0].name FROM orders WHERE items[0].price > 100"

# GROUP BY with aggregation
queryleaf "SELECT status, COUNT(*) as count FROM orders GROUP BY status"

# JOIN between collections
queryleaf "SELECT u.name, o.total FROM users u JOIN orders o ON u._id = o.userId"
```

## Configuration

You can configure the CLI using command-line arguments or environment variables:

| Argument       | Environment Variable | Description                      |
|----------------|----------------------|----------------------------------|
| `--uri`        | `MONGODB_URI`        | MongoDB connection URI           |
| `--db`         | `MONGODB_DB`         | MongoDB database name            |
| `--format`     | `QUERYLEAF_FORMAT`   | Output format (json, table, csv) |
| `--debug`      | `QUERYLEAF_DEBUG`    | Enable debug output              |

## Links

- [Website](https://queryleaf.com)
- [Documentation](https://queryleaf.com/docs)
- [GitHub Repository](https://github.com/beekeeper-studio/queryleaf)

## License

QueryLeaf is dual-licensed:

- [AGPL-3.0](https://github.com/beekeeper-studio/queryleaf/blob/main/LICENSE.md) for open source use
- [Commercial license](https://github.com/beekeeper-studio/queryleaf/blob/main/COMMERCIAL_LICENSE.md) for commercial use

For commercial licensing options, visit [queryleaf.com](https://queryleaf.com).