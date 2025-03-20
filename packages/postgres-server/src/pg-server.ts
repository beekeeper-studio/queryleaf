#!/usr/bin/env node

import { createServer, Server } from 'net';
import { MongoClient } from 'mongodb';
import { QueryLeaf } from '@queryleaf/lib';
import { ProtocolHandler } from './protocol-handler';
import debugLib from 'debug';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const debug = debugLib('queryleaf:pg-server');

// Parse command line arguments
// Only parse if this file is the main entry point (not during tests)
const yargsInstance = yargs(hideBin(process.argv))
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
    describe: 'PostgreSQL server port',
    default: 5432,
    type: 'number',
  })
  .option('host', {
    describe: 'PostgreSQL server host',
    default: 'localhost',
    type: 'string',
  })
  .option('max-connections', {
    describe: 'Maximum number of connections',
    default: 100,
    type: 'number',
  })
  .option('auth-passthrough', {
    describe: 'Pass authentication credentials to MongoDB',
    default: false,
    type: 'boolean',
  })
  .example('$0 --db mydb --port 5432', 'Start the PostgreSQL-compatible server on port 5432')
  .example(
    '$0 --db mydb --uri mongodb://username:password@localhost:27017',
    'Connect to MongoDB with authentication'
  )
  .epilog('For more information, visit https://github.com/beekeeper-studio/queryleaf')
  .help()
  .alias('help', 'h')
  .version()
  .alias('version', 'v');

// Define the argument type
interface Args {
  uri?: string;
  db?: string;
  port?: number;
  host?: string;
  maxConnections?: number;
  authPassthrough?: boolean;
}

// Only parse command line args when run as main file, not during tests
const argv: Args = require.main === module ? yargsInstance.parseSync() : {};

/**
 * PostgreSQL wire protocol server for QueryLeaf
 */
class PostgresServer {
  private server: Server;
  private mongoClient: MongoClient;
  private queryLeaf: QueryLeaf;
  private connections: Set<ProtocolHandler> = new Set();
  private maxConnections: number;
  private authPassthrough: boolean;
  private dbName: string;
  private mongoUri: string;

  /**
   * Create a new PostgreSQL wire protocol server
   * @param mongoClient MongoDB client
   * @param dbName MongoDB database name
   * @param options Server options
   */
  constructor(
    mongoClient: MongoClient,
    dbName: string,
    options: {
      port: number;
      host: string;
      maxConnections: number;
      authPassthrough?: boolean;
      mongoUri?: string;
    }
  ) {
    this.mongoClient = mongoClient;
    this.queryLeaf = new QueryLeaf(mongoClient, dbName);
    this.maxConnections = options.maxConnections;
    this.authPassthrough = options.authPassthrough || false;
    this.dbName = dbName;
    this.mongoUri = options.mongoUri || '';

    // Create TCP server
    this.server = createServer((socket) => {
      debug(`New connection from ${socket.remoteAddress}:${socket.remotePort}`);

      // Check max connections
      if (this.connections.size >= this.maxConnections) {
        debug(`Connection limit reached (${this.maxConnections}), rejecting connection`);
        socket.end();
        return;
      }

      // Create protocol handler for this connection
      const handler = new ProtocolHandler(socket, this.queryLeaf, {
        authPassthrough: this.authPassthrough,
        mongoClient: this.mongoClient,
        dbName: this.dbName,
        mongoUri: this.mongoUri,
      });
      this.connections.add(handler);

      // Remove connection on close
      socket.on('close', () => {
        debug(`Connection closed from ${socket.remoteAddress}:${socket.remotePort}`);
        this.connections.delete(handler);
      });
    });

    // Handle server errors
    this.server.on('error', (err) => {
      console.error('Server error:', err);
    });

    // Handle process signals (only when running as main module)
    if (require.main === module) {
      process.on('SIGINT', () => this.shutdown(true));
      process.on('SIGTERM', () => this.shutdown(true));

      // Only auto-listen if running as main module
      this.listen(options.port, options.host);
    }
    // For tests, we'll call listen() explicitly
  }

  /**
   * Start listening for connections
   * @param port Port to listen on
   * @param host Host to listen on
   * @returns A promise that resolves when the server is listening
   */
  async listen(port: number, host: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.listen(port, host, () => {
        debug(`PostgreSQL-compatible server running at ${host}:${port}`);
        debug(`Connected to MongoDB at ${this.mongoClient.options.hosts?.join(',')}`);
        resolve();
      });

      // Handle initial connection errors
      const errorHandler = (err: Error) => {
        this.server.removeListener('error', errorHandler);
        reject(err);
      };

      this.server.once('error', errorHandler);
    });
  }

  /**
   * Shutdown the server and close all connections
   * @param exitProcess Whether to exit the process after shutdown (default: false)
   */
  async shutdown(exitProcess = false): Promise<void> {
    debug('Shutting down server...');

    // Close server - stop accepting new connections
    this.server.close();

    // Close MongoDB connection
    await this.mongoClient.close();

    debug('Server stopped');

    // Only exit the process if explicitly requested (for CLI usage)
    if (exitProcess) {
      process.exit(0);
    }
  }
}

/**
 * Main function to start the server
 */
async function main(): Promise<void> {
  // Use the command line arguments or default values
  const uri = argv.uri || 'mongodb://localhost:27017';
  const db = argv.db;
  const port = argv.port || 5432;
  const host = argv.host || 'localhost';
  const maxConnections = argv.maxConnections || 100;
  const authPassthrough = argv.authPassthrough || false;

  if (!db) {
    console.error('Error: MongoDB database name is required. Use --db option.');
    process.exit(1);
  }

  try {
    // Connect to MongoDB
    debug(`Connecting to MongoDB: ${uri}`);
    const mongoClient = new MongoClient(uri);
    await mongoClient.connect();
    debug(`Connected to MongoDB, using database: ${db}`);

    // Start PostgreSQL server
    new PostgresServer(mongoClient, db, {
      port,
      host,
      maxConnections,
      authPassthrough,
      mongoUri: uri,
    });

    console.log(`🌱 QueryLeaf PostgreSQL-compatible server started at ${host}:${port}`);
    console.log(`Connected to MongoDB database: ${db}`);
    console.log(`Connection string: postgresql://<username>@${host}:${port}/${db}`);
    console.log(`Connect with: psql -h ${host} -p ${port} -d ${db} -U <any-username>`);
    console.log('Press Ctrl+C to stop the server');
  } catch (error) {
    console.error('Error starting server:', error);
    process.exit(1);
  }
}

// Run the main function if this file is executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error(`Unhandled error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}

export { PostgresServer, ProtocolHandler };
