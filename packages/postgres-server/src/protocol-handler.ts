import { Socket } from 'net';
import { QueryLeaf } from '@queryleaf/lib';
import { Transform } from 'stream';
import debugLib from 'debug';

const debug = debugLib('queryleaf:pg-server:protocol');

// Simplified protocol implementation for demo purposes
interface BackendMessage {
  // Buffer containing the formatted message ready to send
  buffer: Buffer;
}

interface ClientMessage {
  // Parsed client message
  length: number;
  type?: string;
  string?: string;
  parameters?: Record<string, string>;
  name?: string;
  query?: string;
  dataTypeIDs?: any[];
  portal?: string;
  maxRows?: number;
}

// Simplified message types
type MessageName = 
  | 'startup' 
  | 'password' 
  | 'query' 
  | 'parse' 
  | 'bind' 
  | 'describe' 
  | 'execute' 
  | 'sync' 
  | 'flush' 
  | 'terminate';

interface PgUser {
  username: string;
  password: string;
}

// Simplified serializer implementation
class Serializer {
  // Create a Buffer with a message code and length prefix
  private static createMessage(code: string, body: Buffer): Buffer {
    const length = body.length + 4; // body + length field
    const message = Buffer.alloc(length + 1); // + message code
    message[0] = code.charCodeAt(0);
    message.writeUInt32BE(length, 1);
    body.copy(message, 5);
    return message;
  }

  // Serialize a string into a buffer
  private static encodeString(str: string): Buffer {
    return Buffer.from(str + '\0', 'utf8');
  }

  // Authentication: OK (R)
  authenticationOk(): BackendMessage {
    const body = Buffer.alloc(4);
    body.writeUInt32BE(0, 0); // Authentication type 0 = OK
    return { buffer: Serializer.createMessage('R', body) };
  }

  // Authentication: Cleartext password (R)
  authenticationCleartextPassword(): BackendMessage {
    const body = Buffer.alloc(4);
    body.writeUInt32BE(3, 0); // Authentication type 3 = CleartextPassword
    return { buffer: Serializer.createMessage('R', body) };
  }

  // Parameter status (S)
  parameterStatus(name: string, value: string): BackendMessage {
    const nameBuffer = Serializer.encodeString(name);
    const valueBuffer = Serializer.encodeString(value);
    const body = Buffer.concat([nameBuffer, valueBuffer]);
    return { buffer: Serializer.createMessage('S', body) };
  }

  // Backend key data (K)
  backendKeyData(processId: number, secretKey: number): BackendMessage {
    const body = Buffer.alloc(8);
    body.writeUInt32BE(processId, 0);
    body.writeUInt32BE(secretKey, 4);
    return { buffer: Serializer.createMessage('K', body) };
  }

  // Ready for query (Z)
  readyForQuery(status: string): BackendMessage {
    const body = Buffer.alloc(1);
    body.write(status, 0, 1, 'utf8');
    return { buffer: Serializer.createMessage('Z', body) };
  }

  // Row description (T)
  rowDescription(fields: any[]): BackendMessage {
    // Calculate the total buffer size
    let size = 2; // number of fields (2 bytes)
    for (const field of fields) {
      size += Serializer.encodeString(field.name).length;
      size += 18; // tableID(4) + columnID(4) + dataTypeID(4) + dataTypeSize(2) + typeModifier(4)
    }

    const body = Buffer.alloc(size);
    body.writeUInt16BE(fields.length, 0);
    
    let offset = 2;
    for (const field of fields) {
      offset += Serializer.encodeString(field.name).copy(body, offset);
      body.writeUInt32BE(field.tableID || 0, offset); // tableID
      offset += 4;
      body.writeUInt16BE(field.columnID || 0, offset); // columnID
      offset += 2;
      body.writeUInt32BE(field.dataTypeID || 25, offset); // dataTypeID (25 = TEXT)
      offset += 4;
      body.writeInt16BE(field.dataTypeSize || -1, offset); // dataTypeSize
      offset += 2;
      body.writeInt32BE(field.dataTypeModifier || -1, offset); // typeModifier
      offset += 4;
      body.writeInt16BE(field.format || 0, offset); // format code (0 = text)
      offset += 2;
    }

    return { buffer: Serializer.createMessage('T', body) };
  }

