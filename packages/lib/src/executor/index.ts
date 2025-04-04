import {
  CommandExecutor,
  Command,
  ExecutionResult,
  CursorResult,
  CursorOptions,
} from '../interfaces';
import { Document, MongoClient, ObjectId } from 'mongodb';

/**
 * MongoDB command executor implementation for Node.js
 */
export class MongoExecutor implements CommandExecutor {
  private client: MongoClient;
  private dbName: string;

  /**
   * Create a new MongoDB executor using a MongoDB client
   * @param client MongoDB client instance
   * @param dbName Database name
   */
  constructor(client: MongoClient, dbName: string) {
    this.client = client;
    this.dbName = dbName;
  }

  /**
   * No-op - client lifecycle is managed by the user
   */
  async connect(): Promise<void> {
    // Connection is managed by the user
  }

  /**
   * No-op - client lifecycle is managed by the user
   */
  async close(): Promise<void> {
    // Connection is managed by the user
  }

  /**
   * Execute a series of MongoDB commands and return documents
   * @param commands Array of commands to execute
   * @returns Result of the last command as documents (not cursors)
   * @typeParam T - The type of documents that will be returned (defaults to Document)
   */
  async execute<T = Document>(commands: Command[]): Promise<ExecutionResult<T>> {
    // We assume the client is already connected
    const database = this.client.db(this.dbName);

    // Execute each command in sequence
    let result = null;
    for (const command of commands) {
      switch (command.type) {
        case 'FIND':
          // Prepare find options
          const findOptions: any = {};

          // Apply projection if specified
          if (command.projection) {
            findOptions.projection = command.projection;
          }

          // Apply sorting if specified
          if (command.sort) {
            findOptions.sort = command.sort;
          }

          // Apply pagination if specified
          if (command.skip) {
            findOptions.skip = command.skip;
          }
          if (command.limit && command.limit > 0) {
            findOptions.limit = command.limit;
          }

          // Create the cursor with all options at once
          const findCursor = database
            .collection(command.collection)
            .find(this.convertObjectIds(command.filter || {}), findOptions);

          // Always return array for the regular execute
          result = await findCursor.toArray();
          break;

        case 'INSERT':
          result = await database
            .collection(command.collection)
            .insertMany(command.documents.map((doc) => this.convertObjectIds(doc)));
          break;

        case 'UPDATE':
          result = await database
            .collection(command.collection)
            .updateMany(
              this.convertObjectIds(command.filter || {}),
              this.convertObjectIds(command.update)
            );
          break;

        case 'DELETE':
          result = await database
            .collection(command.collection)
            .deleteMany(this.convertObjectIds(command.filter || {}));
          break;

        case 'AGGREGATE':
          // Handle aggregation commands
          const pipeline = command.pipeline.map((stage) => this.convertObjectIds(stage));

          // Prepare aggregation options
          const aggregateOptions: any = {};

          // Create the cursor with options
          const aggregateCursor = database
            .collection(command.collection)
            .aggregate(pipeline, aggregateOptions);

          // Always return array for the regular execute
          result = await aggregateCursor.toArray();
          break;

        default:
          throw new Error(`Unsupported command type: ${(command as any).type}`);
      }
    }

    return result;
  }

  /**
   * Execute a series of MongoDB commands and return cursors
   * @param commands Array of commands to execute
   * @param options Options for cursor execution
   * @returns Cursor for FIND and AGGREGATE commands, null for other commands
   * @typeParam T - The type of documents that will be returned (defaults to Document)
   */
  async executeCursor<T = Document>(
    commands: Command[],
    options?: CursorOptions
  ): Promise<CursorResult<T>> {
    // We assume the client is already connected
    const database = this.client.db(this.dbName);

    // Execute each command in sequence, but only return a cursor for the last command
    // if it's a FIND or AGGREGATE
    let result = null;

    for (const command of commands) {
      switch (command.type) {
        case 'FIND':
          // Prepare find options
          const findOptions: any = {};

          // Apply projection if specified
          if (command.projection) {
            findOptions.projection = command.projection;
          }

          // Apply sorting if specified
          if (command.sort) {
            findOptions.sort = command.sort;
          }

          // Apply pagination if specified
          if (command.skip) {
            findOptions.skip = command.skip;
          }
          if (command.limit && command.limit > 0) {
            findOptions.limit = command.limit;
          }

          // Apply batch size from options
          if (options?.batchSize) {
            findOptions.batchSize = options.batchSize;
          }

          // Create the cursor with all options at once
          const findCursor = database
            .collection(command.collection)
            .find(this.convertObjectIds(command.filter || {}), findOptions);

          // Return the cursor directly
          result = findCursor;
          break;

        case 'AGGREGATE':
          // Handle aggregation commands
          const pipeline = command.pipeline.map((stage) => this.convertObjectIds(stage));

          // Prepare aggregation options
          const aggregateOptions: any = {};

          // Apply batch size from options
          if (options?.batchSize) {
            aggregateOptions.batchSize = options.batchSize;
          }

          // Create the cursor with options
          result = database.collection(command.collection).aggregate(pipeline, aggregateOptions);
          break;

        case 'INSERT':
        case 'UPDATE':
        case 'DELETE':
          // For non-cursor commands, execute them but don't return a cursor
          throw new Error(`Cannot return cursor for ${(command as any).type}`);
        default:
          throw new Error(`Unsupported command type: ${(command as any).type}`);
      }
    }

    return result as CursorResult<T>;
  }

  /**
   * Convert string ObjectIds to MongoDB ObjectId instances
   * @param obj Object to convert
   * @returns Object with converted ObjectIds
   */
  private convertObjectIds(obj: any): any {
    if (!obj) return obj;

    if (Array.isArray(obj)) {
      return obj.map((item) => this.convertObjectIds(item));
    }

    if (typeof obj === 'object') {
      const result: Record<string, any> = {};

      for (const [key, value] of Object.entries(obj)) {
        // Special handling for _id field and fields ending with Id
        if (
          (key === '_id' || key.endsWith('Id') || key.endsWith('Ids')) &&
          typeof value === 'string'
        ) {
          try {
            // Check if it's a valid ObjectId string
            if (/^[0-9a-fA-F]{24}$/.test(value)) {
              result[key] = new ObjectId(value);
              continue;
            }
          } catch (error) {
            // If it's not a valid ObjectId, keep it as a string
            console.warn(`Could not convert ${key} value to ObjectId: ${value}`);
          }
        } else if (Array.isArray(value) && (key.endsWith('Ids') || key === 'productIds')) {
          // For arrays of IDs
          result[key] = value.map((item: any) => {
            if (typeof item === 'string' && /^[0-9a-fA-F]{24}$/.test(item)) {
              try {
                return new ObjectId(item);
              } catch (error) {
                return item;
              }
            }
            return this.convertObjectIds(item);
          });
          continue;
        } else if (typeof value === 'object' && value !== null) {
          // Recursively convert nested objects
          result[key] = this.convertObjectIds(value);
          continue;
        }

        // Copy other values as is
        result[key] = value;
      }

      return result;
    }

    return obj;
  }
}
