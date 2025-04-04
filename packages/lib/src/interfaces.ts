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
 * Represents result types that can be returned by the executor
 */
export type ExecutionResult<T = Document> =
  | Document[] // Array of documents (default for FIND and AGGREGATE)
  | Document // Single document or operation result (for INSERT, UPDATE, DELETE)
  | null; // No result

/**
 * Represents cursor types that can be returned by the cursor executor
 */
export type CursorResult<T = Document> =
  | FindCursor<T> // Cursor from FIND command
  | AggregationCursor<T> // Cursor from AGGREGATE command
  | null; // No result

/**
 * Options for cursor execution
 */
export interface CursorOptions {
  /**
   * Number of documents to fetch per batch
   * This will be set directly on the query command, not on the cursor after creation
   */
  batchSize?: number;
}

/**
 * MongoDB command executor interface
 */
export interface CommandExecutor {
  connect(): Promise<void>;
  close(): Promise<void>;
  /**
   * Execute MongoDB commands and return documents
   * @param commands Array of commands to execute
   * @returns Document results (no cursors)
   */
  execute<T = Document>(commands: Command[]): Promise<ExecutionResult<T>>;

  /**
   * Execute MongoDB commands and return cursors for FIND and AGGREGATE commands
   * @param commands Array of commands to execute
   * @param options Options for cursor execution
   * @returns Cursor for FIND and AGGREGATE commands, null for other commands
   */
  executeCursor<T = Document>(
    commands: Command[],
    options?: CursorOptions
  ): Promise<CursorResult<T>>;
}

/**
 * Main QueryLeaf interface
 */
export interface QueryLeaf {
  /**
   * Execute a SQL query and return documents
   * @param sql SQL query string
   * @returns Document results (no cursors)
   */
  execute<T = Document>(sql: string): Promise<ExecutionResult<T>>;

  /**
   * Execute a SQL query and return a cursor for SELECT queries
   * @param sql SQL query string
   * @param options Options for cursor execution
   * @returns Cursor for SELECT queries, null for other queries
   */
  executeCursor<T = Document>(sql: string, options?: CursorOptions): Promise<CursorResult<T>>;

  parse(sql: string): SqlStatement;
  compile(statement: SqlStatement): Command[];
  getExecutor(): CommandExecutor;
  close(): Promise<void>;
}

export interface Squongo extends QueryLeaf {
  execute<T = Document>(sql: string): Promise<ExecutionResult<T>>;
  executeCursor<T = Document>(sql: string, options?: CursorOptions): Promise<CursorResult<T>>;
  parse(sql: string): SqlStatement;
  compile(statement: SqlStatement): Command[];
  getExecutor(): CommandExecutor;
  close(): Promise<void>;
}
