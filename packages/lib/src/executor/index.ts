import {
  CommandExecutor,
  Command,
  ExecutionResult,
  CursorResult,
  CursorOptions,
} from '../interfaces';
import { Db, Document, MongoClient, ObjectId } from 'mongodb';

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
          const findFilter = await this.resolveFilterObjectIds(
            database,
            command.collection,
            command.filter || {}
          );
          const findCursor = database
            .collection(command.collection)
            .find(findFilter, findOptions);

          // Always return array for the regular execute
          result = await findCursor.toArray();
          break;

        case 'INSERT':
          result = await database
            .collection(command.collection)
            .insertMany(command.documents.map((doc) => this.convertObjectIds(doc)));
          break;

        case 'UPDATE': {
          const updateFilter = await this.resolveFilterObjectIds(
            database,
            command.collection,
            command.filter || {}
          );
          result = await database
            .collection(command.collection)
            .updateMany(updateFilter, this.convertObjectIds(command.update));
          break;
        }

        case 'DELETE': {
          const deleteFilter = await this.resolveFilterObjectIds(
            database,
            command.collection,
            command.filter || {}
          );
          result = await database
            .collection(command.collection)
            .deleteMany(deleteFilter);
          break;
        }

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
          const cursorFilter = await this.resolveFilterObjectIds(
            database,
            command.collection,
            command.filter || {}
          );
          const findCursor = database
            .collection(command.collection)
            .find(cursorFilter, findOptions);

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
   * Sample one document from the collection to discover which fields contain ObjectIds,
   * then apply conversions to the filter accordingly.
   */
  private async resolveFilterObjectIds(
    db: Db,
    collectionName: string,
    filter: Record<string, any>
  ): Promise<Record<string, any>> {
    const objectIdFields = new Set<string>(['_id']);
    const sample = await db.collection(collectionName).findOne({});
    if (sample) {
      for (const [key, value] of Object.entries(sample)) {
        if (value instanceof ObjectId) {
          objectIdFields.add(key);
        }
      }
    }
    return this.applyFilterConversions(filter, objectIdFields);
  }

  /**
   * Recursively apply ObjectId conversions to a filter using a set of known ObjectId fields.
   * Handles logical operators ($and, $or, $nor) and comparison operators ($eq, $in, etc.).
   */
  private applyFilterConversions(filter: any, objectIdFields: Set<string>): any {
    if (!filter || typeof filter !== 'object') return filter;

    if (Array.isArray(filter)) {
      return filter.map((item) => this.applyFilterConversions(item, objectIdFields));
    }

    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(filter)) {
      if (key.startsWith('$')) {
        // Logical operator ($and, $or, $nor) — recurse without a field context
        result[key] = this.applyFilterConversions(value, objectIdFields);
      } else if (objectIdFields.has(key)) {
        // Known ObjectId field — convert any hex strings in the value
        result[key] = this.convertToObjectId(value);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  /**
   * Convert a filter value (or nested operator expression) to ObjectId where applicable.
   */
  private convertToObjectId(value: any): any {
    if (typeof value === 'string' && /^[0-9a-fA-F]{24}$/.test(value)) {
      try {
        return new ObjectId(value);
      } catch {
        return value;
      }
    }
    if (Array.isArray(value)) {
      return value.map((v) => this.convertToObjectId(v));
    }
    if (value && typeof value === 'object') {
      // Operator expression like { $eq: '...', $in: [...], $ne: '...' }
      const result: Record<string, any> = {};
      for (const [op, v] of Object.entries(value)) {
        result[op] = this.convertToObjectId(v);
      }
      return result;
    }
    return value;
  }

  /**
   * Recursively convert _id fields in documents (used for INSERT payloads).
   */
  private convertObjectIds(obj: any): any {
    if (!obj) return obj;

    if (Array.isArray(obj)) {
      return obj.map((item) => this.convertObjectIds(item));
    }

    if (typeof obj === 'object') {
      const result: Record<string, any> = {};
      for (const [key, value] of Object.entries(obj)) {
        if (key === '_id' && typeof value === 'string' && /^[0-9a-fA-F]{24}$/.test(value)) {
          try {
            result[key] = new ObjectId(value);
          } catch {
            result[key] = value;
          }
        } else if (typeof value === 'object' && value !== null) {
          result[key] = this.convertObjectIds(value);
        } else {
          result[key] = value;
        }
      }
      return result;
    }

    return obj;
  }
}
