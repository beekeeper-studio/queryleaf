import { SqlParserImpl } from '../parser';
import { SqlCompilerImpl } from '../compiler';
import { createSquongo, SquongoImpl } from '../index';

// Mock the MongoDB executor to avoid actual database connections during tests
jest.mock('../executor', () => {
  return {
    MongoExecutor: jest.fn().mockImplementation(() => {
      return {
        connect: jest.fn().mockResolvedValue(undefined),
        close: jest.fn().mockResolvedValue(undefined),
        execute: jest.fn().mockResolvedValue([{ id: 1, name: 'Test User', age: 25 }])
      };
    })
  };
});

describe('Squongo', () => {
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
  });

  describe('SquongoImpl', () => {
    test('should execute a SQL query', async () => {
      const squongo = createSquongo('mongodb://localhost:27017', 'test');
      const result = await squongo.execute('SELECT * FROM users WHERE age > 18');
      
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result[0]).toHaveProperty('name');
      expect(result[0]).toHaveProperty('age');
    });
  });
});