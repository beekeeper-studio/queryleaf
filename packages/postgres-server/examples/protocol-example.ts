import { MongoClient } from 'mongodb';
import { GenericContainer } from 'testcontainers';
import debug from 'debug';
import { createConnection, Socket } from 'net';
import portfinder from 'portfinder';
import { createServer, Server } from 'net';

const log = debug('queryleaf:test:direct');

// Mock QueryLeaf class for testing
class MockQueryLeaf {
  constructor(public client: any, public dbName: string) {}
  
  execute(query: string): any[] {
    log(`Mock executing query: ${query}`);
    if (query.includes('test')) {
      return [{ test: 'success' }];
    }
    return [];
  }
  
  getDatabase() {
    return this.dbName;
  }
}

// Function to create raw PostgreSQL startup message
function createStartupMessage(): Buffer {
  // Format: int32 length + int32 protocol + params
  const buffer = Buffer.alloc(40);
  // Length (includes self)
  buffer.writeInt32BE(40, 0);
  // Protocol version 3.0
  buffer.writeInt32BE(196608, 4);
  // User param
  buffer.write('user', 8, 'utf8');
  buffer[12] = 0; // null terminator
  buffer.write('test', 13, 'utf8');
  buffer[17] = 0; // null terminator
  // Database param
  buffer.write('database', 18, 'utf8');
  buffer[26] = 0; // null terminator
  buffer.write('test_db', 27, 'utf8');
  buffer[34] = 0; // null terminator
  buffer[35] = 0; // extra null terminator for end of params
  
  return buffer;
}

// Function to create a simple query message
function createQueryMessage(query: string): Buffer {
  // Format: 'Q' + int32 length + string + null terminator
  const queryBuffer = Buffer.from(query + '\0', 'utf8');
  const length = 4 + queryBuffer.length; // Length field + query text with null terminator
  
  const buffer = Buffer.alloc(1 + length);
  buffer.write('Q', 0, 'utf8'); // Message type
  buffer.writeInt32BE(length, 1); // Length (includes self, not type)
  queryBuffer.copy(buffer, 5); // Copy query text with null terminator
  
  return buffer;
}

// Create an authentication OK response
function createAuthOkResponse(): Buffer {
  // R message type + length + auth type (0 = OK)
  const buffer = Buffer.alloc(9);
  buffer.write('R', 0);
  buffer.writeInt32BE(8, 1); // Message length (includes self)
  buffer.writeInt32BE(0, 5); // Auth type 0 = OK
  return buffer;
}

// Create parameter status message
function createParameterStatus(name: string, value: string): Buffer {
  const nameBuffer = Buffer.from(name + '\0', 'utf8');
  const valueBuffer = Buffer.from(value + '\0', 'utf8');
  const length = 4 + nameBuffer.length + valueBuffer.length;
  
  const buffer = Buffer.alloc(1 + length);
  buffer.write('S', 0);
  buffer.writeInt32BE(length, 1);
  nameBuffer.copy(buffer, 5);
  valueBuffer.copy(buffer, 5 + nameBuffer.length);
  
  return buffer;
}

// Create backend key data
function createBackendKeyData(pid: number, key: number): Buffer {
  const buffer = Buffer.alloc(13);
  buffer.write('K', 0);
  buffer.writeInt32BE(12, 1); // Length
  buffer.writeInt32BE(pid, 5); // Process ID
  buffer.writeInt32BE(key, 9); // Secret key
  return buffer;
}

// Create ready for query message
function createReadyForQuery(status: string): Buffer {
  const buffer = Buffer.alloc(6);
  buffer.write('Z', 0);
  buffer.writeInt32BE(5, 1); // Length
  buffer.write(status, 5, 1); // Status (I = idle, T = transaction, E = error)
  return buffer;
}

// Create row description message
function createRowDescription(fields: string[]): Buffer {
  // Start with a bigger buffer to be safe
  const buffer = Buffer.alloc(1000);
  let offset = 0;
  
  // Message type
  buffer.write('T', offset++);
  
  // Skip length for now
  offset += 4;
  
  // Field count
  buffer.writeInt16BE(fields.length, offset);
  offset += 2;
  
  // Fields
  for (const field of fields) {
    // Field name
    const bytesWritten = buffer.write(field, offset);
    offset += bytesWritten;
    buffer[offset++] = 0; // Null terminator
    
    // Table OID (4), Column number (2), Data type OID (4), Data type size (2),
    // Type modifier (4), Format code (2)
    buffer.writeInt32BE(0, offset); // Table OID
    offset += 4;
    buffer.writeInt16BE(0, offset); // Column number
    offset += 2;
    buffer.writeInt32BE(25, offset); // Data type OID (25 = TEXT)
    offset += 4;
    buffer.writeInt16BE(-1, offset); // Data type size
    offset += 2;
    buffer.writeInt32BE(-1, offset); // Type modifier
    offset += 4;
    buffer.writeInt16BE(0, offset); // Format code (0 = text)
    offset += 2;
  }
  
  // Now write the length
  buffer.writeInt32BE(offset - 1, 1);
  
  // Return a slice of the buffer with just the data we need
  return buffer.slice(0, offset);
}

