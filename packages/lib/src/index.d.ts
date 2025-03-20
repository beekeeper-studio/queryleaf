import { SqlStatement, Command, SqlParser, SqlCompiler, CommandExecutor } from './interfaces';
import { MongoClient } from 'mongodb';
import { SqlParserImpl } from './parser';
import { SqlCompilerImpl } from './compiler';
import { MongoExecutor } from './executor';
import { DummyMongoClient } from './executor/dummy-client';
/**
 * QueryLeaf: SQL to MongoDB query translator
 */
export declare class QueryLeaf {
  private parser;
  private compiler;
  private executor;
  /**
   * Create a new QueryLeaf instance with your MongoDB client
   * @param client Your MongoDB client
   * @param dbName Database name
   */
  constructor(client: MongoClient, dbName: string);
  /**
   * Execute a SQL query on MongoDB
   * @param sql SQL query string
   * @returns Query results
   */
  execute(sql: string): Promise<any>;
  /**
   * Parse a SQL query string
   * @param sql SQL query string
   * @returns Parsed SQL statement
   */
  parse(sql: string): SqlStatement;
  /**
   * Compile a SQL statement to MongoDB commands
   * @param statement SQL statement
   * @returns MongoDB commands
   */
  compile(statement: SqlStatement): Command[];
  /**
   * Get the command executor instance
   * @returns Command executor
   */
  getExecutor(): CommandExecutor;
  /**
   * No-op method for backward compatibility
   * QueryLeaf no longer manages MongoDB connections
   */
  close(): Promise<void>;
}
/**
 * Create a QueryLeaf instance with a dummy client for testing
 * No actual MongoDB connection is made
 */
export declare class DummyQueryLeaf extends QueryLeaf {
  /**
   * Create a new DummyQueryLeaf instance
   * @param dbName Database name
   */
  constructor(dbName: string);
}
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
export * from './interfaces';
