import { MongoClient, Db, Collection } from 'mongodb';

/**
 * Dummy MongoDB database that logs operations instead of executing them
 */
class DummyDb {
  private dbName: string;
  private collections: Map<string, DummyCollection> = new Map();

  constructor(dbName: string) {
    this.dbName = dbName;
  }

  /**
   * Get a collection from the dummy database
   * @param name Collection name
   * @returns A dummy collection
   */
  collection(name: string): Collection {
    if (!this.collections.has(name)) {
      this.collections.set(name, new DummyCollection(name, this.dbName));
    }
    return this.collections.get(name) as unknown as Collection;
  }
}

/**
 * Dummy MongoDB collection that logs operations instead of executing them
 */
class DummyCollection {
  private name: string;
  private dbName: string;

  constructor(name: string, dbName: string) {
    this.name = name;
    this.dbName = dbName;
  }

  /**
   * Log a find operation
   * @param filter Query filter
   * @returns A chainable cursor
   */
  find(filter: any = {}) {
    console.log(
      `[DUMMY MongoDB] FIND in ${this.dbName}.${this.name} with filter:`,
      JSON.stringify(filter, null, 2)
    );
    return new DummyCursor(this.name, 'find', filter);
  }

  /**
   * Log an insertMany operation
   * @param documents Documents to insert
   * @returns A dummy result
   */
  async insertMany(documents: any[]) {
    console.log(
      `[DUMMY MongoDB] INSERT into ${this.dbName}.${this.name}:`,
      JSON.stringify(documents, null, 2)
    );
    return {
      acknowledged: true,
      insertedCount: documents.length,
      insertedIds: documents.map((_, i) => i),
    };
  }

  /**
   * Log an updateMany operation
   * @param filter Query filter
   * @param update Update operation
   * @returns A dummy result
   */
  async updateMany(filter: any = {}, update: any) {
    console.log(
      `[DUMMY MongoDB] UPDATE in ${this.dbName}.${this.name} with filter:`,
      JSON.stringify(filter, null, 2)
    );
    console.log(`[DUMMY MongoDB] UPDATE operation:`, JSON.stringify(update, null, 2));
    return {
      acknowledged: true,
      matchedCount: 1,
      modifiedCount: 1,
      upsertedCount: 0,
      upsertedId: null,
    };
  }

  /**
   * Log a deleteMany operation
   * @param filter Query filter
   * @returns A dummy result
   */
  async deleteMany(filter: any = {}) {
    console.log(
      `[DUMMY MongoDB] DELETE from ${this.dbName}.${this.name} with filter:`,
      JSON.stringify(filter, null, 2)
    );
    return {
      acknowledged: true,
      deletedCount: 1,
    };
  }

  /**
   * Log an aggregate operation
   * @param pipeline Aggregation pipeline
   * @returns A chainable cursor
   */
  aggregate(pipeline: any[]) {
    console.log(
      `[DUMMY MongoDB] AGGREGATE in ${this.dbName}.${this.name} with pipeline:`,
      JSON.stringify(pipeline, null, 2)
    );
    return new DummyCursor(this.name, 'aggregate', null, pipeline);
  }
}

/**
 * Dummy MongoDB cursor that logs operations instead of executing them
 */
class DummyCursor {
  private collectionName: string;
  private operation: string;
  private filter: any;
  private pipeline: any[] | null;
  private projectionObj: any = null;
  private sortObj: any = null;
  private limitVal: number | null = null;
  private skipVal: number | null = null;

  constructor(
    collectionName: string,
    operation: string,
    filter: any = null,
    pipeline: any[] | null = null
  ) {
    this.collectionName = collectionName;
    this.operation = operation;
    this.filter = filter;
    this.pipeline = pipeline;
  }

  /**
   * Add projection to the cursor
   * @param projection Projection specification
   * @returns The cursor
   */
  project(projection: any) {
    console.log(
      `[DUMMY MongoDB] Adding projection to ${this.operation}:`,
      JSON.stringify(projection, null, 2)
    );
    this.projectionObj = projection;
    return this;
  }

