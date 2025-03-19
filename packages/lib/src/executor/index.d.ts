import { CommandExecutor, Command } from '../interfaces';
import { MongoClient } from 'mongodb';
/**
 * MongoDB command executor implementation for Node.js
 */
export declare class MongoExecutor implements CommandExecutor {
    private client;
    private dbName;
    /**
     * Create a new MongoDB executor using a MongoDB client
     * @param client MongoDB client instance
     * @param dbName Database name
     */
    constructor(client: MongoClient, dbName: string);
    /**
     * No-op - client lifecycle is managed by the user
     */
    connect(): Promise<void>;
    /**
     * No-op - client lifecycle is managed by the user
     */
    close(): Promise<void>;
    /**
     * Execute a series of MongoDB commands
     * @param commands Array of commands to execute
     * @returns Result of the last command
     */
    execute(commands: Command[]): Promise<any>;
    /**
     * Convert string ObjectIds to MongoDB ObjectId instances
     * @param obj Object to convert
     * @returns Object with converted ObjectIds
     */
    private convertObjectIds;
}
