#!/usr/bin/env node

import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import bodyParser from 'body-parser';
import { rateLimit } from 'express-rate-limit';
// Removed swagger-ui-express import
import { MongoClient } from 'mongodb';
import { QueryLeaf } from '@queryleaf/lib';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

// Parse command line arguments
const argv = yargs(hideBin(process.argv))
  .usage('Usage: $0 [options]')
  .option('uri', {
    describe: 'MongoDB connection URI',
    default: 'mongodb://localhost:27017',
    type: 'string',
  })
  .option('db', {
    describe: 'MongoDB database name',
    demandOption: true,
    type: 'string',
  })
  .option('port', {
    describe: 'Server port',
    default: 4000,
    type: 'number',
  })
  .option('host', {
    describe: 'Server host',
    default: 'localhost',
    type: 'string',
  })
  .option('rate-limit', {
    describe: 'API rate limit per minute',
    default: 100,
    type: 'number',
  })
  .example('$0 --db mydb --port 3000', 'Start the server on port 3000')
  .example('$0 --db mydb --uri mongodb://username:password@localhost:27017', 'Connect to MongoDB with authentication')
  .epilog('For more information, visit https://github.com/beekeeper-studio/queryleaf')
  .help()
  .alias('help', 'h')
  .version()
  .alias('version', 'v')
  .parseSync();

