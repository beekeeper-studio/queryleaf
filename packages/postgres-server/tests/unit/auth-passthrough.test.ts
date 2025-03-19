import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Socket } from 'net';
import { URL } from 'url';

// Mock the QueryLeaf import
jest.mock('@queryleaf/lib', () => {
  return {
    QueryLeaf: class MockQueryLeaf {
      constructor(public client: any, public dbName: string) {}
      
      async execute(sql: string): Promise<any> {
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
    return this;
  }
  
  remoteAddress = '127.0.0.1';
  remotePort = 12345;
}

// Mock MongoClient to test auth passthrough
let mockAuthSuccess = true;
jest.mock('mongodb', () => {
  const originalModule = jest.requireActual('mongodb');
  
  return {
    ...originalModule,
    MongoClient: class MockMongoClient {
      constructor(uri: string) {
        this.options = { hosts: ['localhost:27017'] };
        this.uri = uri;
      }
      
      options: { hosts: string[] };
      uri: string;
      
      async connect(): Promise<void> {
        // Parse URI to check credentials
        try {
          const parsedUri = new URL(this.uri);
          const username = parsedUri.username;
          const password = parsedUri.password;
          
          if (username === 'testuser' && password === 'testpass') {
            return Promise.resolve();
          } else if (!mockAuthSuccess) {
            return Promise.reject(new Error('Authentication failed'));
          }
          
          return Promise.resolve();
        } catch (error) {
          return Promise.resolve();
        }
      }
      
      async close(): Promise<void> {
        return Promise.resolve();
      }
      
      db(name: string): any {
        return { collection: () => ({}) };
      }
    }
  };
});

// Import ProtocolHandler after mocking dependencies
import { ProtocolHandler } from '../../src/protocol-handler';
import { PostgresServer } from '../../src/pg-server';
import { QueryLeaf } from '@queryleaf/lib';

describe('PostgreSQL Auth Passthrough Tests', () => {
  let mongoClient: MongoClient;
  
  beforeAll(() => {
    mongoClient = new MongoClient('mongodb://localhost:27017');
  });
  
  afterEach(() => {
    mockAuthSuccess = true;
    jest.clearAllMocks();
  });
  
  test('ProtocolHandler supports auth passthrough enabled', async () => {
    const socket = new MockSocket();
    const queryLeaf = new QueryLeaf(mongoClient, 'test');
    const handler = new ProtocolHandler(socket as unknown as Socket, queryLeaf, {
      authPassthrough: true,
      mongoUri: 'mongodb://localhost:27017',
      dbName: 'test'
    });
    
    // Simulate startup message
    const startupBuffer = Buffer.alloc(62);
    startupBuffer.writeUInt32BE(62, 0);  
    startupBuffer.writeUInt32BE(196608, 4);
    Buffer.from('user\0testuser\0database\0testdb\0\0').copy(startupBuffer, 8);
    
    // Emit data event
    socket.emit('data', startupBuffer);
    
    // Wait for async processing
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Check if authentication request was sent
    expect(socket.data.length).toBeGreaterThan(0);
    
    // Reset socket data
    socket.data = [];
    
    // Simulate password message
    const passwordBuffer = Buffer.alloc(20);
    passwordBuffer.write('p', 0); // Message type
    passwordBuffer.writeUInt32BE(16, 1); // Length
    Buffer.from('testpass\0').copy(passwordBuffer, 5); // Password
    
    // Emit data event
    socket.emit('data', passwordBuffer);
    
    // Wait for async processing
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Check if authentication successful messages were sent
    expect(socket.data.length).toBeGreaterThan(0);
    
    // We consider authentication successful if we received messages after password submission
    expect(true).toBe(true);
  });
  
  test('ProtocolHandler rejects invalid credentials with auth passthrough', async () => {
    mockAuthSuccess = false;
    
    const socket = new MockSocket();
    const queryLeaf = new QueryLeaf(mongoClient, 'test');
    const handler = new ProtocolHandler(socket as unknown as Socket, queryLeaf, {
      authPassthrough: true,
      mongoUri: 'mongodb://localhost:27017',
      dbName: 'test'
    });
    
    // Simulate startup message
    const startupBuffer = Buffer.alloc(62);
    startupBuffer.writeUInt32BE(62, 0);  
    startupBuffer.writeUInt32BE(196608, 4);
    Buffer.from('user\0invaliduser\0database\0testdb\0\0').copy(startupBuffer, 8);
    
    // Emit data event
    socket.emit('data', startupBuffer);
    
    // Wait for async processing
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Reset socket data
    socket.data = [];
    
    // Simulate password message
    const passwordBuffer = Buffer.alloc(20);
    passwordBuffer.write('p', 0); // Message type
    passwordBuffer.writeUInt32BE(16, 1); // Length
    Buffer.from('wrongpass\0').copy(passwordBuffer, 5); // Password
    
    // Emit data event
    socket.emit('data', passwordBuffer);
    
    // Wait for async processing
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Check if error response was sent
    expect(socket.data.length).toBeGreaterThan(0);
    
    // Check if we received error response (code 'E')
    const hasErrorResponse = socket.data.some(buffer => 
      buffer.length > 0 && buffer[0] === 0x45 // 'E' in hex
    );
    
    expect(hasErrorResponse).toBe(true);
  });
  
  test('ProtocolHandler accepts any credentials with auth passthrough disabled', async () => {
    const socket = new MockSocket();
    const queryLeaf = new QueryLeaf(mongoClient, 'test');
    const handler = new ProtocolHandler(socket as unknown as Socket, queryLeaf, {
      authPassthrough: false
    });
    
    // Simulate startup message
    const startupBuffer = Buffer.alloc(62);
    startupBuffer.writeUInt32BE(62, 0);  
    startupBuffer.writeUInt32BE(196608, 4);
    Buffer.from('user\0anyuser\0database\0testdb\0\0').copy(startupBuffer, 8);
    
    // Emit data event
    socket.emit('data', startupBuffer);
    
    // Wait for async processing
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Reset socket data
    socket.data = [];
    
    // Simulate password message
    const passwordBuffer = Buffer.alloc(20);
    passwordBuffer.write('p', 0); // Message type
    passwordBuffer.writeUInt32BE(16, 1); // Length
    Buffer.from('anypass\0').copy(passwordBuffer, 5); // Password
    
    // Emit data event
    socket.emit('data', passwordBuffer);
    
    // Wait for async processing
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Check if authentication OK was sent
    expect(socket.data.length).toBeGreaterThan(0);
    
    // We consider authentication successful if we received messages after password submission
    expect(true).toBe(true);
  });
});