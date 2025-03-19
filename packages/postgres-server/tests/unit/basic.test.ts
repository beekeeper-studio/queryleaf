import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Socket } from 'net';

// Mock the QueryLeaf import
jest.mock('@queryleaf/lib', () => {
  return {
    QueryLeaf: class MockQueryLeaf {
      constructor(public client: any, public dbName: string) {}
      
      async execute(sql: string): Promise<any> {
        if (sql === 'SELECT * FROM users') {
          return [
            { name: 'John Doe', age: 30, email: 'john@example.com' },
            { name: 'Jane Smith', age: 25, email: 'jane@example.com' }
          ];
        }
        return [];
      }
    }
  };
});

// Create a mock Socket class
class MockSocket {
  public data: Buffer[] = [];
  public writable = true;
  public listeners: Record<string, Array<(data: any) => void>> = {
    data: [],
    error: [],
    close: [],
    end: [],
    timeout: [],
    drain: []
  };
  
  write(data: Buffer): boolean {
    this.data.push(data);
    return true;
  }
  
  on(event: string, callback: (data: any) => void): this {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
    return this;
  }
  
  emit(event: string, data?: any): boolean {
    if (this.listeners[event]) {
      for (const listener of this.listeners[event]) {
        listener(data);
      }
      return true;
    }
    return false;
  }
  
  end(): void {
    this.emit('close');
  }
  
  setTimeout(timeout: number): this {
    // Mock implementation of setTimeout
    return this;
  }
  
  // Add missing socket properties for testing
  remoteAddress = '127.0.0.1';
  remotePort = 12345;
}

// Manually import ProtocolHandler with relative path
import { ProtocolHandler } from '../../src/protocol-handler';
import { QueryLeaf } from '@queryleaf/lib';

describe('Basic PostgreSQL Protocol Tests', () => {
  let mongoServer: MongoMemoryServer;
  let mongoClient: MongoClient;
  
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    mongoClient = new MongoClient(mongoUri);
    await mongoClient.connect();
  });
  
  afterAll(async () => {
    await mongoClient.close();
    await mongoServer.stop();
  });
  
  test('ProtocolHandler handles authentication', async () => {
    const socket = new MockSocket();
    const queryLeaf = new QueryLeaf(mongoClient, 'test');
    const handler = new ProtocolHandler(socket as unknown as Socket, queryLeaf);
    
    // Simulate startup message with proper length
    const startupBuffer = Buffer.alloc(62);
    // Set message length (includes the length itself)
    startupBuffer.writeUInt32BE(62, 0);  
    // Protocol version (196608 = 3.0)
    startupBuffer.writeUInt32BE(196608, 4);
    // Write "user\0postgres\0database\0testdb\0\0" with proper padding
    Buffer.from('user\0postgres\0database\0testdb\0\0').copy(startupBuffer, 8);
    
    // Emit data event
    socket.emit('data', startupBuffer);
    
    // Wait for async processing
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Check if authentication request was sent
    expect(socket.data.length).toBeGreaterThan(0);
    
    // Simulate password message
    const passwordBuffer = Buffer.alloc(16);
    passwordBuffer.write('p', 0); // Message type
    passwordBuffer.writeUInt32BE(12, 1); // Length
    Buffer.from('password\0').copy(passwordBuffer, 5); // Password
    
    // Reset data array
    socket.data = [];
    
    // Emit data event
    socket.emit('data', passwordBuffer);
    
    // Wait for async processing
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Check if authentication successful messages were sent
    expect(socket.data.length).toBeGreaterThan(0);
  });
  
  test('ProtocolHandler handles SELECT query', async () => {
    const socket = new MockSocket();
    const queryLeaf = new QueryLeaf(mongoClient, 'test');
    const handler = new ProtocolHandler(socket as unknown as Socket, queryLeaf);
    
    // Set authenticated flag manually
    (handler as any).authenticated = true;
    
    // Simulate query message with proper format
    const queryString = 'SELECT * FROM users';
    const queryLength = 1 + 4 + queryString.length + 1; // message type + length field + string + null terminator
    const queryBuffer = Buffer.alloc(queryLength);
    queryBuffer.write('Q', 0); // Message type 'Q'
    queryBuffer.writeUInt32BE(queryLength - 1, 1); // Length (don't include the message type in length)
    Buffer.from(queryString + '\0').copy(queryBuffer, 5); // Query with null terminator
    
    // Reset data array
    socket.data = [];
    
    // Emit data event
    socket.emit('data', queryBuffer);
    
    // Allow async operations to complete with generous timeout
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Check if response was sent
    expect(socket.data.length).toBeGreaterThan(0);
  });
});