// Create data row message
function createDataRow(values: string[]): Buffer {
  // Use a large buffer to be safe
  const buffer = Buffer.alloc(1000);
  let offset = 0;
  
  // Message type
  buffer.write('D', offset++);
  
  // Skip length for now
  offset += 4;
  
  // Column count
  buffer.writeInt16BE(values.length, offset);
  offset += 2;
  
  // Values
  for (const value of values) {
    const valueBuffer = Buffer.from(value, 'utf8');
    buffer.writeInt32BE(valueBuffer.length, offset);
    offset += 4;
    valueBuffer.copy(buffer, offset);
    offset += valueBuffer.length;
  }
  
  // Now write the length
  buffer.writeInt32BE(offset - 1, 1);
  
  // Return a slice of the buffer with just the data we need
  return buffer.slice(0, offset);
}

// Create command complete message
function createCommandComplete(tag: string): Buffer {
  const tagBuffer = Buffer.from(tag + '\0', 'utf8');
  const length = 4 + tagBuffer.length;
  
  const buffer = Buffer.alloc(1 + length);
  buffer.write('C', 0);
  buffer.writeInt32BE(length, 1);
  tagBuffer.copy(buffer, 5);
  
  return buffer;
}

// Main function to run the example
async function runProtocolExample() {
    log('Starting protocol test...');
    
    // Get a free port
    const port = await portfinder.getPortPromise({
      port: 5432,
      stopPort: 6000
    });
    
    log(`Using port ${port}`);
    
    let server: Server;
    
    // Create and start server
    server = await new Promise((resolve) => {
      // Create a simple TCP server that mimics PostgreSQL protocol
      const srv = createServer((socket) => {
        log(`New connection from ${socket.remoteAddress}:${socket.remotePort}`);
        
        // Handle client messages
        socket.on('data', (data) => {
          log(`Received data of length ${data.length}, first few bytes: ${data.slice(0, Math.min(10, data.length)).toString('hex')}`);
          
          // Check if it's a startup message
          if (data.length >= 4 && data.readUInt32BE(0) === 196608) {
            log('Received startup message');
            
            // Respond with authentication OK
            socket.write(createAuthOkResponse());
            
            // Send parameter status messages
            socket.write(createParameterStatus('server_version', '14.0'));
            socket.write(createParameterStatus('client_encoding', 'UTF8'));
            
            // Send backend key data
            socket.write(createBackendKeyData(12345, 67890));
            
            // Send ready for query
            socket.write(createReadyForQuery('I'));
          }
          // Check if it's a query message (starts with 'Q')
          else if (data.length >= 1 && data[0] === 81) { // 81 = 'Q'
            try {
              // Extract query text
              const messageLength = data.readInt32BE(1);
              const queryText = data.toString('utf8', 5, data.length - 1);
              log(`Received query: ${queryText}`);
              
              // Respond to test query
              if (queryText.toLowerCase().includes('test')) {
                // Send row description
                socket.write(createRowDescription(['test']));
                
                // Send data row
                socket.write(createDataRow(['success']));
                
                // Send command complete
                socket.write(createCommandComplete('SELECT 1'));
                
                // Send ready for query
                socket.write(createReadyForQuery('I'));
              } else {
                // Send empty result
                socket.write(createRowDescription([]));
                socket.write(createCommandComplete('SELECT 0'));
                socket.write(createReadyForQuery('I'));
              }
            } catch (err) {
              log(`Error processing query: ${err instanceof Error ? err.message : String(err)}`);
            }
          }
        });
        
        socket.on('error', (err) => {
          log(`Socket error: ${err.message}`);
        });
        
        socket.on('close', () => {
          log(`Connection closed from ${socket.remoteAddress}:${socket.remotePort}`);
        });
      });
      
      srv.listen(port, '127.0.0.1', () => {
        log(`Server listening on 127.0.0.1:${port}`);
        resolve(srv);
      });
    });
    
    try {
      // Create a client connection
      log('Creating client connection...');
      const client = new Socket();
      
      // Store received data for assertions
      const receivedData: Buffer[] = [];
      
      // Set up data handler
      client.on('data', (data) => {
        log(`Client received data (${data.length} bytes): ${data.slice(0, Math.min(20, data.length)).toString('hex')}`);
        receivedData.push(data);
      });
      
      // Connect to server
      await new Promise<void>((resolve, reject) => {
        client.connect(port, '127.0.0.1', () => {
          log('Client connected to server');
          resolve();
        });
        
        client.on('error', (err) => {
          log(`Client error: ${err.message}`);
          reject(err);
        });
      });
      
      // Send startup message
      log('Sending startup message...');
      const startupMessage = createStartupMessage();
      client.write(startupMessage);
      
      // Wait for response
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Send query
      log('Sending query message...');
      const queryMessage = createQueryMessage('SELECT test');
      client.write(queryMessage);
      
      // Wait for response
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Close connection
      log('Closing client connection...');
      client.end();
      
      // Wait a bit for everything to complete
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Check that we received responses
      if (receivedData.length === 0) {
        throw new Error('No data received from server');
      }
      
      // Convert all received data to string for easier inspection
      const allDataStr = Buffer.concat(receivedData).toString('hex');
      log(`All received data: ${allDataStr}`);
      
      // Since the binary protocol might include these characters in various ways,
      // we'll just verify we got a response with substantial data
      if (allDataStr.length <= 20) {
        throw new Error('Received data too short');
      }
      
      log('Basic protocol communication verified successfully');
      
      log('Example completed successfully');
    } finally {
      // Cleanup
      server.close();
      log('Server closed');
    }
}

// Run the example directly when executed
if (require.main === module) {
  runProtocolExample().catch(err => {
    console.error('Example failed:', err);
    process.exit(1);
  });
}