  /**
   * Add sort to the cursor
   * @param sort Sort specification
   * @returns The cursor
   */
  sort(sort: any) {
    console.log(`[DUMMY MongoDB] Adding sort to ${this.operation}:`, JSON.stringify(sort, null, 2));
    this.sortObj = sort;
    return this;
  }

  /**
   * Add limit to the cursor
   * @param limit Limit value
   * @returns The cursor
   */
  limit(limit: number) {
    console.log(`[DUMMY MongoDB] Adding limit to ${this.operation}:`, limit);
    this.limitVal = limit;
    return this;
  }

  /**
   * Add skip to the cursor
   * @param skip Skip value
   * @returns The cursor
   */
  skip(skip: number) {
    console.log(`[DUMMY MongoDB] Adding skip to ${this.operation}:`, skip);
    this.skipVal = skip;
    return this;
  }

  /**
   * Convert the cursor to an array of results
   * @returns A dummy array of results
   */
  async toArray() {
    console.log(`[DUMMY MongoDB] Executing ${this.operation} on ${this.collectionName}`);
    if (this.projectionObj)
      console.log(`  - Projection:`, JSON.stringify(this.projectionObj, null, 2));
    if (this.sortObj) console.log(`  - Sort:`, JSON.stringify(this.sortObj, null, 2));
    if (this.limitVal !== null && this.limitVal > 0) console.log(`  - Limit:`, this.limitVal);
    if (this.skipVal !== null) console.log(`  - Skip:`, this.skipVal);

    // Return a dummy result indicating this is a simulation
    return [
      {
        _id: 'dummy-id',
        operation: this.operation,
        message: 'This is a dummy result from the DummyClient',
      },
    ];
  }

  /**
   * Dummy method to simulate cursor forEach
   * @param callback Function to execute for each document
   */
  async forEach(callback: (doc: any) => void): Promise<void> {
    const results = await this.toArray();
    for (const doc of results) {
      callback(doc);
    }
  }

  /**
   * Dummy method to simulate cursor next
   * @returns The next document or null if none
   */
  async next(): Promise<any | null> {
    const results = await this.toArray();
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Dummy method to simulate cursor hasNext
   * @returns Whether there are more documents
   */
  async hasNext(): Promise<boolean> {
    const results = await this.toArray();
    return results.length > 0;
  }

  /**
   * Dummy method to simulate cursor count
   * @returns The count of documents in the cursor
   */
  async count(): Promise<number> {
    const results = await this.toArray();
    return results.length;
  }

  /**
   * Dummy method to simulate cursor close
   */
  async close(): Promise<void> {
    console.log(`[DUMMY MongoDB] Closing cursor for ${this.operation} on ${this.collectionName}`);
  }
}

/**
 * A dummy MongoDB client that mimics the MongoDB client interface
 * Logs operations instead of executing them - useful for testing and debugging
 */
export class DummyMongoClient extends MongoClient {
  private databases: Map<string, DummyDb> = new Map();

  /**
   * Create a new dummy client
   */
  constructor() {
    // Pass an empty string since we're not actually connecting
    super('mongodb://dummy');
  }

  /**
   * Get a dummy database
   * @param dbName Database name
   * @returns A dummy database instance
   */
  override db(dbName: string): Db {
    console.log(`[DUMMY MongoDB] Using database: ${dbName}`);
    if (!this.databases.has(dbName)) {
      this.databases.set(dbName, new DummyDb(dbName));
    }
    return this.databases.get(dbName) as unknown as Db;
  }

  /**
   * Simulate connection - no actual connection is made
   */
  override async connect(): Promise<this> {
    console.log('[DUMMY MongoDB] Connected to MongoDB (simulated)');
    return this;
  }

  /**
   * Simulate closing the connection
   */
  override async close(): Promise<void> {
    console.log('[DUMMY MongoDB] Closed MongoDB connection (simulated)');
  }
}
