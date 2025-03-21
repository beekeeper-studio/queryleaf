<p align="center">
  <img src="https://raw.githubusercontent.com/beekeeper-studio/queryleaf/main/logo-transparent-bg-green-shape.png" width="100" height="100" alt="QueryLeaf Logo">
</p>

<h1 align="center">@queryleaf/server</h1>

<p align="center">SQL to MongoDB query translator - Web Server</p>

## Overview

`@queryleaf/server` provides a REST API server for QueryLeaf, allowing you to execute SQL queries against MongoDB through HTTP requests. It's built on Express.js and leverages the core `@queryleaf/lib` package to parse SQL, transform it into MongoDB commands, and execute those commands.

## Installation

```bash
# Global installation
npm install -g @queryleaf/server
# or
yarn global add @queryleaf/server

# Local installation
npm install @queryleaf/server
# or
yarn add @queryleaf/server
```

## Usage

### Running the Server

```bash
# Start the server with default settings
queryleaf-server

# With specific MongoDB URI and port
queryleaf-server --uri mongodb://localhost:27017 --port 3000

# With authentication
queryleaf-server --uri mongodb://user:pass@localhost:27017

# Help
queryleaf-server --help
```

### API Endpoints

#### Execute SQL Query

```
POST /api/query
```

Request body:
```json
{
  "database": "mydb",
  "query": "SELECT * FROM users WHERE age > 21"
}
```

Response:
```json
{
  "results": [
    { "name": "Alice", "age": 25, "email": "alice@example.com" },
    { "name": "Bob", "age": 30, "email": "bob@example.com" }
  ],
  "count": 2,
  "message": "Query executed successfully"
}
```

#### Get Server Information

```
GET /api/info
```

Response:
```json
{
  "version": "0.1.0",
  "name": "QueryLeaf Server",
  "mongodb": {
    "connected": true,
    "version": "6.0.0"
  }
}
```

## Configuration

You can configure the server using command-line arguments or environment variables:

| Argument       | Environment Variable | Description                      |
|----------------|----------------------|----------------------------------|
| `--uri`        | `MONGODB_URI`        | MongoDB connection URI           |
| `--port`       | `PORT`               | Server port (default: 3000)      |
| `--host`       | `HOST`               | Server host (default: 0.0.0.0)   |
| `--cors`       | `ENABLE_CORS`        | Enable CORS (default: true)      |
| `--rate-limit` | `RATE_LIMIT`         | Rate limit (reqs/min, default: 60) |

## Security

The server includes security features:
- Rate limiting to prevent abuse
- Helmet.js for HTTP security headers
- Express security best practices
- Optional authentication

## Links

- [Website](https://queryleaf.com)
- [Documentation](https://queryleaf.com/docs)
- [GitHub Repository](https://github.com/beekeeper-studio/queryleaf)

## License

QueryLeaf is dual-licensed:

- [AGPL-3.0](https://github.com/beekeeper-studio/queryleaf/blob/main/LICENSE.md) for open source use
- [Commercial license](https://github.com/beekeeper-studio/queryleaf/blob/main/COMMERCIAL_LICENSE.md) for commercial use

For commercial licensing options, visit [queryleaf.com](https://queryleaf.com).