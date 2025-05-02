import { SqlParserImpl } from '../../src/parser';
import { SqlCompilerImpl } from '../../src/compiler';
import { QueryLeaf, DummyQueryLeaf } from '../../src/index';
import { MongoClient } from 'mongodb';

// Mock the MongoDB executor to avoid actual database connections during tests
jest.mock('../../src/executor', () => {
  return {
    MongoExecutor: jest.fn().mockImplementation(() => {
      return {
        execute: jest.fn().mockResolvedValue([{ id: 1, name: 'Test User', age: 25 }])
      };
    })
  };
});

// Mock MongoClient
const mockMongoClient = {} as MongoClient;

describe('QueryLeaf', () => {
  describe('SqlParserImpl', () => {
    const parser = new SqlParserImpl();

    test('should parse a SELECT statement', () => {
      const sql = 'SELECT id, name, age FROM users WHERE age > 18';
      const result = parser.parse(sql);
      
      expect(result).toBeDefined();
      expect(result.text).toBe(sql);
      expect(result.ast).toBeDefined();
      expect(result.ast.type).toBe('select');
    });
    
    test('should parse a SELECT with nested fields', () => {
      const sql = 'SELECT address.zip, address FROM shipping_addresses';
      const result = parser.parse(sql);
      
      expect(result).toBeDefined();
      expect(result.text).toBe(sql);
      expect(result.ast).toBeDefined();
      expect(result.ast.type).toBe('select');
    });
    
    test('should parse a SELECT with array indexing', () => {
      const sql = 'SELECT items[0].id, items FROM orders';
      const result = parser.parse(sql);
      
      expect(result).toBeDefined();
      expect(result.text).toBe(sql);
      expect(result.ast).toBeDefined();
      expect(result.ast.type).toBe('select');
    });

    test('should parse an INSERT statement', () => {
      const sql = 'INSERT INTO users (id, name, age) VALUES (1, "John", 25)';
      const result = parser.parse(sql);
      
      expect(result).toBeDefined();
      expect(result.text).toBe(sql);
      expect(result.ast).toBeDefined();
      expect(result.ast.type).toBe('insert');
    });

    test('should parse an UPDATE statement', () => {
      const sql = 'UPDATE users SET name = "Jane" WHERE id = 1';
      const result = parser.parse(sql);
      
      expect(result).toBeDefined();
      expect(result.text).toBe(sql);
      expect(result.ast).toBeDefined();
      expect(result.ast.type).toBe('update');
    });

    test('should parse a DELETE statement', () => {
      const sql = 'DELETE FROM users WHERE id = 1';
      const result = parser.parse(sql);
      
      expect(result).toBeDefined();
      expect(result.text).toBe(sql);
      expect(result.ast).toBeDefined();
      expect(result.ast.type).toBe('delete');
    });

    test('should throw on invalid SQL', () => {
      const sql = 'INVALID SQL STATEMENT';
      expect(() => parser.parse(sql)).toThrow();
    });
  });

  describe('SqlCompilerImpl', () => {
    const parser = new SqlParserImpl();
    const compiler = new SqlCompilerImpl();
    
    // Test different types of SELECT queries

    test('should compile a SELECT statement', () => {
      const sql = 'SELECT id, name, age FROM users WHERE age > 18';
      const statement = parser.parse(sql);
      const commands = compiler.compile(statement);
      
      expect(commands).toHaveLength(1);
      expect(commands[0].type).toBe('FIND');
      expect(commands[0].collection).toBe('users');
      // Check if it's a FindCommand
      if (commands[0].type === 'FIND') {
        expect(commands[0].filter).toBeDefined();
      }
    });
    
    test('should compile a SELECT with OFFSET', () => {
      const sql = 'SELECT * FROM users OFFSET 10';
      const statement = parser.parse(sql);
      const commands = compiler.compile(statement);
      
      expect(commands).toHaveLength(1);
      expect(commands[0].type).toBe('FIND');
      expect(commands[0].collection).toBe('users');
      // Check if it's a FindCommand with offset
      if (commands[0].type === 'FIND') {
        expect(commands[0].skip).toBe(10);
      }
    });
    
    test('should compile a SELECT with LIMIT and OFFSET', () => {
      const sql = 'SELECT * FROM users LIMIT 5 OFFSET 10';
      const statement = parser.parse(sql);
      const commands = compiler.compile(statement);
      
      expect(commands).toHaveLength(1);
      expect(commands[0].type).toBe('FIND');
      expect(commands[0].collection).toBe('users');
      // Check if it's a FindCommand with limit and offset
      if (commands[0].type === 'FIND') {
        expect(commands[0].limit).toBe(5);
        expect(commands[0].skip).toBe(10);
      }
    });
    
    test('should compile a SELECT with nested fields', () => {
      const sql = 'SELECT address.zip, address FROM shipping_addresses';
      const statement = parser.parse(sql);
      const commands = compiler.compile(statement);
      
      expect(commands).toHaveLength(1);
      // Can be either a FIND or AGGREGATE command
      expect(['FIND', 'AGGREGATE']).toContain(commands[0].type);
      expect(commands[0].collection).toBe('shipping_addresses');
      
      // Check if we're using FIND with projection
      if (commands[0].type === 'FIND' && commands[0].projection) {
        expect(commands[0].projection).toBeDefined();
        expect(commands[0].projection['address.zip']).toBe(1);
        expect(commands[0].projection['address']).toBe(1);
      } 
      // Or AGGREGATE with pipeline including $project
      else if (commands[0].type === 'AGGREGATE') {
        expect(commands[0].pipeline).toBeDefined();
        // Check that we have a $project stage with the right fields
        const projectStage = commands[0].pipeline.find((stage: any) => '$project' in stage);
        expect(projectStage).toBeDefined();
        if (projectStage) {
          // Check that address_zip field is included (from address.zip)
          expect(projectStage.$project.address_zip).toBeDefined();
          // Address field should be included too
          expect(projectStage.$project.address).toBeDefined();
        }
      }
    });
    
    test('should compile a SELECT with array indexing', () => {
      const sql = 'SELECT items[0].id, items FROM orders';
      const statement = parser.parse(sql);
      const commands = compiler.compile(statement);
      
      expect(commands).toHaveLength(1);
      expect(commands[0].type).toBe('FIND');
      expect(commands[0].collection).toBe('orders');
      // Check if projection includes array element access
      if (commands[0].type === 'FIND' && commands[0].projection) {
        expect(commands[0].projection).toBeDefined();
        expect(commands[0].projection['id']).toBeDefined();
        expect(commands[0].projection['id']['$getField']).toBeDefined();
        expect(commands[0].projection['id']['$getField']['field']).toBe('id');
        expect(commands[0].projection['id']['$getField']['input']).toBeDefined();
        expect(commands[0].projection['items']).toBe(1);
      }
    });

    test('should compile an INSERT statement', () => {
      const sql = 'INSERT INTO users (id, name, age) VALUES (1, "John", 25)';
      const statement = parser.parse(sql);
      const commands = compiler.compile(statement);
      
      expect(commands).toHaveLength(1);
      expect(commands[0].type).toBe('INSERT');
      expect(commands[0].collection).toBe('users');
      // Check if it's an InsertCommand
      if (commands[0].type === 'INSERT') {
        expect(commands[0].documents).toHaveLength(1);
      }
    });

    test('should compile an UPDATE statement', () => {
      const sql = 'UPDATE users SET name = "Jane" WHERE id = 1';
      const statement = parser.parse(sql);
      const commands = compiler.compile(statement);
      
      expect(commands).toHaveLength(1);
      expect(commands[0].type).toBe('UPDATE');
      expect(commands[0].collection).toBe('users');
      // Check if it's an UpdateCommand
      if (commands[0].type === 'UPDATE') {
        expect(commands[0].filter).toBeDefined();
        expect(commands[0].update).toBeDefined();
      }
    });

    test('should compile a DELETE statement', () => {
      const sql = 'DELETE FROM users WHERE id = 1';
      const statement = parser.parse(sql);
      const commands = compiler.compile(statement);
      
      expect(commands).toHaveLength(1);
      expect(commands[0].type).toBe('DELETE');
      expect(commands[0].collection).toBe('users');
      // Check if it's a DeleteCommand
      if (commands[0].type === 'DELETE') {
        expect(commands[0].filter).toBeDefined();
      }
    });
    
    test('should compile queries with nested field conditions', () => {
      const sql = "SELECT * FROM users WHERE address.city = 'New York'";
      const statement = parser.parse(sql);
      const commands = compiler.compile(statement);
      
      expect(commands).toHaveLength(1);
      // Allow either FIND or AGGREGATE type
      expect(['FIND', 'AGGREGATE']).toContain(commands[0].type);
      
      if (commands[0].type === 'FIND' && commands[0].filter) {
        // For FIND command
        expect(commands[0].filter).toBeDefined();
        expect(commands[0].filter['address.city']).toBe('New York');
      } else if (commands[0].type === 'AGGREGATE') {
        // For AGGREGATE command
        expect(commands[0].pipeline).toBeDefined();
        
        // Find the $match stage in pipeline
        const matchStage = commands[0].pipeline.find((stage: any) => '$match' in stage);
        expect(matchStage).toBeDefined();
        if (matchStage) {
          expect(matchStage.$match['address.city']).toBe('New York');
        }
      }
    });
    
    test('should compile queries with array element conditions', () => {
      const sql = "SELECT * FROM orders WHERE items[0].price > 100";
      const statement = parser.parse(sql);
      const commands = compiler.compile(statement);
      
      expect(commands).toHaveLength(1);
      // Allow either FIND or AGGREGATE type
      expect(['FIND', 'AGGREGATE']).toContain(commands[0].type);
      
      if (commands[0].type === 'FIND' && commands[0].filter) {
        // For FIND command
        expect(commands[0].filter).toBeDefined();
        expect(commands[0].filter['items.0.price']).toBeDefined();
        expect(commands[0].filter['items.0.price'].$gt).toBe(100);
      } else if (commands[0].type === 'AGGREGATE') {
        // For AGGREGATE command
        expect(commands[0].pipeline).toBeDefined();
        
        // Find the $match stage in pipeline
        const matchStage = commands[0].pipeline.find((stage: any) => '$match' in stage);
        expect(matchStage).toBeDefined();
        if (matchStage) {
          expect(matchStage.$match['items.0.price']).toBeDefined();
          expect(matchStage.$match['items.0.price'].$gt).toBe(100);
        }
      }
    });
    
    test('should compile GROUP BY queries with aggregation', () => {
      const sql = "SELECT category, COUNT(*) as count, AVG(price) as avg_price FROM products GROUP BY category";
      const statement = parser.parse(sql);
      const commands = compiler.compile(statement);
      
      expect(commands).toHaveLength(1);
      // Allow either FIND or AGGREGATE type
      expect(['FIND', 'AGGREGATE']).toContain(commands[0].type);
      
      if (commands[0].type === 'FIND') {
        // For FIND command
        expect(commands[0].group).toBeDefined();
        expect(commands[0].pipeline).toBeDefined();
        
        // Check if the pipeline contains a $group stage
        if (commands[0].pipeline) {
          const groupStage = commands[0].pipeline.find(stage => '$group' in stage);
          expect(groupStage).toBeDefined();
          if (groupStage) {
            // Just check the overall structure rather than specific field names
            expect(groupStage.$group._id).toBeDefined();
            // The property might be different based on the AST format
            expect(groupStage.$group.count).toBeDefined();
            expect(groupStage.$group.avg_price).toBeDefined();
            
            // Check that the operations use the right aggregation operators
            expect(groupStage.$group.count.$sum).toBeDefined();
            expect(groupStage.$group.avg_price.$avg).toBeDefined();
          }
        }
      } else if (commands[0].type === 'AGGREGATE') {
        // For AGGREGATE command
        expect(commands[0].pipeline).toBeDefined();
        
        // Find the $group stage in the pipeline
        const groupStage = commands[0].pipeline.find((stage: any) => '$group' in stage);
        expect(groupStage).toBeDefined();
        if (groupStage) {
          // Just check the overall structure rather than specific field names
          expect(groupStage.$group._id).toBeDefined();
          // The property might be different based on the AST format
          expect(groupStage.$group.count).toBeDefined();
          expect(groupStage.$group.avg_price).toBeDefined();
          
          // Check that the operations use the right aggregation operators
          expect(groupStage.$group.count.$sum).toBeDefined();
          expect(groupStage.$group.avg_price.$avg).toBeDefined();
        }
      }
    });
    
    test('should compile JOIN queries', () => {
      const sql = "SELECT users.name, orders.total FROM users JOIN orders ON users._id = orders.userId";
      const statement = parser.parse(sql);
      const commands = compiler.compile(statement);
      
      expect(commands).toHaveLength(1);
      // Allow either FIND or AGGREGATE type
      expect(['FIND', 'AGGREGATE']).toContain(commands[0].type);
      
      if (commands[0].type === 'FIND') {
        // For FIND command
        expect(commands[0].lookup).toBeDefined();
        expect(commands[0].pipeline).toBeDefined();
        
        // Check if the pipeline contains a $lookup stage
        if (commands[0].pipeline) {
          const lookupStage = commands[0].pipeline.find(stage => '$lookup' in stage);
          expect(lookupStage).toBeDefined();
          if (lookupStage) {
            expect(lookupStage.$lookup.from).toBe('orders');
            expect(lookupStage.$lookup.localField).toBe('_id');
            expect(lookupStage.$lookup.foreignField).toBe('userId');
          }
          
          // Check if it's followed by an $unwind stage
          const unwindStage = commands[0].pipeline.find(stage => '$unwind' in stage);
          expect(unwindStage).toBeDefined();
        }
      } else if (commands[0].type === 'AGGREGATE') {
        // For AGGREGATE command
        expect(commands[0].pipeline).toBeDefined();
        
        // Check if the pipeline contains a $lookup stage
        const lookupStage = commands[0].pipeline.find((stage: any) => '$lookup' in stage);
        expect(lookupStage).toBeDefined();
        if (lookupStage) {
          expect(lookupStage.$lookup.from).toBe('orders');
          expect(lookupStage.$lookup.localField).toBe('_id');
          expect(lookupStage.$lookup.foreignField).toBe('userId');
        }
        
        // Check if it's followed by an $unwind stage
        const unwindStage = commands[0].pipeline.find((stage: any) => '$unwind' in stage);
        expect(unwindStage).toBeDefined();
      }
    });
  });

  describe('QueryLeaf', () => {
    test('should execute a SQL query', async () => {
      const queryLeaf = new QueryLeaf(mockMongoClient, 'test');
      const result = await queryLeaf.execute('SELECT * FROM users WHERE age > 18');
      
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result[0]).toHaveProperty('name');
      expect(result[0]).toHaveProperty('age');
    });
  });
});
