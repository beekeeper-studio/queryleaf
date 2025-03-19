# Web Server

QueryLeaf provides a web server that allows you to run a MongoDB SQL proxy. This server offers both a REST API for programmatic access and a simple web UI for interactive querying.

## Installation

The web server is included with the QueryLeaf package. If you've installed QueryLeaf globally, you can use it directly:

```bash
npm install -g queryleaf
```

## Starting the Server

### Basic Usage

```bash
queryleaf-server
```

By default, this will:
- Start a server on port 3000
- Try to connect to MongoDB at `mongodb://localhost:27017`
- Expect a database name provided via the `MONGO_DB` environment variable

### Environment Variables

The server can be configured using the following environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Port to run the server on | `3000` |
| `MONGO_URI` | MongoDB connection URI | `mongodb://localhost:27017` |
| `MONGO_DB` | MongoDB database name (required) | - |
| `LOG_FORMAT` | Morgan logging format | `dev` |
| `ENABLE_CORS` | Enable CORS | `true` |
| `CORS_ORIGIN` | CORS origin | `*` |
| `API_RATE_LIMIT` | API rate limit (requests) | `100` |
| `API_RATE_LIMIT_WINDOW` | Rate limit window (minutes) | `15` |
| `SWAGGER_ENABLED` | Enable Swagger documentation | `true` |

### Example

```bash
PORT=8080 MONGO_URI="mongodb://localhost:27017" MONGO_DB="test" queryleaf-server
```

## Using the Web UI

The web UI is available at the root URL (e.g., `http://localhost:3000/`). It provides:

- A SQL editor with syntax highlighting
- A list of available collections
- Results displayed in a tabular format
- Error messages for failed queries
- Query execution time information

### Features

- **SQL Editor**: Write and edit SQL queries with syntax highlighting
- **Collections List**: Quick access to available collections in your database
- **Table Results**: Results displayed in a clean, tabular format
- **Error Handling**: Clear error messages for troubleshooting
- **Keyboard Shortcuts**: Use Ctrl+Enter (Cmd+Enter on Mac) to execute queries

## REST API

The server provides a REST API for programmatic access to your MongoDB database through SQL queries.

### API Endpoints

#### Execute a SQL Query

```
POST /api/query
```

**Request Body**:
```json
{
  "sql": "SELECT * FROM users LIMIT 10"
}
```

**Response**:
```json
{
  "results": [
    {
      "_id": "5f8d41f2e6b5a92c6a328d1a",
      "name": "John Doe",
      "email": "john@example.com",
      "age": 30
    },
    // ... more results
  ],
  "rowCount": 10,
  "executionTime": 15
}
```

#### List Available Collections

```
GET /api/tables
```

**Response**:
```json
{
  "collections": [
    "users",
    "products",
    "orders"
  ]
}
```

#### Health Check

```
GET /api/health
```

**Response**:
```json
{
  "status": "ok",
  "mongodb": "connected",
  "version": "1.0.0",
  "database": "mydb"
}
```

### API Documentation

The API documentation is available at `/api-docs` when the server is running with Swagger enabled.

## Security Considerations

The server includes several security features:

- **Helmet**: Sets various HTTP headers for security
- **Rate Limiting**: Prevents abuse through request rate limiting
- **CORS**: Configurable Cross-Origin Resource Sharing

However, for production use, you should consider:

1. Using HTTPS (by putting the server behind a reverse proxy like Nginx)
2. Adding authentication (via an authentication proxy or custom middleware)
3. Restricting the CORS origin to specific domains
4. Running the server in a container or restricted environment

## Use Cases

### Local Development Database Interface

Run the server locally to provide a simple SQL interface to your MongoDB development database:

```bash
MONGO_DB="development" queryleaf-server
```

### Microservice for SQL Access

Deploy the server as a microservice to provide SQL access to MongoDB for applications that expect SQL:

```bash
PORT=8080 MONGO_URI="mongodb://user:pass@production-mongodb:27017" MONGO_DB="production" CORS_ORIGIN="https://myapp.example.com" queryleaf-server
```

### Analytics Access Point

Provide a SQL interface for analytics tools or data scientists who are more comfortable with SQL:

```bash
PORT=3030 MONGO_URI="mongodb://analytics-user:pass@mongodb:27017" MONGO_DB="analytics" queryleaf-server
```

## Advanced Configuration

For advanced configuration, you can create a startup script:

```javascript
// server.js
const { startServer } = require('queryleaf/dist/server');

startServer({
  port: 8080,
  mongoUri: 'mongodb://localhost:27017',
  databaseName: 'myapp',
  logFormat: 'combined',
  enableCors: true,
  corsOrigin: 'https://myapp.example.com',
  apiRateLimit: 200,
  apiRateLimitWindow: 30,
  swaggerEnabled: true
}).then(({ app, server }) => {
  console.log('Server started with custom configuration');
  
  // Add custom middleware or routes
  app.get('/custom', (req, res) => {
    res.json({ message: 'Custom endpoint' });
  });
}).catch(error => {
  console.error('Failed to start server:', error);
});
```

Then run it with:

```bash
node server.js
```