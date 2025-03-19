import { MongoClient, Db } from 'mongodb';
/**
 * A dummy MongoDB client that mimics the MongoDB client interface
 * Logs operations instead of executing them - useful for testing and debugging
 */
export declare class DummyMongoClient extends MongoClient {
    private databases;
    /**
     * Create a new dummy client
     */
    constructor();
    /**
     * Get a dummy database
     * @param dbName Database name
     * @returns A dummy database instance
     */
    db(dbName: string): Db;
    /**
     * Simulate connection - no actual connection is made
     */
    connect(): Promise<this>;
    /**
     * Simulate closing the connection
     */
    close(): Promise<void>;
}