// Swagger API documentation
const swaggerDocument = {
  openapi: '3.0.0',
  info: {
    title: 'QueryLeaf API',
    version: '0.1.0',
    description: 'REST API for executing SQL queries against MongoDB',
  },
  servers: [
    {
      url: `http://${argv.host}:${argv.port}`,
      description: 'QueryLeaf API server',
    },
  ],
  paths: {
    '/api/query': {
      post: {
        summary: 'Execute a SQL query',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['query'],
                properties: {
                  query: {
                    type: 'string',
                    description: 'SQL query to execute',
                    example: 'SELECT * FROM users LIMIT 5',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Query results',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    results: {
                      type: 'array',
                      items: {
                        type: 'object',
                      },
                    },
                    executionTime: {
                      type: 'number',
                      description: 'Query execution time in milliseconds',
                    },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Bad request',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    error: {
                      type: 'string',
                    },
                  },
                },
              },
            },
          },
          '500': {
            description: 'Server error',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    error: {
                      type: 'string',
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/collections': {
      get: {
        summary: 'List all collections in the database',
        responses: {
          '200': {
            description: 'List of collections',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    collections: {
                      type: 'array',
                      items: {
                        type: 'string',
                      },
                    },
                  },
                },
              },
            },
          },
          '500': {
            description: 'Server error',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    error: {
                      type: 'string',
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/health': {
      get: {
        summary: 'Health check endpoint',
        responses: {
          '200': {
            description: 'Server is healthy',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: {
                      type: 'string',
                      example: 'ok',
                    },
                    version: {
                      type: 'string',
                      example: '0.1.0',
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

// Main function
async function main() {
  const { uri, db, port, host, rateLimit: rateLimitValue } = argv;
  
  // Connect to MongoDB
  console.log(`Connecting to MongoDB: ${uri}`);
  const mongoClient = new MongoClient(uri as string);
  await mongoClient.connect();
  console.log(`Connected to MongoDB, using database: ${db}`);
  
  // Create QueryLeaf instance
  const queryLeaf = new QueryLeaf(mongoClient, db as string);
  
  // Create Express app
  const app = express();
  
  // Middleware
  app.use(cors());
  app.use(morgan('tiny'));
  app.use(
    helmet({
      contentSecurityPolicy: false, // Disable CSP for Swagger UI
    })
  );
  app.use(bodyParser.json());
  
  // Rate limiting
  const limiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: rateLimitValue as number,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
  });
  app.use('/api/', limiter);
  
  // API routes
  app.post('/api/query', async (req, res) => {
    try {
      const { query } = req.body;
      
      if (!query || typeof query !== 'string') {
        return res.status(400).json({ error: 'Query parameter is required and must be a string' });
      }
      
      const startTime = Date.now();
      const results = await queryLeaf.execute(query);
      const executionTime = Date.now() - startTime;
      
      res.json({
        results,
        executionTime,
      });
    } catch (error) {
      console.error('Query error:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });
  
  app.get('/api/collections', async (req, res) => {
    try {
      const collections = await mongoClient.db(db as string).listCollections().toArray();
      res.json({
        collections: collections.map(c => c.name),
      });
    } catch (error) {
      console.error('Error listing collections:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });
  
  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      version: require('../package.json').version,
    });
  });
  
  // Swagger API docs
  // Using a simpler approach instead of swagger-ui-express
  app.get('/api-docs', (req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <title>QueryLeaf API Documentation</title>
          <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5.1.0/swagger-ui.css">
        </head>
        <body>
          <div id="swagger-ui"></div>
          <script src="https://unpkg.com/swagger-ui-dist@5.1.0/swagger-ui-bundle.js"></script>
          <script>
            window.onload = function() {
              window.ui = SwaggerUIBundle({
                spec: ${JSON.stringify(swaggerDocument)},
                dom_id: '#swagger-ui',
                presets: [
                  SwaggerUIBundle.presets.apis,
                  SwaggerUIBundle.SwaggerUIStandalonePreset
                ],
                layout: "BaseLayout",
                deepLinking: true
              });
            }
          </script>
        </body>
      </html>
    `);
  });
  
  // Simple HTML UI for testing
  app.get('/', (req, res) => {
    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>QueryLeaf - SQL to MongoDB Proxy</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
          }
          h1 {
            color: #2c3e50;
          }
          textarea {
            width: 100%;
            height: 150px;
            padding: 12px;
            margin: 8px 0;
            border: 1px solid #ddd;
            border-radius: 4px;
            resize: vertical;
            font-family: monospace;
          }
          button {
            background-color: #4CAF50;
            color: white;
            padding: 12px 20px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
          }
          button:hover {
            background-color: #45a049;
          }
          pre {
            background-color: #f5f5f5;
            padding: 15px;
            border-radius: 4px;
            overflow: auto;
          }
          .links {
            margin-top: 20px;
          }
          .links a {
            margin-right: 20px;
            color: #3498db;
            text-decoration: none;
          }
          .links a:hover {
            text-decoration: underline;
          }
        </style>
      </head>
      <body>
        <h1>QueryLeaf - SQL to MongoDB Proxy</h1>
        <p>Enter a SQL query to execute against MongoDB:</p>
        <textarea id="query-input" placeholder="SELECT * FROM users LIMIT 5"></textarea>
        <button id="execute-btn">Execute Query</button>
        <h3>Results:</h3>
        <pre id="results"></pre>
        <div class="links">
          <a href="/api-docs" target="_blank">API Documentation</a>
          <a href="https://github.com/beekeeper-studio/queryleaf" target="_blank">GitHub Repository</a>
        </div>
        <script>
          document.getElementById('execute-btn').addEventListener('click', async () => {
            const query = document.getElementById('query-input').value.trim();
            const resultsElement = document.getElementById('results');
            
            if (!query) {
              resultsElement.textContent = 'Please enter a query';
              return;
            }
            
            resultsElement.textContent = 'Loading...';
            
            try {
              const response = await fetch('/api/query', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ query }),
              });
              
              const data = await response.json();
              
              if (response.ok) {
                resultsElement.textContent = JSON.stringify(data, null, 2);
              } else {
                resultsElement.textContent = 'Error: ' + (data.error || 'Unknown error');
              }
            } catch (error) {
              resultsElement.textContent = 'Error: ' + error.message;
            }
          });
        </script>
      </body>
      </html>
    `;
    res.send(html);
  });
  
  // Start server
  app.listen(port, host as string, () => {
    console.log(`Server running at http://${host}:${port}/`);
    console.log(`API Documentation: http://${host}:${port}/api-docs`);
  });
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nClosing MongoDB connection and shutting down server...');
    await mongoClient.close();
    process.exit(0);
  });
}

// Run the main function if this file is executed directly
if (require.main === module) {
  main().catch(error => {
    console.error(`Unhandled error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}