  // Data row (D)
  dataRow(values: (string | null)[]): BackendMessage {
    // Calculate the total buffer size
    let size = 2; // number of columns (2 bytes)
    for (const value of values) {
      if (value === null) {
        size += 4; // null length (-1 as 4 bytes)
      } else {
        size += 4 + Buffer.byteLength(value, 'utf8'); // length + value
      }
    }

    const body = Buffer.alloc(size);
    body.writeUInt16BE(values.length, 0);
    
    let offset = 2;
    for (const value of values) {
      if (value === null) {
        body.writeInt32BE(-1, offset); // null value
        offset += 4;
      } else {
        const valueBuffer = Buffer.from(value, 'utf8');
        body.writeInt32BE(valueBuffer.length, offset);
        offset += 4;
        valueBuffer.copy(body, offset);
        offset += valueBuffer.length;
      }
    }

    return { buffer: Serializer.createMessage('D', body) };
  }

  // Command complete (C)
  commandComplete(tag: string): BackendMessage {
    const body = Serializer.encodeString(tag);
    return { buffer: Serializer.createMessage('C', body) };
  }

  // Parse complete (1)
  parseComplete(): BackendMessage {
    return { buffer: Serializer.createMessage('1', Buffer.alloc(0)) };
  }

  // Bind complete (2)
  bindComplete(): BackendMessage {
    return { buffer: Serializer.createMessage('2', Buffer.alloc(0)) };
  }

  // Error (E)
  error(fields: Record<string, any>): BackendMessage {
    // Build error fields - each field has a type (1 byte) and value string (null-terminated)
    const fieldBuffers: Buffer[] = [];
    
    // Add required fields
    if (fields.severity) {
      fieldBuffers.push(Buffer.from('S' + fields.severity + '\0', 'utf8'));
    }
    if (fields.code) {
      fieldBuffers.push(Buffer.from('C' + fields.code + '\0', 'utf8'));
    }
    if (fields.message) {
      fieldBuffers.push(Buffer.from('M' + fields.message + '\0', 'utf8'));
    }
    
    // Add optional fields if present
    if (fields.detail) {
      fieldBuffers.push(Buffer.from('D' + fields.detail + '\0', 'utf8'));
    }
    if (fields.hint) {
      fieldBuffers.push(Buffer.from('H' + fields.hint + '\0', 'utf8'));
    }
    if (fields.position) {
      fieldBuffers.push(Buffer.from('P' + fields.position + '\0', 'utf8'));
    }
    
    // Add null terminator
    fieldBuffers.push(Buffer.from([0]));
    
    const body = Buffer.concat(fieldBuffers);
    return { buffer: Serializer.createMessage('E', body) };
  }
}

// Simplified message parser
function parseMessage(type: string, buffer: Buffer): ClientMessage | null {
  switch (type) {
    case 'Q': { // Simple query
      // Format: 'Q' + int32 length + string (null-terminated)
      const str = buffer.toString('utf8', 4, buffer.length - 1); // Skip length and remove null terminator
      return { 
        length: 1 + 4 + str.length + 1, // msgType + length + string + null terminator
        type: 'query',
        string: str
      };
    }
    case '\0': { // Startup message
      // Format: int32 protocol version + key-value pairs (null-terminated strings)
      const parameters: Record<string, string> = {};
      let offset = 4; // Skip protocol version
      
      while (offset < buffer.length - 1) {
        const key = [];
        while (buffer[offset] !== 0) {
          key.push(buffer[offset]);
          offset++;
        }
        offset++; // Skip null terminator
        
        if (key.length === 0) break; // End of parameters
        
        const value = [];
        while (offset < buffer.length && buffer[offset] !== 0) {
          value.push(buffer[offset]);
          offset++;
        }
        offset++; // Skip null terminator
        
        parameters[Buffer.from(key).toString('utf8')] = Buffer.from(value).toString('utf8');
      }
      
      return {
        length: offset,
        type: 'startup',
        parameters
      };
    }
    case 'p': { // Password message
      const passwordStr = buffer.toString('utf8', 4, buffer.length - 1); // Skip length and remove null terminator
      return {
        length: 1 + 4 + passwordStr.length + 1,
        type: 'password',
        string: passwordStr
      };
    }
    case 'P': { // Parse
      let offset = 4; // Skip length
      
      // Read statement name (null-terminated)
      const nameStart = offset;
      while (buffer[offset] !== 0) offset++;
      const name = buffer.toString('utf8', nameStart, offset);
      offset++; // Skip null terminator
      
      // Read query string (null-terminated)
      const queryStart = offset;
      while (buffer[offset] !== 0) offset++;
      const query = buffer.toString('utf8', queryStart, offset);
      offset++; // Skip null terminator
      
      // Read parameter data types (if any)
      const numParams = buffer.readUInt16BE(offset);
      offset += 2;
      
      const dataTypeIDs = [];
      for (let i = 0; i < numParams; i++) {
        dataTypeIDs.push(buffer.readUInt32BE(offset));
        offset += 4;
      }
      
      return {
        length: offset,
        type: 'parse',
        name,
        query,
        dataTypeIDs
      };
    }
    case 'B': { // Bind
      // Simplified - we don't parse all fields
      return {
        length: buffer.length,
        type: 'bind'
      };
    }
    case 'D': { // Describe
      const objectType = buffer[4]; // 'S' for prepared statement, 'P' for portal
      const nameStart = 5;
      let offset = nameStart;
      while (buffer[offset] !== 0) offset++;
      const name = buffer.toString('utf8', nameStart, offset);
      
      return {
        length: offset + 1,
        type: 'describe',
        string: objectType === 83 ? 'S' : 'P', // 83 is ASCII for 'S'
        name
      };
    }
    case 'E': { // Execute
      let offset = 4; // Skip length
      
      // Read portal name (null-terminated)
      const portalStart = offset;
      while (buffer[offset] !== 0) offset++;
      const portal = buffer.toString('utf8', portalStart, offset);
      offset++; // Skip null terminator
      
      // Read max rows
      const maxRows = buffer.readUInt32BE(offset);
      offset += 4;
      
      return {
        length: offset,
        type: 'execute',
        portal,
        maxRows
      };
    }
    case 'S': { // Sync
      return {
        length: 5, // 1 + 4 (msgType + length)
        type: 'sync'
      };
    }
    case 'H': { // Flush
      return {
        length: 5, // 1 + 4 (msgType + length)
        type: 'flush'
      };
    }
    case 'X': { // Terminate
      return {
        length: 5, // 1 + 4 (msgType + length)
        type: 'terminate'
      };
    }
    default:
      // Unknown message type
      return null;
  }
}

