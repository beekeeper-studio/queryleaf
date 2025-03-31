import { AST } from 'node-sql-parser';
import { Document, FindCursor, AggregationCursor } from 'mongodb';

/**
 * Represents a parsed SQL statement
 */
export interface SqlStatement {
  ast: AST;
  text: string;
  metadata?: {
    nestedFieldReplacements?: [string, string][]; // Placeholder to original field mapping
  };
}

/**
 * Command types supported by the MongoDB executor
 */
export type CommandType = 'FIND' | 'INSERT' | 'UPDATE' | 'DELETE' | 'AGGREGATE';

/**
 * Base interface for all MongoDB commands
 */
export interface BaseCommand {
  type: CommandType;
  collection: string;
}

/**
 * Find command for MongoDB
 */
export interface FindCommand extends BaseCommand {
  type: 'FIND';
  filter?: Record<string, any>;
  projection?: Record<string, any>;
  sort?: Record<string, any>;
  limit?: number;
  skip?: number;
  group?: {
    _id: any;
    [key: string]: any;
  };
  pipeline?: Record<string, any>[];
  lookup?: {
    from: string;
    localField: string;
    foreignField: string;
    as: string;
  }[];
}

/**
 * Insert command for MongoDB
 */
export interface InsertCommand extends BaseCommand {
  type: 'INSERT';
  documents: Record<string, any>[];
}

/**
 * Update command for MongoDB
 */
export interface UpdateCommand extends BaseCommand {
  type: 'UPDATE';
  filter?: Record<string, any>;
  update: Record<string, any>;
  upsert?: boolean;
}

/**
 * Delete command for MongoDB
 */
export interface DeleteCommand extends BaseCommand {
  type: 'DELETE';
  filter?: Record<string, any>;
}

/**
 * Aggregate command for MongoDB
 */
export interface AggregateCommand extends BaseCommand {
  type: 'AGGREGATE';
  pipeline: Record<string, any>[];
}

/**
 * Union type of all MongoDB commands
 */
export type Command =
  | FindCommand
  | InsertCommand
  | UpdateCommand
  | DeleteCommand
  | AggregateCommand;

/**
 * SQL parser interface
 */
export interface SqlParser {
  parse(sql: string): SqlStatement;
}

/**
 * SQL to MongoDB compiler interface
 */
export interface SqlCompiler {
  compile(statement: SqlStatement): Command[];
}

/**
 * Options for query execution
 */
export interface ExecutionOptions {
  /**
   * If true, return the MongoDB cursor instead of an array of results
   * This only applies to FIND and AGGREGATE commands, other commands always return their result
   */
  returnCursor?: boolean;
}

/**
 * Represents result types that can be returned by the executor
 */
export type ExecutionResult<T = Document> = 
  | Document[]               // Array of documents (default for FIND and AGGREGATE)
  | Document                 // Single document or operation result (for INSERT, UPDATE, DELETE)
  | FindCursor<T>            // Cursor from FIND command when returnCursor is true
  | AggregationCursor<T>     // Cursor from AGGREGATE command when returnCursor is true
  | null;                    // No result

/**
 * Type guard to check if a result is a MongoDB cursor (either FindCursor or AggregationCursor)
 * @param result The result to check
 * @returns True if the result is a cursor
 */
export function isCursor<T = Document>(
  result: ExecutionResult<T>
): result is FindCursor<T> | AggregationCursor<T> {
  return (
    result !== null && 
    typeof result === 'object' &&
    'forEach' in result &&
    'toArray' in result &&
    'close' in result
  );
}

/**
 * MongoDB command executor interface
 */
export interface CommandExecutor {
  connect(): Promise<void>;
  close(): Promise<void>;
  execute<T = Document>(commands: Command[], options?: ExecutionOptions): Promise<ExecutionResult<T>>;
}

/**
 * Main QueryLeaf interface
 */
export interface QueryLeaf {
  execute<T = Document>(sql: string, options?: ExecutionOptions): Promise<ExecutionResult<T>>;
  parse(sql: string): SqlStatement;
  compile(statement: SqlStatement): Command[];
  getExecutor(): CommandExecutor;
  close(): Promise<void>;
}

export interface Squongo extends QueryLeaf {
  execute<T = Document>(sql: string, options?: ExecutionOptions): Promise<ExecutionResult<T>>;
  parse(sql: string): SqlStatement;
  compile(statement: SqlStatement): Command[];
  getExecutor(): CommandExecutor;
  close(): Promise<void>;
}
