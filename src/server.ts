import express, { Request, Response } from 'express';
import { MongoClient } from 'mongodb';
import { QueryLeaf } from './index';
import bodyParser from 'body-parser';
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import path from 'path';
import fs from 'fs';

// Config options
interface ServerConfig {
  port: number;
  mongoUri: string;
  databaseName: string;
  logFormat: string;
  enableCors: boolean;
  corsOrigin: string;
  apiRateLimit: number;
  apiRateLimitWindow: number; // in minutes
  swaggerEnabled: boolean;
}

// Initialize config with defaults
const config: ServerConfig = {
  port: parseInt(process.env.PORT || '3000', 10),
  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017',
  databaseName: process.env.MONGO_DB || '',
  logFormat: process.env.LOG_FORMAT || 'dev',
  enableCors: process.env.ENABLE_CORS !== 'false',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  apiRateLimit: parseInt(process.env.API_RATE_LIMIT || '100', 10),
  apiRateLimitWindow: parseInt(process.env.API_RATE_LIMIT_WINDOW || '15', 10),
  swaggerEnabled: process.env.SWAGGER_ENABLED !== 'false',
};

// Swagger documentation
const swaggerDocument = {
  openapi: '3.0.0',
  info: {
    title: 'QueryLeaf API',
    version: '1.0.0',
    description: 'API for executing SQL queries against MongoDB',
  },
  servers: [
    {
      url: '/',
      description: 'Current server',
    },
  ],
  paths: {
    '/api/query': {
      post: {
        summary: 'Execute a SQL query',
        description: 'Execute a SQL query against the MongoDB database',
        operationId: 'executeSqlQuery',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['sql'],
                properties: {
                  sql: {
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
            description: 'Query executed successfully',
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
                    rowCount: {
                      type: 'integer',
                      description: 'Number of rows returned',
                    },
                    executionTime: {
                      type: 'integer',
                      description: 'Execution time in milliseconds',
                    },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Bad request - Invalid SQL query',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    error: {
                      type: 'string',
                      description: 'Error message',
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
                      description: 'Error message',
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/tables': {
      get: {
        summary: 'List available collections',
        description: 'Get a list of all collections in the MongoDB database',
        operationId: 'listTables',
        responses: {
          '200': {
            description: 'Collections retrieved successfully',
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
                      description: 'Error message',
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/health': {
      get: {
        summary: 'Health check',
        description: 'Check if the API is running and connected to MongoDB',
        operationId: 'healthCheck',
        responses: {
          '200': {
            description: 'API is healthy',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: {
                      type: 'string',
                      enum: ['ok'],
                    },
                    mongodb: {
                      type: 'string',
                      enum: ['connected', 'disconnected'],
                    },
                  },
                },
              },
            },
          },
          '500': {
            description: 'API is unhealthy',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: {
                      type: 'string',
                      enum: ['error'],
                    },
                    mongodb: {
                      type: 'string',
                      enum: ['disconnected'],
                    },
                    error: {
                      type: 'string',
                      description: 'Error message',
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

// Rate limiter middleware
const limiter = rateLimit({
  windowMs: config.apiRateLimitWindow * 60 * 1000, // in milliseconds
  limit: config.apiRateLimit,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

// Main function to start server
export async function startServer(customConfig?: Partial<ServerConfig>): Promise<{ app: express.Application; server: any }> {
  // Apply custom config if provided
  const serverConfig = { ...config, ...customConfig };
  
  // Validate database name
  if (!serverConfig.databaseName) {
    throw new Error('MongoDB database name is required. Set MONGO_DB environment variable or provide in custom config.');
  }
  
  // Create Express app
  const app = express();
  
  // Apply middleware
  app.use(helmet()); // Security headers
  app.use(morgan(serverConfig.logFormat)); // Logging
  app.use(bodyParser.json()); // Parse JSON requests
  
  // Apply CORS if enabled
  if (serverConfig.enableCors) {
    app.use(cors({
      origin: serverConfig.corsOrigin,
      methods: ['GET', 'POST'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }));
  }
  
  // Apply rate limiter to API routes
  app.use('/api/', limiter);
  
  // Connect to MongoDB
  const mongoClient = new MongoClient(serverConfig.mongoUri);
  await mongoClient.connect();
  console.log(`Connected to MongoDB: ${serverConfig.mongoUri}`);
  
  // Create QueryLeaf instance
  const queryLeaf = new QueryLeaf(mongoClient, serverConfig.databaseName);
  console.log(`Using database: ${serverConfig.databaseName}`);
  
  // Health check endpoint
  app.get('/api/health', async (req: Request, res: Response) => {
    try {
      // Check MongoDB connection
      await mongoClient.db('admin').command({ ping: 1 });
      
      res.json({
        status: 'ok',
        mongodb: 'connected',
        version: '1.0.0',
        database: serverConfig.databaseName,
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        mongodb: 'disconnected',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
  
  // List tables (collections) endpoint
  app.get('/api/tables', async (req: Request, res: Response) => {
    try {
      const collections = await mongoClient
        .db(serverConfig.databaseName)
        .listCollections()
        .toArray();
      
      res.json({
        collections: collections.map(collection => collection.name),
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
  
  // Execute SQL query endpoint
  app.post('/api/query', async (req: Request, res: Response) => {
    const { sql } = req.body;
    
    if (!sql || typeof sql !== 'string') {
      return res.status(400).json({
        error: 'SQL query is required in the request body',
      });
    }
    
    try {
      const startTime = Date.now();
      const results = await queryLeaf.execute(sql);
      const executionTime = Date.now() - startTime;
      
      res.json({
        results,
        rowCount: Array.isArray(results) ? results.length : (results ? 1 : 0),
        executionTime,
      });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
  
  // Serve Swagger documentation if enabled
  if (serverConfig.swaggerEnabled) {
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
    console.log('Swagger API documentation available at /api-docs');
  }
  
  // Simple UI for testing queries
  const uiHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>QueryLeaf SQL UI</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
  <style>
    body { padding: 20px; }
    #results { font-family: monospace; white-space: pre; }
    .editor-container { position: relative; height: 200px; border: 1px solid #ccc; border-radius: 4px; }
    .navbar-brand img { height: 30px; margin-right: 10px; }
    .results-container { max-height: 500px; overflow: auto; }
    .table-container { overflow-x: auto; }
  </style>
</head>
<body>
  <nav class="navbar navbar-expand-lg navbar-light bg-light mb-4">
    <div class="container-fluid">
      <a class="navbar-brand" href="/">
        <span>QueryLeaf SQL</span>
      </a>
      <div class="collapse navbar-collapse">
        <ul class="navbar-nav me-auto mb-2 mb-lg-0">
          <li class="nav-item">
            <a class="nav-link" href="/api-docs" target="_blank">API Docs</a>
          </li>
          <li class="nav-item">
            <a class="nav-link" href="https://github.com/beekeeper-studio/queryleaf" target="_blank">GitHub</a>
          </li>
        </ul>
      </div>
    </div>
  </nav>

  <div class="container-fluid">
    <div class="row mb-3">
      <div class="col-md-9">
        <div class="editor-container" id="editor">SELECT * FROM users LIMIT 10;</div>
      </div>
      <div class="col-md-3">
        <div class="d-grid gap-2">
          <button class="btn btn-primary" id="runBtn">Run Query</button>
          <button class="btn btn-outline-secondary" id="clearBtn">Clear Results</button>
        </div>
        <div class="mt-3">
          <h6>Collections</h6>
          <div id="collections" class="list-group">
            <div class="d-flex justify-content-center">
              <div class="spinner-border spinner-border-sm" role="status">
                <span class="visually-hidden">Loading...</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <div class="row">
      <div class="col-12">
        <div id="errorBox" class="alert alert-danger d-none" role="alert"></div>
        <div class="card">
          <div class="card-header d-flex justify-content-between align-items-center">
            Results <span id="resultCount" class="badge bg-secondary"></span>
            <span id="executionTime" class="badge bg-light text-dark"></span>
          </div>
          <div class="card-body results-container">
            <div class="table-container">
              <table id="resultsTable" class="table table-sm table-hover"></table>
            </div>
            <div id="emptyResults" class="text-center text-muted my-5 d-none">
              <p>No results to display</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/ace-builds@1.31.0/src-min-noconflict/ace.js"></script>
  <script>
    // Initialize editor
    const editor = ace.edit("editor");
    editor.setTheme("ace/theme/sqlserver");
    editor.session.setMode("ace/mode/sql");
    editor.setShowPrintMargin(false);
    
    // Load collections
    async function loadCollections() {
      try {
        const response = await fetch('/api/tables');
        const data = await response.json();
        
        if (data.collections && Array.isArray(data.collections)) {
          const collectionsEl = document.getElementById('collections');
          collectionsEl.innerHTML = '';
          
          if (data.collections.length === 0) {
            collectionsEl.innerHTML = '<div class="text-muted small">No collections found</div>';
            return;
          }
          
          data.collections.forEach(name => {
            const btn = document.createElement('button');
            btn.className = 'list-group-item list-group-item-action d-flex justify-content-between align-items-center btn-sm py-1';
            btn.textContent = name;
            btn.addEventListener('click', () => {
              editor.setValue(\`SELECT * FROM \${name} LIMIT 10;\`);
              editor.clearSelection();
            });
            collectionsEl.appendChild(btn);
          });
        }
      } catch (error) {
        console.error('Error loading collections:', error);
      }
    }
    
    // Run query
    async function runQuery() {
      const sql = editor.getValue();
      const errorBox = document.getElementById('errorBox');
      const resultCount = document.getElementById('resultCount');
      const executionTime = document.getElementById('executionTime');
      const resultsTable = document.getElementById('resultsTable');
      const emptyResults = document.getElementById('emptyResults');
      
      errorBox.classList.add('d-none');
      resultsTable.innerHTML = '';
      emptyResults.classList.add('d-none');
      resultCount.textContent = '';
      executionTime.textContent = '';
      
      try {
        const response = await fetch('/api/query', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ sql }),
        });
        
        const data = await response.json();
        
        if (!response.ok) {
          errorBox.textContent = data.error || 'Unknown error';
          errorBox.classList.remove('d-none');
          return;
        }
        
        // Display execution time
        executionTime.textContent = \`\${data.executionTime}ms\`;
        
        // Display results
        const results = data.results;
        
        if (!results || (Array.isArray(results) && results.length === 0)) {
          emptyResults.classList.remove('d-none');
          resultCount.textContent = '0';
          return;
        }
        
        // Get all unique keys for table headers
        const keys = new Set();
        if (Array.isArray(results)) {
          results.forEach(row => {
            Object.keys(row).forEach(key => keys.add(key));
          });
          resultCount.textContent = String(results.length);
        } else {
          // Results is a single object (e.g. from INSERT/UPDATE)
          Object.keys(results).forEach(key => keys.add(key));
          resultCount.textContent = '1';
        }
        
        // Create table headers
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        
        Array.from(keys).forEach(key => {
          const th = document.createElement('th');
          th.textContent = key;
          headerRow.appendChild(th);
        });
        
        thead.appendChild(headerRow);
        resultsTable.appendChild(thead);
        
        // Create table body
        const tbody = document.createElement('tbody');
        
        if (Array.isArray(results)) {
          results.forEach(row => {
            const tr = document.createElement('tr');
            
            Array.from(keys).forEach(key => {
              const td = document.createElement('td');
              let value = row[key];
              
              // Format value for display
              if (value === null || value === undefined) {
                td.innerHTML = '<span class="text-muted font-italic">null</span>';
              } else if (typeof value === 'object') {
                td.textContent = JSON.stringify(value);
              } else {
                td.textContent = String(value);
              }
              
              tr.appendChild(td);
            });
            
            tbody.appendChild(tr);
          });
        } else {
          // Single object result
          const tr = document.createElement('tr');
          
          Array.from(keys).forEach(key => {
            const td = document.createElement('td');
            let value = results[key];
            
            if (value === null || value === undefined) {
              td.innerHTML = '<span class="text-muted font-italic">null</span>';
            } else if (typeof value === 'object') {
              td.textContent = JSON.stringify(value);
            } else {
              td.textContent = String(value);
            }
            
            tr.appendChild(td);
          });
          
          tbody.appendChild(tr);
        }
        
        resultsTable.appendChild(tbody);
      } catch (error) {
        errorBox.textContent = error.message || 'Error executing query';
        errorBox.classList.remove('d-none');
      }
    }
    
    // Event listeners
    document.getElementById('runBtn').addEventListener('click', runQuery);
    
    document.getElementById('clearBtn').addEventListener('click', () => {
      document.getElementById('errorBox').classList.add('d-none');
      document.getElementById('resultsTable').innerHTML = '';
      document.getElementById('emptyResults').classList.add('d-none');
      document.getElementById('resultCount').textContent = '';
      document.getElementById('executionTime').textContent = '';
    });
    
    // Run on page load
    document.addEventListener('DOMContentLoaded', () => {
      loadCollections();
    });
    
    // Run on Ctrl+Enter
    editor.commands.addCommand({
      name: 'executeQuery',
      bindKey: {win: 'Ctrl-Enter', mac: 'Command-Enter'},
      exec: runQuery
    });
  </script>
</body>
</html>
  `;
  
  // Serve UI
  app.get('/', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/html');
    res.send(uiHtml);
  });
  
  // Start the server
  const server = app.listen(serverConfig.port, () => {
    console.log(`QueryLeaf SQL server running on port ${serverConfig.port}`);
    console.log(`Web UI available at http://localhost:${serverConfig.port}/`);
    
    if (serverConfig.swaggerEnabled) {
      console.log(`API documentation available at http://localhost:${serverConfig.port}/api-docs`);
    }
  });
  
  // Handle graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully');
    await mongoClient.close();
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });
  
  process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down gracefully');
    await mongoClient.close();
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });
  
  return { app, server };
}

// Run the server if this file is executed directly
if (require.main === module) {
  startServer().catch(error => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}