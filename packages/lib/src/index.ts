import { SqlStatement, Command, SqlParser, SqlCompiler, CommandExecutor } from './interfaces';
import { MongoClient } from 'mongodb';
import { SqlParserImpl } from './parser';
import { SqlCompilerImpl } from './compiler';
import { MongoExecutor } from './executor';
import { DummyMongoClient } from './executor/dummy-client';

/**
 * QueryLeaf: SQL to MongoDB query translator
 */
export class QueryLeaf {
  private parser: SqlParser;
  private compiler: SqlCompiler;
  private executor: CommandExecutor;

  /**
   * Create a new QueryLeaf instance with your MongoDB client
   * @param client Your MongoDB client
   * @param dbName Database name
   */
  constructor(client: MongoClient, dbName: string) {
    this.parser = new SqlParserImpl();
    this.compiler = new SqlCompilerImpl();
    this.executor = new MongoExecutor(client, dbName);
  }

  /**
   * Execute a SQL query on MongoDB
   * @param sql SQL query string
   * @returns Query results
   */
  async execute(sql: string): Promise<any> {
    const statement = this.parse(sql);
    const commands = this.compile(statement);
    return await this.executor.execute(commands);
  }

  /**
   * Parse a SQL query string
   * @param sql SQL query string
   * @returns Parsed SQL statement
   */
  parse(sql: string): SqlStatement {
    return this.parser.parse(sql);
  }

  /**
   * Compile a SQL statement to MongoDB commands
   * @param statement SQL statement
   * @returns MongoDB commands
   */
  compile(statement: SqlStatement): Command[] {
    return this.compiler.compile(statement);
  }

  /**
   * Get the command executor instance
   * @returns Command executor
   */
  getExecutor(): CommandExecutor {
    return this.executor;
  }

  /**
   * No-op method for backward compatibility
   * QueryLeaf no longer manages MongoDB connections
   */
  async close(): Promise<void> {
    // No-op - MongoDB client is managed by the user
  }
}

/**
 * Create a QueryLeaf instance with a dummy client for testing
 * No actual MongoDB connection is made
 */
export class DummyQueryLeaf extends QueryLeaf {
  /**
   * Create a new DummyQueryLeaf instance
   * @param dbName Database name
   */
  constructor(dbName: string) {
    super(new DummyMongoClient(), dbName);
  }
}

// Export interfaces and implementation classes
export {
  SqlStatement,
  Command,
  SqlParser,
  SqlCompiler,
  CommandExecutor,
  SqlParserImpl,
  SqlCompilerImpl,
  MongoExecutor,
  DummyMongoClient,
};

// Re-export interfaces
export * from './interfaces';