function readMessageType(buffer: Buffer): string {
  if (buffer.length < 1) return '';
  // Special case for startup message (no message type code)
  if (buffer.readUInt32BE(0) === 196608) {
    return '\0'; // Use null char as special indicator
  }
  return buffer.toString('utf8', 0, 1);
}

/**
 * Handles the PostgreSQL wire protocol for a connection
 */
export class ProtocolHandler {
  private socket: Socket;
  private queryLeaf: QueryLeaf;
  private user: PgUser | null = null;
  private database: string | null = null;
  private serializer: Serializer;
  private buffer: Buffer = Buffer.alloc(0);
  private authenticated = false;
  private inTransaction = false;
  private preparedStatements: Map<string, string> = new Map();

  constructor(socket: Socket, queryLeaf: QueryLeaf) {
    this.socket = socket;
    this.queryLeaf = queryLeaf;
    this.serializer = new Serializer();

    this.socket.on('data', (data) => this.handleData(data));
    this.socket.on('error', (err) => this.handleError(err));
    this.socket.on('close', () => this.handleClose());
  }

  /**
   * Handle incoming data from the client
   */
  private handleData(data: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, data]);
    
    // Process all complete messages in the buffer
    while (this.buffer.length > 5) {
      try {
        const messageType = readMessageType(this.buffer);
        const message = parseMessage(messageType, this.buffer);
        
        if (!message) {
          // Not a complete message yet
          break;
        }

        // Remove the processed message from the buffer
        this.buffer = this.buffer.subarray(message.length);
        
        debug('Received message type:', messageType, message);
        
        // Handle the message
        this.handleMessage(message.type as MessageName, message);
      } catch (err) {
        debug('Error parsing message:', err);
        // Keep processing remaining buffer
        break;
      }
    }
  }

  /**
   * Handle a client message
   */
  private handleMessage(type: MessageName, message: ClientMessage): void {
    debug('Handling message type:', type);
    
    switch (type) {
      case 'startup':
        this.handleStartup(message);
        break;
      case 'password':
        this.handlePassword(message);
        break;
      case 'query':
        this.handleQuery(message.string || '');
        break;
      case 'parse':
        this.handleParse(message);
        break;
      case 'bind':
        this.handleBind(message);
        break;
      case 'describe':
        this.handleDescribe(message);
        break;
      case 'execute':
        this.handleExecute(message);
        break;
      case 'sync':
        this.handleSync();
        break;
      case 'flush':
        this.handleFlush();
        break;
      case 'terminate':
        this.handleTerminate();
        break;
      default:
        debug('Unhandled message type:', type);
        // Send ErrorResponse for unsupported message types
        this.sendErrorResponse(`Unsupported message type: ${type}`);
    }
  }

  /**
   * Handle a startup message
   */
  private handleStartup(message: ClientMessage): void {
    debug('Startup message:', message);
    
    // Extract user and database from parameters
    if (message.parameters) {
      const user = message.parameters.user;
      const database = message.parameters.database;
      
      if (user) {
        this.user = {
          username: user,
          password: ''
        };
      }
      
      if (database) {
        this.database = database;
      }
    }
    
    // In a real implementation, you would check authentication requirements
    // For this simple implementation, we'll request password authentication
    this.sendAuthenticationRequest();
  }

  /**
   * Handle a password message
   */
  private handlePassword(message: ClientMessage): void {
    debug('Password message received');
    
    // For this demo implementation, we'll accept any password
    // In a real implementation, you would verify credentials
    
    this.authenticated = true;
    
    // Send authentication successful and ready for query
    this.sendAuthenticationOk();
    this.sendParameterStatus();
    this.sendBackendKeyData();
    this.sendReadyForQuery();
  }

  /**
   * Handle a query message
   */
  private async handleQuery(queryString: string): Promise<void> {
    debug('Query message:', queryString);
    
    if (!this.authenticated) {
      this.sendErrorResponse('Not authenticated');
      return;
    }
    
    try {
      // Handle transaction control statements
      if (queryString.trim().toUpperCase() === 'BEGIN') {
        this.inTransaction = true;
        this.sendCommandComplete('BEGIN');
        this.sendReadyForQuery();
        return;
      } else if (queryString.trim().toUpperCase() === 'COMMIT') {
        this.inTransaction = false;
        this.sendCommandComplete('COMMIT');
        this.sendReadyForQuery();
        return;
      } else if (queryString.trim().toUpperCase() === 'ROLLBACK') {
        this.inTransaction = false;
        this.sendCommandComplete('ROLLBACK');
        this.sendReadyForQuery();
        return;
      }
      
      // Execute the query through QueryLeaf
      const result = await this.queryLeaf.execute(queryString);
      
      // Determine command tag for the operation
      let commandTag = 'SELECT';
      if (queryString.trim().toUpperCase().startsWith('INSERT')) {
        const count = Array.isArray(result) ? result.length : 1;
        commandTag = `INSERT 0 ${count}`;
      } else if (queryString.trim().toUpperCase().startsWith('UPDATE')) {
        const count = result?.modifiedCount || 0;
        commandTag = `UPDATE ${count}`;
      } else if (queryString.trim().toUpperCase().startsWith('DELETE')) {
        const count = result?.deletedCount || 0;
        commandTag = `DELETE ${count}`;
      }
      
      // Send the result rows
      if (Array.isArray(result)) {
        if (result.length > 0) {
          // Get column names from the first result
          const columnNames = Object.keys(result[0]);
          
          // Send row description
          this.sendRowDescription(columnNames);
          
          // Send data rows
          for (const row of result) {
            this.sendDataRow(columnNames.map(col => row[col]));
          }
        } else {
          // Empty result set
          this.sendRowDescription([]);
        }
      } else {
        // Command didn't return rows (e.g., UPDATE, DELETE)
        // We still need to send an empty result set
        this.sendRowDescription([]);
      }
      
      // Send command complete
      this.sendCommandComplete(commandTag);
      this.sendReadyForQuery();
    } catch (err) {
      debug('Query error:', err);
      this.sendErrorResponse(`Query error: ${err instanceof Error ? err.message : String(err)}`);
      this.sendReadyForQuery();
    }
  }

  /**
   * Handle a parse message (for prepared statements)
   */
  private handleParse(message: ClientMessage): void {
    const { name, query } = message;
    
    debug('Parse message:', name, query);
    
    try {
      // Store the prepared statement for later
      if (name && query) {
        this.preparedStatements.set(name, query);
      }
      
      // Send parse complete
      this.sendMessage(this.serializer.parseComplete());
    } catch (err) {
      this.sendErrorResponse(`Parse error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Handle a bind message
   */
  private handleBind(message: ClientMessage): void {
    debug('Bind message:', message);
    
    // In a real implementation, you would bind parameters to a prepared statement
    // For now, just acknowledge the bind
    this.sendMessage(this.serializer.bindComplete());
  }

  /**
   * Handle a describe message
   */
  private handleDescribe(message: ClientMessage): void {
    debug('Describe message:', message);
    
    const type = message.string;
    const name = message.name;
    
    if (type === 'S' && name) {
      // Describe prepared statement
      const query = this.preparedStatements.get(name);
      
      if (!query) {
        this.sendErrorResponse(`Unknown prepared statement: ${name}`);
        return;
      }
      
      // For now, we'll send an empty row description
      this.sendRowDescription([]);
    } else if (type === 'P') {
      // Describe portal
      // For now, send an empty row description
      this.sendRowDescription([]);
    }
  }

  /**
   * Handle an execute message
   */
  private async handleExecute(message: ClientMessage): Promise<void> {
    debug('Execute message:', message);
    
    const { portal, maxRows } = message;
    
    try {
      // In a real implementation, you would execute the prepared statement
      // For now, just send an empty result and completion
      this.sendCommandComplete('SELECT 0');
    } catch (err) {
      this.sendErrorResponse(`Execute error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Handle a sync message
   */
  private handleSync(): void {
    debug('Sync message');
    this.sendReadyForQuery();
  }

  /**
   * Handle a flush message
   */
  private handleFlush(): void {
    debug('Flush message');
    // No specific action needed for flush in this implementation
  }

  /**
   * Handle a terminate message
   */
  private handleTerminate(): void {
    debug('Terminate message');
    this.socket.end();
  }

  /**
   * Handle socket errors
   */
  private handleError(err: Error): void {
    debug('Socket error:', err);
  }

  /**
   * Handle socket close
   */
  private handleClose(): void {
    debug('Socket closed');
  }

  /**
   * Send a message to the client
   */
  private sendMessage(message: BackendMessage): void {
    if (this.socket.writable) {
      this.socket.write(message.buffer);
    }
  }

  /**
   * Send authentication request (MD5 password)
   */
  private sendAuthenticationRequest(): void {
    // For simplicity, we're using password authentication
    // In a real implementation, you would use a more secure method
    this.sendMessage(this.serializer.authenticationCleartextPassword());
  }

  /**
   * Send authentication OK message
   */
  private sendAuthenticationOk(): void {
    this.sendMessage(this.serializer.authenticationOk());
  }

  /**
   * Send parameter status messages
   */
  private sendParameterStatus(): void {
    // Send parameters to appear as PostgreSQL
    this.sendMessage(this.serializer.parameterStatus('server_version', '14.0'));
    this.sendMessage(this.serializer.parameterStatus('client_encoding', 'UTF8'));
    this.sendMessage(this.serializer.parameterStatus('DateStyle', 'ISO, MDY'));
    this.sendMessage(this.serializer.parameterStatus('TimeZone', 'UTC'));
  }

  /**
   * Send backend key data
   */
  private sendBackendKeyData(): void {
    // Generate random process ID and key
    const processId = Math.floor(Math.random() * 10000);
    const secretKey = Math.floor(Math.random() * 1000000);
    
    this.sendMessage(this.serializer.backendKeyData(processId, secretKey));
  }

  /**
   * Send ready for query status message
   */
  private sendReadyForQuery(): void {
    // Transaction status:
    // 'I' = idle (not in a transaction)
    // 'T' = in a transaction
    // 'E' = in a failed transaction
    const status = this.inTransaction ? 'T' : 'I';
    
    this.sendMessage(this.serializer.readyForQuery(status));
  }

  /**
   * Send row description message
   */
  private sendRowDescription(columns: string[]): void {
    const fields = columns.map((name, i) => ({
      name,
      tableID: 0,
      columnID: i,
      dataTypeID: 25, // TEXT data type
      dataTypeSize: -1,
      dataTypeModifier: -1,
      format: 0, // Text format
    }));
    
    this.sendMessage(this.serializer.rowDescription(fields));
  }

  /**
   * Send data row message
   */
  private sendDataRow(values: any[]): void {
    // Convert all values to strings
    const stringValues = values.map(v => {
      if (v === null || v === undefined) return null;
      return String(v);
    });
    
    this.sendMessage(this.serializer.dataRow(stringValues));
  }

  /**
   * Send command complete message
   */
  private sendCommandComplete(tag: string): void {
    this.sendMessage(this.serializer.commandComplete(tag));
  }

  /**
   * Send error response message
   */
  private sendErrorResponse(message: string, code = '42601'): void {
    this.sendMessage(
      this.serializer.error({
        message,
        severity: 'ERROR',
        code,
        detail: null,
        hint: null,
        position: null,
        internalPosition: null,
        internalQuery: null,
        where: null,
        schema: null,
        table: null,
        column: null,
        dataType: null,
        constraint: null,
        file: 'protocol-handler.ts',
        line: null,
        routine: null,
      })
    );
  }
}