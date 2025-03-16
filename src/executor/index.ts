import { MongoClient } from 'mongodb';
import { CommandExecutor, Command } from '../interfaces';

/**
 * MongoDB command executor implementation for Node.js
 */
export class MongoExecutor implements CommandExecutor {
  private client: MongoClient;
  private db: string;
  private connected: boolean = false;

  constructor(connectionString: string, dbName: string) {
    this.client = new MongoClient(connectionString);
    this.db = dbName;
  }

  async connect(): Promise<void> {
    if (!this.connected) {
      await this.client.connect();
      this.connected = true;
    }
  }

  async close(): Promise<void> {
    if (this.connected) {
      await this.client.close();
      this.connected = false;
    }
  }

  async execute(commands: Command[]): Promise<any> {
    if (!this.connected) {
      await this.connect();
    }

    const database = this.client.db(this.db);
    
    // Execute each command in sequence
    let result = null;
    for (const command of commands) {
      switch (command.type) {
        case 'FIND':
          const findCursor = database.collection(command.collection)
            .find(command.filter || {});
          
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
          if (command.limit) {
            findCursor.limit(command.limit);
          }
          
          result = await findCursor.toArray();
          break;
          
        case 'INSERT':
          result = await database.collection(command.collection)
            .insertMany(command.documents);
          break;
          
        case 'UPDATE':
          result = await database.collection(command.collection)
            .updateMany(
              command.filter || {}, 
              { $set: command.update }
            );
          break;
          
        case 'DELETE':
          result = await database.collection(command.collection)
            .deleteMany(command.filter || {});
          break;
          
        default:
          throw new Error(`Unsupported command type: ${command.type}`);
      }
    }
    
    return result;
  }
}