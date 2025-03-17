import { MongoClient, ObjectId } from 'mongodb';
import {
  CommandExecutor,
  Command,
  FindCommand,
  InsertCommand,
  UpdateCommand,
  DeleteCommand,
  AggregateCommand
} from './interfaces';

/**
 * MongoDB command executor implementation for Node.js
 */
export class MongoExecutor implements CommandExecutor {
  private client: MongoClient;
  private dbName: string;
  private isConnected: boolean = false;

  /**
   * Create a new MongoDB executor
   * @param connectionString MongoDB connection string
   * @param dbName Database name
   */
  constructor(connectionString: string, dbName: string) {
    this.client = new MongoClient(connectionString);
    this.dbName = dbName;
  }

  /**
   * Connect to MongoDB
   */
  async connect(): Promise<void> {
    if (!this.isConnected) {
      await this.client.connect();
      this.isConnected = true;
    }
  }

  /**
   * Close MongoDB connection
   */
  async close(): Promise<void> {
    if (this.isConnected) {
      await this.client.close();
      this.isConnected = false;
    }
  }

  /**
   * Execute a series of MongoDB commands
   * @param commands Array of commands to execute
   * @returns Result of the last command
   */
  async execute(commands: Command[]): Promise<any> {
    if (!this.isConnected) {
      await this.connect();
    }

    const database = this.client.db(this.dbName);
    
    // Execute each command in sequence
    let result = null;
    for (const command of commands) {
      switch (command.type) {
        case 'FIND':
          result = await this.executeFind(database, command);
          break;
        case 'INSERT':
          result = await this.executeInsert(database, command);
          break;
        case 'UPDATE':
          result = await this.executeUpdate(database, command);
          break;
        case 'DELETE':
          result = await this.executeDelete(database, command);
          break;
        case 'AGGREGATE':
          result = await this.executeAggregate(database, command);
          break;
        default:
          throw new Error(`Unsupported command type: ${(command as any).type}`);
      }
    }
    
    return result;
  }

  /**
   * Execute a FIND command
   */
  private async executeFind(database: any, command: FindCommand): Promise<any> {
    // Check if we should use aggregation pipeline
    if (command.pipeline && command.pipeline.length > 0) {
      return this.executeAggregatePipeline(database, command);
    }
    
    // Otherwise, perform a regular find
    // Convert string ObjectIds to actual ObjectIds
    if (command.filter) {
      command.filter = this.convertObjectIds(command.filter);
    }
    console.log('ExecuteFind command:', JSON.stringify(command, null, 2));
    
    let query = database.collection(command.collection).find(command.filter || {});
    
    if (command.projection) {
      console.log('Applying projection:', JSON.stringify(command.projection, null, 2));
      query = query.project(command.projection);
    }
    
    if (command.sort) {
      console.log('Applying sort:', JSON.stringify(command.sort, null, 2));
      query = query.sort(command.sort);
    }
    
    if (command.limit !== undefined) {
      console.log('Applying limit:', command.limit);
      query = query.limit(command.limit);
    }
    
    if (command.skip !== undefined) {
      console.log('Applying skip:', command.skip);
      query = query.skip(command.skip);
    }
    
    const results = await query.toArray();
    console.log('FIND results count:', results.length);
    if (results.length > 0) {
      console.log('First result:', JSON.stringify(results[0], null, 2));
    }
    
    return results;
  }
  
  /**
   * Execute a find command using the aggregation pipeline
   */
  private async executeAggregatePipeline(database: any, command: FindCommand): Promise<any> {
    if (!command.pipeline || command.pipeline.length === 0) {
      throw new Error('Aggregation pipeline is required');
    }
    
    console.log('Executing aggregation pipeline:', JSON.stringify(command.pipeline, null, 2));
    
    // Convert ObjectIds in the pipeline stages
    const pipeline = command.pipeline.map(stage => this.convertObjectIds(stage));
    
    const results = await database.collection(command.collection).aggregate(pipeline).toArray();
    
    console.log('Aggregation results count:', results.length);
    if (results.length > 0) {
      console.log('First aggregation result:', JSON.stringify(results[0], null, 2));
    }
    
    return results;
  }

  /**
   * Execute an INSERT command
   */
  private async executeInsert(database: any, command: InsertCommand): Promise<any> {
    // Convert string ObjectIds to actual ObjectIds in each document
    command.documents = command.documents.map(doc => this.convertObjectIds(doc));
    return await database.collection(command.collection).insertMany(command.documents);
  }

  /**
   * Execute an UPDATE command
   */
  private async executeUpdate(database: any, command: UpdateCommand): Promise<any> {
    // Convert string ObjectIds to actual ObjectIds
    if (command.filter) {
      command.filter = this.convertObjectIds(command.filter);
    }
    command.update = this.convertObjectIds(command.update);
    return await database.collection(command.collection).updateMany(
      command.filter || {},
      { $set: command.update },
      { upsert: command.upsert || false }
    );
  }

  /**
   * Execute a DELETE command
   */
  private async executeDelete(database: any, command: DeleteCommand): Promise<any> {
    // Convert string ObjectIds to actual ObjectIds
    if (command.filter) {
      command.filter = this.convertObjectIds(command.filter);
    }
    return await database.collection(command.collection).deleteMany(command.filter || {});
  }

  /**
   * Execute an AGGREGATE command
   */
  private async executeAggregate(database: any, command: AggregateCommand): Promise<any> {
    // Convert string ObjectIds to actual ObjectIds in the pipeline
    command.pipeline = command.pipeline.map(stage => this.convertObjectIds(stage));
    return await database.collection(command.collection).aggregate(command.pipeline).toArray();
  }
  
  /**
   * Convert string ObjectIds to MongoDB ObjectId instances
   * @param obj Object to convert
   * @returns Object with converted ObjectIds
   */
  private convertObjectIds(obj: any): any {
    if (!obj) return obj;
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.convertObjectIds(item));
    }
    
    if (typeof obj === 'object') {
      const result: Record<string, any> = {};
      
      for (const [key, value] of Object.entries(obj)) {
        // Special handling for _id field and fields ending with Id
        if ((key === '_id' || key.endsWith('Id') || key.endsWith('Ids')) && typeof value === 'string') {
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