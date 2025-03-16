import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { MongoClient, Db, ObjectId } from 'mongodb';

/**
 * Creates and manages a MongoDB container for testing
 */
export class MongoTestContainer {
  private container: StartedTestContainer | null = null;
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private connectionString: string = '';
  
  /**
   * Start a MongoDB container
   */
  async start(): Promise<string> {
    this.container = await new GenericContainer('mongo:6.0')
      .withExposedPorts(27017)
      .start();
    
    const host = this.container.getHost();
    const port = this.container.getMappedPort(27017);
    this.connectionString = `mongodb://${host}:${port}`;
    
    this.client = new MongoClient(this.connectionString);
    await this.client.connect();
    
    return this.connectionString;
  }
  
  /**
   * Get the MongoDB connection string
   */
  getConnectionString(): string {
    if (!this.connectionString) {
      throw new Error('MongoDB container not started');
    }
    return this.connectionString;
  }
  
  /**
   * Get a MongoDB database
   * @param dbName Database name
   */
  getDatabase(dbName: string): Db {
    if (!this.client) {
      throw new Error('MongoDB container not started');
    }
    
    this.db = this.client.db(dbName);
    return this.db;
  }
  
  /**
   * Stop the MongoDB container
   */
  async stop(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
    
    if (this.container) {
      await this.container.stop();
      this.container = null;
    }
  }
}

/**
 * Test fixture data
 */
export const testUsers = [
  { _id: new ObjectId("000000000000000000000001"), name: 'John Doe', age: 25, email: 'john@example.com', active: true },
  { _id: new ObjectId("000000000000000000000002"), name: 'Jane Smith', age: 30, email: 'jane@example.com', active: true },
  { _id: new ObjectId("000000000000000000000003"), name: 'Bob Johnson', age: 18, email: 'bob@example.com', active: false },
  { _id: new ObjectId("000000000000000000000004"), name: 'Alice Brown', age: 35, email: 'alice@example.com', active: true },
  { _id: new ObjectId("000000000000000000000005"), name: 'Charlie Davis', age: 17, email: 'charlie@example.com', active: false },
];

export const testProducts = [
  { _id: new ObjectId("100000000000000000000001"), name: 'Laptop', price: 1200, category: 'Electronics', inStock: true },
  { _id: new ObjectId("100000000000000000000002"), name: 'Smartphone', price: 800, category: 'Electronics', inStock: true },
  { _id: new ObjectId("100000000000000000000003"), name: 'Headphones', price: 150, category: 'Electronics', inStock: false },
  { _id: new ObjectId("100000000000000000000004"), name: 'Chair', price: 250, category: 'Furniture', inStock: true },
  { _id: new ObjectId("100000000000000000000005"), name: 'Table', price: 450, category: 'Furniture', inStock: true },
];

export const testOrders = [
  { _id: new ObjectId("200000000000000000000001"), userId: new ObjectId("000000000000000000000001"), productIds: [new ObjectId("100000000000000000000001"), new ObjectId("100000000000000000000003")], totalAmount: 1350, status: 'Completed', date: new Date('2023-01-01') },
  { _id: new ObjectId("200000000000000000000002"), userId: new ObjectId("000000000000000000000002"), productIds: [new ObjectId("100000000000000000000002"), new ObjectId("100000000000000000000005")], totalAmount: 1250, status: 'Completed', date: new Date('2023-02-15') },
  { _id: new ObjectId("200000000000000000000003"), userId: new ObjectId("000000000000000000000003"), productIds: [new ObjectId("100000000000000000000004")], totalAmount: 250, status: 'Processing', date: new Date('2023-03-10') },
  { _id: new ObjectId("200000000000000000000004"), userId: new ObjectId("000000000000000000000001"), productIds: [new ObjectId("100000000000000000000005"), new ObjectId("100000000000000000000003")], totalAmount: 600, status: 'Completed', date: new Date('2023-04-05') },
  { _id: new ObjectId("200000000000000000000005"), userId: new ObjectId("000000000000000000000004"), productIds: [new ObjectId("100000000000000000000001"), new ObjectId("100000000000000000000002")], totalAmount: 2000, status: 'Delivered', date: new Date('2023-05-20') },
];

/**
 * Load test fixture data into MongoDB
 * @param db MongoDB database
 */
export async function loadFixtures(db: Db): Promise<void> {
  console.log('Loading test fixtures into MongoDB...');
  
  console.log('Clearing existing data...');
  await db.collection('users').deleteMany({});
  await db.collection('products').deleteMany({});
  await db.collection('orders').deleteMany({});
  
  console.log('Inserting users fixture data...');
  const userResult = await db.collection('users').insertMany(testUsers);
  console.log(`Inserted ${userResult.insertedCount} users`);
  
  console.log('Inserting products fixture data...');
  const productResult = await db.collection('products').insertMany(testProducts);
  console.log(`Inserted ${productResult.insertedCount} products`);
  
  console.log('Inserting orders fixture data...');
  const orderResult = await db.collection('orders').insertMany(testOrders);
  console.log(`Inserted ${orderResult.insertedCount} orders`);
  
  // Verify the data is loaded
  const userCount = await db.collection('users').countDocuments();
  const productCount = await db.collection('products').countDocuments();
  const orderCount = await db.collection('orders').countDocuments();
  
  console.log(`Fixture data loaded: ${userCount} users, ${productCount} products, ${orderCount} orders`);
}