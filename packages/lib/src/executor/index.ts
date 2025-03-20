import { CommandExecutor, Command } from '../interfaces';
import { MongoClient, ObjectId } from 'mongodb';

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
   * Execute a series of MongoDB commands
   * @param commands Array of commands to execute
   * @returns Result of the last command
   */
  async execute(commands: Command[]): Promise<any> {
    // We assume the client is already connected

    const database = this.client.db(this.dbName);

    // Execute each command in sequence
    let result = null;
    for (const command of commands) {
      switch (command.type) {
        case 'FIND':
          const findCursor = database
            .collection(command.collection)
            .find(this.convertObjectIds(command.filter || {}));

          // Apply projection if specified
          if (command.projection) {
            findCursor.project(command.projection);
          }

          // Apply sorting if specified
          if (command.sort) {
            findCursor.sort(command.sort);
          }

          // Apply pagination if specified
          if (command.skip) {
            findCursor.skip(command.skip);
          }
          if (command.limit && command.limit > 0) {
            findCursor.limit(command.limit);
          }

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
            .updateMany(this.convertObjectIds(command.filter || {}), {
              $set: this.convertObjectIds(command.update),
            });
          break;

        case 'DELETE':
          result = await database
            .collection(command.collection)
            .deleteMany(this.convertObjectIds(command.filter || {}));
          break;

        case 'AGGREGATE':
          // Handle aggregation commands
          const pipeline = command.pipeline.map((stage) => this.convertObjectIds(stage));
          result = await database.collection(command.collection).aggregate(pipeline).toArray();
          break;

        default:
          throw new Error(`Unsupported command type: ${(command as any).type}`);
      }
    }

    return result;
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
